import type { Plan } from "@/lib/types";

export const APPROVAL_TIME_ZONE = "America/Sao_Paulo";

function dateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APPROVAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function zonedDateToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, millisecond: number) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let result = desired;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: APPROVAL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(result));
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    const represented = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"), millisecond);
    result += desired - represented;
  }

  return new Date(result);
}

export function approvalDeadlineFromDays(days: number, now = new Date()) {
  const current = dateParts(now);
  const target = new Date(Date.UTC(current.year, current.month - 1, current.day));
  target.setUTCDate(target.getUTCDate() + days);
  return zonedDateToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), 23, 59, 59, 999).toISOString();
}

export function isPlanExpired(plan: Pick<Plan, "kind" | "approvalDeadline">, now = new Date()) {
  return plan.kind !== "presentation" && Boolean(plan.approvalDeadline) && now.getTime() > Date.parse(plan.approvalDeadline || "");
}

export function formatApprovalDeadline(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APPROVAL_TIME_ZONE,
  }).format(new Date(value));
}
