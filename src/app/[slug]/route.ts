import { isAllowedSlug } from "@/lib/slug";
import { getPlan } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addStorageShim(html: string) {
  const storageShim = `<script data-vizantu-storage-shim>(function(){function memory(){var values={};return{getItem:function(key){return Object.prototype.hasOwnProperty.call(values,key)?values[key]:null},setItem:function(key,value){values[key]=String(value)},removeItem:function(key){delete values[key]},clear:function(){values={}},key:function(index){return Object.keys(values)[index]||null},get length(){return Object.keys(values).length}}}["localStorage","sessionStorage"].forEach(function(name){try{window[name].getItem("__vizantu_test__")}catch(error){try{Object.defineProperty(window,name,{configurable:true,value:memory()})}catch(ignore){}}})})();</script>`;
  if (html.includes("data-vizantu-storage-shim")) return html;
  return /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${storageShim}`) : `${storageShim}${html}`;
}

function addApprovalClient(html: string, slug: string) {
  if (html.includes("data-vizantu-approval-client")) return html;
  const client = `<script src="/approval-client.js" data-plan-slug="${slug}" data-vizantu-approval-client defer></script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${client}</body>`) : `${html}${client}`;
}

function hideApprovalMarkup(html: string) {
  if (html.includes("data-vizantu-presentation")) return html;
  const style = `<style data-vizantu-presentation>.approval,[id^="appr-"]{display:none!important}</style>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${style}</head>`) : `${style}${html}`;
}

function notFound() {
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plano não encontrado</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f2;color:#151715;font-family:Arial,sans-serif}.box{max-width:520px;padding:40px;border:1px solid #dde1dc;background:white}span{color:#88b725;font-size:12px;font-weight:700;text-transform:uppercase}h1{font-size:38px;margin:12px 0}p{color:#687068;line-height:1.6}</style></head><body><main class="box"><span>Vizantu Planos</span><h1>Este plano não está disponível.</h1><p>Confira o endereço recebido ou solicite um novo link à equipe responsável.</p></main></body></html>`, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) return notFound();
  const result = await getPlan(slug);
  if (!result) return notFound();

  const isPresentation = result.plan.kind === "presentation";
  const base = addStorageShim(result.html);
  const html = isPresentation ? hideApprovalMarkup(base) : addApprovalClient(base, slug);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-modals allow-downloads allow-popups",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
