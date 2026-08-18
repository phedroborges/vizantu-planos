import { NextRequest, NextResponse } from "next/server";
import { CLIENT_SESSION_COOKIE, signClientSession } from "@/lib/client-session";
import { resolveClientToken } from "@/lib/plans-db";

// Atrás do proxy do EasyPanel, request.url chega como http://localhost:3000
// — montar o destino a partir dele mandava o cliente pra localhost. O
// destino real vem do host que o proxy repassa (x-forwarded-*), com
// NEXT_PUBLIC_SITE_URL como fallback.
function absoluteUrl(request: NextRequest, path: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}${path}`;
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return base ? `${base}${path}` : new URL(path, request.url).toString();
}

// Ponto de entrada do link mágico: valida o token (revogado/expirado/
// inexistente => tela de erro), credencia um cookie de sessão httpOnly
// assinado e redireciona pra rota estável /c/dashboard — assim o token cru
// não fica sendo reenviado a cada navegação/aprovação.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let client;
  try {
    client = await resolveClientToken(token);
  } catch (err) {
    // Falha de configuração/infra (ex.: credenciais do Supabase inválidas)
    // não pode virar um 500 cru na cara do cliente — manda pra tela de erro
    // com um motivo, e deixa o detalhe no log do servidor pro time.
    console.error("[/c/token] falha ao resolver token:", err);
    return NextResponse.redirect(absoluteUrl(request, "/c/invalido?motivo=config"));
  }

  if (!client) return NextResponse.redirect(absoluteUrl(request, "/c/invalido"));

  const response = NextResponse.redirect(absoluteUrl(request, "/c/dashboard"));
  response.cookies.set(CLIENT_SESSION_COOKIE, signClientSession(client.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 dias — é um link persistente, não uma sessão curta
  });
  return response;
}
