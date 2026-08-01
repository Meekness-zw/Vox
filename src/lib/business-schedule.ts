import type { BotRequest } from "@/lib/types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidBusinessSchedule(value: unknown): value is NonNullable<BotRequest["businessSchedule"]> {
  if (!Array.isArray(value) || value.length !== DAYS.length) return false;
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Record<string, unknown>;
    if (!DAYS.includes(String(item.day)) || seen.has(String(item.day)) ||
        typeof item.enabled !== "boolean" || !TIME.test(String(item.opens)) ||
        !TIME.test(String(item.closes)) || (item.enabled && String(item.opens) >= String(item.closes))) {
      return false;
    }
    seen.add(String(item.day));
  }
  return DAYS.every((day) => seen.has(day));
}

export function isValidTimezone(timezone: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); return true; }
  catch { return false; }
}
