import Link from "next/link";
import { Logo } from "@/components/logo";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/demo", label: "Live demo" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Use cases",
    links: [
      { href: "/features", label: "AI phone receptionist" },
      { href: "/features", label: "Website chat" },
      { href: "/features", label: "SMS messaging" },
      { href: "/features", label: "Appointment booking" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/signup", label: "Create an account" },
      { href: "/demo", label: "Try the live demo" },
      { href: "/login", label: "Client sign in" },
      { href: "mailto:meeknesskaboti@gmail.com", label: "Contact Vox" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-base leading-7 text-muted-foreground">
            AI voice & chat agents that answer every call and message, 24/7.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h4 className="text-sm font-semibold">{col.title}</h4>
            <ul className="mt-3 space-y-2">
              {col.links.map((l, i) => (
                <li key={`${l.label}-${i}`}>
                  <Link
                    href={l.href}
                    className="text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Vox AI. AI receptionists for calls and messages.
        </div>
      </div>
    </footer>
  );
}
