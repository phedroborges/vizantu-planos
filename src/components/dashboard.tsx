"use client";

import {
  Check,
  CalendarClock,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileArchive,
  FileCode2,
  Pencil,
  Presentation,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toSlug } from "@/lib/slug";
import type { ApprovalSummary, Plan, PlanKind } from "@/lib/types";

const emptySummary: ApprovalSummary = {
  total: 0,
  approved: 0,
  changesRequested: 0,
  pending: 0,
  status: "not_started",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatDeadline(value?: string) {
  if (!value) return "Sem prazo definido";
  return `Prazo: ${new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))}`;
}

function approvalPresentation(summary: ApprovalSummary) {
  if (summary.autoApproved) return { label: "Plano aprovado", tone: "approved", detail: "Aprovação automática" };
  if (summary.status === "approved") return { label: "Plano aprovado", tone: "approved", detail: `${summary.approved}/${summary.total} aprovados` };
  if (summary.status === "changes_requested" && summary.roundComplete) return { label: "Plano com ajustes", tone: "adjustments", detail: `${summary.changesRequested} ${summary.changesRequested === 1 ? "ajuste" : "ajustes"}` };
  if (summary.status === "changes_requested") return { label: "Em revisão", tone: "review", detail: `${summary.pending} aguardando · ${summary.changesRequested} com ajuste` };
  if (summary.status === "in_review") return { label: "Em revisão", tone: "review", detail: `${summary.approved}/${summary.total} aprovados` };
  if (summary.status === "pending") return { label: "Aguardando cliente", tone: "pending", detail: `${summary.total} conteúdos` };
  return { label: "Aguardando acesso", tone: "pending", detail: "Sem avaliação" };
}

export function Dashboard({
  initialPlans,
  initialSummaries,
  siteUrl,
  storageError = "",
}: {
  initialPlans: Plan[];
  initialSummaries: Record<string, ApprovalSummary>;
  siteUrl: string;
  storageError?: string;
}) {
  const [plans, setPlans] = useState(initialPlans);
  const [summaries, setSummaries] = useState(initialSummaries);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<PlanKind>("approval");
  const [approvalDays, setApprovalDays] = useState(7);
  const [slugTouched, setSlugTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsHydrated(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const visiblePlans = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return plans;
    return plans.filter((plan) => `${plan.title} ${plan.slug}`.toLowerCase().includes(normalized));
  }, [plans, query]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(toSlug(value));
  }

  function pickFile(nextFile?: File) {
    if (!nextFile) return;
    setError("");
    if (!/\.(?:html|zip)$/i.test(nextFile.name)) {
      setError("Envie um arquivo com extensão .html ou .zip.");
      return;
    }
    setFile(nextFile);
    if (!title) updateTitle(nextFile.name.replace(/\.(?:html|zip)$/i, "").replace(/[-_]+/g, " "));
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError("Escolha um arquivo HTML ou ZIP.");
    setError("");
    setIsUploading(true);
    const body = new FormData();
    body.set("title", title);
    body.set("slug", slug);
    body.set("kind", kind);
    if (kind === "approval") body.set("approvalDays", String(approvalDays));
    body.set("file", file);

    const response = await fetch("/api/plans", { method: "POST", body });
    const result = await response.json();
    setIsUploading(false);
    if (!response.ok) return setError(result.error || "Não foi possível publicar o plano.");

    setPlans((current) => [result.plan, ...current.filter((plan) => plan.slug !== result.plan.slug)]);
    const summaryResponse = await fetch(`/api/plans/${result.plan.slug}/approvals`, { cache: "no-store" });
    const summaryResult = summaryResponse.ok ? await summaryResponse.json() : null;
    setSummaries((current) => ({ ...current, [result.plan.slug]: summaryResult?.summary || current[result.plan.slug] || emptySummary }));
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    showToast(kind === "presentation" ? "Apresentação publicada, sem fluxo de aprovação." : "Plano publicado e pronto para aprovação.");
    setKind("approval");
    setApprovalDays(7);
  }

  async function copyLink(slugToCopy: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/${slugToCopy}`);
    showToast("Link copiado.");
  }

  async function toggleKind(plan: Plan) {
    const nextKind: PlanKind = (plan.kind || "approval") === "approval" ? "presentation" : "approval";
    const response = await fetch(`/api/plans/${plan.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: nextKind }),
    });
    if (!response.ok) return showToast("Não foi possível alterar o tipo do material.");
    const result = await response.json();
    setPlans((current) => current.map((item) => (item.slug === plan.slug ? result.plan : item)));
    showToast(nextKind === "presentation" ? "Agora é uma apresentação, sem aprovação." : "Agora é um plano com aprovação.");
  }

  async function extendDeadline(plan: Plan) {
    const answer = window.prompt("Por quantos dias o plano deve ficar aberto a partir de hoje?", String(plan.approvalPeriodDays || 7));
    if (answer === null) return;
    const days = Number(answer);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      showToast("Informe uma quantidade entre 1 e 3650 dias.");
      return;
    }
    const response = await fetch(`/api/plans/${plan.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalDays: days }),
    });
    if (!response.ok) return showToast("Não foi possível atualizar o prazo.");
    const result = await response.json();
    const summaryResponse = await fetch(`/api/plans/${plan.slug}/approvals`, { cache: "no-store" });
    const summaryResult = summaryResponse.ok ? await summaryResponse.json() : null;
    setPlans((current) => current.map((item) => (item.slug === plan.slug ? result.plan : item)));
    setSummaries((current) => ({
      ...current,
      [plan.slug]: summaryResult?.summary || { ...(current[plan.slug] || emptySummary), autoApproved: false, deadlineAt: result.plan.approvalDeadline },
    }));
    showToast("Plano reaberto com o novo prazo.");
  }

  async function remove(plan: Plan) {
    if (!window.confirm(`Excluir “${plan.title}”? O plano e seu histórico deixarão de funcionar.`)) return;
    const response = await fetch(`/api/plans/${plan.slug}`, { method: "DELETE" });
    if (!response.ok) return showToast("Não foi possível excluir o plano.");
    setPlans((current) => current.filter((item) => item.slug !== plan.slug));
    setSummaries((current) => {
      const next = { ...current };
      delete next[plan.slug];
      return next;
    });
    showToast("Plano e histórico excluídos.");
  }

  const storageDisabled = !isHydrated || Boolean(storageError);

  return (
    <>
      <header className="topbar">
        <div className="app-shell topbar-inner">
          <div className="brand"><img className="brand-logo" src="/brand/vizantu-white.svg" alt="Vizantu" /><span>Planos<small>Publicador de apresentações</small></span></div>
        </div>
      </header>
      <main className="app-shell dashboard">
        <div className="dashboard-head">
          <div><span className="eyebrow">Biblioteca de aprovações</span><h1>Planos publicados</h1><p>Envie um HTML ou projeto ZIP, acompanhe o parecer do cliente e mantenha o histórico de cada conteúdo.</p></div>
          <div className="stats">
            <div className="stat"><strong>{plans.length}</strong><span>planos ativos</span></div>
            <div className="stat"><strong>{plans.reduce((sum, plan) => sum + plan.size, 0) ? formatBytes(plans.reduce((sum, plan) => sum + plan.size, 0)) : "0 KB"}</strong><span>armazenados</span></div>
          </div>
        </div>
        <div className="workspace">
          <section className="panel upload-panel">
            <div className="panel-head"><h2>Publicar novo plano</h2><p>O mesmo endereço será atualizado quando você reutilizar um slug.</p></div>
            {storageError ? <div className="storage-notice">{storageError}</div> : null}
            <form className="upload-form" onSubmit={upload}>
              <div className="field"><label htmlFor="title">Título</label><input id="title" value={title} onChange={(event) => updateTitle(event.target.value)} placeholder="Plano de julho · TerraNet" required maxLength={120} disabled={storageDisabled} /></div>
              <div className="field"><label htmlFor="slug">Endereço</label><input id="slug" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(toSlug(event.target.value)); }} placeholder="plano-julho-terranet" required maxLength={80} disabled={storageDisabled} /><span className="slug-preview">{siteUrl || "meusite.com"}/{slug || "seu-endereco"}</span></div>
              <div className="field">
                <label>Tipo de material</label>
                <div className="kind-toggle" role="radiogroup" aria-label="Tipo de material">
                  <button type="button" role="radio" aria-checked={kind === "approval"} className={`kind-option ${kind === "approval" ? "active" : ""}`} onClick={() => setKind("approval")} disabled={storageDisabled}><ClipboardCheck size={14} /> Plano com aprovação</button>
                  <button type="button" role="radio" aria-checked={kind === "presentation"} className={`kind-option ${kind === "presentation" ? "active" : ""}`} onClick={() => setKind("presentation")} disabled={storageDisabled}><Presentation size={14} /> Apresentação</button>
                </div>
                <span className="slug-preview">{kind === "approval" ? "O cliente aprova ou pede ajuste em cada conteúdo." : "Somente visualização, sem botões de aprovação."}</span>
              </div>
              {kind === "approval" ? (
                <div className="field">
                  <label htmlFor="approval-days">Prazo para aprovação</label>
                  <input id="approval-days" type="number" min="1" max="3650" step="1" value={approvalDays} onChange={(event) => setApprovalDays(Number(event.target.value))} required disabled={storageDisabled} />
                  <span className="slug-preview">O prazo termina às 23h59 do último dia. Depois disso, o link fecha e o plano é aprovado automaticamente.</span>
                </div>
              ) : null}
              <label className={`dropzone ${isDragging ? "active" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); if (!storageError) pickFile(event.dataTransfer.files[0]); }}>
                <input ref={fileInput} type="file" accept=".html,.zip,text/html,application/zip" onChange={(event) => pickFile(event.target.files?.[0])} disabled={storageDisabled} />
                {file ? <div className="selected-file">{file.name.toLowerCase().endsWith(".zip") ? <FileArchive size={28} /> : <FileCode2 size={28} />}<div><strong>{file.name}</strong><span>{formatBytes(file.size)} · pronto para publicar</span></div></div> : <div><UploadCloud size={29} /><strong>Arraste o HTML ou ZIP</strong><span>Documento ou projeto completo de até 4 MB</span></div>}
              </label>
              {error ? <div className="form-message">{error}</div> : null}
              <button className="primary-button" type="submit" disabled={isUploading || storageDisabled}>{isUploading ? "Publicando..." : <><UploadCloud size={16} /> Publicar plano</>}</button>
            </form>
          </section>

          <section className="panel list-panel">
            <div className="list-toolbar"><div className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cliente ou plano" aria-label="Buscar planos" /></div><span>{visiblePlans.length} {visiblePlans.length === 1 ? "resultado" : "resultados"}</span></div>
            {visiblePlans.length ? (
              <ul className="plan-list">
                {visiblePlans.map((plan) => {
                  const isPresentation = plan.kind === "presentation";
                  const summary = summaries[plan.slug] || emptySummary;
                  const approval = approvalPresentation(summary);
                  return (
                    <li className="plan-row" key={plan.slug}>
                      <div className="plan-title"><a href={`/${plan.slug}`} target="_blank" rel="noreferrer">{plan.title}</a><div className="plan-url">/{plan.slug}</div></div>
                      <div className="plan-meta">
                        {isPresentation
                          ? <><span className="status presentation"><Presentation size={11} /> Apresentação</span><br />Sem fluxo de aprovação</>
                          : <><span className={`status ${approval.tone}`}>{approval.label}</span><br />{approval.detail}</>}
                        {!isPresentation ? <><br />Versão {plan.reviewVersion || 1} · {summary.autoApproved
                          ? "prazo encerrado"
                          : summary.roundComplete
                            ? "revisão concluída"
                            : formatDeadline(plan.approvalDeadline).replace(/^Prazo:\s*/, "prazo ")}</> : null}
                        <br />{formatDate(plan.updatedAt)} · {formatBytes(plan.size)}
                      </div>
                      <div className="actions">
                        <a className="icon-button" href={`/editar/${plan.slug}`} title="Editar o plano" aria-label={`Editar ${plan.title}`}><Pencil size={15} /></a>
                        {isPresentation ? null : <a className="icon-button approval-action" href={`/revisoes/${plan.slug}`} title="Acompanhar aprovações" aria-label={`Acompanhar aprovações de ${plan.title}`}><ClipboardCheck size={15} /></a>}
                        {isPresentation ? null : <button className="icon-button" onClick={() => extendDeadline(plan)} title="Reabrir ou prorrogar prazo" aria-label={`Reabrir ou prorrogar ${plan.title}`}><CalendarClock size={15} /></button>}
                        <button className="icon-button" onClick={() => toggleKind(plan)} title={isPresentation ? "Transformar em plano com aprovação" : "Transformar em apresentação (sem aprovação)"} aria-label={`Alterar tipo de ${plan.title}`}>{isPresentation ? <ClipboardCheck size={15} /> : <Presentation size={15} />}</button>
                        <button className="icon-button" onClick={() => copyLink(plan.slug)} title="Copiar link" aria-label={`Copiar link de ${plan.title}`}><Copy size={15} /></button>
                        <a className="icon-button" href={`/${plan.slug}`} target="_blank" rel="noreferrer" title="Abrir plano" aria-label={`Abrir ${plan.title}`}><ExternalLink size={15} /></a>
                        <button className="icon-button" onClick={() => remove(plan)} title="Excluir" aria-label={`Excluir ${plan.title}`}><Trash2 size={15} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="empty-state">{query ? <Search size={35} /> : <FileCode2 size={35} />}<h3>{query ? "Nenhum plano encontrado" : "Sua biblioteca começa aqui"}</h3><p>{query ? "Tente buscar por outro nome ou endereço." : "Publique o primeiro HTML ou ZIP e o link aparecerá nesta lista imediatamente."}</p></div>
            )}
          </section>
        </div>
      </main>
      {toast ? <div className="toast"><Check size={14} style={{ display: "inline", marginRight: 8 }} />{toast}</div> : null}
    </>
  );
}
