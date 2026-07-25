"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  MessagesSquare,
  BookOpen,
  Send,
  CalendarClock,
  Receipt,
  Files,
  Settings,
  CreditCard,
  LifeBuoy,
  LogOut,
  ClipboardPlus,
  ShieldCheck,
  Boxes,
  UsersRound,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { logout } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/dashboard/appointments", label: "Appointments", icon: CalendarClock },
  { href: "/dashboard/invoices", label: "Invoices", icon: Receipt },
  { href: "/dashboard/documents", label: "Documents", icon: Files },
  { href: "/dashboard/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/dashboard/sms", label: "SMS Automation", icon: Send },
];

const secondary = [
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

function SidebarItem({ href, label, icon: Icon, active }: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return <Link href={href} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors", active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4" />{label}</Link>;
}

export function Sidebar({
  user,
  admin = false,
}: {
  user: { name: string; email: string };
  admin?: boolean;
}) {
  const pathname = usePathname();
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 p-3">
        <SidebarItem href="/dashboard/request-bot" label="Request a bot" icon={ClipboardPlus} active={isActive("/dashboard/request-bot")} />
        {nav.map((item) => (
          <SidebarItem key={item.href} {...item} active={isActive(item.href, item.exact)} />
        ))}
        {admin && <>
          <SidebarItem href="/dashboard/admin/clients" label="Users & subscriptions" icon={UsersRound} active={isActive("/dashboard/admin/clients")} />
          <SidebarItem href="/dashboard/admin/bots" label="Bot administration" icon={Boxes} active={isActive("/dashboard/admin/bots")} />
          <SidebarItem href="/dashboard/admin/requests" label="Bot build queue" icon={ShieldCheck} active={isActive("/dashboard/admin/requests")} />
        </>}
        <div className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Account
        </div>
        {secondary.map((item) => (
          <SidebarItem key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <a
          href="mailto:support@vox.ai"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LifeBuoy className="size-4" />
          Support
        </a>
        <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-border p-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {user.email}
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              title="Sign out"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
