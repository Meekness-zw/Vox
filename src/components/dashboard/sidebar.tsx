"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  MessagesSquare,
  BookOpen,
  Send,
  Settings,
  CreditCard,
  LifeBuoy,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { logout } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/dashboard/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/dashboard/sms", label: "SMS Automation", icon: Send },
];

const secondary = [
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

export function Sidebar({
  user,
}: {
  user: { name: string; email: string };
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

  const Item = ({
    href,
    label,
    icon: Icon,
    exact,
  }: {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    exact?: boolean;
  }) => (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive(href, exact)
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => (
          <Item key={item.href} {...item} />
        ))}
        <div className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Account
        </div>
        {secondary.map((item) => (
          <Item key={item.href} {...item} />
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
