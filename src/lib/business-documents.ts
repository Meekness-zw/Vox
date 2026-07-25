import { PDFDocument, StandardFonts, rgb, type RGB } from "pdf-lib";
import {
  getDocumentTemplate,
  getWorkspaceName,
  insertBusinessDocument,
} from "@/lib/repository";
import { initSchema, isDbEnabled } from "@/lib/db";
import type {
  BusinessDocument,
  BusinessDocumentType,
  DocumentLineItem,
  DocumentTemplate,
} from "@/lib/types";

const prefixes: Record<BusinessDocumentType, string> = {
  invoice: "INV",
  receipt: "RCT",
  quotation: "QUO",
  delivery_order: "DO",
  purchase_order: "PO",
  credit_note: "CN",
};

export const documentTypeLabels: Record<BusinessDocumentType, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  quotation: "Quotation",
  delivery_order: "Delivery order",
  purchase_order: "Purchase order",
  credit_note: "Credit note",
};

export function defaultDocumentTemplate(businessName: string): DocumentTemplate {
  return {
    businessName,
    primaryColor: "#6D5DFB",
    accentColor: "#111827",
    currency: "USD",
    address: "",
    phone: "",
    email: "",
    taxNumber: "",
    footer: "Thank you for your business.",
    paymentTerms: "Payment due on receipt.",
    updatedAt: new Date().toISOString(),
  };
}

export async function resolveDocumentTemplate(workspaceId: string) {
  const existing = await getDocumentTemplate(workspaceId);
  if (existing) return existing;
  return defaultDocumentTemplate(await getWorkspaceName(workspaceId));
}

export async function createBusinessDocument(opts: {
  workspaceId: string;
  agentId?: string;
  conversationId?: string;
  type: BusinessDocumentType;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  lineItems: DocumentLineItem[];
  taxRatePercent?: number;
  notes?: string;
  dueDate?: string;
  metadata?: Record<string, string>;
}): Promise<BusinessDocument> {
  if (isDbEnabled) await initSchema();
  const now = new Date();
  const subtotalCents = opts.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0
  );
  const taxCents = Math.round(
    subtotalCents * Math.max(0, opts.taxRatePercent ?? 0) / 100
  );
  const document: BusinessDocument = {
    id: "doc_" + crypto.randomUUID(),
    agentId: opts.agentId,
    conversationId: opts.conversationId,
    type: opts.type,
    number: `${prefixes[opts.type]}-${now.getFullYear()}-${String(now.getTime()).slice(-7)}`,
    status: opts.type === "receipt" ? "paid" : "issued",
    contactName: opts.contactName,
    contactEmail: opts.contactEmail,
    contactPhone: opts.contactPhone,
    contactAddress: opts.contactAddress,
    lineItems: opts.lineItems,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    currency: (await resolveDocumentTemplate(opts.workspaceId)).currency,
    notes: opts.notes,
    metadata: opts.metadata ?? {},
    issueDate: now.toISOString().slice(0, 10),
    dueDate: opts.dueDate,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await insertBusinessDocument(document, opts.workspaceId);
  return document;
}

function hexColor(value: string, fallback: RGB) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value);
  if (!match) return fallback;
  const n = Number.parseInt(match[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function pdfText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, " ").slice(0, 110);
}

export async function renderBusinessDocumentPdf(
  item: BusinessDocument,
  template: DocumentTemplate
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = hexColor(template.primaryColor, rgb(0.43, 0.36, 0.98));
  const accent = hexColor(template.accentColor, rgb(0.07, 0.09, 0.14));
  const muted = rgb(0.4, 0.43, 0.48);
  const margin = 48;
  let y = 744;

  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | undefined;
  if (template.logoUrl) {
    try {
      const url = new URL(template.logoUrl);
      const blockedHost =
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "::1" ||
        /^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
      if (url.protocol !== "https:" || blockedHost) throw new Error("Unsafe logo URL");
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(4_000),
      });
      const length = Number(response.headers.get("content-length") ?? 0);
      if (!response.ok || length > 2_000_000) throw new Error("Logo unavailable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2_000_000) throw new Error("Logo too large");
      const contentType = response.headers.get("content-type") ?? "";
      logo = contentType.includes("png")
        ? await pdf.embedPng(bytes)
        : contentType.includes("jpeg") || contentType.includes("jpg")
          ? await pdf.embedJpg(bytes)
          : undefined;
    } catch {
      // A broken logo must never prevent a business document from being issued.
    }
  }

  const draw = (text: string, x: number, size = 10, strong = false, color = accent) => {
    page.drawText(pdfText(text), { x, y, size, font: strong ? bold : font, color });
  };
  const next = (amount = 18) => { y -= amount; };
  const newPage = () => {
    page = pdf.addPage([612, 792]);
    y = 744;
  };

  page.drawRectangle({ x: 0, y: 772, width: 612, height: 20, color: primary });
  if (logo) {
    const dimensions = logo.scale(Math.min(80 / logo.width, 38 / logo.height));
    page.drawImage(logo, {
      x: margin,
      y: y - dimensions.height + 5,
      width: dimensions.width,
      height: dimensions.height,
    });
  }
  draw(template.businessName || "Your Business", logo ? 142 : margin, 20, true);
  draw(documentTypeLabels[item.type].toUpperCase(), 410, 13, true, primary);
  next(27);
  if (template.address) { draw(template.address, margin, 9, false, muted); next(14); }
  const contactLine = [template.phone, template.email].filter(Boolean).join("  |  ");
  if (contactLine) { draw(contactLine, margin, 9, false, muted); next(14); }
  if (template.taxNumber) { draw(`Tax / registration: ${template.taxNumber}`, margin, 9, false, muted); next(14); }

  y = Math.min(y - 14, 650);
  draw(`Document no: ${item.number}`, margin, 10, true);
  draw(`Issue date: ${item.issueDate}`, 390, 10);
  next(18);
  if (item.dueDate) { draw(`Due date: ${item.dueDate}`, 390, 10); next(18); }
  next(10);

  draw(item.type === "delivery_order" ? "Deliver to" : "Prepared for", margin, 10, true, primary);
  next(17);
  draw(item.contactName, margin, 11, true);
  next(16);
  for (const value of [item.contactAddress, item.contactEmail, item.contactPhone].filter(Boolean)) {
    draw(String(value), margin, 9, false, muted);
    next(14);
  }
  next(16);

  const columns = { description: margin, quantity: 352, unit: 420, amount: 506 };
  page.drawRectangle({ x: margin, y: y - 6, width: 516, height: 26, color: primary });
  draw("Description", columns.description + 7, 9, true, rgb(1, 1, 1));
  draw("Qty", columns.quantity, 9, true, rgb(1, 1, 1));
  draw("Unit", columns.unit, 9, true, rgb(1, 1, 1));
  draw("Amount", columns.amount, 9, true, rgb(1, 1, 1));
  next(34);

  for (const line of item.lineItems) {
    if (y < 125) newPage();
    draw(line.description, columns.description, 9);
    draw(String(line.quantity), columns.quantity, 9);
    draw(money(line.unitPriceCents, item.currency), columns.unit, 9);
    draw(money(line.quantity * line.unitPriceCents, item.currency), columns.amount, 9);
    next(22);
    page.drawLine({
      start: { x: margin, y: y + 8 },
      end: { x: 564, y: y + 8 },
      thickness: 0.5,
      color: rgb(0.88, 0.89, 0.92),
    });
  }

  next(12);
  draw("Subtotal", 420, 10);
  draw(money(item.subtotalCents, item.currency), 506, 10, true);
  next(19);
  if (item.taxCents) {
    draw("Tax", 420, 10);
    draw(money(item.taxCents, item.currency), 506, 10, true);
    next(19);
  }
  page.drawRectangle({ x: 408, y: y - 8, width: 156, height: 28, color: primary });
  draw("TOTAL", 420, 11, true, rgb(1, 1, 1));
  draw(money(item.totalCents, item.currency), 490, 11, true, rgb(1, 1, 1));

  y -= 55;
  if (item.notes) {
    draw("Notes", margin, 10, true, primary);
    next(17);
    draw(item.notes, margin, 9);
    next(22);
  }
  if (item.type !== "receipt" && template.paymentTerms) {
    draw("Terms", margin, 10, true, primary);
    next(17);
    draw(template.paymentTerms, margin, 9);
  }
  page.drawText(pdfText(template.footer), {
    x: margin,
    y: 38,
    size: 8,
    font,
    color: muted,
  });
  return pdf.save();
}
