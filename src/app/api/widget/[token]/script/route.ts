import { getWidgetByToken } from "@/lib/repository";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const widget = await getWidgetByToken(token);
  if (!widget) return new Response("Widget not found", { status: 404 });
  const origin = new URL(req.url).origin;
  const color = String(widget.primary_color || "#0F766E");
  const script = `(()=>{if(document.getElementById("vox-widget-launcher"))return;const f=document.createElement("iframe"),b=document.createElement("button");f.id="vox-widget-frame";f.src=${JSON.stringify(`${origin}/widget/${token}`)};f.title="Vox chat";f.style.cssText="display:none;position:fixed;right:20px;bottom:84px;width:380px;height:560px;max-width:calc(100vw - 24px);max-height:calc(100vh - 110px);border:0;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.22);z-index:2147483647;background:white";b.id="vox-widget-launcher";b.type="button";b.setAttribute("aria-label","Open chat");b.textContent="Chat";b.style.cssText="position:fixed;right:20px;bottom:20px;border:0;border-radius:999px;padding:14px 20px;background:${color};color:white;font:600 14px system-ui;box-shadow:0 8px 30px rgba(0,0,0,.2);cursor:pointer;z-index:2147483647";b.onclick=()=>{const open=f.style.display!=="none";f.style.display=open?"none":"block";b.textContent=open?"Chat":"Close"};document.body.append(f,b)})();`;
  return new Response(script, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300" } });
}
