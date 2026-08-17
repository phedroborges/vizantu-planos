import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Mesmo projeto Supabase do vizantu-tarefas — é isso que faz "alimentar um
// app só" funcionar: o Planos lê/escreve nas MESMAS tabelas (plans, tasks,
// plan_clients, plan_client_tokens, plan_item_approvals, ...) que o Tarefas
// já usa pra criar planos de conteúdo. Server-only (service-role key).
let client: SupabaseClient | undefined;

export function getDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes — necessários pro pipeline nativo de planos.");
  }
  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return client;
}

function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export { unwrap };
