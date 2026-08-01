"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session-cookies";
import {
  createBusinessDocument,
  defaultDocumentTemplate,
} from "@/lib/business-documents";
import {
  getDocumentTemplate,
  getWorkspaceName,
  upsertDocumentTemplate,
} from "@/lib/repository";
import type { BusinessDocumentType } from "@/lib/types";

export type DocumentActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

const allowedTypes = new Set<BusinessDocumentType>([
  "invoice",
  "receipt",
  "quotation",
  "delivery_order",
  "purchase_order",
  "credit_note",
]);

export async function createDocumentAction(
  _previous: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  const session = await requireSession();
  const type = String(formData.get("type") ?? "") as BusinessDocumentType;
  const contactName = String(formData.get("contactName") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const quantity = Math.max(1, Number(formData.get("quantity") ?? 1));
  const unitPrice = Number(formData.get("unitPrice") ?? 0);
  const taxRate = Math.max(0, Number(formData.get("taxRate") ?? 0));

  if (!allowedTypes.has(type)) return { error: "Choose a valid document type." };
  if (!contactName) return { error: "Add the customer or company name." };
  if (!description) return { error: "Add an item or service description." };
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    return { error: "Enter a valid quantity." };
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100_000_000 ||
      !Number.isFinite(taxRate) || taxRate > 100) {
    return { error: "Enter a valid unit price." };
  }

  try {
    const item = await createBusinessDocument({
      workspaceId: session.workspaceId,
      type,
      contactName,
      contactEmail: String(formData.get("contactEmail") ?? "").trim() || undefined,
      contactPhone: String(formData.get("contactPhone") ?? "").trim() || undefined,
      contactAddress: String(formData.get("contactAddress") ?? "").trim() || undefined,
      lineItems: [{
        description,
        quantity,
        unitPriceCents: Math.round(unitPrice * 100),
        sku: String(formData.get("sku") ?? "").trim() || undefined,
      }],
      taxRatePercent: taxRate,
      notes: String(formData.get("notes") ?? "").trim() || undefined,
      dueDate: String(formData.get("dueDate") ?? "").trim() || undefined,
      metadata: {
        deliveryReference:
          String(formData.get("deliveryReference") ?? "").trim(),
      },
    });
    revalidatePath("/dashboard/documents");
    return { ok: true, message: `${item.number} created and saved.` };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Document creation failed.",
    };
  }
}

export async function saveDocumentTemplateAction(
  _previous: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  const session = await requireSession();
  const current =
    (await getDocumentTemplate(session.workspaceId)) ??
    defaultDocumentTemplate(await getWorkspaceName(session.workspaceId));
  const primaryColor = String(formData.get("primaryColor") ?? "");
  const accentColor = String(formData.get("accentColor") ?? "");
  if (!/^#[0-9a-f]{6}$/i.test(primaryColor) || !/^#[0-9a-f]{6}$/i.test(accentColor)) {
    return { error: "Choose valid document colours." };
  }
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  if (logoUrl && !/^https:\/\//i.test(logoUrl)) {
    return { error: "The logo must use a secure HTTPS URL." };
  }

  await upsertDocumentTemplate({
    ...current,
    businessName: String(formData.get("businessName") ?? "").trim() || current.businessName,
    logoUrl: logoUrl || undefined,
    primaryColor,
    accentColor,
    currency: String(formData.get("currency") ?? "USD").trim().toUpperCase().slice(0, 3),
    address: String(formData.get("address") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    taxNumber: String(formData.get("taxNumber") ?? "").trim(),
    footer: String(formData.get("footer") ?? "").trim(),
    paymentTerms: String(formData.get("paymentTerms") ?? "").trim(),
    updatedAt: new Date().toISOString(),
  }, session.workspaceId);
  revalidatePath("/dashboard/documents");
  return { ok: true, message: "Document design saved for every new PDF." };
}
