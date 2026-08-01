"use server";

import { revalidatePath } from "next/cache";
import { ingestSource } from "@/lib/rag";
import { isDbEnabled } from "@/lib/db";
import { getSession } from "@/lib/auth/session-cookies";
import type { KnowledgeSource } from "@/lib/types";

export type IngestState = { ok?: boolean; error?: string; message?: string };

export async function addKnowledgeSource(
  _prev: IngestState,
  formData: FormData
): Promise<IngestState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };
  if (!isDbEnabled) {
    return { error: "Knowledge ingestion requires a database (set DATABASE_URL)." };
  }

  const type = String(formData.get("type") ?? "Manual Q&A") as KnowledgeSource["type"];
  const name = String(formData.get("name") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!(["URL", "Manual Q&A", "FAQ", "Document", "CSV"] as string[]).includes(type)) return { error: "Choose a valid source type." };
  if (!name || name.length > 200) return { error: "Give this source a name (200 characters maximum)." };
  if (!content) return { error: "Add a URL or some text to train on." };
  if (content.length > 2_000_000) return { error: "Knowledge content is limited to 2 MB per source." };

  try {
    const res = await ingestSource({
      workspaceId: session.workspaceId,
      name,
      type,
      content,
    });
    revalidatePath("/dashboard/knowledge");
    return {
      ok: true,
      message: `Indexed ${res.chunks} chunk${res.chunks === 1 ? "" : "s"}${
        res.embedded ? " with embeddings" : " (full-text search)"
      }.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to ingest source." };
  }
}
