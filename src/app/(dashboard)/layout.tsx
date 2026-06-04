import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getSession } from "@/lib/auth/session-cookies";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: session.name, email: session.email }} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
