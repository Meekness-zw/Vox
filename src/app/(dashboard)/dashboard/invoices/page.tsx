import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewInvoiceForm } from "@/components/dashboard/new-invoice-form";
import { InvoicesView } from "@/components/dashboard/invoices-view";
import { listClientInvoices } from "@/lib/repository";
import { getSession } from "@/lib/auth/session-cookies";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const session = await getSession();
  const invoices = await listClientInvoices(session?.workspaceId);

  return (
    <>
      <Topbar title="Invoices" />
      <div className="space-y-6 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>New invoice</CardTitle>
            <p className="text-sm text-muted-foreground">
              Bill a client directly — your AI agents can also create these
              automatically once a service and price are agreed in a call or
              chat.
            </p>
          </CardHeader>
          <CardContent>
            <NewInvoiceForm />
          </CardContent>
        </Card>

        <InvoicesView invoices={invoices} />
      </div>
    </>
  );
}
