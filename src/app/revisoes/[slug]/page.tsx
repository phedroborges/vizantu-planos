import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewDashboard } from "@/components/review-dashboard";
import { getPlanApprovals, listPlans } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const plans = await listPlans();
  const plan = plans.find((item) => item.slug === slug);
  if (!plan) notFound();
  const approvals = await getPlanApprovals(slug);

  return (
    <>
      <header className="topbar">
        <div className="app-shell topbar-inner">
          <div className="brand"><span className="brand-mark">VZ</span><span>Vizantu Planos<small>Acompanhamento de aprovações</small></span></div>
          <Link className="ghost-button" href="/"><ArrowLeft size={15} /> Voltar ao painel</Link>
        </div>
      </header>
      <main className="app-shell review-page">
        <ReviewDashboard plan={plan} initialApprovals={approvals} />
      </main>
    </>
  );
}
