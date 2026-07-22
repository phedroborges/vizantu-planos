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
    box.appendChild(head);

    var destination = isContent ? target : target.querySelector(":scope > .shell, :scope > .deck, :scope > .container") || target;
    destination.appendChild(box);
  }

  Array.prototype.forEach.call(document.querySelectorAll("section.slide, article.script[id]"), createGeneratedApproval);
  var boxes = Array.prototype.slice.call(document.querySelectorAll(".approval[data-id]"));
  if (!boxes.length) return;

  var apiUrl = "/api/plans/" + encodeURIComponent(slug) + "/approvals";
  var state = {};
  var busy = {};
  var editing = {};
  var dirty = {};
  var saveQueue = Promise.resolve();
  var lastUpdatedAt = 0;
  var refreshInFlight = false;

  var CHECK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="vz-check-path" d="M4 12.5 9.5 18 20 6.5"/></svg>';

  function addStyles() {
    var style = document.createElement("style");
    style.textContent = [
      /* esconde os controles antigos embutidos nos planos */
      ".approval[data-id] .approval-btns{display:none!important}",
      ".approval[data-id]>textarea{display:none!important}",
      /* caixa gerada */
      ".vz-generated-approval{box-sizing:border-box;margin-top:32px;padding:20px;border:1px solid rgba(31,43,34,.18);border-radius:6px;background:#fff;color:#18201a;box-shadow:0 8px 24px rgba(25,35,27,.06);font-family:Arial,sans-serif}",
      ".vz-generated-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}",
      ".vz-generated-head span{flex:none;color:#749f1c;font:700 10px/1.4 Arial,sans-serif;letter-spacing:.08em}",
      ".vz-generated-head strong{max-width:680px;text-align:right;font:650 15px/1.4 Arial,sans-serif}",
      /* interface nova */
      ".vz-ui{font-family:Arial,sans-serif;color:#18201a}",
      ".vz-ui [hidden]{display:none!important}",
      ".vz-choice{display:flex;gap:10px}",
      ".vz-approve,.vz-request{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:9px 18px;border-radius:5px;cursor:pointer;font:650 13px Arial,sans-serif;transition:transform .12s ease,box-shadow .12s ease}",
      ".vz-approve{border:1px solid #2f5f3c;background:#2f5f3c;color:#fff}",
      ".vz-approve:hover{box-shadow:0 4px 14px rgba(47,95,60,.35);transform:translateY(-1px)}",
      ".vz-request{border:1px solid #cbd2cc;background:#f7f8f6;color:#18201a}",
      ".vz-request:hover{border-color:#d65d32;color:#a63d1e}",
      ".vz-edit textarea{box-sizing:border-box;display:block;width:100%;min-height:96px;padding:12px;border:1px solid #d65d32;border-radius:5px;background:#fff;color:#18201a;resize:vertical;font:400 13px/1.5 Arial,sans-serif}",
      ".vz-edit textarea:focus{outline:2px solid rgba(214,93,50,.25)}",
      ".vz-edit-hint{margin:8px 0 10px;font:500 11px/1.5 Arial,sans-serif;color:#8a5a2b}",
      ".vz-edit-actions{display:flex;gap:8px;margin-top:10px}",
      ".vz-send{min-height:38px;padding:8px 16px;border:1px solid #d65d32;border-radius:5px;background:#d65d32;color:#fff;cursor:pointer;font:650 12px Arial,sans-serif}",
      ".vz-send:disabled{opacity:.45;cursor:not-allowed}",
      ".vz-cancel{min-height:38px;padding:8px 14px;border:1px solid #cbd2cc;border-radius:5px;background:transparent;color:#4c554d;cursor:pointer;font:600 12px Arial,sans-serif}",
      /* veredito */
      ".vz-badge{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:6px}",
      ".vz-badge-approved{background:#eef7e4;border:1px solid #bcd98f}",
      ".vz-badge-changes{background:#fdf0ea;border:1px solid #edbfa8}",
      ".vz-badge-icon{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;color:#fff}",
      ".vz-badge-approved .vz-badge-icon{background:#2f5f3c}",
      ".vz-badge-changes .vz-badge-icon{background:#d65d32;font:700 15px Arial,sans-serif}",
      ".vz-badge-body{flex:1;min-width:0}",
      ".vz-badge-body strong{display:block;font:700 14px/1.3 Arial,sans-serif}",
      ".vz-badge-approved strong{color:#2c5237}",
      ".vz-badge-changes strong{color:#a63d1e}",
      ".vz-badge-body small{display:block;margin-top:3px;font:500 11px/1.4 Arial,sans-serif;color:#687068}",
      ".vz-badge-comment{margin:8px 0 0;padding:8px 10px;background:rgba(255,255,255,.75);border-left:3px solid #d65d32;font:400 12px/1.5 Arial,sans-serif;color:#42331f;white-space:pre-wrap;overflow-wrap:break-word}",
      ".vz-badge-links{flex:none;display:flex;flex-direction:column;gap:6px;align-items:flex-end}",
      ".vz-link{border:0;background:transparent;padding:2px 0;cursor:pointer;font:600 11px Arial,sans-serif;color:#5a6a52;text-decoration:underline}",
      ".vz-link:hover{color:#18201a}",
      /* animações */
      "@keyframes vzBadgePop{0%{transform:scale(.9);opacity:0}70%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}",
      "@keyframes vzIconPop{0%{transform:scale(.2)}65%{transform:scale(1.25)}100%{transform:scale(1)}}",
      "@keyframes vzCheckDraw{from{stroke-dashoffset:26}to{stroke-dashoffset:0}}",
      "@keyframes vzGlow{0%{box-shadow:0 0 0 0 rgba(47,95,60,.45)}100%{box-shadow:0 0 0 18px rgba(47,95,60,0)}}",
      ".vz-anim.vz-badge{animation:vzBadgePop .45s ease}",
      ".vz-anim .vz-badge-icon{animation:vzIconPop .5s cubic-bezier(.2,1.4,.4,1),vzGlow .9s ease .15s}",
      ".vz-anim .vz-check-path{stroke-dasharray:26;animation:vzCheckDraw .4s ease .25s backwards}",
      /* linha de status */
      ".vz-status-line{margin-top:8px;font:500 11px/1.4 Arial,sans-serif;color:#687068}",
      ".vz-status-line[data-state=error]{color:#b3312a;font-weight:700}",
      ".vz-busy .vz-ui button,.vz-busy .vz-ui textarea{opacity:.55;pointer-events:none}",
      "@media(max-width:640px){.vz-generated-approval{padding:16px}.vz-generated-head{display:block}.vz-generated-head strong{display:block;margin-top:6px;text-align:left}.vz-choice{display:grid;grid-template-columns:1fr 1fr}.vz-badge{flex-wrap:wrap}.vz-badge-links{flex-direction:row;width:100%;justify-content:flex-end}}"
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

  function fetchApprovals() {
    return fetch(apiUrl + "?t=" + Date.now(), {
      method: "GET",
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) throw new Error("Não foi possível atualizar as aprovações.");
      return response.json();
    });
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
      }).format(new Date(value));
    } catch {
      return "";
    }
  }

  function enhanceBox(box) {
    if (box.dataset.vizantuReady) return;
    box.dataset.vizantuReady = "true";

    var ui = document.createElement("div");
    ui.className = "vz-ui";
    ui.innerHTML =
      '<div class="vz-choice">' +
        '<button type="button" class="vz-approve">' + CHECK_SVG + ' Aprovar</button>' +
        '<button type="button" class="vz-request">Pedir ajuste</button>' +
      '</div>' +
      '<div class="vz-edit" hidden>' +
        '<textarea aria-label="Descreva o ajuste" placeholder="Descreva aqui o que você quer ajustar neste conteúdo…"></textarea>' +
        '<p class="vz-edit-hint">Escreva o que precisa mudar e confirme. O pedido de ajuste só é enviado depois que você escrever.</p>' +
        '<div class="vz-edit-actions">' +
          '<button type="button" class="vz-send" disabled>Enviar pedido de ajuste</button>' +
          '<button type="button" class="vz-cancel">Cancelar</button>' +
        '</div>' +
      '</div>' +
      '<div class="vz-verdict" hidden></div>' +
      '<div class="vz-status-line">Conectando à aprovação...</div>';
    box.appendChild(ui);
  }

  function setBusy(box, value) {
    var id = box.dataset.id;
    busy[id] = value;
    box.classList.toggle("vz-busy", value);
    var label = box.querySelector(".vz-status-line");
    if (value && label) {
      label.dataset.state = "saving";
      label.textContent = "Salvando...";
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function renderBox(box, animate) {
    var id = box.dataset.id;
    var item = state[id] || { status: "pending", comment: "" };
    var choice = box.querySelector(".vz-choice");
    var edit = box.querySelector(".vz-edit");
    var verdict = box.querySelector(".vz-verdict");
    var label = box.querySelector(".vz-status-line");
    if (!choice || !edit || !verdict) return;

    var mode = editing[id] ? "edit" : item.status === "approved" ? "approved" : item.status === "changes_requested" ? "changes" : "choice";

    choice.hidden = mode !== "choice";
    edit.hidden = mode !== "edit";
    verdict.hidden = mode !== "approved" && mode !== "changes";

    if (mode === "edit") {
      var textarea = edit.querySelector("textarea");
      if (textarea && !dirty[id] && document.activeElement !== textarea) textarea.value = item.comment || "";
      var send = edit.querySelector(".vz-send");
      if (send && textarea) send.disabled = !textarea.value.trim();
    }

    if (mode === "approved") {
      verdict.innerHTML =
        '<div class="vz-badge vz-badge-approved' + (animate ? " vz-anim" : "") + '">' +
          '<span class="vz-badge-icon">' + CHECK_SVG + '</span>' +
          '<div class="vz-badge-body"><strong>Conteúdo aprovado ✓</strong><small>' +
            (item.updatedAt ? "Aprovado em " + formatDate(item.updatedAt) : "Aprovação registrada") +
          '</small></div>' +
          '<div class="vz-badge-links"><button type="button" class="vz-link vz-undo">Desfazer</button></div>' +
        '</div>';
    } else if (mode === "changes") {
      verdict.innerHTML =
        '<div class="vz-badge vz-badge-changes' + (animate ? " vz-anim" : "") + '">' +
          '<span class="vz-badge-icon">✎</span>' +
          '<div class="vz-badge-body"><strong>Ajuste solicitado</strong><small>' +
            (item.updatedAt ? "Enviado em " + formatDate(item.updatedAt) : "Pedido registrado") +
          '</small>' +
          (item.comment ? '<p class="vz-badge-comment">' + escapeHtml(item.comment) + '</p>' : "") +
          '</div>' +
          '<div class="vz-badge-links"><button type="button" class="vz-link vz-edit-request">Editar pedido</button><button type="button" class="vz-link vz-undo">Desfazer</button></div>' +
        '</div>';
    } else {
      verdict.innerHTML = "";
    }

    if (label && !busy[id]) {
      label.dataset.state = "saved";
      if (mode === "choice") label.textContent = "Aprove este conteúdo ou peça um ajuste.";
      else if (mode === "edit") label.textContent = "O pedido é enviado quando você confirmar.";
      else label.textContent = item.updatedAt ? "Salvo em " + formatDate(item.updatedAt) : "";
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
      var label = item.status === "approved" ? "APROVADO" : item.status === "changes_requested" ? "AJUSTE SOLICITADO" : "SEM AVALIAÇÃO";
      lines.push((box.dataset.title || box.dataset.id) + ": " + label);
      if (item.comment && item.status === "changes_requested") lines.push('Ajuste: "' + item.comment + '"');
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

  function applyApprovals(approvals, animatedBox) {
    var updatedAt = Date.parse(approvals.updatedAt || "") || 0;
    if (updatedAt && updatedAt < lastUpdatedAt) return false;
    if (updatedAt) lastUpdatedAt = updatedAt;
    state = {};
    (approvals.items || []).forEach(function (item) { state[item.id] = item; });
    boxes.forEach(function (box) { renderBox(box, box === animatedBox); });
    renderSummary();
    return true;
  }

  function refreshApprovals() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    fetchApprovals().then(function (data) {
      applyApprovals(data.approvals);
    }).catch(function () {
      // Uma falha breve de rede não deve interromper a revisão em andamento.
    }).then(function () {
      refreshInFlight = false;
    });
  }

  function showError(box, message) {
    var label = box.querySelector(".vz-status-line");
    if (label) {
      label.dataset.state = "error";
      label.textContent = message || "Não foi possível salvar. Tente novamente.";
    }
  }

  function save(box, nextStatus, comment) {
    var id = box.dataset.id;
    if (busy[id]) return;
    setBusy(box, true);
    var payload = {
      action: "record",
      itemId: id,
      itemTitle: box.dataset.title || id,
      status: nextStatus,
      comment: comment
    };
    var request = saveQueue.catch(function () {}).then(function () { return api(payload); });
    saveQueue = request.catch(function () {});

    request.then(function (data) {
      dirty[id] = false;
      editing[id] = false;
      var textarea = box.querySelector(".vz-edit textarea");
      if (textarea) textarea.value = "";
      setBusy(box, false);
      applyApprovals(data.approvals, box);
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

    var button = target.closest(".vz-approve, .vz-request, .vz-send, .vz-cancel, .vz-undo, .vz-edit-request");
    if (!button) return;
    var box = button.closest(".approval[data-id]");
    if (!box) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var id = box.dataset.id;
    var item = state[id] || { status: "pending", comment: "" };

    if (button.classList.contains("vz-approve")) {
      save(box, "approved", "");
      return;
    }
    if (button.classList.contains("vz-request") || button.classList.contains("vz-edit-request")) {
      editing[id] = true;
      dirty[id] = false;
      renderBox(box, false);
      var textarea = box.querySelector(".vz-edit textarea");
      if (textarea) {
        if (!textarea.value) textarea.value = item.comment || "";
        textarea.focus();
      }
      return;
    }
    if (button.classList.contains("vz-cancel")) {
      editing[id] = false;
      dirty[id] = false;
      var field = box.querySelector(".vz-edit textarea");
      if (field) field.value = "";
      renderBox(box, false);
      return;
    }
    if (button.classList.contains("vz-send")) {
      var input = box.querySelector(".vz-edit textarea");
      var comment = input ? input.value.trim() : "";
      if (!comment) return;
      save(box, "changes_requested", comment);
      return;
    }
    if (button.classList.contains("vz-undo")) {
      save(box, "pending", item.status === "changes_requested" ? item.comment || "" : "");
      return;
    }
  }

  function handleInput(event) {
    var textarea = event.target;
    if (!textarea || !textarea.closest || !textarea.closest(".vz-edit")) return;
    var box = textarea.closest(".approval[data-id]");
    if (!box) return;
    dirty[box.dataset.id] = true;
    var send = box.querySelector(".vz-send");
    if (send) send.disabled = !textarea.value.trim();
  }

  addStyles();
  boxes.forEach(function (box) {
    enhanceBox(box);
    setBusy(box, true);
  });
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);

  api({
    action: "sync",
    items: boxes.map(function (box) { return { id: box.dataset.id, title: box.dataset.title || box.dataset.id }; })
  }).then(function (data) {
    applyApprovals(data.approvals);
    boxes.forEach(function (box) { setBusy(box, false); renderBox(box, false); });
    window.setInterval(refreshApprovals, 2_000);
    window.addEventListener("focus", refreshApprovals);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refreshApprovals();
    });
  }).catch(function (error) {
    boxes.forEach(function (box) { setBusy(box, false); showError(box, error.message); });
  });
})();
