import { Topbar } from "@/components/dashboard/topbar";
import { AppointmentsView } from "@/components/dashboard/appointments-view";
import { listAppointments } from "@/lib/repository";
import { getSession } from "@/lib/auth/session-cookies";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const session = await getSession();
  const appointments = await listAppointments(session?.workspaceId);

  return (
    <>
      <Topbar title="Appointments" />
      <div className="space-y-6 p-4 sm:p-6">
        <AppointmentsView appointments={appointments} />
      </div>
    </>
  );
}
