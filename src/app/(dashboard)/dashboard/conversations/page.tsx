import { Topbar } from "@/components/dashboard/topbar";
import { ConversationsView } from "@/components/dashboard/conversations-view";
import { listConversations } from "@/lib/repository";
import { getSession } from "@/lib/auth/session-cookies";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  const conversations = await listConversations(session?.workspaceId);
  const { q: rawQuery } = await searchParams;
  const query = String(rawQuery ?? "").trim().slice(0, 100);
  const needle = query.toLocaleLowerCase();
  const filtered = needle
    ? conversations.filter((conversation) =>
        [
          conversation.contact,
          conversation.summary,
          conversation.channel,
          conversation.outcome,
          ...conversation.transcript.map((line) => line.text),
        ].some((value) => value.toLocaleLowerCase().includes(needle))
      )
    : conversations;
  return (
    <>
      <Topbar title="Conversations" search={query} />
      <div className="p-4 sm:p-6">
        {query && (
          <p className="mb-4 text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
          </p>
        )}
        <ConversationsView conversations={filtered} />
      </div>
    </>
  );
}
