"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  FileText,
  Headphones,
  Loader2,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Search,
  Send,
  StickyNote,
  UserRound,
} from "lucide-react";
import {
  addInboxNote,
  assignInboxConversation,
  markConversationRead,
  sendInboxReply,
  updateInboxState,
} from "@/app/(dashboard)/dashboard/conversations/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type {
  ConversationNote,
  ConversationMessage,
  InboxConversation,
} from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

type InboxView = "all" | "needs_human" | "mine" | "unassigned" | "resolved";

export type InboxFilters = {
  q: string;
  view: InboxView;
  channel: string;
  priority: string;
  assignee: string;
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
};

type InboxDetail = {
  conversation: InboxConversation;
  messages: ConversationMessage[];
  notes: ConversationNote[];
};

type Counts = {
  all: number;
  needsHuman: number;
  mine: number;
  unassigned: number;
  resolved: number;
  unread: number;
};

const channelIcon = {
  voice: Phone,
  chat: MessageSquare,
  sms: MessageSquare,
  whatsapp: MessageSquare,
} as const;

const statusLabel = {
  ai_active: "AI active",
  needs_human: "Needs human",
  human_active: "Human active",
  resolved: "Resolved",
} as const;

const statusVariant = {
  ai_active: "default",
  needs_human: "danger",
  human_active: "warning",
  resolved: "success",
} as const;

const priorityLabel = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
} as const;

const priorityClass = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-warning",
  urgent: "text-danger",
} as const;

const views: Array<{ value: InboxView; label: string; countKey: keyof Counts }> = [
  { value: "needs_human", label: "Needs human", countKey: "needsHuman" },
  { value: "mine", label: "Mine", countKey: "mine" },
  { value: "unassigned", label: "Unassigned", countKey: "unassigned" },
  { value: "all", label: "All", countKey: "all" },
  { value: "resolved", label: "Resolved", countKey: "resolved" },
];

export function ConversationsView({
  conversations,
  detail,
  team,
  currentUserId,
  filters,
  counts,
  mobileDetailOpen,
  replyRequestId,
}: {
  conversations: InboxConversation[];
  detail: InboxDetail | null;
  team: TeamMember[];
  currentUserId: string;
  filters: InboxFilters;
  counts: Counts;
  mobileDetailOpen: boolean;
  replyRequestId: string;
}) {
  const selectedId = detail?.conversation.id;
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <InboxToolbar filters={filters} counts={counts} team={team} />

      <div className="grid min-h-0 flex-1 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]">
        <section
          aria-label="Conversations"
          className={cn(
            "border-r border-border bg-card lg:block",
            mobileDetailOpen ? "hidden" : "block"
          )}
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            filters={filters}
          />
        </section>

        <main
          className={cn(
            "min-w-0 bg-muted/30 lg:block",
            mobileDetailOpen ? "block" : "hidden"
          )}
        >
          {detail ? (
            <ConversationDetail
              detail={detail}
              team={team}
              currentUserId={currentUserId}
              filters={filters}
              replyRequestId={replyRequestId}
            />
          ) : (
            <div className="flex min-h-[70vh] items-center justify-center p-6 text-center">
              <div>
                <Headphones className="mx-auto size-9 text-muted-foreground" />
                <h2 className="mt-3 font-semibold">Select a conversation</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Open a conversation to review its history, assign a teammate, or take over from AI.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function InboxToolbar({
  filters,
  counts,
  team,
}: {
  filters: InboxFilters;
  counts: Counts;
  team: TeamMember[];
}) {
  return (
    <div className="border-b border-border bg-background px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Customer conversations</h2>
            {counts.unread > 0 && (
              <Badge variant="danger" aria-label={`${counts.unread} unread conversations`}>
                {counts.unread} unread
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Take over when a customer needs a person, then return the thread to AI when ready.
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 text-sm text-danger"
          role="status"
          aria-live="polite"
        >
          <CircleAlert className="size-4" aria-hidden="true" />
          <span className="font-medium">{counts.needsHuman}</span>
          <span className="text-muted-foreground">need attention</span>
        </div>
      </div>

      <nav aria-label="Inbox views" className="mt-3 flex gap-1 overflow-x-auto pb-1">
        {views.map((view) => (
          <Link
            key={view.value}
            href={inboxHref(filters, { view: view.value, conversation: null })}
            aria-current={filters.view === view.value ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              filters.view === view.value
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {view.label}
            <span className="rounded-full bg-background/80 px-1.5 text-xs">
              {counts[view.countKey]}
            </span>
          </Link>
        ))}
      </nav>

      <form
        action="/dashboard/conversations"
        method="get"
        role="search"
        className="mt-3 grid gap-2 sm:grid-cols-[minmax(180px,1fr)_140px_130px_180px_auto]"
      >
        <input type="hidden" name="view" value={filters.view} />
        <label className="relative">
          <span className="sr-only">Search team inbox</span>
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <input
            name="q"
            type="search"
            defaultValue={filters.q}
            maxLength={100}
            placeholder="Search contacts or messages…"
            className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <FilterSelect name="channel" label="Channel" value={filters.channel}>
          <option value="">All channels</option>
          <option value="voice">Voice</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="chat">Website chat</option>
        </FilterSelect>
        <FilterSelect name="priority" label="Priority" value={filters.priority}>
          <option value="">All priorities</option>
          {Object.entries(priorityLabel).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </FilterSelect>
        <FilterSelect name="assignee" label="Assignee" value={filters.assignee}>
          <option value="">All teammates</option>
          <option value="unassigned">Unassigned</option>
          {team.map((member) => (
            <option key={member.id} value={member.id}>{member.name || member.email}</option>
          ))}
        </FilterSelect>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">Filter</Button>
          {(filters.q || filters.channel || filters.priority || filters.assignee) && (
            <Link
              href={inboxHref({ ...filters, q: "", channel: "", priority: "", assignee: "" })}
              className="inline-flex h-10 items-center justify-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Clear
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </select>
    </label>
  );
}

function ConversationList({
  conversations,
  selectedId,
  filters,
}: {
  conversations: InboxConversation[];
  selectedId?: string;
  filters: InboxFilters;
}) {
  if (!conversations.length) {
    return (
      <div className="px-6 py-14 text-center">
        <MessageSquare className="mx-auto size-8 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold">No conversations found</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Try another view or clear the current filters.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {conversations.map((conversation) => {
        const Icon = channelIcon[conversation.channel];
        const selected = selectedId === conversation.id;
        return (
          <li key={conversation.id}>
            <Link
              href={inboxHref(filters, { conversation: conversation.id })}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "relative block min-h-28 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                selected ? "bg-accent/50" : "hover:bg-muted/70"
              )}
            >
            {selected && <span className="absolute inset-y-0 left-0 w-1 bg-primary" />}
            <div className="flex items-start gap-3">
              <div className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
                {conversation.unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">
                    {Math.min(conversation.unreadCount, 99)}
                    <span className="sr-only"> unread messages</span>
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("truncate text-sm", conversation.unreadCount > 0 ? "font-bold" : "font-medium")}>{conversation.contact}</p>
                  <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={conversation.lastMessageAt}>
                    {timeAgo(conversation.lastMessageAt)}
                  </time>
                </div>
                <p className={cn("mt-1 line-clamp-2 text-xs", conversation.unreadCount > 0 ? "text-foreground" : "text-muted-foreground")}>{conversation.lastMessagePreview || conversation.summary}</p>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                  <Badge variant={statusVariant[conversation.inboxStatus]} className="px-2 py-0 text-[10px]">
                    {statusLabel[conversation.inboxStatus]}
                  </Badge>
                  {conversation.priority !== "normal" && (
                    <span className={cn("text-[10px] font-semibold", priorityClass[conversation.priority])}>
                      {priorityLabel[conversation.priority]}
                    </span>
                  )}
                  <span className="truncate text-[10px] text-muted-foreground">
                    {conversation.assignedUserName || "Unassigned"}
                  </span>
                  {conversation.botMode === "paused" && (
                    <span className="flex items-center gap-1 text-[10px] text-warning"><Pause className="size-2.5" />AI paused</span>
                  )}
                </div>
              </div>
            </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ConversationDetail({
  detail,
  team,
  currentUserId,
  filters,
  replyRequestId,
}: {
  detail: InboxDetail;
  team: TeamMember[];
  currentUserId: string;
  filters: InboxFilters;
  replyRequestId: string;
}) {
  const conversation = detail.conversation;
  const Icon = channelIcon[conversation.channel];
  const backHref = inboxHref(filters, { conversation: null });

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <MarkRead conversationId={conversation.id} unreadCount={conversation.unreadCount} />

      <div className="border-b border-border bg-card px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <Link
            href={backHref}
            aria-label="Back to conversations"
            className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-semibold">{conversation.contact}</h2>
              <Badge variant={statusVariant[conversation.inboxStatus]}>{statusLabel[conversation.inboxStatus]}</Badge>
              <Badge variant={conversation.botMode === "active" ? "success" : "warning"}>
                {conversation.botMode === "active" ? <Bot className="size-3" /> : <Pause className="size-3" />}
                AI {conversation.botMode === "active" ? "active" : "paused"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">
              {conversation.channel === "chat" ? "Website chat" : conversation.channel} · Started {timeAgo(conversation.startedAt)}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_minmax(130px,0.7fr)_auto_auto]">
          <AssignmentControl conversation={conversation} team={team} currentUserId={currentUserId} />
          <PriorityControl conversation={conversation} />
          <BotControl conversation={conversation} />
          <ResolveControl conversation={conversation} />
        </div>
      </div>

      {conversation.inboxStatus === "needs_human" && (
        <div className="flex items-start gap-2 border-b border-danger/20 bg-danger/10 px-4 py-2.5 text-sm text-danger sm:px-5" role="status">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>This customer is waiting for a person. Assign the conversation and respond as soon as possible.</span>
        </div>
      )}
      {conversation.inboxStatus === "human_active" && (
        <div className="flex items-start gap-2 border-b border-warning/20 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 sm:px-5" role="status">
          <UserRound className="mt-0.5 size-4 shrink-0" />
          <span>A teammate owns this conversation. AI should remain paused until the handoff is complete.</span>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        <ConversationContext conversation={conversation} />
        <Timeline
          conversation={conversation}
          messages={detail.messages}
          notes={detail.notes}
        />
      </div>

      <Composer conversation={conversation} replyRequestId={replyRequestId} />
    </div>
  );
}

function AssignmentControl({
  conversation,
  team,
  currentUserId,
}: {
  conversation: InboxConversation;
  team: TeamMember[];
  currentUserId: string;
}) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <form action={assignInboxConversation} className="flex min-w-0 flex-1 gap-1.5">
        <input type="hidden" name="conversationId" value={conversation.id} />
        <input type="hidden" name="stateVersion" value={conversation.stateVersion} />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Assigned teammate</span>
          <select name="assignedUserId" defaultValue={conversation.assignedUserId ?? ""} className={controlClass}>
            <option value="">Unassigned</option>
            {team.map((member) => <option key={member.id} value={member.id}>{member.name || member.email}</option>)}
          </select>
        </label>
        <PendingButton label="Save assignment" />
      </form>
      {conversation.assignedUserId !== currentUserId && (
        <form action={assignInboxConversation} className="hidden sm:block">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <input type="hidden" name="stateVersion" value={conversation.stateVersion} />
          <input type="hidden" name="assignedUserId" value={currentUserId} />
          <ActionButton label="Assign to me" pendingLabel="Assigning…" icon={UserRound} variant="secondary" />
        </form>
      )}
    </div>
  );
}

function PriorityControl({ conversation }: { conversation: InboxConversation }) {
  return (
    <form action={updateInboxState} className="flex gap-1.5">
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="stateVersion" value={conversation.stateVersion} />
      <input type="hidden" name="intent" value="priority" />
      <label className="min-w-0 flex-1">
        <span className="sr-only">Priority</span>
        <select name="priority" defaultValue={conversation.priority} className={controlClass}>
          {Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label} priority</option>)}
        </select>
      </label>
      <PendingButton label="Save priority" />
    </form>
  );
}

function BotControl({ conversation }: { conversation: InboxConversation }) {
  if (conversation.channel === "voice") {
    return (
      <div
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-muted px-3 text-xs text-muted-foreground"
        title="Live callers are transferred automatically after they confirm a human handoff."
      >
        <Phone className="size-3.5" />Auto transfer
      </div>
    );
  }
  const active = conversation.botMode === "active";
  return (
    <form action={updateInboxState}>
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="stateVersion" value={conversation.stateVersion} />
      <input type="hidden" name="intent" value="botMode" />
      <input type="hidden" name="botMode" value={active ? "paused" : "active"} />
      <ActionButton
        label={active ? "Pause AI" : "Resume AI"}
        pendingLabel={active ? "Pausing…" : "Resuming…"}
        icon={active ? Pause : Play}
        variant={active ? "secondary" : "primary"}
      />
    </form>
  );
}

function ResolveControl({ conversation }: { conversation: InboxConversation }) {
  const resolved = conversation.inboxStatus === "resolved";
  return (
    <form action={updateInboxState}>
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="stateVersion" value={conversation.stateVersion} />
      <input type="hidden" name="intent" value="status" />
      <input
        type="hidden"
        name="inboxStatus"
        value={resolved ? "needs_human" : "resolved"}
      />
      <ActionButton
        label={resolved ? "Reopen" : "Resolve"}
        pendingLabel={resolved ? "Reopening…" : "Resolving…"}
        icon={resolved ? Clock3 : Check}
        variant="secondary"
      />
    </form>
  );
}

function ConversationContext({ conversation }: { conversation: InboxConversation }) {
  return (
    <details className="rounded-lg border border-border bg-card" open={conversation.inboxStatus === "needs_human"}>
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Conversation context
      </summary>
      <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><FileText className="size-3.5" />Summary</h3>
          <p className="mt-2 text-sm">{conversation.summary || "No summary is available yet."}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action items</h3>
          {conversation.actionItems.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {conversation.actionItems.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />{item}</li>)}
            </ul>
          ) : <p className="mt-2 text-sm text-muted-foreground">No action items recorded.</p>}
        </div>
      </div>
    </details>
  );
}

function Timeline({
  conversation,
  messages,
  notes,
}: {
  conversation: InboxConversation;
  messages: ConversationMessage[];
  notes: ConversationNote[];
}) {
  const items = useMemo(() => {
    const normalized = [
      ...messages.map((message) => ({ kind: "message" as const, at: message.createdAt, message })),
      ...notes.map((note) => ({ kind: "note" as const, at: note.createdAt, note })),
    ];
    return normalized.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [messages, notes]);

  return (
    <section aria-labelledby="conversation-timeline-heading" className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 id="conversation-timeline-heading" className="text-sm font-semibold">Conversation timeline</h3>
      </div>
      <div className="space-y-4 p-4" aria-live="polite">
        {items.length ? items.map((item) => item.kind === "note"
          ? <NoteItem key={`note-${item.note.id}`} note={item.note} />
          : <MessageItem key={`message-${item.message.id}`} message={item.message} />
        ) : conversation.transcript.length ? conversation.transcript.map((line, index) => (
          <LegacyMessage key={`${index}-${line.text}`} role={line.role} text={line.text} />
        )) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages have been recorded for this conversation.</p>
        )}
      </div>
    </section>
  );
}

function MessageItem({ message }: { message: ConversationMessage }) {
  if (message.authorType === "system") {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
          {message.body} · <Timestamp value={message.createdAt} />
        </div>
      </div>
    );
  }
  const customer = message.authorType === "customer";
  const bot = message.authorType === "bot";
  return (
    <div className={cn("flex", customer ? "justify-end" : "justify-start")}>
      <div className="max-w-[88%] sm:max-w-[75%]">
        <div className={cn("mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground", customer && "justify-end")}>
          {bot ? <Bot className="size-3" /> : customer ? <UserRound className="size-3" /> : <Headphones className="size-3" />}
          <span>{customer ? "Customer" : bot ? "Vox AI" : message.authorName || "Team member"}</span>
          <span>·</span>
          <Timestamp value={message.createdAt} />
        </div>
        <div className={cn(
          "whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm",
          customer
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : bot
              ? "rounded-tl-sm bg-muted"
              : "rounded-tl-sm border border-primary/20 bg-accent/60"
        )}>
          {message.body}
        </div>
        {!customer && message.deliveryStatus && (
          <div className="mt-1 flex items-center gap-1 text-[10px] capitalize text-muted-foreground">
            {message.deliveryStatus === "delivered" ? <CheckCheck className="size-3" /> : <Check className="size-3" />}
            <span className={message.deliveryStatus === "failed" ? "text-danger" : undefined}>{message.deliveryStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteItem({ note }: { note: ConversationNote }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
        <StickyNote className="size-3" /> Internal note · {note.authorName || note.authorUserId} · <Timestamp value={note.createdAt} />
      </div>
      <p className="whitespace-pre-wrap break-words">{note.body}</p>
    </div>
  );
}

function LegacyMessage({ role, text }: { role: "agent" | "caller"; text: string }) {
  const customer = role === "caller";
  return (
    <div className={cn("flex", customer ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm sm:max-w-[75%]",
        customer ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted"
      )}>{text}</div>
    </div>
  );
}

function Composer({
  conversation,
  replyRequestId,
}: {
  conversation: InboxConversation;
  replyRequestId: string;
}) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [noteState, noteAction] = useActionState(addInboxNote, {});
  const [replyState, replyAction] = useActionState(sendInboxReply, {});
  const supportsReply = conversation.channel === "whatsapp" || conversation.channel === "sms" || conversation.channel === "chat";
  const resolved = conversation.inboxStatus === "resolved";

  return (
    <div className="sticky bottom-16 z-10 border-t border-border bg-card px-4 py-3 lg:bottom-0 sm:px-5">
      <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="Composer mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "reply"}
          onClick={() => setMode("reply")}
          className={composerTabClass(mode === "reply")}
        >
          <Send className="size-3.5" />Reply
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "note"}
          onClick={() => setMode("note")}
          className={composerTabClass(mode === "note")}
        >
          <StickyNote className="size-3.5" />Internal note
        </button>
      </div>

      {mode === "note" ? (
        <form action={noteAction} className="space-y-2">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <Textarea name="body" maxLength={4000} rows={3} placeholder="Add context for your team…" aria-describedby="note-privacy" required />
          <div className="flex items-center justify-between gap-3">
            <p id="note-privacy" className="text-xs text-muted-foreground">Only your team can see internal notes.</p>
            <ActionButton label="Add note" pendingLabel="Adding…" icon={StickyNote} variant="secondary" />
          </div>
          <ComposerResult state={noteState} />
        </form>
      ) : supportsReply && !resolved ? (
        <form action={replyAction} className="space-y-2">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <input type="hidden" name="idempotencyKey" value={replyRequestId} />
          <Textarea
            name="body"
            maxLength={4000}
            rows={3}
            placeholder={`Reply via ${conversation.channel === "whatsapp" ? "WhatsApp" : conversation.channel === "sms" ? "SMS" : "website chat"}…`}
            aria-describedby="reply-behavior"
            required
          />
          <div className="flex items-center justify-between gap-3">
            <p id="reply-behavior" className="text-xs text-muted-foreground">
              {conversation.botMode === "active" ? "Sending a human reply pauses AI for this conversation." : "AI is paused for this conversation."}
            </p>
            <ActionButton label="Send reply" pendingLabel="Sending…" icon={Send} variant="primary" />
          </div>
          <ComposerResult state={replyState} />
        </form>
      ) : (
        <div className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">
          {resolved
            ? "Reopen this conversation before sending a reply. You can still add an internal note."
            : conversation.channel === "voice"
              ? "Phone-call transcripts are read-only here. Call the customer back or use SMS Messaging if the number supports it."
              : "A reply cannot be sent on this channel. You can add an internal note or follow up using the captured contact details."}
        </div>
      )}
    </div>
  );
}

function ComposerResult({ state }: { state: { ok?: boolean; message?: string; error?: string } }) {
  if (state.error) return <p className="text-xs text-danger" role="alert">{state.error}</p>;
  if (state.ok && state.message) return <p className="text-xs text-success" role="status">{state.message}</p>;
  return null;
}

function MarkRead({ conversationId, unreadCount }: { conversationId: string; unreadCount: number }) {
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (unreadCount < 1) return;
    const formData = new FormData();
    formData.set("conversationId", conversationId);
    startTransition(() => markConversationRead(formData));
  }, [conversationId, unreadCount]);
  return null;
}

function PendingButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="icon" variant="secondary" aria-label={label} title={label} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Check />}
    </Button>
  );
}

function ActionButton({
  label,
  pendingLabel,
  icon: Icon,
  variant,
}: {
  label: string;
  pendingLabel: string;
  icon: typeof Check;
  variant: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Icon />}
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Timestamp({ value }: { value: string }) {
  const parsed = new Date(value);
  const exact = Number.isNaN(parsed.getTime())
    ? value
    : `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  return <time dateTime={value} title={exact}>{timeAgo(value)}</time>;
}

function inboxHref(filters: InboxFilters, overrides: Partial<InboxFilters> & { conversation?: string | null } = {}) {
  const params = new URLSearchParams();
  const next = { ...filters, ...overrides };
  if (next.q) params.set("q", next.q);
  if (next.view && next.view !== "all") params.set("view", next.view);
  if (next.channel) params.set("channel", next.channel);
  if (next.priority) params.set("priority", next.priority);
  if (next.assignee) params.set("assignee", next.assignee);
  if (overrides.conversation) params.set("conversation", overrides.conversation);
  const query = params.toString();
  return `/dashboard/conversations${query ? `?${query}` : ""}`;
}

function composerTabClass(active: boolean) {
  return cn(
    "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  );
}

const controlClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
