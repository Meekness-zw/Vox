import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Resend } from "resend";
import { insertClientInvoice } from "@/lib/repository";
import type { ClientInvoice, InvoiceLineItem } from "@/lib/types";

export function hasEmailCredentials() {
  return Boolean(process.env.RESEND_API_KEY);
}

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/* ---- creation ---------------------------------------------------------------- */

export async function createInvoice(opts: {
  workspaceId: string;
  agentId?: string;
  conversationId?: string;
  contactName: string;
  contactEmail: string;
  lineItems: InvoiceLineItem[];
  notes?: string;
  businessName?: string;
}): Promise<{ invoice: ClientInvoice; emailed: boolean }> {
  const subtotalCents = opts.lineItems.reduce(
    (sum, li) => sum + li.quantity * li.unitPriceCents,
    0
  );

  const invoice: ClientInvoice = {
    id: "inv_" + Math.random().toString(36).slice(2, 10),
    agentId: opts.agentId,
    conversationId: opts.conversationId,
    contactName: opts.contactName,
    contactEmail: opts.contactEmail,
    lineItems: opts.lineItems,
    subtotalCents,
    totalCents: subtotalCents,
    status: "draft",
    notes: opts.notes,
    createdAt: new Date().toISOString(),
  };

  const pdfBytes = await renderInvoicePdf(invoice, opts.businessName);
  const { sent } = await sendInvoiceEmail(invoice, pdfBytes);
  if (sent) {
    invoice.status = "sent";
    invoice.sentAt = new Date().toISOString();
  }

  await insertClientInvoice(invoice, opts.workspaceId);
  return { invoice, emailed: sent };
}

/* ---- PDF rendering (pure function, always works, no env dependency) --------- */

export async function renderInvoicePdf(
  invoice: ClientInvoice,
  businessName = "Your Business"
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 56;
  let y = 792 - margin;
  const line = (text: string, size: number, useBold = false, color = rgb(0.1, 0.1, 0.12)) => {
    page.drawText(text, { x: margin, y, size, font: useBold ? bold : font, color });
    y -= size + 10;
  };

  line(businessName, 18, true);
  line("INVOICE", 12, true, rgb(0.4, 0.3, 1));
  y -= 6;
  line(`Invoice #${invoice.id}`, 10);
  line(`Date: ${new Date(invoice.createdAt).toLocaleDateString("en-US")}`, 10);
  y -= 10;
  line("Bill to:", 11, true);
  line(invoice.contactName, 10);
  line(invoice.contactEmail, 10);
  y -= 16;

  // Line item table header
  const cols = { desc: margin, qty: 360, price: 430, total: 510 };
  page.drawText("Description", { x: cols.desc, y, size: 10, font: bold });
  page.drawText("Qty", { x: cols.qty, y, size: 10, font: bold });
  page.drawText("Price", { x: cols.price, y, size: 10, font: bold });
  page.drawText("Total", { x: cols.total, y, size: 10, font: bold });
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 556, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.88),
  });
  y -= 16;

  for (const li of invoice.lineItems) {
    const lineTotal = li.quantity * li.unitPriceCents;
    page.drawText(li.description, { x: cols.desc, y, size: 10, font });
    page.drawText(String(li.quantity), { x: cols.qty, y, size: 10, font });
    page.drawText(usd(li.unitPriceCents), { x: cols.price, y, size: 10, font });
    page.drawText(usd(lineTotal), { x: cols.total, y, size: 10, font });
    y -= 20;
  }

  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 556, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.88),
  });
  y -= 24;
  page.drawText("Total", { x: cols.price, y, size: 12, font: bold });
  page.drawText(usd(invoice.totalCents), { x: cols.total, y, size: 12, font: bold });

  if (invoice.notes) {
    y -= 40;
    line("Notes", 10, true);
    line(invoice.notes, 10);
  }

  return doc.save();
}

/* ---- email -------------------------------------------------------------------- */

/**
 * Emails the invoice PDF via Resend. Returns { sent: false } (never throws)
 * when RESEND_API_KEY is unset or the send fails, so invoice creation always
 * succeeds — the invoice is just left in "draft" for manual follow-up.
 */
export async function sendInvoiceEmail(
  invoice: ClientInvoice,
  pdfBytes: Uint8Array
): Promise<{ sent: boolean }> {
  if (!hasEmailCredentials()) return { sent: false };
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.INVOICE_FROM_EMAIL ?? "invoices@vox.ai",
      to: invoice.contactEmail,
      subject: `Invoice #${invoice.id}`,
      text: `Hi ${invoice.contactName}, please find your invoice attached. Total due: ${usd(invoice.totalCents)}.`,
      attachments: [
        { filename: `${invoice.id}.pdf`, content: Buffer.from(pdfBytes) },
      ],
    });
    return { sent: !error };
  } catch {
    return { sent: false };
  }
}
