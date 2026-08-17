import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { FIXTURE_PATH } from "./global-setup";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

export default async function globalTeardown() {
  if (!existsSync(FIXTURE_PATH)) return;
  const { projectId } = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));

  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (projectId) await db.from("projects").delete().eq("id", projectId);
  await db.from("tags").delete().like("label", "[E2E]%");

  rmSync(FIXTURE_PATH, { force: true });
}
