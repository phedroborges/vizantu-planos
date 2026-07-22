"use client";

import { Check, Copy, ExternalLink, MessageSquareText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApprovalStatus, Plan, PlanApprovals } from "@/lib/types";

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
  if (status === "changes_requested") return "Ajuste solicitado";
  return "Aguardando";
}

function actionLabel(action: PlanApprovals["history"][number]["action"]) {
  if (action === "approved") return "Aprovou o conteúdo";
  if (action === "changes_requested") return "Solicitou ajuste";
  if (action === "commented") return "Atualizou o comentário";
  return "Reabriu a avaliação";
}

function planStatus(approvals: PlanApprovals) {
  const items = approvals.items;
  const approved = items.filter((item) => item.status === "approved").length;
  const changes = items.filter((item) => item.status === "changes_requested").length;
  if (approvals.autoApproved) return { label: "Plano aprovado automaticamente", tone: "approved", approved: items.length, changes: 0 };
  if (!items.length) return { label: "Aguardando acesso", tone: "pending", approved, changes };
  if (changes) return { label: "Plano com ajustes", tone: "adjustments", approved, changes };
  if (approved === items.length) return { label: "Plano aprovado", tone: "approved", approved, changes };
  if (approved === 0) return { label: "Aguardando cliente", tone: "pending", approved, changes };
  return { label: "Plano em revisão", tone: "review", approved, changes };
}

function buildReport(plan: Plan, approvals: PlanApprovals) {
  const overall = planStatus(approvals);
  const lines = approvals.items.map((item) => {
    const responses = (item.responses || []).filter((response) => response.status !== "pending");
    const details = responses.map((response) => {
      const comment = response.comment ? `\n  Comentário: ${response.comment}` : "";
      return `- ${response.approverName}: ${statusLabel(response.status).toUpperCase()}${comment}`;
    });
    return `${item.title}: ${statusLabel(item.status).toUpperCase()}${details.length ? `\n${details.join("\n")}` : ""}`;
  });
  return `${plan.title}\n${overall.label}\n\n${lines.join("\n\n")}`;
}

export function ReviewDashboard({ plan, initialApprovals }: { plan: Plan; initialApprovals: PlanApprovals }) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const overall = useMemo(() => planStatus(approvals), [approvals]);
  const pending = approvals.items.length - overall.approved - overall.changes;

  const refresh = useCallback(async (silent = false) => {
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
  }, [plan.slug]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => refresh(true), 0);
    const refreshTimer = window.setInterval(() => refresh(true), 2_000);
    const refreshOnFocus = () => refresh(true);
    const refreshOnVisibility = () => {
      if (!document.hidden) refresh(true);
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [refresh]);

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
          <p>Decisões e comentários são atualizados automaticamente.</p>
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

      {approvals.autoApproved ? (
        <div className="deadline-admin-notice">
          <strong>Prazo encerrado</strong>
          <span>O link foi fechado e o plano foi aprovado automaticamente em {formatDate(approvals.deadlineAt)}. Os pareceres anteriores continuam preservados no histórico.</span>
        </div>
      ) : plan.approvalDeadline ? (
        <div className="deadline-admin-notice active">
          <strong>Prazo de aprovação</strong>
          <span>O cliente pode responder até {formatDate(plan.approvalDeadline)}. Depois desse horário, o plano será aprovado automaticamente.</span>
        </div>
      ) : null}

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
                  {(item.responses || []).some((response) => response.status !== "pending") ? (
                    <div className="approval-response-list">
                      {(item.responses || []).filter((response) => response.status !== "pending").map((response) => (
                        <div className={`approval-response ${response.status}`} key={response.reviewerId}>
                          <div><strong>{response.approverName}</strong><span className={`review-status ${response.status}`}>{statusLabel(response.status)}</span></div>
                          {response.comment ? <p>{response.comment}</p> : null}
                          <small>{formatDate(response.updatedAt)}</small>
                        </div>
                      ))}
                    </div>
                  ) : <p className="no-comment">Nenhum parecer registrado neste conteúdo.</p>}
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
                    <small>{event.approverName ? <><strong>{event.approverName}</strong> · </> : null}{formatDate(event.createdAt)}</small>
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
