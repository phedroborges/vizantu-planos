import crypto from "node:crypto";

export const CLIENT_SESSION_COOKIE = "vz_client_session";

// CLIENT_SESSION_SECRET é opcional: sem ela, deriva a chave de assinatura da
// service-role key (que já é obrigatória pra ler o banco e nunca sai do
// servidor). Assim o link do cliente funciona com UMA variável a menos pra
// configurar, sem enfraquecer nada — continua sendo um segredo forte que só
// o servidor conhece.
function secret(): string {
  const explicit = process.env.CLIENT_SESSION_SECRET;
  if (explicit) return explicit;
  const derived = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (derived) return `vz-client-session:${derived}`;
  throw new Error("Nem CLIENT_SESSION_SECRET nem SUPABASE_SERVICE_ROLE_KEY estão configuradas.");
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
