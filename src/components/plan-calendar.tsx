"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Eye,
  Files,
  MessageSquareWarning,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DashboardProject } from "@/lib/admin-analytics";

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function dateParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: SAO_PAULO_TIME_ZONE,
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function monthKey(value: string) {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}`;
}

function dayKey(value: string) {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentMonthKey() {
  return monthKey(new Date().toISOString());
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: SAO_PAULO_TIME_ZONE })
    .format(new Date(Date.UTC(year, month - 1, 15)));
}

function moveMonth(key: string, amount: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 15));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SAO_PAULO_TIME_ZONE,
  }).format(new Date(value));
}

function statusLabel(project: DashboardProject) {
  if (project.status === "approved") return "Aprovado";
  if (project.status === "adjustments") return "Com ajustes";
  if (project.status === "review") return "Em revisão";
  if (project.status === "presentation") return "Apresentação";
  return "Aguardando";
}

export function PlanCalendar({
  projects,
  storageError = "",
}: {
  projects: DashboardProject[];
  storageError?: string;
}) {
  const latestMonth = useMemo(
    () => projects.map((project) => monthKey(project.createdAt)).sort().at(-1) || currentMonthKey(),
    [projects],
  );
  const [selectedMonth, setSelectedMonth] = useState(latestMonth);
  const [selectedProject, setSelectedProject] = useState<DashboardProject | null>(null);

  useEffect(() => {
    if (!selectedProject) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedProject(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedProject]);

  const monthProjects = useMemo(
    () => projects.filter((project) => monthKey(project.createdAt) === selectedMonth),
    [projects, selectedMonth],
  );
  const projectsByDay = useMemo(() => {
    const grouped = new Map<string, DashboardProject[]>();
    monthProjects.forEach((project) => {
      const key = dayKey(project.createdAt);
      grouped.set(key, [...(grouped.get(key) || []), project]);
    });
    return grouped;
  }, [monthProjects]);
  const calendarDays = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [selectedMonth]);

  return (
    <main className="admin-page full-calendar-page">
      <div className="analytics-heading calendar-page-heading">
        <div>
          <span className="eyebrow">Organização mensal</span>
          <h1>Calendário</h1>
          <p>Veja quando cada plano foi publicado e abra sua visão geral sem sair do calendário.</p>
        </div>
        <div className="calendar-filter full-calendar-filter">
          <button type="button" onClick={() => setSelectedMonth((current) => moveMonth(current, -1))} aria-label="Mês anterior"><ArrowLeft size={17} /></button>
          <label>
            <span className="sr-only">Filtrar mês</span>
            <input type="month" value={selectedMonth} onChange={(event) => event.target.value && setSelectedMonth(event.target.value)} />
          </label>
          <button type="button" onClick={() => setSelectedMonth((current) => moveMonth(current, 1))} aria-label="Próximo mês"><ArrowRight size={17} /></button>
        </div>
      </div>

      {storageError ? <div className="storage-notice analytics-storage">{storageError}</div> : null}

      <section className="analytics-panel full-calendar-panel">
        <div className="full-calendar-summary">
          <div><CalendarDays size={18} /><strong>{monthLabel(selectedMonth)}</strong></div>
          <span>{monthProjects.length} {monthProjects.length === 1 ? "plano publicado" : "planos publicados"}</span>
        </div>
        <div className="full-calendar-scroll">
          <div className="full-calendar-grid" aria-label={`Calendário de ${monthLabel(selectedMonth)}`}>
            {WEEKDAYS.map((weekday) => <span className="calendar-weekday" key={weekday}>{weekday}</span>)}
            {calendarDays.map((day, index) => {
              if (day === null) return <span className="full-calendar-day empty" key={`empty-${index}`} aria-hidden="true" />;
              const key = `${selectedMonth}-${String(day).padStart(2, "0")}`;
              const dayProjects = projectsByDay.get(key) || [];
              return (
                <div className={`full-calendar-day ${dayProjects.length ? "has-plans" : ""}`} key={key}>
                  <div className="full-calendar-date"><span>{day}</span>{dayProjects.length ? <small>{dayProjects.length}</small> : null}</div>
                  <div className="full-calendar-cards">
                    {dayProjects.map((project) => (
                      <button className={`calendar-project-card ${project.status}`} type="button" onClick={() => setSelectedProject(project)} key={project.slug}>
                        <span>{project.client}</span>
                        <strong>{project.title}</strong>
                        <small>{project.kind === "presentation" ? "Apresentação" : `${project.approvalRate}% aprovado`} · {statusLabel(project)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {!monthProjects.length ? <div className="calendar-page-empty"><Files size={28} /><strong>Nenhum plano neste mês</strong><p>Use as setas ou o filtro para consultar outro período.</p></div> : null}
      </section>

      {selectedProject ? (
        <div className="plan-overview-layer">
          <button className="plan-overview-backdrop" type="button" aria-label="Fechar visão geral" onClick={() => setSelectedProject(null)} />
          <section className="plan-overview-modal" role="dialog" aria-modal="true" aria-labelledby="plan-overview-title">
            <header className="plan-overview-head">
              <div>
                <span>{selectedProject.client} · Versão {selectedProject.reviewVersion}</span>
                <h2 id="plan-overview-title">{selectedProject.title}</h2>
              </div>
              <button type="button" aria-label="Fechar visão geral" onClick={() => setSelectedProject(null)}><X size={19} /></button>
            </header>
            <div className="plan-overview-body">
              <div className="plan-overview-status">
                <span className={`analytics-status ${selectedProject.status}`}>{statusLabel(selectedProject)}</span>
                <small>Publicado em {formatDateTime(selectedProject.createdAt)}</small>
              </div>
              <div className="plan-overview-metrics">
                <article><Files size={17} /><span>Conteúdos</span><strong>{selectedProject.total}</strong></article>
                <article><CheckCircle2 size={17} /><span>Aprovados</span><strong>{selectedProject.approved}</strong></article>
                <article><MessageSquareWarning size={17} /><span>Com ajustes</span><strong>{selectedProject.changesRequested}</strong></article>
                <article><Clock3 size={17} /><span>Pendentes</span><strong>{selectedProject.pending}</strong></article>
              </div>
              {selectedProject.kind !== "presentation" ? (
                <div className="plan-overview-progress">
                  <div><strong>{selectedProject.approvalRate}% de aprovação</strong><span>{selectedProject.approved} de {selectedProject.total}</span></div>
                  <div><span style={{ width: `${selectedProject.approvalRate}%` }} /></div>
                </div>
              ) : null}
              <div className="plan-overview-people">
                <section>
                  <div className="people-title"><Eye size={17} /><div><strong>Pessoas que visualizaram</strong><span>{selectedProject.viewers.length} identificadas</span></div></div>
                  {selectedProject.viewers.length ? (
                    <ul>
                      {selectedProject.viewers.map((viewer) => (
                        <li key={viewer.reviewerId}>
                          <span className="person-avatar">{viewer.name.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
                          <div><strong>{viewer.name}</strong><small>Último acesso: {formatDateTime(viewer.lastViewedAt)} · {viewer.viewCount} {viewer.viewCount === 1 ? "visita" : "visitas"}</small></div>
                        </li>
                      ))}
                    </ul>
                  ) : <p>Nenhuma visualização identificada foi registrada ainda.</p>}
                </section>
                <section>
                  <div className="people-title"><ClipboardCheck size={17} /><div><strong>Aprovadores</strong><span>{selectedProject.approvers.length} participantes</span></div></div>
                  {selectedProject.approvers.length ? (
                    <ul>
                      {selectedProject.approvers.map((name) => (
                        <li key={name}>
                          <span className="person-avatar approved">{name.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
                          <div><strong>{name}</strong><small>Registrou uma decisão no plano</small></div>
                        </li>
                      ))}
                    </ul>
                  ) : <p>Ninguém aprovou ou pediu ajustes ainda.</p>}
                </section>
              </div>
            </div>
            <footer className="plan-overview-actions">
              {selectedProject.kind === "presentation" ? null : <Link className="secondary-button" href={`/revisoes/${selectedProject.slug}`}><ClipboardCheck size={15} /> Ver aprovações</Link>}
              <Link className="primary-button" href={`/${selectedProject.slug}`} target="_blank"><ExternalLink size={15} /> Abrir plano</Link>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
