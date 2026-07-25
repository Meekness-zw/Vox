import { decryptSecret } from "@/lib/token-crypto";
import { getCrmConnection } from "@/lib/repository";

export async function syncCrmLead(workspaceId: string, lead: Record<string, unknown>) {
  const connection = await getCrmConnection(workspaceId);
  if (!connection || !connection.enabled) return { synced: false };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (connection.secret_encrypted) {
    headers.authorization = `Bearer ${decryptSecret(String(connection.secret_encrypted))}`;
  }
  try {
    const response = await fetch(String(connection.webhook_url), {
      method: "POST",
      headers,
      body: JSON.stringify({ event: "vox.lead", workspaceId, lead }),
      signal: AbortSignal.timeout(8000),
    });
    return { synced: response.ok, status: response.status };
  } catch {
    return { synced: false };
  }
}
