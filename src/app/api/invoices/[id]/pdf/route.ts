import { getSession } from "@/lib/auth/session-cookies";
import { getClientInvoiceById, getWorkspaceName } from "@/lib/repository";
import { renderInvoicePdf } from "@/lib/invoices";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new Response("Not authenticated", { status: 401 });

  const { id } = await params;
  const invoice = await getClientInvoiceById(id, session.workspaceId);
  if (!invoice) return new Response("Not found", { status: 404 });

  const businessName = await getWorkspaceName(session.workspaceId);
  const pdfBytes = await renderInvoicePdf(invoice, businessName);

  return new Response(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.id}.pdf"`,
    },
  });
}
