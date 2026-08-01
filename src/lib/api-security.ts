import { createHash } from "node:crypto";
import { consumeWidgetRateLimit } from "@/lib/repository";

export function requestIdentity(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const raw = forwarded || req.headers.get("x-real-ip") || req.headers.get("user-agent") || "anonymous";
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export async function allowRequest(req: Request, scope: string, limit: number, identity?: string) {
  return consumeWidgetRateLimit(`api:${scope}`, identity ?? requestIdentity(req), limit);
}

export function bodyTooLarge(req: Request, maximumBytes: number) {
  const length = Number(req.headers.get("content-length") ?? 0);
  return Number.isFinite(length) && length > maximumBytes;
}
