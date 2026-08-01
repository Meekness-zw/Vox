import { createHmac, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import {
  cancelAppointmentRow,
  getAppointmentById,
  getCalendarConnection,
  getCompanyProfile,
  insertAppointmentIfAvailable,
  listAppointmentsInRange,
  upsertCalendarConnection,
} from "@/lib/repository";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "@/lib/token-crypto";
import type { Appointment } from "@/lib/types";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export function hasCalendarCredentials() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      hasEncryptionKey()
  );
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/integrations/google/callback`
  );
}

/* ---- OAuth state (CSRF-safe, no server-side session store needed) -------- */

function stateSecret() {
  return process.env.SESSION_SECRET?.trim() || "dev-only-insecure-secret-change-me";
}

export function signState(workspaceId: string): string {
  const body = `${workspaceId}.${Date.now()}`;
  const sig = createHmac("sha256", stateSecret()).update(body).digest("hex");
  return Buffer.from(`${body}.${sig}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const [workspaceId, ts, sig] = Buffer.from(state, "base64url").toString("utf8").split(".");
    if (!workspaceId || !ts || !sig) return null;
    const expected = createHmac("sha256", stateSecret()).update(`${workspaceId}.${ts}`).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    // 10 minute OAuth round-trip window
    if (Date.now() - Number(ts) > 10 * 60 * 1000) return null;
    return workspaceId;
  } catch {
    return null;
  }
}

export function getGoogleAuthUrl(workspaceId: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // ensures a refresh_token is returned even on re-connect
    scope: SCOPES,
    state: signState(workspaceId),
  });
}

export async function exchangeCodeForTokens(code: string, workspaceId: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Disconnect the app at https://myaccount.google.com/permissions and reconnect."
    );
  }
  await upsertCalendarConnection({
    workspaceId,
    calendarId: "primary",
    refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
    accessToken: tokens.access_token ?? undefined,
    accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
  });
}

async function getClientForWorkspace(workspaceId: string) {
  const conn = await getCalendarConnection(workspaceId);
  if (!conn) return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: decryptSecret(conn.refreshTokenEncrypted) });
  return { client, calendarId: conn.calendarId, timezone: conn.timezone };
}

/* ---- availability ----------------------------------------------------------- */

const DEFAULT_TIMEZONE = process.env.VOX_DEFAULT_TIMEZONE?.trim() || "Africa/Harare";

export type AvailabilityResult = { slots: string[]; timezone: string };

function zonedTimeToUtc(date: string, time: string, timezone: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  let timestamp = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hour,
    minute
  );
  // Convert the requested wall-clock time into UTC. A second pass handles
  // daylight-saving boundaries for client workspaces outside Zimbabwe.
  for (let pass = 0; pass < 2; pass++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const representedAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );
    timestamp -= representedAsUtc - Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      hour,
      minute
    );
  }
  return new Date(timestamp);
}

const DEFAULT_SCHEDULE = [
  ...["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => ({
    day,
    enabled: true,
    opens: "09:00",
    closes: "17:00",
  })),
  { day: "Saturday", enabled: false, opens: "09:00", closes: "17:00" },
  { day: "Sunday", enabled: false, opens: "09:00", closes: "17:00" },
];

function weekdayForDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function localDateForInstant(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Open slots for `date` (YYYY-MM-DD), constrained to that client's configured
 * day, opening/closing times and timezone. Google Calendar contributes busy
 * periods when connected; Vox appointments are used otherwise.
 */
export async function getAvailability(
  workspaceId: string,
  date: string,
  durationMinutes = 30
): Promise<AvailabilityResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || durationMinutes < 10) {
    throw new Error("Invalid appointment date or duration");
  }
  const [conn, profile] = await Promise.all([
    getClientForWorkspace(workspaceId),
    getCompanyProfile(workspaceId),
  ]);
  const timezone = profile?.timezone || conn?.timezone || DEFAULT_TIMEZONE;
  const schedule = profile?.businessSchedule?.length
    ? profile.businessSchedule
    : DEFAULT_SCHEDULE;
  const day = schedule.find((entry) => entry.day === weekdayForDate(date));
  if (!day?.enabled) return { slots: [], timezone };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(day.opens) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.closes)) {
    throw new Error("The business schedule contains an invalid time");
  }

  const dayStart = zonedTimeToUtc(date, day.opens, timezone);
  const dayEnd = zonedTimeToUtc(date, day.closes, timezone);
  if (dayEnd <= dayStart) return { slots: [], timezone };

  const busy: { start: Date; end: Date }[] = [];

  if (conn) {
    const fb = await conn.client.request<{
      calendars: Record<string, { busy: { start: string; end: string }[] }>;
    }>({
        url: "https://www.googleapis.com/calendar/v3/freeBusy",
        method: "POST",
        data: {
          timeMin: dayStart.toISOString(),
          timeMax: dayEnd.toISOString(),
          items: [{ id: conn.calendarId }],
        },
      });
    const calBusy = fb.data.calendars?.[conn.calendarId]?.busy ?? [];
    for (const b of calBusy) busy.push({ start: new Date(b.start), end: new Date(b.end) });
  }
  // Always include Vox's records too. This covers events awaiting Calendar
  // propagation and appointments created while Calendar was disconnected.
  const existing = await listAppointmentsInRange(
    workspaceId,
    dayStart.toISOString(),
    dayEnd.toISOString()
  );
  for (const a of existing) busy.push({ start: new Date(a.startsAt), end: new Date(a.endsAt) });

  const slots: string[] = [];
  const stepMs = durationMinutes * 60 * 1000;
  for (let t = dayStart.getTime(); t + stepMs <= dayEnd.getTime(); t += stepMs) {
    const slotStart = new Date(t);
    const slotEnd = new Date(t + stepMs);
    const overlaps = busy.some((b) => slotStart < b.end && slotEnd > b.start);
    if (!overlaps) slots.push(slotStart.toISOString());
  }

  return { slots, timezone };
}

/* ---- booking ----------------------------------------------------------------- */

export async function bookAppointment(opts: {
  workspaceId: string;
  agentId: string;
  conversationId?: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  service: string;
  startsAt: string;
  durationMinutes?: number;
}): Promise<Appointment> {
  const durationMinutes = opts.durationMinutes ?? 30;
  const startsAt = new Date(opts.startsAt).toISOString();
  const profile = await getCompanyProfile(opts.workspaceId);
  const timezone = profile?.timezone || DEFAULT_TIMEZONE;
  const localDate = localDateForInstant(new Date(startsAt), timezone);
  const availability = await getAvailability(opts.workspaceId, localDate, durationMinutes);
  if (!availability.slots.includes(startsAt)) {
    throw new Error("That time is outside business hours or is no longer available");
  }
  const endsAt = new Date(new Date(opts.startsAt).getTime() + durationMinutes * 60 * 1000).toISOString();

  let googleEventId: string | undefined;
  const conn = await getClientForWorkspace(opts.workspaceId);
  if (conn) {
    const calendar = google.calendar({ version: "v3", auth: conn.client });
    const event = await calendar.events.insert({
      calendarId: conn.calendarId,
      requestBody: {
        summary: `${opts.service} — ${opts.contactName}`,
        description: [opts.contactPhone, opts.contactEmail].filter(Boolean).join(" · "),
        start: { dateTime: startsAt },
        end: { dateTime: endsAt },
      },
    });
    googleEventId = event.data.id ?? undefined;
  }

  const appointment: Appointment = {
    id: "ap_" + crypto.randomUUID(),
    agentId: opts.agentId,
    conversationId: opts.conversationId,
    contactName: opts.contactName,
    contactPhone: opts.contactPhone,
    contactEmail: opts.contactEmail,
    service: opts.service,
    startsAt,
    endsAt,
    status: "confirmed",
    googleEventId,
    createdAt: new Date().toISOString(),
  };

  try {
    await insertAppointmentIfAvailable(appointment, opts.workspaceId);
  } catch (error) {
    // If another request won the atomic reservation after we created the
    // Google event, remove our orphan before reporting the slot conflict.
    if (googleEventId && conn) {
      const calendar = google.calendar({ version: "v3", auth: conn.client });
      await calendar.events.delete({ calendarId: conn.calendarId, eventId: googleEventId }).catch(() => {});
    }
    throw error;
  }
  return appointment;
}

export async function cancelAppointment(id: string, workspaceId: string): Promise<void> {
  const appointment = await getAppointmentById(id, workspaceId);
  if (appointment?.googleEventId) {
    const conn = await getClientForWorkspace(workspaceId);
    if (conn) {
      const calendar = google.calendar({ version: "v3", auth: conn.client });
      try {
        await calendar.events.delete({ calendarId: conn.calendarId, eventId: appointment.googleEventId });
      } catch (error) {
        const status = (error as { code?: number; response?: { status?: number } }).response?.status ??
          (error as { code?: number }).code;
        // A missing Google event is already effectively cancelled. For network
        // or permission failures, keep the Vox record confirmed so the UI does
        // not falsely report a cancellation that never reached the calendar.
        if (status !== 404 && status !== 410) throw error;
      }
    }
  }
  await cancelAppointmentRow(id, workspaceId);
}
