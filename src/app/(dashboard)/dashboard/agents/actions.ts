"use server";

import { revalidatePath } from "next/cache";
import { upsertAgent, isDbEnabled } from "@/lib/repository";
import { getSession } from "@/lib/auth/session-cookies";
import type { Agent } from "@/lib/types";

export async function saveAgent(
  agent: Agent
): Promise<{ ok: boolean; persisted: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false, persisted: false };

  await upsertAgent(agent, session.workspaceId);
  revalidatePath("/dashboard/agents");
  // `persisted` is false in demo mode (no DATABASE_URL), where this is a no-op.
  return { ok: true, persisted: isDbEnabled };
}
