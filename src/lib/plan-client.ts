import type { Plan } from "@/lib/types";

const TITLE_SEPARATORS = [" · ", " — ", " – ", " | "];

export function inferClientFromTitle(title: string) {
  for (const separator of TITLE_SEPARATORS) {
    const parts = title.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) return parts.at(-1) || "";
  }
  return "";
}

export function planClientName(plan: Pick<Plan, "client" | "title">) {
  return plan.client?.trim() || inferClientFromTitle(plan.title) || "Cliente não informado";
}
