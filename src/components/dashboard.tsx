"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, FileCode2, LogOut, Search, Trash2, UploadCloud } from "lucide-react";
import type { Plan } from "@/lib/types";
import { toSlug } from "@/lib/slug";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export function Dashboard({ initialPlans }: { initialPlans: Plan[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "meusite.com";
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
    if (!nextFile.name.toLowerCase().endsWith(".html")) {
      setError("Envie um arquivo com extensão .html.");
      return;
    }
    setFile(nextFile);
    if (!title) updateTitle(nextFile.name.replace(/\.html$/i, "").replace(/[-_]+/g, " "));
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError("Escolha um arquivo HTML.");
    setError("");
    setIsUploading(true);
    const body = new FormData();
    body.set("title", title);
    body.set("slug", slug);
    body.set("file", file);

    const response = await fetch("/api/plans", { method: "POST", body });
    const result = await response.json();
    setIsUploading(false);
    if (!response.ok) return setError(result.error || "Não foi possível publicar o plano.");

    setPlans((current) => [result.plan, ...current.filter((plan) => plan.slug !== result.plan.slug)]);
    setTitle(""); setSlug(""); setSlugTouched(false); setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    showToast("Plano publicado e pronto para compartilhar.");
  }

  async function copyLink(slugToCopy: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/${slugToCopy}`);
    showToast("Link copiado.");
  }

  async function remove(plan: Plan) {
    if (!window.confirm(`Excluir “${plan.title}”? O link deixará de funcionar.`)) return;
    const response = await fetch(`/api/plans/${plan.slug}`, { method: "DELETE" });
    if (!response.ok) return showToast("Não foi possível excluir o plano.");
    setPlans((current) => current.filter((item) => item.slug !== plan.slug));
    showToast("Plano excluído.");
  }

  return (
    <>
      <header className="topbar"><div className="app-shell topbar-inner"><div className="brand"><span className="brand-mark">VZ</span><span>Vizantu Planos<small>Publicador de apresentações</small></span></div><form action="/api/logout" method="post"><button className="ghost-button" type="submit"><LogOut size={15} /> Sair</button></form></div></header>
      <main className="app-shell dashboard">
        <div className="dashboard-head"><div><span className="eyebrow">Biblioteca de aprovações</span><h1>Planos publicados</h1><p>Envie um HTML e receba uma página pronta para compartilhar com o cliente.</p></div><div className="stats"><div className="stat"><strong>{plans.length}</strong><span>planos ativos</span></div><div className="stat"><strong>{plans.reduce((sum, plan) => sum + plan.size, 0) ? formatBytes(plans.reduce((sum, plan) => sum + plan.size, 0)) : "0 KB"}</strong><span>armazenados</span></div></div></div>
        <div className="workspace">
          <section className="panel upload-panel"><div className="panel-head"><h2>Publicar novo plano</h2><p>O mesmo endereço será atualizado quando você reutilizar um slug.</p></div><form className="upload-form" onSubmit={upload}><div className="field"><label htmlFor="title">Título</label><input id="title" value={title} onChange={(event) => updateTitle(event.target.value)} placeholder="Plano de julho · TerraNet" required maxLength={120} /></div><div className="field"><label htmlFor="slug">Endereço</label><input id="slug" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(toSlug(event.target.value)); }} placeholder="plano-julho-terranet" required maxLength={80} /><span className="slug-preview">{siteUrl || "meusite.com"}/{slug || "seu-endereco"}</span></div><label className={`dropzone ${isDragging ? "active" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); pickFile(event.dataTransfer.files[0]); }}><input ref={fileInput} type="file" accept=".html,text/html" onChange={(event) => pickFile(event.target.files?.[0])} />{file ? <div className="selected-file"><FileCode2 size={28} /><div><strong>{file.name}</strong><span>{formatBytes(file.size)} · pronto para publicar</span></div></div> : <div><UploadCloud size={29} /><strong>Arraste o HTML ou clique para escolher</strong><span>Arquivo único de até 4 MB</span></div>}</label>{error ? <div className="form-message">{error}</div> : null}<button className="primary-button" type="submit" disabled={isUploading}>{isUploading ? "Publicando..." : <><UploadCloud size={16} /> Publicar plano</>}</button></form></section>
          <section className="panel list-panel"><div className="list-toolbar"><div className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cliente ou plano" aria-label="Buscar planos" /></div><span>{visiblePlans.length} {visiblePlans.length === 1 ? "resultado" : "resultados"}</span></div>{visiblePlans.length ? <ul className="plan-list">{visiblePlans.map((plan) => <li className="plan-row" key={plan.slug}><div className="plan-title"><a href={`/${plan.slug}`} target="_blank" rel="noreferrer">{plan.title}</a><div className="plan-url">/{plan.slug}</div></div><div className="plan-meta"><span className="status">Publicado</span><br />{formatDate(plan.updatedAt)} · {formatBytes(plan.size)}</div><div className="actions"><button className="icon-button" onClick={() => copyLink(plan.slug)} title="Copiar link" aria-label={`Copiar link de ${plan.title}`}><Copy size={15} /></button><a className="icon-button" href={`/${plan.slug}`} target="_blank" rel="noreferrer" title="Abrir plano" aria-label={`Abrir ${plan.title}`}><ExternalLink size={15} /></a><button className="icon-button" onClick={() => remove(plan)} title="Excluir" aria-label={`Excluir ${plan.title}`}><Trash2 size={15} /></button></div></li>)}</ul> : <div className="empty-state">{query ? <Search size={35} /> : <FileCode2 size={35} />}<h3>{query ? "Nenhum plano encontrado" : "Sua biblioteca começa aqui"}</h3><p>{query ? "Tente buscar por outro nome ou endereço." : "Publique o primeiro HTML e o link aparecerá nesta lista imediatamente."}</p></div>}</section>
        </div>
      </main>
      {toast ? <div className="toast"><Check size={14} style={{ display: "inline", marginRight: 8 }} />{toast}</div> : null}
    </>
  );
}
