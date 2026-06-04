import { Topbar } from "@/components/dashboard/topbar";
import { ConversationsView } from "@/components/dashboard/conversations-view";
import { listConversations } from "@/lib/repository";
import { getSession } from "@/lib/auth/session-cookies";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const session = await getSession();
  const conversations = await listConversations(session?.workspaceId);
  return (
    <>
      <Topbar title="Conversations" />
      <div className="p-4 sm:p-6">
        <ConversationsView conversations={conversations} />
      </div>
    </>
  );
}
