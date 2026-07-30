"use client";

import { Check, ChevronDown, Layers, MessageSquareText, Minus, X } from "lucide-react";
import { useState } from "react";
import type { VersionBreakdown, VersionItem, VersionItemOutcome } from "@/lib/version-timeline";

const OUTCOME_LABEL: Record<VersionItemOutcome, string> = {
  approved: "Aprovado",
  changes_requested: "Ajuste",
  rejected: "Reprovado",
  pending: "Aguardando",
};

function OutcomeIcon({ outcome }: { outcome: VersionItemOutcome }) {
  if (outcome === "approved") return <Check size={12} />;
  if (outcome === "changes_requested") return <MessageSquareText size={12} />;
  if (outcome === "rejected") return <X size={12} />;
  return <Minus size={12} />;
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function VersionCard({
  breakdown,
  open,
  onToggle,
  onSelectItem,
}: {
  breakdown: VersionBreakdown;
  open: boolean;
  onToggle: () => void;
  onSelectItem?: (item: Pick<VersionItem, "id" | "title">) => void;
}) {
  const stats = [
    { key: "approved", label: "aprovados", value: breakdown.approved, tone: "approved" },
    { key: "changes_requested", label: "ajustes", value: breakdown.changesRequested, tone: "changes_requested" },
    { key: "rejected", label: "reprovados", value: breakdown.rejected, tone: "rejected" },
    { key: "pending", label: "aguardando", value: breakdown.pending, tone: "pending" },
  ].filter((stat) => stat.value > 0 || stat.key === "pending");

  return (
    <div className={`vz-version-card ${breakdown.isCurrent ? "current" : ""} ${open ? "open" : ""}`}>
      <button type="button" className="vz-version-card-head" onClick={onToggle} aria-expanded={open}>
        <span className="vz-version-tag">
          V{breakdown.version}
          {breakdown.isCurrent ? <em>atual</em> : null}
        </span>
        <span className="vz-version-headline">
          <strong>{breakdown.total} {breakdown.total === 1 ? "conteúdo" : "conteúdos"} em jogo</strong>
          {breakdown.carriedIn > 0 ? <small>{breakdown.carriedIn} já resolvido{breakdown.carriedIn === 1 ? "" : "s"} antes</small> : null}
        </span>
        <span className="vz-version-mini">
          {stats.map((stat) => (
            <span key={stat.key} className={`vz-mini ${stat.tone}`} title={stat.label}>
              <OutcomeIcon outcome={stat.tone as VersionItemOutcome} />
              {stat.value}
            </span>
          ))}
          <ChevronDown size={15} className="vz-version-chevron" />
        </span>
      </button>

      {open ? (
        <ul className="vz-version-items">
          {breakdown.items.map((item) => {
            const clickable = Boolean(onSelectItem);
            return (
              <li key={item.id}>
                {clickable ? (
                  <button type="button" className="vz-version-item" onClick={() => onSelectItem?.(item)}>
                    <VersionItemRow item={item} />
                  </button>
                ) : (
                  <div className="vz-version-item static">
                    <VersionItemRow item={item} />
                  </div>
                )}
              </li>
            );
          })}
          {breakdown.items.length === 0 ? <li className="vz-version-empty">Nenhum conteúdo registrado nesta versão.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function VersionItemRow({ item }: { item: VersionItem }) {
  return (
    <>
      <span className="vz-version-item-title">{item.title}</span>
      <span className={`vz-outcome ${item.outcome}`}>
        <OutcomeIcon outcome={item.outcome} />
        {OUTCOME_LABEL[item.outcome]}
      </span>
      {item.comment ? <span className="vz-version-item-comment">{item.comment}</span> : null}
      {item.approverName || item.updatedAt ? (
        <small className="vz-version-item-meta">
          {item.approverName ? <strong>{item.approverName}</strong> : null}
          {item.approverName && item.updatedAt ? " · " : null}
          {formatDate(item.updatedAt)}
        </small>
      ) : null}
    </>
  );
}

export function VersionTimeline({
  breakdowns,
  onSelectItem,
  variant = "full",
}: {
  breakdowns: VersionBreakdown[];
  onSelectItem?: (item: Pick<VersionItem, "id" | "title">) => void;
  variant?: "full" | "compact";
}) {
  const currentVersion = breakdowns.find((breakdown) => breakdown.isCurrent)?.version ?? breakdowns.at(-1)?.version ?? 1;
  const [openVersion, setOpenVersion] = useState<number | null>(currentVersion);

  if (!breakdowns.length) return null;

  return (
    <div className={`vz-versions ${variant}`}>
      {breakdowns.length > 1 ? (
        <div className="vz-version-rail" role="tablist" aria-label="Versões do plano">
          <span className="vz-version-rail-label"><Layers size={13} /> Versões</span>
          {breakdowns.map((breakdown) => (
            <button
              key={breakdown.version}
              type="button"
              role="tab"
              aria-selected={openVersion === breakdown.version}
              className={`vz-version-pill ${openVersion === breakdown.version ? "active" : ""} ${breakdown.isCurrent ? "is-current" : ""}`}
              onClick={() => setOpenVersion(breakdown.version)}
            >
              V{breakdown.version}
            </button>
          ))}
        </div>
      ) : null}

      <div className="vz-version-cards">
        {breakdowns.map((breakdown) => (
          <VersionCard
            key={breakdown.version}
            breakdown={breakdown}
            open={openVersion === breakdown.version}
            onToggle={() => setOpenVersion((current) => (current === breakdown.version ? null : breakdown.version))}
            onSelectItem={onSelectItem}
          />
        ))}
      </div>
    </div>
  );
}
