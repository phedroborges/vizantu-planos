"use client";

import { Check, Copy, ExternalLink, MessageSquareText, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ApprovalItem, ApprovalStatus, Plan, PlanApprovals } from "@/lib/types";

function formatDate(value?: string) {
  if (!value) return "Sem atualização";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function statusLabel(status: ApprovalStatus) {
  if (status === "approved") return "Aprovado";
  if (status === "changes_requested") return "Pedir ajuste";
  return "Aguardando";
}

function actionLabel(action: PlanApprovals["history"][number]["action"]) {
  if (action === "approved") return "Aprovou o conteúdo";
  if (action === "changes_requested") return "Solicitou ajuste";
  if (action === "commented") return "Atualizou o comentário";
  return "Reabriu a avaliação";
}

function planStatus(items: ApprovalItem[]) {
  const approved = items.filter((item) => item.status === "approved").length;
  const changes = items.filter((item) => item.status === "changes_requested").length;
  if (!items.length) return { label: "Aguardando acesso", tone: "pending", approved, changes };
  if (changes) return { label: "Plano com ajustes", tone: "adjustments", approved, changes };
  if (approved === items.length) return { label: "Plano aprovado", tone: "approved", approved, changes };
  return { label: "Plano em revisão", tone: "review", approved, changes };
}

function buildReport(plan: Plan, approvals: PlanApprovals) {
  const overall = planStatus(approvals.items);
  const lines = approvals.items.map((item) => {
    const comment = item.comment ? `\nComentário: ${item.comment}` : "";
    return `${item.title}: ${statusLabel(item.status).toUpperCase()}${comment}`;
  });
  return `${plan.title}\n${overall.label}\n\n${lines.join("\n\n")}`;
}

export function ReviewDashboard({ plan, initialApprovals }: { plan: Plan; initialApprovals: PlanApprovals }) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const overall = useMemo(() => planStatus(approvals.items), [approvals.items]);
  const pending = approvals.items.length - overall.approved - overall.changes;

  async function refresh(silent = false) {
    if (!silent) setIsRefreshing(true);
    try {
      const response = await fetch(`/api/plans/${plan.slug}/approvals`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setApprovals(data.approvals);
      }
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => refresh(true), 10_000);
    return () => window.clearInterval(timer);
  });

  async function copyReport() {
    await navigator.clipboard.writeText(buildReport(plan, approvals));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <>
      <div className="review-heading">
        <div>
          <span className="eyebrow">Acompanhamento do cliente</span>
          <h1>{plan.title}</h1>
          <p>Decisões e comentários são atualizados automaticamente a cada 10 segundos.</p>
        </div>
        <div className="review-actions">
          <button className="secondary-button" type="button" onClick={() => refresh()} disabled={isRefreshing}>
            <RefreshCw size={15} className={isRefreshing ? "spin" : ""} /> Atualizar
          </button>
          <button className="primary-button" type="button" onClick={copyReport}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Parecer copiado" : "Copiar parecer"}
          </button>
          <a className="secondary-button" href={`/${plan.slug}`} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Abrir plano
          </a>
        </div>
      </div>

      <section className="review-overview" aria-label="Resumo da aprovação">
        <div className={`overall-status ${overall.tone}`}>
          <span>Status geral</span>
          <strong>{overall.label}</strong>
          <small>{formatDate(approvals.updatedAt)}</small>
        </div>
        <div className="review-stat"><strong>{approvals.items.length}</strong><span>conteúdos</span></div>
        <div className="review-stat approved"><strong>{overall.approved}</strong><span>aprovados</span></div>
        <div className="review-stat adjustments"><strong>{overall.changes}</strong><span>com ajustes</span></div>
        <div className="review-stat"><strong>{pending}</strong><span>aguardando</span></div>
      </section>

      <div className="review-columns">
        <section className="review-section">
          <div className="section-title">
            <div><span className="eyebrow">Conteúdo por conteúdo</span><h2>Parecer atual</h2></div>
            <span>{approvals.items.length} itens</span>
          </div>
          {approvals.items.length ? (
            <div className="approval-item-list">
              {approvals.items.map((item) => (
                <article className="approval-item" key={item.id}>
                  <div className="approval-item-head">
                    <a href={`/${plan.slug}#${item.id}`} target="_blank" rel="noreferrer">{item.title}</a>
                    <span className={`review-status ${item.status}`}>{statusLabel(item.status)}</span>
                  </div>
                  {item.comment ? <p>{item.comment}</p> : <p className="no-comment">Nenhum comentário neste conteúdo.</p>}
                  <small>{formatDate(item.updatedAt)}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="review-empty">
              <MessageSquareText size={34} />
              <h3>Aguardando a primeira visita do cliente</h3>
              <p>Assim que o plano for aberto, os conteúdos compatíveis serão registrados aqui automaticamente.</p>
            </div>
          )}
        </section>

        <aside className="review-section history-section">
          <div className="section-title">
            <div><span className="eyebrow">Rastro completo</span><h2>Histórico</h2></div>
            <span>{approvals.history.length} ações</span>
          </div>
          {approvals.history.length ? (
            <ol className="history-list">
              {[...approvals.history].reverse().map((event) => (
                <li key={event.id}>
                  <span className={`history-dot ${event.status}`} />
                  <div>
                    <strong>{actionLabel(event.action)}</strong>
                    <p>{event.itemTitle}</p>
                    {event.comment ? <blockquote>{event.comment}</blockquote> : null}
                    <small>{formatDate(event.createdAt)}</small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="review-empty compact"><p>Nenhuma decisão foi registrada ainda.</p></div>
          )}
        </aside>
      </div>
    </>
  );
}
