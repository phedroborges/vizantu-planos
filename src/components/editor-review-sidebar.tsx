"use client";

import { Check, ChevronRight, History, MessageSquareText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalEvent, ApprovalItem, PlanApprovals } from "@/lib/types";

function formatDate(value?: string) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function actionLabel(event: ApprovalEvent) {
  if (event.action === "approved") return "Aprovou";
  if (event.action === "changes_requested") return "Solicitou ajuste";
  if (event.action === "commented") return "Atualizou o comentário";
  return "Reabriu a avaliação";
}

export function EditorReviewSidebar({
  slug,
  initialApprovals,
  onSelectItem,
}: {
  slug: string;
  initialApprovals: PlanApprovals;
  onSelectItem: (item: Pick<ApprovalItem, "id" | "title">) => boolean;
}) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const locationTimerRef = useRef<number | null>(null);
  const adjustments = useMemo(
    () => approvals.autoApproved ? [] : approvals.items.flatMap((item) => (item.responses || [])
      .filter((response) => response.status === "changes_requested")
      .map((response) => ({ item, response }))),
    [approvals],
  );

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const response = await fetch(`/api/plans/${slug}/approvals`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setApprovals(data.approvals);
      }
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => refresh(true), 2_000);
    const refreshOnFocus = () => refresh(true);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
      if (locationTimerRef.current !== null) window.clearTimeout(locationTimerRef.current);
    };
  }, [refresh]);

  function selectItem(item: Pick<ApprovalItem, "id" | "title">) {
    const found = onSelectItem(item);
    setLocationMessage(found ? `“${item.title}” destacado no plano.` : "Não encontrei esse bloco no HTML atual.");
    if (locationTimerRef.current !== null) window.clearTimeout(locationTimerRef.current);
    locationTimerRef.current = window.setTimeout(() => setLocationMessage(""), 3200);
  }

  return (
    <aside className="editor-review" aria-label="Histórico de alterações solicitado pelo cliente">
      <div className="editor-review-head">
        <div>
          <span>Revisão do cliente · Versão {approvals.reviewVersion || 1}</span>
          <h2>Ajustes e histórico</h2>
        </div>
        <button type="button" onClick={() => refresh()} disabled={isRefreshing} aria-label="Atualizar histórico">
          <RefreshCw size={15} className={isRefreshing ? "spin" : ""} />
        </button>
      </div>

      <div className={`editor-review-summary ${adjustments.length ? "has-adjustments" : "clear"}`}>
        <span className="editor-review-summary-icon">{adjustments.length ? <MessageSquareText size={17} /> : <Check size={17} />}</span>
        <div>
          <strong>{adjustments.length ? `${adjustments.length} ${adjustments.length === 1 ? "ajuste pendente" : "ajustes pendentes"}` : "Nenhum ajuste pendente"}</strong>
          <p>{adjustments.length ? "Use os pedidos abaixo como checklist enquanto edita." : "O parecer atual do cliente não tem pedidos de alteração."}</p>
        </div>
      </div>

      {locationMessage ? <p className="editor-location-message" role="status">{locationMessage}</p> : null}

      <section className="editor-review-section" aria-labelledby="editor-adjustments-title">
        <div className="editor-review-section-title">
          <h3 id="editor-adjustments-title">O que precisa mudar</h3>
          <span>{adjustments.length}</span>
        </div>
        {adjustments.length ? (
          <div className="editor-adjustment-list">
            {adjustments.map(({ item, response }) => (
              <button className="editor-adjustment" type="button" key={`${item.id}:${response.reviewerId}`} onClick={() => selectItem(item)}>
                <span className="editor-adjustment-title">{item.title}<ChevronRight size={14} /></span>
                {response.comment ? <span className="editor-adjustment-comment">{response.comment}</span> : <span className="editor-adjustment-comment empty">Ajuste solicitado sem comentário.</span>}
                <small><strong>{response.approverName}</strong> · {formatDate(response.updatedAt)}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="editor-review-empty"><Check size={22} /><p>Tudo certo por enquanto.</p></div>
        )}
      </section>

      <section className="editor-review-section editor-full-history" aria-labelledby="editor-history-title">
        <div className="editor-review-section-title">
          <h3 id="editor-history-title"><History size={14} /> Histórico completo</h3>
          <span>{approvals.history.length}</span>
        </div>
        {approvals.history.length ? (
          <ol className="editor-history-list">
            {[...approvals.history].reverse().map((event) => (
              <li key={event.id}>
                <button type="button" onClick={() => selectItem({ id: event.itemId, title: event.itemTitle })}>
                  <span className={`editor-history-dot ${event.status}`} />
                  <span className="editor-history-body">
                    <strong>{actionLabel(event)}</strong>
                    <span>{event.itemTitle}</span>
                    {event.comment ? <blockquote>{event.comment}</blockquote> : null}
                    <small>{event.approverName ? <><strong>{event.approverName}</strong> · </> : null}Versão {event.reviewVersion || 1} · {formatDate(event.createdAt)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="editor-review-empty"><p>O cliente ainda não registrou nenhuma decisão.</p></div>
        )}
      </section>
    </aside>
  );
}
