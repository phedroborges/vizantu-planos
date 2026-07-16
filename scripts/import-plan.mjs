import { readFile } from "node:fs/promises";
import path from "node:path";

const [filePath, title, slug, baseUrl = "http://localhost:3000"] = process.argv.slice(2);

if (!filePath || !title || !slug) {
  console.error("Uso: node scripts/import-plan.mjs <arquivo> <titulo> <slug> [url]");
  process.exit(1);
}

const bytes = await readFile(filePath);
const body = new FormData();
body.set("title", title);
body.set("slug", slug);
body.set("file", new File([bytes], path.basename(filePath), { type: "text/html" }));

const response = await fetch(`${baseUrl}/api/plans`, {
  method: "POST",
  body,
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || "Falha no upload.");

console.log(`${baseUrl}${result.url}`);
