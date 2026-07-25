import { NextResponse } from "next/server";
import { exchangeCodeForTokens, verifyState } from "@/lib/calendar";

/** Google redirects here after the workspace owner grants calendar access. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const settingsUrl = new URL("/dashboard/settings", url.origin);

  if (error) {
    settingsUrl.searchParams.set("calendar_error", error);
    return NextResponse.redirect(settingsUrl);
  }

  const workspaceId = state ? verifyState(state) : null;
  if (!code || !workspaceId) {
    settingsUrl.searchParams.set("calendar_error", "invalid_state");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    await exchangeCodeForTokens(code, workspaceId);
    settingsUrl.searchParams.set("connected", "google");
  } catch {
    settingsUrl.searchParams.set("calendar_error", "exchange_failed");
  }

  return NextResponse.redirect(settingsUrl);
}
