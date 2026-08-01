import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { requireSession } from "@/lib/auth/session-cookies";

function initials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length) {
    return parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export async function Topbar({ title, search = "" }: { title: string; search?: string }) {
  const session = await requireSession();
  const userInitials = initials(session.name, session.email);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <form action="/dashboard/conversations" method="get" role="search" className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring sm:flex">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="conversation-search" className="sr-only">Search conversations</label>
          <input
            id="conversation-search"
            name="q"
            type="search"
            defaultValue={search}
            maxLength={100}
            placeholder="Search conversations…"
            className="w-48 bg-transparent text-foreground outline-none placeholder:text-muted-foreground lg:w-56"
          />
        </form>
        <Link
          href="/dashboard/conversations"
          aria-label="View recent conversation activity"
          title="Recent conversation activity"
          className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          <Bell className="size-4" aria-hidden="true" />
        </Link>
        <Link
          href="/dashboard/settings"
          aria-label={`Open account settings for ${session.name || session.email}`}
          title={session.name || session.email}
          className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground ring-offset-background hover:ring-2 hover:ring-ring hover:ring-offset-2"
        >
          {userInitials}
        </Link>
      </div>
    </header>
  );
}
