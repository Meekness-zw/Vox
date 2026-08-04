import { Topbar } from "@/components/dashboard/topbar";
import {
  ConversationsView,
  type InboxFilters,
} from "@/components/dashboard/conversations-view";
import { requireInboxOperator } from "@/lib/auth/session-cookies";
import {
  getInboxConversation,
  listInboxConversations,
  listWorkspaceUsers,
} from "@/lib/repository";
import type { InboxConversation } from "@/lib/types";

export const dynamic = "force-dynamic";

type InboxView = InboxFilters["view"];

const validViews = new Set<InboxView>(["all", "needs_human", "mine", "unassigned", "resolved"]);
const validChannels = new Set(["", "voice", "chat", "sms", "whatsapp"]);
const validPriorities = new Set(["", "low", "normal", "high", "urgent"]);

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    view?: string;
    channel?: string;
    priority?: string;
    assignee?: string;
    conversation?: string;
  }>;
}) {
  const session = await requireInboxOperator();
  const raw = await searchParams;
  const filters = normalizeFilters(raw);

  const [allConversations, allTeamMembers]: [
    InboxConversation[],
    Array<{ id: string; name: string; email: string; role: string; status?: string }>,
  ] = await Promise.all([
    listInboxConversations(session.workspaceId, session.userId),
    listWorkspaceUsers(session.workspaceId),
  ]);
  const team = allTeamMembers
    .filter((member) => member.status !== "suspended" && member.role !== "Bookkeeper")
    .map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      status: member.status,
    }));

  const counts = {
    all: allConversations.filter((item) => item.inboxStatus !== "resolved").length,
    needsHuman: allConversations.filter((item) => item.inboxStatus === "needs_human").length,
    mine: allConversations.filter((item) => item.inboxStatus !== "resolved" && item.assignedUserId === session.userId).length,
    unassigned: allConversations.filter((item) => item.inboxStatus !== "resolved" && !item.assignedUserId).length,
    resolved: allConversations.filter((item) => item.inboxStatus === "resolved").length,
    unread: allConversations.filter((item) => item.unreadCount > 0).length,
  };

  const conversations = allConversations.filter((conversation) => {
    if (filters.view === "all" && conversation.inboxStatus === "resolved") return false;
    if (filters.view === "needs_human" && conversation.inboxStatus !== "needs_human") return false;
    if (filters.view === "mine" && (conversation.inboxStatus === "resolved" || conversation.assignedUserId !== session.userId)) return false;
    if (filters.view === "unassigned" && (conversation.inboxStatus === "resolved" || conversation.assignedUserId)) return false;
    if (filters.view === "resolved" && conversation.inboxStatus !== "resolved") return false;
    if (filters.channel && conversation.channel !== filters.channel) return false;
    if (filters.priority && conversation.priority !== filters.priority) return false;
    if (filters.assignee === "unassigned" && conversation.assignedUserId) return false;
    if (filters.assignee && filters.assignee !== "unassigned" && conversation.assignedUserId !== filters.assignee) return false;
    if (filters.q) {
      const needle = filters.q.toLocaleLowerCase();
      return [
        conversation.contact,
        conversation.summary,
        conversation.lastMessagePreview,
        conversation.channel,
        conversation.assignedUserName ?? "",
      ].some((value) => value.toLocaleLowerCase().includes(needle));
    }
    return true;
  });

  const requestedId = safeConversationId(raw.conversation);
  const selectedConversation = requestedId
    ? await getInboxConversation(requestedId, session.workspaceId, session.userId)
    : null;
  const detail = selectedConversation
    ? {
        conversation: selectedConversation,
        messages: selectedConversation.messages,
        notes: selectedConversation.notes,
      }
    : null;

  return (
    <>
      <Topbar title="Team Inbox" showSearch={false} />
      <ConversationsView
        conversations={conversations}
        detail={detail}
        team={team}
        currentUserId={session.userId}
        filters={filters}
        counts={counts}
        mobileDetailOpen={Boolean(requestedId && detail)}
        replyRequestId={crypto.randomUUID()}
      />
    </>
  );
}

function normalizeFilters(raw: {
  q?: string;
  view?: string;
  channel?: string;
  priority?: string;
  assignee?: string;
}): InboxFilters {
  const requestedView = String(raw.view ?? "all") as InboxView;
  const requestedChannel = String(raw.channel ?? "");
  const requestedPriority = String(raw.priority ?? "");
  const assignee = String(raw.assignee ?? "").trim().slice(0, 100);
  return {
    q: String(raw.q ?? "").trim().slice(0, 100),
    view: validViews.has(requestedView) ? requestedView : "all",
    channel: validChannels.has(requestedChannel) ? requestedChannel : "",
    priority: validPriorities.has(requestedPriority) ? requestedPriority : "",
    assignee: /^(?:unassigned|[a-zA-Z0-9_-]{1,100})$/.test(assignee) ? assignee : "",
  };
}

function safeConversationId(value?: string) {
  const id = String(value ?? "").trim();
  return /^[a-zA-Z0-9_:+-]{1,200}$/.test(id) ? id : undefined;
}
