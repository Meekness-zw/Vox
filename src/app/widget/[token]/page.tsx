import { notFound } from "next/navigation";
import { getWidgetByToken } from "@/lib/repository";
import { WidgetClient } from "./widget-client";

export const dynamic = "force-dynamic";

export default async function WidgetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const config = await getWidgetByToken(token);
  if (!config) notFound();
  return <WidgetClient token={token} title={String(config.title)}
    welcome={String(config.welcome_message)} color={String(config.primary_color)} />;
}
