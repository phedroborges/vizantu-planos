import { NextRequest, NextResponse } from "next/server";
import { CLIENT_SESSION_COOKIE, signClientSession } from "@/lib/client-session";
import { resolveClientToken } from "@/lib/plans-db";

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
    // Falha de configuração/infra (ex.: variáveis do Supabase ausentes) não
    // pode virar um 500 cru na cara do cliente — manda pra tela de erro com
    // um motivo, e deixa o detalhe no log do servidor pro time.
    console.error("[/c/token] falha ao resolver token:", err);
    return NextResponse.redirect(new URL("/c/invalido?motivo=config", request.url));
  }

  if (!client) return NextResponse.redirect(new URL("/c/invalido", request.url));

  const response = NextResponse.redirect(new URL("/c/dashboard", request.url));
  response.cookies.set(CLIENT_SESSION_COOKIE, signClientSession(client.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 dias — é um link persistente, não uma sessão curta
  });
  return response;
}
