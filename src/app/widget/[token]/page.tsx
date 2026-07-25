import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getWidgetByToken } from "@/lib/repository";
import { WidgetClient } from "./widget-client";

export const dynamic = "force-dynamic";

export default async function WidgetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const config = await getWidgetByToken(token);
  if (!config) notFound();
  const allowed = Array.isArray(config.allowed_domains)
    ? config.allowed_domains.map(String)
    : [];
  const referer = (await headers()).get("referer");
  if (allowed.length && referer) {
    let host = "";
    try { host = new URL(referer).hostname.toLowerCase(); } catch {}
    if (!allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) notFound();
  }
  return <WidgetClient token={token} title={String(config.title)}
    welcome={String(config.welcome_message)} color={String(config.primary_color)} />;
}
