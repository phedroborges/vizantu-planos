"use client";

import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Files,
  MessageSquareMore,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { groupAdjustmentCategories, type DashboardProject } from "@/lib/admin-analytics";

function statusLabel(project: DashboardProject) {
  if (project.status === "approved") return "Aprovado";
  if (project.status === "adjustments") return "Com ajustes";
  if (project.status === "review") return "Em revisão";
  if (project.status === "presentation") return "Apresentação";
  return "Aguardando";
}

export function AnalyticsDashboard({
  projects,
  storageError = "",
}: {
  projects: DashboardProject[];
  storageError?: string;
}) {
  const metrics = useMemo(() => {
    const approvalProjects = projects.filter((project) => project.kind !== "presentation");
    const clients = new Set(projects.map((project) => project.client).filter((client) => client !== "Cliente não informado"));
    const approvers = new Set(projects.flatMap((project) => project.approvers).map((name) => name.toLocaleLowerCase("pt-BR")));
    const totalContents = approvalProjects.reduce((sum, project) => sum + project.total, 0);
    const approvedContents = approvalProjects.reduce((sum, project) => sum + project.approved, 0);
    return {
      plans: projects.length,
      clients: clients.size,
      approvers: approvers.size,
      approvalRate: totalContents ? Math.round((approvedContents / totalContents) * 100) : 0,
      totalContents,
      approvedContents,
    };
  }, [projects]);

  const adjustmentCategories = useMemo(() => groupAdjustmentCategories(projects), [projects]);
  const adjustmentTotal = adjustmentCategories.reduce((sum, category) => sum + category.count, 0);

  return (
    <main className="admin-page analytics-page">
      <div className="analytics-heading">
        <div>
          <span className="eyebrow">Visão geral</span>
          <h1>Dashboard</h1>
          <p>O panorama dos planos, clientes e decisões que estão passando pela agência.</p>
        </div>
        <Link className="primary-button analytics-new-plan" href="/planos#novo-plano">Novo plano</Link>
      </div>

      {storageError ? <div className="storage-notice analytics-storage">{storageError}</div> : null}

      <section className="metric-grid" aria-label="Indicadores gerais">
        <article className="metric-card">
          <div className="metric-icon violet"><Files size={19} /></div>
          <span>Planos</span>
          <strong>{metrics.plans}</strong>
          <small>{projects.filter((project) => project.status === "approved").length} concluídos</small>
        </article>
        <article className="metric-card">
          <div className="metric-icon green"><Users size={19} /></div>
          <span>Clientes</span>
          <strong>{metrics.clients}</strong>
          <small>{metrics.approvers} {metrics.approvers === 1 ? "aprovador identificado" : "aprovadores identificados"}</small>
        </article>
        <article className="metric-card">
          <div className="metric-icon orange"><MessageSquareMore size={19} /></div>
          <span>Pedidos de ajuste</span>
          <strong>{adjustmentTotal}</strong>
          <small>em todo o histórico</small>
        </article>
        <article className="metric-card approval-metric">
          <div className="metric-icon blue"><CheckCircle2 size={19} /></div>
          <span>Aprovação dos conteúdos</span>
          <div className="metric-rate">
            <strong>{metrics.approvalRate}%</strong>
            <div className="metric-ring" style={{ "--approval-rate": `${metrics.approvalRate}%` } as React.CSSProperties} aria-hidden="true" />
          </div>
          <small>{metrics.approvedContents} de {metrics.totalContents} conteúdos</small>
        </article>
      </section>

      <section className="analytics-panel project-overview">
        <div className="analytics-panel-head">
          <div><span className="eyebrow">Projetos</span><h2>Clientes e aprovadores</h2></div>
          <span>{projects.length} {projects.length === 1 ? "projeto" : "projetos"}</span>
        </div>
        {projects.length ? (
          <div className="project-table-wrap">
            <table className="project-table">
              <thead>
                <tr><th>Cliente e projeto</th><th>Aprovadores</th><th>Aprovação</th><th>Status</th><th><span className="sr-only">Abrir</span></th></tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.slug}>
                    <td data-label="Projeto">
                      <strong>{project.client}</strong>
                      <span>{project.title} · Versão {project.reviewVersion}</span>
                    </td>
                    <td data-label="Aprovadores">
                      <strong>{project.approvers.length}</strong>
                      <span>{project.approvers.length ? project.approvers.join(", ") : "Ninguém se identificou"}</span>
                    </td>
                    <td data-label="Aprovação">
                      {project.kind === "presentation" ? <span>Sem aprovação</span> : (
                        <>
                          <div className="project-progress-label"><strong>{project.approvalRate}%</strong><span>{project.approved}/{project.total}</span></div>
                          <div className="project-progress"><span style={{ width: `${project.approvalRate}%` }} /></div>
                        </>
                      )}
                    </td>
                    <td data-label="Status"><span className={`analytics-status ${project.status}`}>{statusLabel(project)}</span></td>
                    <td>
                      <Link className="table-open" href={project.kind === "presentation" ? `/${project.slug}` : `/revisoes/${project.slug}`} aria-label={`Abrir detalhes de ${project.title}`}><ExternalLink size={16} /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="analytics-empty"><ClipboardList size={30} /><strong>Nenhum plano publicado</strong><p>Quando você publicar o primeiro plano, os dados aparecerão aqui.</p></div>
        )}
      </section>

      <section className="analytics-panel adjustment-insights">
          <div className="analytics-panel-head">
            <div><span className="eyebrow">Aprendizados</span><h2>Ajustes mais comuns</h2></div>
            <span>{adjustmentTotal} solicitações</span>
          </div>
          {adjustmentCategories.length ? (
            <ol className="adjustment-ranking">
              {adjustmentCategories.slice(0, 6).map((category, index) => {
                const share = adjustmentTotal ? Math.round((category.count / adjustmentTotal) * 100) : 0;
                return (
                  <li key={category.id}>
                    <span className="ranking-number">{String(index + 1).padStart(2, "0")}</span>
                    <div className="ranking-content">
                      <div><strong>{category.label}</strong><span>{category.count} {category.count === 1 ? "pedido" : "pedidos"} · {share}%</span></div>
                      <div className="ranking-bar"><span style={{ width: `${share}%` }} /></div>
                      {category.examples[0] ? <blockquote>“{category.examples[0]}”</blockquote> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="analytics-empty compact"><MessageSquareMore size={28} /><strong>Ainda não há ajustes</strong><p>Os temas recorrentes aparecerão conforme os clientes enviarem comentários.</p></div>
          )}
      </section>
    </main>
  );
}
