import { NextResponse } from "next/server";
import { getSession, requireWorkspaceManager } from "@/lib/auth/session-cookies";
import { getGoogleAuthUrl, hasCalendarCredentials } from "@/lib/calendar";

/** Redirects the signed-in workspace owner into Google's OAuth consent flow. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  try { await requireWorkspaceManager(); }
  catch { return NextResponse.json({ error: "Owner or Admin access required." }, { status: 403 }); }
  if (!hasCalendarCredentials()) {
    return NextResponse.json(
      { error: "Google Calendar isn't configured on this deployment yet." },
      { status: 501 }
    );
  }
  return NextResponse.redirect(getGoogleAuthUrl(session.workspaceId));
}
