import { embed, embedMany } from "ai";
import { sql } from "@/lib/db";
import { hasModelCredentials } from "@/lib/agent-runtime";
import type { KnowledgeSource } from "@/lib/types";

const EMBED_MODEL = process.env.VOX_EMBED_MODEL ?? "openai/text-embedding-3-small";
const EMBED_DIMS = 1536;

/* ---- embeddings (best-effort; returns null when the gateway is unavailable) */

export async function embedText(text: string): Promise<number[] | null> {
  if (!hasModelCredentials()) return null;
  try {
    const { embedding } = await embed({ model: EMBED_MODEL, value: text });
    return embedding;
  } catch {
    return null;
  }
}

async function embedAll(texts: string[]): Promise<(number[] | null)[]> {
  if (!hasModelCredentials()) return texts.map(() => null);
  try {
    const { embeddings } = await embedMany({ model: EMBED_MODEL, values: texts });
    return embeddings;
  } catch {
    return texts.map(() => null);
  }
}

const toVector = (v: number[]) => `[${v.join(",")}]`;

/* ---- chunking ------------------------------------------------------------- */

export function chunkText(text: string, target = 800): string[] {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > target && current) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  // Hard-split any oversized chunk.
  return chunks.flatMap((c) =>
    c.length <= target * 1.6
      ? [c]
      : (c.match(new RegExp(`[\\s\\S]{1,${target}}`, "g")) ?? [c])
  );
}

/* ---- ingestion ------------------------------------------------------------ */

export async function fetchUrlText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "VoxBot/1.0" } });
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export type IngestInput = {
  workspaceId: string;
  name: string;
  type: KnowledgeSource["type"];
  /** Raw text, or a URL when type === "URL". */
  content: string;
};

export async function ingestSource(input: IngestInput): Promise<{
  sourceId: string;
  chunks: number;
  embedded: boolean;
}> {
  if (!sql) throw new Error("DATABASE_URL is not set");

  const text =
    input.type === "URL" ? await fetchUrlText(input.content) : input.content;
  const chunks = chunkText(text);
  const sourceId = "kb_" + Math.random().toString(36).slice(2, 10);

  await sql`
    insert into knowledge_sources (id, workspace_id, name, type, status, chunks)
    values (${sourceId}, ${input.workspaceId}, ${input.name}, ${input.type}, 'syncing', 0)
  `;

  const embeddings = await embedAll(chunks);
  let embedded = false;

  for (let i = 0; i < chunks.length; i++) {
    const id = `${sourceId}_${i}`;
    const e = embeddings[i];
    if (e && e.length === EMBED_DIMS) {
      embedded = true;
      await sql`
        insert into knowledge_chunks (id, source_id, workspace_id, content, embedding)
        values (${id}, ${sourceId}, ${input.workspaceId}, ${chunks[i]}, ${toVector(e)}::vector)
      `;
    } else {
      await sql`
        insert into knowledge_chunks (id, source_id, workspace_id, content)
        values (${id}, ${sourceId}, ${input.workspaceId}, ${chunks[i]})
      `;
    }
  }

  await sql`
    update knowledge_sources set chunks = ${chunks.length}, status = 'synced',
      updated_at = now() where id = ${sourceId}
  `;

  return { sourceId, chunks: chunks.length, embedded };
}

/* ---- retrieval ------------------------------------------------------------ */

/**
 * Returns the most relevant knowledge for a query. Uses vector similarity when
 * embeddings exist, otherwise Postgres full-text search — so it always works,
 * and upgrades to semantic search the moment the AI Gateway is reachable.
 */
export async function retrieveContext(
  workspaceId: string,
  query: string,
  k = 6
): Promise<{ text: string; sources: string[] } | null> {
  if (!sql || !query.trim()) return null;

  const qEmbedding = await embedText(query);
  let rows: Record<string, unknown>[] = [];

  if (qEmbedding) {
    rows = await sql`
      select c.content, s.name as source
      from knowledge_chunks c
      join knowledge_sources s on s.id = c.source_id
      where c.workspace_id = ${workspaceId} and c.embedding is not null
      order by c.embedding <=> ${toVector(qEmbedding)}::vector
      limit ${k}
    `;
  }

  if (!rows.length) {
    // Full-text fallback with OR semantics + ranking, so partial matches still
    // surface (plainto_tsquery requires ALL terms, which is too strict for RAG).
    const orQuery = (query.toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .filter((w) => w.length > 2)
      .join(" | ");
    if (orQuery) {
      rows = await sql`
        select c.content, s.name as source,
          ts_rank(c.tsv, to_tsquery('english', ${orQuery})) as rank
        from knowledge_chunks c
        join knowledge_sources s on s.id = c.source_id
        where c.workspace_id = ${workspaceId}
          and c.tsv @@ to_tsquery('english', ${orQuery})
        order by rank desc
        limit ${k}
      `;
    }
  }

  if (!rows.length) return null;

  const text = rows.map((r) => r.content as string).join("\n\n---\n\n");
  const sources = [...new Set(rows.map((r) => r.source as string))];
  return { text, sources };
}
