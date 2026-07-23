import { buildDashboardProjects } from "@/lib/admin-analytics";
import { applyPlanDeadline, getPlanApprovals, listPlans } from "@/lib/storage";
import type { PlanApprovals } from "@/lib/types";

export async function loadDashboardProjects() {
  const plans = await listPlans();
  const approvalEntries = await Promise.all(plans.map(async (plan) => {
    const approvals = await getPlanApprovals(plan.slug);
    return [plan.slug, applyPlanDeadline(plan, approvals)] as const;
  }));
  return buildDashboardProjects(plans, Object.fromEntries(approvalEntries) as Record<string, PlanApprovals>);
}
