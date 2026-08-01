import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DocumentDesignForm,
  NewBusinessDocumentForm,
} from "@/components/dashboard/document-studio";
import { requireSession } from "@/lib/auth/session-cookies";
import {
  defaultDocumentTemplate,
  documentTypeLabels,
} from "@/lib/business-documents";
import {
  getDocumentTemplate,
  getWorkspaceName,
  listBusinessDocuments,
} from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const session = await requireSession();
  const [documents, storedTemplate, businessName] = await Promise.all([
    listBusinessDocuments(session.workspaceId),
    getDocumentTemplate(session.workspaceId),
    getWorkspaceName(session.workspaceId),
  ]);
  const template = storedTemplate ?? defaultDocumentTemplate(businessName);

  return <>
    <Topbar title="Business documents" />
    <div className="space-y-6 p-4 sm:p-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Create a document</CardTitle><p className="text-sm text-muted-foreground">Create receipts, quotations, invoices, delivery orders and more. Vox agents can create the same records during conversations.</p></CardHeader><CardContent><NewBusinessDocumentForm /></CardContent></Card>
        <Card><CardHeader><CardTitle>Company document design</CardTitle><p className="text-sm text-muted-foreground">This branding is automatically applied to every PDF created by your team or bots.</p></CardHeader><CardContent><DocumentDesignForm template={template} /></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Document history</CardTitle><p className="text-sm text-muted-foreground">{documents.length} saved document{documents.length === 1 ? "" : "s"}</p></CardHeader>
        <CardContent className="divide-y p-0">
          {!documents.length && <div className="p-10 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-3 size-8" />No documents yet.</div>}
          {documents.map((item) => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><p className="font-medium">{item.number} · {documentTypeLabels[item.type]}</p><p className="truncate text-sm text-muted-foreground">{item.contactName} · {new Intl.NumberFormat("en", { style: "currency", currency: item.currency }).format(item.totalCents / 100)}</p></div>
            <Badge variant={item.status === "paid" ? "success" : "muted"}>{item.status}</Badge>
            <Link href={`/api/documents/${item.id}/pdf`} target="_blank" className="inline-flex items-center gap-2 text-sm font-medium text-primary"><Download className="size-4" />PDF</Link>
          </div>)}
        </CardContent>
      </Card>
    </div>
  </>;
}
