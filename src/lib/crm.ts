import { decryptSecret } from "@/lib/token-crypto";
import { createCrmDelivery, finishCrmDelivery, getCrmConnection } from "@/lib/repository";

export async function syncCrmLead(workspaceId: string, lead: Record<string, unknown>) {
  const connection = await getCrmConnection(workspaceId);
  if (!connection || !connection.enabled) return { synced: false };
  const payload = { event: "vox.lead", workspaceId, lead };
  const deliveryId = await createCrmDelivery(workspaceId, payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (connection.secret_encrypted) {
    headers.authorization = `Bearer ${decryptSecret(String(connection.secret_encrypted))}`;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(String(connection.webhook_url), {
        method: "POST", headers, body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (deliveryId) await finishCrmDelivery(deliveryId, response.ok, response.status);
      if (response.ok) return { synced: true, status: response.status };
    } catch (error) {
      if (deliveryId) await finishCrmDelivery(deliveryId, false, undefined, error instanceof Error ? error.message : "Delivery failed");
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return { synced: false };
}
