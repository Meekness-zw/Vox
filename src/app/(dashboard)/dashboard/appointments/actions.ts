"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session-cookies";
import { cancelAppointment } from "@/lib/calendar";

export async function cancelAppointmentAction(id: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  await cancelAppointment(id, session.workspaceId);
  revalidatePath("/dashboard/appointments");
  return { ok: true };
}
