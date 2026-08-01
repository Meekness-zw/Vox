import { notFound } from "next/navigation";
import { getWidgetByToken } from "@/lib/repository";
import { WidgetClient } from "./widget-client";
import { verifyWidgetEmbed } from "@/lib/widget-auth";

export const dynamic = "force-dynamic";

export default async function WidgetPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ proof?: string }> }) {
  const { token } = await params;
  const config = await getWidgetByToken(token);
  if (!config) notFound();
  const allowed = Array.isArray(config.allowed_domains)
    ? config.allowed_domains.map(String)
    : [];
  const proof = (await searchParams).proof ?? "";
  if (allowed.length && !verifyWidgetEmbed(proof, token, allowed)) notFound();
  return <WidgetClient token={token} title={String(config.title)}
    welcome={String(config.welcome_message)} color={String(config.primary_color)} embedProof={proof} />;
}
