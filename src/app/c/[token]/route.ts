import { NextRequest, NextResponse } from "next/server";
import { CLIENT_SESSION_COOKIE, signClientSession } from "@/lib/client-session";
import { resolveClientToken } from "@/lib/plans-db";

// Ponto de entrada do link mágico: valida o token (revogado/expirado/
// inexistente => tela de erro), credencia um cookie de sessão httpOnly
// assinado e redireciona pra rota estável /c/dashboard — assim o token cru
// não fica sendo reenviado a cada navegação/aprovação.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = await resolveClientToken(token);
  if (!client) {
    return NextResponse.redirect(new URL("/c/invalido", _request.url));
  }

  const response = NextResponse.redirect(new URL("/c/dashboard", _request.url));
  response.cookies.set(CLIENT_SESSION_COOKIE, signClientSession(client.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 dias — é um link persistente, não uma sessão curta
  });
  return response;
}
