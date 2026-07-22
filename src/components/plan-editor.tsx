"use client";

import { ArrowLeft, Check, ExternalLink, History, Save } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorReviewSidebar } from "@/components/editor-review-sidebar";
import type { ApprovalItem, PlanApprovals } from "@/lib/types";

const EDITABLE = [
  "p", "h1", "h2", "h3", "h4", "h5", "li", "td", "th", "blockquote", "figcaption", "caption",
  ".ig-caption", ".ig-signature", ".ig-kicker", ".ig-visual > strong",
].map((s) => `main ${s}`).join(", ");

const EDITOR_STYLE = `
  [data-vz-editable]{outline:1px dashed rgba(145,71,255,.35);outline-offset:2px;border-radius:3px;transition:outline-color .12s,background .12s;cursor:text;}
  [data-vz-editable]:hover{outline-color:rgba(145,71,255,.7);background:rgba(145,71,255,.05);}
  [data-vz-editable]:focus{outline:2px solid #9147ff;background:rgba(145,71,255,.08);}
  [data-vz-editor-target]{outline:4px solid #e56a3c!important;outline-offset:6px!important;animation:vzEditorTarget 1.8s ease;}
  @keyframes vzEditorTarget{0%,100%{box-shadow:0 0 0 0 rgba(229,106,60,0)}35%{box-shadow:0 0 0 12px rgba(229,106,60,.2)}}
`;

export function PlanEditor({ slug, title, html, initialApprovals }: { slug: string; title: string; html: string; initialApprovals: PlanApprovals }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);

  const setupEditor = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc || doc.readyState !== "complete" || !doc.body) return;
    if (doc.body.dataset.vzEditorReady === "true") return;
    doc.body.dataset.vzEditorReady = "true";

    const style = doc.createElement("style");
    style.id = "vz-editor-style";
    style.textContent = EDITOR_STYLE;
    doc.head.appendChild(style);

    doc.querySelectorAll(EDITABLE).forEach((el) => {
      const node = el as HTMLElement;
      if (node.hasAttribute("data-vz-editable") || node.closest("[data-vz-editable]")) return;
      node.setAttribute("data-vz-editable", "true");
      node.setAttribute("contenteditable", "true");
      node.spellcheck = false;
    });

    doc.addEventListener("input", () => {
      setStatus("idle");
      setMessage("");
      setDirty(true);
    });
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    setupEditor();
    frame.addEventListener("load", setupEditor);
    const timer = window.setInterval(setupEditor, 250);
    const stop = window.setTimeout(() => window.clearInterval(timer), 4000);
    return () => {
      frame.removeEventListener("load", setupEditor);
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [setupEditor]);

  const save = useCallback(async () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    setStatus("saving");
    setMessage("");

    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelector("#vz-editor-style")?.remove();
    clone.querySelectorAll("[data-vz-editable]").forEach((el) => {
      el.removeAttribute("data-vz-editable");
      el.removeAttribute("contenteditable");
      el.removeAttribute("spellcheck");
    });
    const output = "<!doctype html>\n" + clone.outerHTML;

    try {
      const res = await fetch(`/api/plans/${slug}/html`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: output }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível salvar.");
      }
      setStatus("saved");
      setDirty(false);
      setMessage("Alterações salvas. O plano já está atualizado para o próximo envio.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }, [slug]);

  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
  }, []);

  const focusReviewItem = useCallback((item: Pick<ApprovalItem, "id" | "title">) => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return false;
    const escapedId = window.CSS?.escape ? window.CSS.escape(item.id) : item.id.replace(/[^a-zA-Z0-9_-]/g, "");
    const sourceId = item.id.replace(/^(secao|conteudo)-/, "");
    let target = doc.querySelector<HTMLElement>(`.approval[data-id="${escapedId}"]`);
    target = target?.closest<HTMLElement>("article, section") || target;
    if (!target && sourceId) target = doc.getElementById(sourceId);
    if (!target) {
      const normalizedTitle = item.title.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
      target = [...doc.querySelectorAll<HTMLElement>("article, section")].find((element) => {
        const text = (element.textContent || "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
        return normalizedTitle.length > 5 && text.includes(normalizedTitle);
      }) || null;
    }
    if (!target) return false;

    doc.querySelectorAll("[data-vz-editor-target]").forEach((element) => element.removeAttribute("data-vz-editor-target"));
    target.setAttribute("data-vz-editor-target", "true");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => target?.removeAttribute("data-vz-editor-target"), 2600);
    return true;
  }, []);

  return (
    <div className="editor-wrap">
      <div className="editor-bar">
        <Link className="editor-back" href="/"><ArrowLeft size={15} /> Painel</Link>
        <div className="editor-title">
          <strong>Editando</strong>
          <span>{title}</span>
        </div>
        <div className="editor-actions">
          {message ? <span className={`editor-msg ${status}`}>{message}</span> : dirty ? <span className="editor-msg dirty">Alterações não salvas</span> : null}
          <button className={`editor-history-toggle ${historyOpen ? "active" : ""}`} type="button" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen} aria-controls="editor-review-panel">
            <History size={14} /> {historyOpen ? "Ocultar histórico" : "Ver histórico"}
          </button>
          <Link className="editor-ghost" href={`/${slug}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Ver plano</Link>
          <button className="editor-save" type="button" onClick={save} disabled={status === "saving" || !dirty}>
            {status === "saving" ? "Salvando…" : status === "saved" ? <><Check size={15} /> Salvo</> : <><Save size={15} /> Salvar alterações</>}
          </button>
        </div>
      </div>
      <div className="editor-hint">
        Clique em qualquer texto do plano para editar. As áreas editáveis ficam destacadas em roxo ao passar o mouse. Salve ao terminar — guardamos um backup automático da versão anterior.
      </div>
      <div className="editor-workspace">
        <iframe
          ref={frameRef}
          className="editor-frame"
          title={`Editando ${title}`}
          srcDoc={html}
          sandbox="allow-same-origin"
        />
        {historyOpen ? (
          <div id="editor-review-panel" className="editor-review-panel">
            <EditorReviewSidebar slug={slug} initialApprovals={initialApprovals} onSelectItem={focusReviewItem} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
