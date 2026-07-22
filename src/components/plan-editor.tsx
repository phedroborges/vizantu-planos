"use client";

import { ArrowLeft, Check, ExternalLink, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const EDITABLE = [
  "p", "h1", "h2", "h3", "h4", "h5", "li", "td", "th", "blockquote", "figcaption", "caption",
  ".ig-caption", ".ig-signature", ".ig-kicker", ".ig-visual > strong",
].map((s) => `main ${s}`).join(", ");

const EDITOR_STYLE = `
  [data-vz-editable]{outline:1px dashed rgba(145,71,255,.35);outline-offset:2px;border-radius:3px;transition:outline-color .12s,background .12s;cursor:text;}
  [data-vz-editable]:hover{outline-color:rgba(145,71,255,.7);background:rgba(145,71,255,.05);}
  [data-vz-editable]:focus{outline:2px solid #9147ff;background:rgba(145,71,255,.08);}
`;

export function PlanEditor({ slug, title, html }: { slug: string; title: string; html: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

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

  return (
    <div className="editor-wrap">
      <div className="editor-bar">
        <a className="editor-back" href="/"><ArrowLeft size={15} /> Painel</a>
        <div className="editor-title">
          <strong>Editando</strong>
          <span>{title}</span>
        </div>
        <div className="editor-actions">
          {message ? <span className={`editor-msg ${status}`}>{message}</span> : dirty ? <span className="editor-msg dirty">Alterações não salvas</span> : null}
          <a className="editor-ghost" href={`/${slug}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Ver plano</a>
          <button className="editor-save" type="button" onClick={save} disabled={status === "saving" || !dirty}>
            {status === "saving" ? "Salvando…" : status === "saved" ? <><Check size={15} /> Salvo</> : <><Save size={15} /> Salvar alterações</>}
          </button>
        </div>
      </div>
      <div className="editor-hint">
        Clique em qualquer texto do plano para editar. As áreas editáveis ficam destacadas em roxo ao passar o mouse. Salve ao terminar — guardamos um backup automático da versão anterior.
      </div>
      <iframe
        ref={frameRef}
        className="editor-frame"
        title={`Editando ${title}`}
        srcDoc={html}
        sandbox="allow-same-origin"
      />
    </div>
  );
}
