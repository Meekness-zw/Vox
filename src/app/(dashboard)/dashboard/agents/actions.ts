"use server";

import { revalidatePath } from "next/cache";
import { upsertAgent, isDbEnabled } from "@/lib/repository";
import { getSession } from "@/lib/auth/session-cookies";
import type { Agent } from "@/lib/types";
import { isVoxAdmin } from "@/lib/admin";

export async function saveAgent(
  agent: Agent,
  targetWorkspaceId?: string
): Promise<{ ok: boolean; persisted: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false, persisted: false };

  const workspaceId = targetWorkspaceId && isVoxAdmin(session.email)
    ? targetWorkspaceId
    : session.workspaceId;
  await upsertAgent(agent, workspaceId);
  revalidatePath("/dashboard/agents");
  // `persisted` is false in demo mode (no DATABASE_URL), where this is a no-op.
  return { ok: true, persisted: isDbEnabled };
}
