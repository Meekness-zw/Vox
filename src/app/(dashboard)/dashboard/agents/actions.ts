"use server";

import { revalidatePath } from "next/cache";
import { upsertAgent, isDbEnabled } from "@/lib/repository";
import { getSession, requireWorkspaceManager } from "@/lib/auth/session-cookies";
import type { Agent } from "@/lib/types";
import { isVoxAdmin } from "@/lib/admin";

export async function saveAgent(
  agent: Agent,
  targetWorkspaceId?: string
): Promise<{ ok: boolean; persisted: boolean }> {
  const initialSession = await getSession();
  const session = initialSession && isVoxAdmin(initialSession.email)
    ? initialSession
    : await requireWorkspaceManager();
  if (!session) return { ok: false, persisted: false };

  const workspaceId = targetWorkspaceId && isVoxAdmin(session.email)
    ? targetWorkspaceId
    : session.workspaceId;
  const clean: Agent = {
    ...agent,
    id: String(agent.id).slice(0, 100),
    name: String(agent.name).trim().slice(0, 120),
    type: agent.type === "voice" ? "voice" : "chat",
    status: ["active", "paused", "draft"].includes(agent.status) ? agent.status : "draft",
    language: String(agent.language).trim().slice(0, 120),
    voice: agent.voice ? String(agent.voice).trim().slice(0, 200) : undefined,
    personality: String(agent.personality).trim().slice(0, 1000),
    systemPrompt: String(agent.systemPrompt).trim().slice(0, 20_000),
    greeting: String(agent.greeting).trim().slice(0, 2000),
    businessHours: String(agent.businessHours).trim().slice(0, 1000),
    escalation: String(agent.escalation).trim().slice(0, 2000),
  };
  if (!clean.id || !clean.name || !clean.systemPrompt) return { ok: false, persisted: false };
  await upsertAgent(clean, workspaceId);
  revalidatePath("/dashboard/agents");
  // `persisted` is false in demo mode (no DATABASE_URL), where this is a no-op.
  return { ok: true, persisted: isDbEnabled };
}
