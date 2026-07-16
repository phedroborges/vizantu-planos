(function () {
  "use strict";

  var ownScript = document.currentScript;
  var slug = ownScript && ownScript.dataset ? ownScript.dataset.planSlug : "";
  var boxes = Array.prototype.slice.call(document.querySelectorAll(".approval[data-id]"));
  if (!slug || !boxes.length) return;

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
      ".approval .btn-adjust.active{background:#d65d32!important;border-color:#d65d32!important;color:#fff!important}"
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
