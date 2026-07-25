import { createHmac, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import {
  cancelAppointmentRow,
  getAppointmentById,
  getCalendarConnection,
  insertAppointment,
  listAppointmentsInRange,
  upsertCalendarConnection,
} from "@/lib/repository";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "@/lib/token-crypto";
import type { Appointment } from "@/lib/types";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

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

const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 17;
const DEFAULT_TIMEZONE = process.env.VOX_DEFAULT_TIMEZONE?.trim() || "Africa/Harare";

export type AvailabilityResult = { slots: string[]; timezone: string };

/**
 * Open slots for `date` (YYYY-MM-DD). Falls back to a naive 9-5 business-hours
 * window minus already-booked appointments when no Google Calendar is
 * connected, so booking works in demo mode with zero configuration; upgrades
 * to real Google Calendar free/busy the moment a workspace connects one.
 */
export async function getAvailability(
  workspaceId: string,
  date: string,
  durationMinutes = 30
): Promise<AvailabilityResult> {
  const conn = await getClientForWorkspace(workspaceId);
  const timezone = conn?.timezone ?? DEFAULT_TIMEZONE;

  const dayStart = new Date(`${date}T${String(BUSINESS_START_HOUR).padStart(2, "0")}:00:00Z`);
  const dayEnd = new Date(`${date}T${String(BUSINESS_END_HOUR).padStart(2, "0")}:00:00Z`);

  const busy: { start: Date; end: Date }[] = [];

  if (conn) {
    const fb = await conn.client
      .request<{ calendars: Record<string, { busy: { start: string; end: string }[] }> }>({
        url: "https://www.googleapis.com/calendar/v3/freeBusy",
        method: "POST",
        data: {
          timeMin: dayStart.toISOString(),
          timeMax: dayEnd.toISOString(),
          items: [{ id: conn.calendarId }],
        },
      })
      .catch(() => null);
    const calBusy = fb?.data.calendars?.[conn.calendarId]?.busy ?? [];
    for (const b of calBusy) busy.push({ start: new Date(b.start), end: new Date(b.end) });
  } else {
    const existing = await listAppointmentsInRange(
      workspaceId,
      dayStart.toISOString(),
      dayEnd.toISOString()
    );
    for (const a of existing) busy.push({ start: new Date(a.startsAt), end: new Date(a.endsAt) });
  }

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
    id: "ap_" + Math.random().toString(36).slice(2, 10),
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

  await insertAppointment(appointment, opts.workspaceId);
  return appointment;
}

export async function cancelAppointment(id: string, workspaceId: string): Promise<void> {
  const appointment = await getAppointmentById(id, workspaceId);
  if (appointment?.googleEventId) {
    const conn = await getClientForWorkspace(workspaceId);
    if (conn) {
      const calendar = google.calendar({ version: "v3", auth: conn.client });
      await calendar.events.delete({ calendarId: conn.calendarId, eventId: appointment.googleEventId }).catch(() => {});
    }
  }
  await cancelAppointmentRow(id, workspaceId);
}
