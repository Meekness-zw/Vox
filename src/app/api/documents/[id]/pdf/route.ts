import { requireSession } from "@/lib/auth/session-cookies";
import { renderBusinessDocumentPdf, resolveDocumentTemplate } from "@/lib/business-documents";
import { initSchema } from "@/lib/db";
import { getBusinessDocumentById } from "@/lib/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  await initSchema();
  const { id } = await params;
  const item = await getBusinessDocumentById(id, session.workspaceId);
  if (!item) return new Response("Not found", { status: 404 });
  const template = await resolveDocumentTemplate(session.workspaceId);
  const bytes = await renderBusinessDocumentPdf(item, template);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${item.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
