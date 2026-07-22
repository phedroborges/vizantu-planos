import { isAllowedSlug } from "@/lib/slug";
import { isPlanExpired } from "@/lib/approval-deadline";
import { getPlan } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addStorageShim(html: string) {
  const storageShim = `<script data-vizantu-storage-shim>(function(){function memory(){var values={};return{getItem:function(key){return Object.prototype.hasOwnProperty.call(values,key)?values[key]:null},setItem:function(key,value){values[key]=String(value)},removeItem:function(key){delete values[key]},clear:function(){values={}},key:function(index){return Object.keys(values)[index]||null},get length(){return Object.keys(values).length}}}['localStorage','sessionStorage'].forEach(function(name){try{window[name].getItem('__vizantu_test__')}catch(error){try{Object.defineProperty(window,name,{configurable:true,value:memory()})}catch(ignore){}}})})();</script>`;
  if (html.includes("data-vizantu-storage-shim")) return html;
  return /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${storageShim}`) : `${storageShim}${html}`;
}

function addDocumentBase(html: string, slug: string) {
  if (/<base\b/i.test(html)) return html;
  const base = `<base href="/${encodeURIComponent(slug)}">`;
  return /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${base}`) : `${base}${html}`;
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

function addVizantuWatermark(html: string) {
  if (html.includes("data-vizantu-watermark")) return html;
  const badge =
    `<style data-vizantu-watermark-style>` +
    `[data-vizantu-watermark]{position:fixed;left:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:9px;padding:9px 14px;border-radius:999px;background:rgba(16,16,16,.74);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 8px 24px rgba(0,0,0,.24);text-decoration:none;opacity:.9;transition:opacity .2s ease,transform .2s ease}` +
    `[data-vizantu-watermark]:hover{opacity:1;transform:translateY(-1px)}` +
    `[data-vizantu-watermark] span{font-family:Arial,Helvetica,sans-serif;font-size:8.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.66);white-space:nowrap}` +
    `[data-vizantu-watermark] img{height:15px;width:auto;display:block}` +
    `@media print{[data-vizantu-watermark],[data-vizantu-watermark-style]{display:none!important}}` +
    `@media(max-width:640px){[data-vizantu-watermark]{left:12px;bottom:12px;padding:7px 11px}[data-vizantu-watermark] span{display:none}}` +
    `</style>` +
    `<a href="https://vizantu.com.br" target="_blank" rel="noopener" data-vizantu-watermark aria-label="Plano criado pela Vizantu">` +
    `<span>Plano criado por</span><img src="/brand/vizantu-white.svg" alt="Vizantu"></a>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${badge}</body>`) : `${html}${badge}`;
}

function notFound() {
  return new Response("Plano não encontrado.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) return notFound();
  const result = await getPlan(slug);
  if (!result) return notFound();
  if (isPlanExpired(result.plan)) {
    return new Response("O prazo de aprovação terminou e este plano foi aprovado automaticamente.", {
      status: 410,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }

  const isPresentation = result.plan.kind === "presentation";
  const base = addDocumentBase(addStorageShim(result.html), slug);
  const withApproval = isPresentation ? hideApprovalMarkup(base) : addApprovalClient(base, slug);
  const html = addVizantuWatermark(withApproval);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
