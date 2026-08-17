import crypto from "node:crypto";

export const CLIENT_SESSION_COOKIE = "vz_client_session";

function secret(): string {
  const value = process.env.CLIENT_SESSION_SECRET;
  if (!value) throw new Error("CLIENT_SESSION_SECRET ausente — necessário pra assinar a sessão do link mágico.");
  return value;
}

// Sessão própria pro link mágico do cliente — deliberadamente NÃO é o
// Supabase Auth interno do time (ver plano de implementação, decisão #3).
// Formato: "<clientId>.<hmac>", assinatura HMAC-SHA256 evita que alguém
// forje um clientId sem conhecer CLIENT_SESSION_SECRET.
export function signClientSession(clientId: string): string {
  const hmac = crypto.createHmac("sha256", secret()).update(clientId).digest("base64url");
  return `${clientId}.${hmac}`;
}

export function verifyClientSession(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf(".");
  if (dot === -1) return null;
  const clientId = cookieValue.slice(0, dot);
  const providedHmac = cookieValue.slice(dot + 1);
  const expectedHmac = crypto.createHmac("sha256", secret()).update(clientId).digest("base64url");
  const provided = Buffer.from(providedHmac);
  const expected = Buffer.from(expectedHmac);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;
  return clientId;
}
