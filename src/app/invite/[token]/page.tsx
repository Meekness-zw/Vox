import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { getTeamInvitation } from "@/lib/repository";
import { acceptInvitation } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getTeamInvitation(createHash("sha256").update(token).digest("hex"));
  if (!invite) notFound();
  return <main className="mx-auto flex min-h-screen max-w-md items-center p-5">
    <Card className="w-full"><CardHeader><CardTitle>Join the Vox workspace</CardTitle>
      <p className="text-sm text-muted-foreground">Invited as {String(invite.role)} · {String(invite.email)}</p>
    </CardHeader><CardContent>
      <form action={acceptInvitation.bind(null, token)} className="space-y-4">
        <Input name="name" placeholder="Your full name" maxLength={120} required />
        <Input name="password" type="password" placeholder="Create password (8–128 characters)" minLength={8} maxLength={128} required />
        <Button className="w-full">Accept invitation</Button>
      </form>
    </CardContent></Card>
  </main>;
}
