import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Plans & pricing" },
  { href: "/demo", label: "Hear Vox live" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav aria-label="Primary navigation" className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-base text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Sign in</Link>
          <Link href="/signup" className={cn(buttonVariants({ size: "sm" }))}>Build my bot</Link>
        </div>
        <details className="group relative sm:hidden">
          <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-md border bg-background [&::-webkit-details-marker]:hidden" aria-label="Open navigation"><Menu className="size-5" /></summary>
          <nav aria-label="Mobile navigation" className="absolute right-0 top-13 z-50 w-64 space-y-1 rounded-xl border bg-card p-3 shadow-xl">
            {links.map(link => <Link key={link.href} href={link.href} className="block rounded-md px-3 py-3 text-base font-medium hover:bg-muted">{link.label}</Link>)}
            <div className="my-2 border-t" />
            <Link href="/login" className="block rounded-md px-3 py-3 text-base font-medium hover:bg-muted">Sign in</Link>
            <Link href="/signup" className={cn(buttonVariants(), "mt-2 w-full")}>Build my bot</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
