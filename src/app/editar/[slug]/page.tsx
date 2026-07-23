import { notFound } from "next/navigation";
import { PlanEditor } from "@/components/plan-editor";
import { applyPlanDeadline, getPlan, getPlanApprovals } from "@/lib/storage";
import { isAllowedSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

export default async function EditPlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) notFound();
  const [result, approvals] = await Promise.all([getPlan(slug), getPlanApprovals(slug)]);
  if (!result) notFound();

  return <PlanEditor slug={slug} title={result.plan.title} html={result.html} reviewVersion={result.plan.reviewVersion || 1} initialApprovals={applyPlanDeadline(result.plan, approvals)} />;
}
