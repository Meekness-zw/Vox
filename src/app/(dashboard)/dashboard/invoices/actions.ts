"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session-cookies";
import { createInvoice } from "@/lib/invoices";
import { getWorkspaceName } from "@/lib/repository";

export type CreateInvoiceState = { ok?: boolean; error?: string; message?: string };

export async function createInvoiceAction(
  _prev: CreateInvoiceState,
  formData: FormData
): Promise<CreateInvoiceState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 1) || 1;
  const unitPrice = Number(formData.get("unitPrice") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim();

  if (!contactName) return { error: "Add the client's name." };
  if (!contactEmail) return { error: "Add the client's email." };
  if (!description) return { error: "Describe the service or item." };
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return { error: "Add a valid quantity greater than zero." };
  if (!Number.isFinite(unitPrice) || !(unitPrice > 0) || unitPrice > 100_000_000) return { error: "Add a valid price greater than zero." };

  try {
    const businessName = await getWorkspaceName(session.workspaceId);
    const { invoice, emailed } = await createInvoice({
      workspaceId: session.workspaceId,
      contactName,
      contactEmail,
      lineItems: [
        { description, quantity, unitPriceCents: Math.round(unitPrice * 100) },
      ],
      notes: notes || undefined,
      businessName,
    });
    revalidatePath("/dashboard/invoices");
    return {
      ok: true,
      message: emailed
        ? `Invoice #${invoice.id} sent to ${contactEmail}.`
        : `Invoice #${invoice.id} created. Email wasn't sent — connect an email provider (RESEND_API_KEY) to send automatically, or download the PDF and send it yourself.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create invoice." };
  }
}
