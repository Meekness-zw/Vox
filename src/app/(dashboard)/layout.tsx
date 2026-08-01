import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getSession } from "@/lib/auth/session-cookies";
import { isVoxAdmin } from "@/lib/admin";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: session.name, email: session.email }} role={session.role} admin={isVoxAdmin(session.email)} />
      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">{children}</div>
    </div>
  );
}
