import { notFound } from "next/navigation";
import { PlanEditor } from "@/components/plan-editor";
import { getPlan } from "@/lib/storage";
import { isAllowedSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

export default async function EditPlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) notFound();
  const result = await getPlan(slug);
  if (!result) notFound();

  return <PlanEditor slug={slug} title={result.plan.title} html={result.html} />;
}
