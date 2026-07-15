import { isAllowedSlug } from "@/lib/slug";
import { getPlan } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return new Response(result.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-modals allow-downloads",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
