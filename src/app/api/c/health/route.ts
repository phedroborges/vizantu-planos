import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Diagnóstico do pipeline nativo (dashboard do cliente). NÃO expõe valor de
// variável nenhuma — só diz se está presente e se o banco responde, pra dar
// pra descobrir o que falta no ambiente sem ler log de container.
export async function GET() {
  const env = {
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    CLIENT_SESSION_SECRET: Boolean(process.env.CLIENT_SESSION_SECRET),
  };

  let database: { ok: boolean; error?: string };
  try {
    const { error } = await getDb().from("plan_client_tokens").select("id").limit(1);
    database = error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    database = { ok: false, error: err instanceof Error ? err.message : "erro desconhecido" };
  }

  // CLIENT_SESSION_SECRET não entra no "ready": ela é opcional (cai pra uma
  // chave derivada da service-role key — ver src/lib/client-session.ts).
  const ready = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && database.ok;
  return NextResponse.json({ ready, env, database }, { status: ready ? 200 : 503 });
}
