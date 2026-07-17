(function () {
  "use strict";

  var ownScript = document.currentScript;
  var slug = ownScript && ownScript.dataset ? ownScript.dataset.planSlug : "";
  if (!slug) return;

  function textFrom(element) {
    return element && element.textContent ? element.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function hasDirectApproval(target) {
    return Boolean(target.querySelector(":scope > .approval[data-id], :scope > .shell > .approval[data-id]"));
  }

  function createGeneratedApproval(target, index) {
    var isContent = target.tagName === "ARTICLE";
    if (!target.id) target.id = "vizantu-slide-" + String(index + 1).padStart(2, "0");
    var id = (isContent ? "conteudo-" : "secao-") + target.id;
    if (hasDirectApproval(target) || document.querySelector('.approval[data-id="' + id + '"]')) return;

    var label = textFrom(target.querySelector(isContent ? ".script-header .eyebrow, :scope > header .eyebrow" : ".section-no"));
    var heading = textFrom(target.querySelector(isContent ? ".script-header h3, :scope > header h2, :scope > header h3, :scope h3" : ":scope > .shell > .section-head h2, :scope > .section-head h2, :scope h2"));
    var title = [label, heading].filter(Boolean).join(" · ") || target.id;
    var box = document.createElement("div");
    box.className = "approval vz-generated-approval";
    box.dataset.id = id;
    box.dataset.title = title;

    var head = document.createElement("div");
    head.className = "vz-generated-head";
    var kicker = document.createElement("span");
    kicker.textContent = isContent ? "APROVAÇÃO DO CONTEÚDO" : "APROVAÇÃO DA SEÇÃO";
    var headingElement = document.createElement("strong");
    headingElement.textContent = heading || label || "Revise este item";
    head.appendChild(kicker);
    head.appendChild(headingElement);

    var actions = document.createElement("div");
    actions.className = "vz-generated-actions";
    actions.innerHTML = '<button type="button" class="btn-ok">Aprovar</button><button type="button" class="btn-adjust">Pedir ajuste</button>';
    var textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", "Comentário sobre " + title);
    textarea.placeholder = "Escreva aqui o que precisa ser ajustado ou registre uma observação.";
    box.appendChild(head);
    box.appendChild(actions);
    box.appendChild(textarea);

    var destination = isContent ? target : target.querySelector(":scope > .shell, :scope > .deck, :scope > .container") || target;
    destination.appendChild(box);
  }

  Array.prototype.forEach.call(document.querySelectorAll("section.band, section.slide, article.script[id]"), createGeneratedApproval);
  var boxes = Array.prototype.slice.call(document.querySelectorAll(".approval[data-id]"));
  if (!boxes.length) return;

  var apiUrl = "/api/plans/" + encodeURIComponent(slug) + "/approvals";
  var state = {};
  var busy = {};

  function addStyles() {
    var style = document.createElement("style");
    style.textContent = [
      ".vz-approval-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:9px;font:500 11px/1.4 Arial,sans-serif;color:#687068}",
      ".vz-save-comment{border:1px solid currentColor;background:transparent;color:inherit;padding:6px 10px;border-radius:5px;cursor:pointer;font:600 11px Arial,sans-serif}",
      ".vz-save-comment:hover{background:rgba(128,128,128,.08)}",
      ".vz-save-comment:disabled,.approval button:disabled,.approval textarea:disabled{opacity:.55;cursor:wait}",
      ".vz-save-state[data-state=error]{color:#b3312a}",
      ".approval .btn-ok.active{background:#2f5f3c!important;border-color:#2f5f3c!important;color:#fff!important}",
      ".approval .btn-adjust.active{background:#d65d32!important;border-color:#d65d32!important;color:#fff!important}",
      ".vz-generated-approval{box-sizing:border-box;margin-top:32px;padding:20px;border:1px solid rgba(31,43,34,.18);border-radius:6px;background:#fff;color:#18201a;box-shadow:0 8px 24px rgba(25,35,27,.06);font-family:Arial,sans-serif}",
      ".vz-generated-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}",
      ".vz-generated-head span{flex:none;color:#749f1c;font:700 10px/1.4 Arial,sans-serif;letter-spacing:.08em}",
      ".vz-generated-head strong{max-width:680px;text-align:right;font:650 15px/1.4 Arial,sans-serif}",
      ".vz-generated-actions{display:flex;gap:8px;margin-bottom:10px}",
      ".vz-generated-approval .btn-ok,.vz-generated-approval .btn-adjust{min-height:36px;padding:8px 14px;border:1px solid #cbd2cc;border-radius:4px;background:#f7f8f6;color:#18201a;cursor:pointer;font:650 12px Arial,sans-serif}",
      ".vz-generated-approval textarea{box-sizing:border-box;display:block;width:100%;min-height:88px;padding:12px;border:1px solid #cbd2cc;border-radius:4px;background:#fff;color:#18201a;resize:vertical;font:400 13px/1.5 Arial,sans-serif}",
      ".vz-generated-approval textarea:focus{outline:2px solid rgba(132,181,35,.32);border-color:#84b523}",
      "@media(max-width:640px){.vz-generated-approval{padding:16px}.vz-generated-head{display:block}.vz-generated-head strong{display:block;margin-top:6px;text-align:left}.vz-generated-actions{display:grid;grid-template-columns:1fr 1fr}.vz-generated-approval .btn-ok,.vz-generated-approval .btn-adjust{width:100%}}"
    ].join("");
    document.head.appendChild(style);
  }

  function api(body) {
    return fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (response) {
      if (!response.ok) return response.json().catch(function () { return {}; }).then(function (data) {
        throw new Error(data.error || "Não foi possível salvar.");
      });
      return response.json();
    });
  }

  function formatDate(value) {
    if (!value) return "Ainda não avaliado";
    try {
      return "Salvo em " + new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
      }).format(new Date(value));
    } catch {
      return "Avaliação salva";
    }
  }

  function enhanceBox(box) {
    if (box.dataset.vizantuReady) return;
    box.dataset.vizantuReady = "true";
    var textarea = box.querySelector("textarea");
    if (!textarea) return;

    var meta = document.createElement("div");
    meta.className = "vz-approval-meta";
    meta.innerHTML = '<span class="vz-save-state">Conectando à aprovação...</span><button type="button" class="vz-save-comment">Salvar comentário</button>';
    textarea.insertAdjacentElement("afterend", meta);
  }

  function setBusy(box, value) {
    var id = box.dataset.id;
    busy[id] = value;
    Array.prototype.forEach.call(box.querySelectorAll("button, textarea"), function (control) {
      control.disabled = value;
    });
    var label = box.querySelector(".vz-save-state");
    if (value && label) {
      label.dataset.state = "saving";
      label.textContent = "Salvando...";
    }
  }

  function renderBox(box) {
    var item = state[box.dataset.id] || { status: "pending", comment: "" };
    var ok = box.querySelector(".btn-ok");
    var adjust = box.querySelector(".btn-adjust");
    var textarea = box.querySelector("textarea");
    var label = box.querySelector(".vz-save-state");
    if (ok) {
      ok.classList.toggle("active", item.status === "approved");
      ok.setAttribute("aria-pressed", item.status === "approved" ? "true" : "false");
    }
    if (adjust) {
      adjust.classList.toggle("active", item.status === "changes_requested");
      adjust.setAttribute("aria-pressed", item.status === "changes_requested" ? "true" : "false");
    }
    if (textarea && document.activeElement !== textarea) textarea.value = item.comment || "";
    if (label && !busy[box.dataset.id]) {
      label.dataset.state = "saved";
      label.textContent = formatDate(item.updatedAt);
    }
  }

  function renderSummary() {
    var items = boxes.map(function (box) { return state[box.dataset.id] || { status: "pending" }; });
    var approved = items.filter(function (item) { return item.status === "approved"; }).length;
    var changes = items.filter(function (item) { return item.status === "changes_requested"; }).length;
    var done = approved + changes;
    var overall = changes ? "Plano com ajustes" : approved === items.length ? "Plano aprovado" : approved === 0 ? "Aguardando cliente" : "Em revisão";
    var counter = document.getElementById("appr-count");
    if (counter) counter.textContent = done + " de " + items.length + " conteúdos avaliados · " + overall;
  }

  function buildReport() {
    var lines = [document.title + " — Parecer do cliente", ""];
    boxes.forEach(function (box) {
      var item = state[box.dataset.id] || { status: "pending", comment: "" };
      var label = item.status === "approved" ? "APROVADO" : item.status === "changes_requested" ? "PEDIR AJUSTE" : "SEM AVALIAÇÃO";
      lines.push((box.dataset.title || box.dataset.id) + ": " + label);
      if (item.comment) lines.push('Comentário: "' + item.comment + '"');
      lines.push("");
    });
    return lines.join("\n");
  }

  function copyReport(button) {
    var text = buildReport();
    function done() {
      var original = button.textContent;
      button.textContent = "Parecer copiado!";
      window.setTimeout(function () { button.textContent = original; }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copie o parecer:", text); });
    } else {
      window.prompt("Copie o parecer:", text);
    }
  }

  function applyApprovals(approvals) {
    state = {};
    (approvals.items || []).forEach(function (item) { state[item.id] = item; });
    boxes.forEach(renderBox);
    renderSummary();
  }

  function showError(box, message) {
    var label = box.querySelector(".vz-save-state");
    if (label) {
      label.dataset.state = "error";
      label.textContent = message || "Não foi possível salvar. Tente novamente.";
    }
  }

  function save(box, nextStatus) {
    var id = box.dataset.id;
    if (busy[id]) return;
    var textarea = box.querySelector("textarea");
    setBusy(box, true);
    api({
      action: "record",
      itemId: id,
      itemTitle: box.dataset.title || id,
      status: nextStatus || "pending",
      comment: textarea ? textarea.value : ""
    }).then(function (data) {
      applyApprovals(data.approvals);
      setBusy(box, false);
      renderBox(box);
    }).catch(function (error) {
      setBusy(box, false);
      showError(box, error.message);
    });
  }

  function handleClick(event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    var copyButton = target.closest("#appr-copy");
    var whatsappButton = target.closest("#appr-wa");
    if (copyButton || whatsappButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (copyButton) copyReport(copyButton);
      if (whatsappButton) window.open("https://wa.me/?text=" + encodeURIComponent(buildReport()), "_blank", "noopener");
      return;
    }

    var button = target.closest(".btn-ok, .btn-adjust, .vz-save-comment");
    if (!button) return;
    var box = button.closest(".approval[data-id]");
    if (!box) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var current = state[box.dataset.id] || { status: "pending" };
    var nextStatus = current.status;
    if (button.classList.contains("btn-ok")) nextStatus = current.status === "approved" ? "pending" : "approved";
    if (button.classList.contains("btn-adjust")) nextStatus = current.status === "changes_requested" ? "pending" : "changes_requested";
    save(box, nextStatus);
  }

  addStyles();
  boxes.forEach(function (box) {
    enhanceBox(box);
    setBusy(box, true);
  });
  document.addEventListener("click", handleClick, true);

  api({
    action: "sync",
    items: boxes.map(function (box) { return { id: box.dataset.id, title: box.dataset.title || box.dataset.id }; })
  }).then(function (data) {
    applyApprovals(data.approvals);
    boxes.forEach(function (box) { setBusy(box, false); renderBox(box); });
  }).catch(function (error) {
    boxes.forEach(function (box) { setBusy(box, false); showError(box, error.message); });
  });
})();
