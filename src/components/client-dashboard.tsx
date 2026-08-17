"use client";

import { Check, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { burst } from "@/lib/confetti";
import "../app/c/client-dashboard.css";

export type DashboardItem = {
  id: string;
  name: string;
  status: string;
  dueDate: string | null;
  captacaoLabel: string | null;
  formatLabel: string | null;
  categoryLabel: string | null;
  description: string | null;
  approvalStatus: "pending" | "approved" | "changes_requested" | "rejected";
  reviewVersion: number;
  updatedAt: string;
};

export type DashboardEvent = { id: string; title: string; date: string };

const STATUS_LABEL: Record<string, string> = { pending: "pendente", approved: "aprovado", changes_requested: "em ajuste", rejected: "reprovado" };
const REVIEWER_KEY = "vizantu-client-reviewer-name";
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysGrid(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // segunda = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date | null }[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d) });
  while (cells.length % 7 !== 0) cells.push({ date: null });
  return cells;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// A descrição do item vem em markdown-lite do vizantu-tarefas — as seções
// (Direcionamento, Roteiro, Referência, Legenda) são escritas como **negrito**
// pela equipe. Renderiza só o negrito, como nós de texto (nada de HTML
// injetado); quebras de linha ficam por conta do pre-wrap do container.
function renderDescription(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) => {
    const bold = /^\*\*([^*\n]+)\*\*$/.exec(part);
    return bold ? <strong key={index}>{bold[1]}</strong> : <span key={index}>{part}</span>;
  });
}

export function ClientDashboard({
  clientName,
  roleTitle,
  city,
  instagramHandle,
  initialItems,
  events,
  initialScore,
}: {
  clientName: string;
  roleTitle: string | null;
  city: string | null;
  instagramHandle: string | null;
  initialItems: DashboardItem[];
  events: DashboardEvent[];
  initialScore: number | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [score, setScore] = useState(initialScore);
  const [surveyOpen, setSurveyOpen] = useState(false);
  // Guarda só o id, não o objeto — assim o modal sempre reflete o item mais
  // recente de `items` depois de um approve/ajuste/reprova, em vez de ficar
  // preso a um snapshot de antes da resposta chegar.
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const activeItem = items.find((i) => i.id === activeItemId) || null;
  const [month, setMonth] = useState(() => new Date());
  const [reviewerName, setReviewerName] = useState(() => (typeof window !== "undefined" ? window.localStorage.getItem(REVIEWER_KEY) || "" : ""));

  const approvedCount = items.filter((i) => i.approvalStatus === "approved").length;
  const approvalRate = items.length ? Math.round((approvedCount / items.length) * 100) : 0;
  const lastDeliveries = useMemo(
    () => [...items].filter((i) => i.approvalStatus === "approved").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3),
    [items],
  );

  const groups = useMemo(() => {
    const map = new Map<string, DashboardItem[]>();
    for (const item of items) {
      const label = item.captacaoLabel ? `${item.formatLabel || "Conteúdo"} | ${item.captacaoLabel}` : item.formatLabel || "Conteúdo";
      (map.get(label) || map.set(label, []).get(label)!).push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  const cellsByDay = useMemo(() => {
    const map = new Map<string, { label: string; kind: "content" | "event"; approvalStatus?: string }[]>();
    for (const item of items) {
      if (!item.dueDate) continue;
      (map.get(item.dueDate) || map.set(item.dueDate, []).get(item.dueDate)!).push({ label: item.name, kind: "content", approvalStatus: item.approvalStatus });
    }
    for (const ev of events) {
      (map.get(ev.date) || map.set(ev.date, []).get(ev.date)!).push({ label: ev.title, kind: "event" });
    }
    return map;
  }, [items, events]);

  function updateItemLocal(id: string, patch: Partial<DashboardItem>) {
    setItems((current) => current.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function submitReview(item: DashboardItem, status: "approved" | "changes_requested" | "rejected", comment: string, buttonEl?: HTMLElement) {
    const name = reviewerName.trim() || "Cliente";
    window.localStorage.setItem(REVIEWER_KEY, name);
    const response = await fetch("/api/c/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: item.id, reviewerName: name, status, comment }),
    });
    if (!response.ok) return;
    const result = await response.json();
    updateItemLocal(item.id, { approvalStatus: result.status, reviewVersion: result.reviewVersion });
    if (status === "approved" && buttonEl) {
      const rect = buttonEl.getBoundingClientRect();
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 60);
    }
    setTimeout(() => setActiveItemId(null), status === "approved" ? 650 : 150);
  }

  async function submitSurvey(newScore: number) {
    await fetch("/api/c/satisfaction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score: newScore }) });
    setScore(newScore);
    setSurveyOpen(false);
  }

  const grid = useMemo(() => daysGrid(month), [month]);
  const currentMonthKey = monthKey(month);

  return (
    <div className="cd-root">
      <div className="cd-shell">
        <div className="cd-header">
          <div>
            <h1>Bem-vindo(a), {clientName}</h1>
            <p>Este é o seu painel de conteúdo com a Vizantu.</p>
          </div>
          <div className="cd-header-meta">
            {[roleTitle, city].filter(Boolean).join(" · ")}
            {instagramHandle ? <div>@{instagramHandle.replace(/^@/, "")}</div> : null}
          </div>
        </div>

        <div className="cd-stats">
          <div className="cd-card">
            <h3>Nota da vizantu</h3>
            <div className="cd-score">{score !== null ? `${score}/10` : "—"}</div>
            <button type="button" className="cd-score-cta" onClick={() => setSurveyOpen(true)}>
              <Sparkles size={12} /> refazer a pesquisa de satisfação
            </button>
          </div>
          <div className="cd-card">
            <h3>Conteúdos publicados</h3>
            <div className="cd-big-number">{approvedCount}</div>
          </div>
          <div className="cd-card">
            <h3>Últimas entregas</h3>
            <div className="cd-deliveries">
              {lastDeliveries.length ? (
                lastDeliveries.map((item) => (
                  <div className="cd-delivery-row" key={item.id}>
                    <span>{item.name}</span>
                    <span className="cd-pill tag">{item.formatLabel || "conteúdo"}</span>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 12, color: "#999" }}>Ainda sem entregas.</span>
              )}
            </div>
          </div>
        </div>

        <h2 className="cd-section-title">Conteúdos orgânicos</h2>
        <div className="cd-calendar">
          <div className="cd-calendar-head">
            <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
            <strong style={{ fontSize: 13, textTransform: "capitalize" }}>{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong>
            <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button>
          </div>
          <div className="cd-calendar-grid">
            {WEEKDAYS.map((w) => <div className="cd-calendar-weekday" key={w}>{w}</div>)}
            {grid.map((cell, idx) => {
              const iso = cell.date ? isoDate(cell.date) : null;
              const dayItems = iso ? cellsByDay.get(iso) || [] : [];
              const muted = !cell.date || monthKey(cell.date) !== currentMonthKey;
              return (
                <div className={`cd-calendar-cell ${muted ? "is-muted" : ""}`} key={idx}>
                  {cell.date ? <span className="cd-calendar-daynum">{cell.date.getDate()}</span> : null}
                  {dayItems.slice(0, 3).map((d, i) => (
                    <span key={i} className={`cd-cal-item status-${d.kind === "event" ? "event" : d.approvalStatus}`} title={d.label}>{d.label}</span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="cd-approval-bar-wrap">
          <div className="cd-approval-bar-label">
            <span>barrinha da aprovação</span>
            <span>{approvedCount} de {items.length} conteúdos aprovados ({approvalRate}%)</span>
          </div>
          <div className="cd-approval-bar-track"><div className="cd-approval-bar-fill" style={{ width: `${approvalRate}%` }} /></div>
        </div>

        <div className="cd-groups">
          {groups.map(([label, groupItems]) => (
            <div className="cd-group" key={label}>
              <h4>{label}</h4>
              {groupItems.slice(0, 5).map((item) => (
                <div className="cd-group-item" key={item.id} onClick={() => setActiveItemId(item.id)}>
                  <span className="cd-group-item-name">{item.name}</span>
                  {item.categoryLabel ? <span className="cd-pill tag">{item.categoryLabel}</span> : null}
                  <span className={`cd-pill status-${item.approvalStatus}`}>{STATUS_LABEL[item.approvalStatus]}</span>
                </div>
              ))}
            </div>
          ))}
          {!groups.length ? <div className="cd-card">Nenhum conteúdo publicado ainda.</div> : null}
        </div>
      </div>

      {activeItem ? (
        <ApprovalModal
          item={activeItem}
          reviewerName={reviewerName}
          onReviewerNameChange={setReviewerName}
          onClose={() => setActiveItemId(null)}
          onSubmit={submitReview}
        />
      ) : null}

      {surveyOpen ? (
        <div className="cd-overlay" onClick={() => setSurveyOpen(false)}>
          <div className="cd-approval-modal" onClick={(e) => e.stopPropagation()}>
            <button className="cd-close" type="button" onClick={() => setSurveyOpen(false)} aria-label="Fechar"><X size={16} /></button>
            <h3>Como você avalia a Vizantu?</h3>
            <div className="cd-meta">Escolha uma nota de 0 a 10.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Array.from({ length: 11 }, (_, n) => n).map((n) => (
                <button key={n} type="button" className="cd-btn ghost" onClick={() => submitSurvey(n)}>{n}</button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ApprovalModal({
  item,
  reviewerName,
  onReviewerNameChange,
  onClose,
  onSubmit,
}: {
  item: DashboardItem;
  reviewerName: string;
  onReviewerNameChange: (v: string) => void;
  onClose: () => void;
  onSubmit: (item: DashboardItem, status: "approved" | "changes_requested" | "rejected", comment: string, buttonEl?: HTMLElement) => void;
}) {
  const [comment, setComment] = useState("");
  const [pendingAction, setPendingAction] = useState<"changes_requested" | "rejected" | null>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const justApproved = item.approvalStatus === "approved";

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-approval-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cd-close" type="button" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        <h3>{item.name}</h3>
        <div className="cd-meta">{[item.formatLabel, item.captacaoLabel].filter(Boolean).join(" · ") || "Conteúdo"}</div>

        {item.description ? <div className="cd-item-description">{renderDescription(item.description)}</div> : null}

        {justApproved ? (
          <p style={{ display: "flex", alignItems: "center", gap: 6, color: "#2f8f4e", fontWeight: 700, marginTop: 14 }}>
            <Check size={18} className="cd-celebrate-icon" /> Aprovado — obrigado!
          </p>
        ) : (
          <>
            <label style={{ display: "block", fontSize: 11, color: "#6b6b6b", marginTop: 12 }}>
              Seu nome
              <input
                value={reviewerName}
                onChange={(e) => onReviewerNameChange(e.target.value)}
                placeholder="Como podemos te identificar?"
                style={{ display: "block", width: "100%", marginTop: 4, padding: 7, border: "1px solid #ddd", fontSize: 12.5 }}
              />
            </label>

            {pendingAction ? (
              <textarea
                autoFocus
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={pendingAction === "rejected" ? "Conta pra gente o motivo da reprovação" : "O que precisa ajustar?"}
              />
            ) : null}

            <div className="cd-approval-actions">
              <button
                ref={approveRef}
                type="button"
                className="cd-btn approve"
                disabled={!reviewerName.trim()}
                onClick={() => onSubmit(item, "approved", "", approveRef.current || undefined)}
              >
                Aprovar
              </button>
              {pendingAction === "changes_requested" ? (
                <button type="button" className="cd-btn request" disabled={!comment.trim() || !reviewerName.trim()} onClick={() => onSubmit(item, "changes_requested", comment)}>
                  Enviar pedido de ajuste
                </button>
              ) : (
                <button type="button" className="cd-btn request" onClick={() => setPendingAction("changes_requested")}>Pedir ajuste</button>
              )}
              {pendingAction === "rejected" ? (
                <button type="button" className="cd-btn reject" disabled={!comment.trim() || !reviewerName.trim()} onClick={() => onSubmit(item, "rejected", comment)}>
                  Confirmar reprovação
                </button>
              ) : (
                <button type="button" className="cd-btn reject" onClick={() => setPendingAction("rejected")}>Reprovar</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
