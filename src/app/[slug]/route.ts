import { randomBytes } from "node:crypto";
import { formatApprovalDeadline } from "@/lib/approval-deadline";
import { isAllowedSlug } from "@/lib/slug";
import { applyPlanDeadline, getPlan, getPlanApprovals, summarizeApprovals } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function reviewerHostScript(slug: string, deadlineAt: string | undefined, reviewVersion: number, initialReviewStatus: string) {
  return `(function(){
    "use strict";
    var slug=${JSON.stringify(slug)};
    var frame=document.getElementById("vz-plan-frame");
    var profilesKey="vizantu-reviewer-profiles:v1";
    var activeKey="vizantu-reviewer-active:v1";
    var memoryProfiles=[];
    var memoryActive="";
    var viewedReviewerId="";
    var deadlineAt=${JSON.stringify(deadlineAt || "")};
    var deadlineLabel=${JSON.stringify(deadlineAt ? formatApprovalDeadline(deadlineAt) : "")};
    var reviewVersion=${reviewVersion};
    var reviewStatus=${JSON.stringify(initialReviewStatus)};

    function readProfiles(){
      try{
        var value=JSON.parse(window.localStorage.getItem(profilesKey)||"[]");
        return Array.isArray(value)?value.filter(validProfile).slice(0,12):[];
      }catch(error){return memoryProfiles.filter(validProfile).slice(0,12);}
    }
    function readActive(){
      try{return window.localStorage.getItem(activeKey)||"";}catch(error){return memoryActive;}
    }
    function writeState(profiles,active){
      memoryProfiles=profiles;
      memoryActive=active||"";
      try{
        window.localStorage.setItem(profilesKey,JSON.stringify(profiles));
        if(active)window.localStorage.setItem(activeKey,active);else window.localStorage.removeItem(activeKey);
      }catch(error){}
    }
    function validProfile(profile){
      return Boolean(profile&&typeof profile.id==="string"&&typeof profile.name==="string"&&profile.id.length<=120&&profile.name.trim().length>=2);
    }
    function cleanName(value){return String(value||"").trim().replace(/\\s+/g," ").slice(0,120);}
    function createId(){
      try{return "reviewer-"+window.crypto.randomUUID().replace(/-/g,"");}
      catch(error){return "reviewer-"+Date.now().toString(36)+Math.random().toString(36).slice(2);}
    }
    function state(){
      var profiles=readProfiles();
      var activeId=readActive();
      var active=profiles.find(function(profile){return profile.id===activeId;})||null;
      return {profiles:profiles,active:active};
    }
    function recordView(profile){
      if(!profile||profile.id===viewedReviewerId)return;
      viewedReviewerId=profile.id;
      fetch("/api/plans/"+encodeURIComponent(slug)+"/approvals",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"view",reviewerId:profile.id,approverName:profile.name}),
        keepalive:true
      }).catch(function(){viewedReviewerId="";});
    }
    function send(){
      if(!frame||!frame.contentWindow)return;
      var current=state();
      recordView(current.active);
      frame.contentWindow.postMessage({type:"vizantu:identity:state",slug:slug,active:current.active,profiles:current.profiles,deadlineAt:deadlineAt,deadlineLabel:deadlineLabel,reviewVersion:reviewVersion,reviewStatus:reviewStatus},"*");
    }
    function saveName(name){
      name=cleanName(name);
      if(name.length<2)return send();
      var profiles=readProfiles();
      var profile=profiles.find(function(entry){return entry.name.toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR");});
      var now=new Date().toISOString();
      if(profile){profile.name=name;profile.lastUsedAt=now;}
      else{profile={id:createId(),name:name,createdAt:now,lastUsedAt:now};profiles.unshift(profile);}
      profiles=profiles.sort(function(a,b){return String(b.lastUsedAt||"").localeCompare(String(a.lastUsedAt||""));}).slice(0,12);
      writeState(profiles,profile.id);
      send();
    }
    function selectProfile(id){
      var profiles=readProfiles();
      var profile=profiles.find(function(entry){return entry.id===id;});
      if(!profile)return send();
      profile.lastUsedAt=new Date().toISOString();
      writeState(profiles,profile.id);
      send();
    }

    window.addEventListener("message",function(event){
      if(!frame||event.source!==frame.contentWindow||!event.data||event.data.slug!==slug)return;
      if(event.data.type==="vizantu:review:status"&&/^(active|approved|adjustments)$/.test(event.data.status)){reviewStatus=event.data.status;renderReviewBar();return;}
      if(event.data.type==="vizantu:identity:get")send();
      if(event.data.type==="vizantu:identity:save")saveName(event.data.name);
      if(event.data.type==="vizantu:identity:select")selectProfile(event.data.reviewerId);
      if(event.data.type==="vizantu:identity:clear"){writeState(readProfiles(),"");send();}
    });

    if(frame){
      var source=frame.getAttribute("data-src")||"";
      frame.src=source+(window.location.hash||"");
      frame.addEventListener("load",send);
    }
    function updateDeadline(){
      if(!deadlineAt||reviewStatus!=="active")return;
      var output=document.getElementById("vz-deadline-countdown");
      var remaining=Date.parse(deadlineAt)-Date.now();
      if(remaining<=0){if(output)output.textContent="Prazo encerrado";window.location.reload();return;}
      var seconds=Math.floor(remaining/1000);
      var days=Math.floor(seconds/86400);seconds-=days*86400;
      var hours=Math.floor(seconds/3600);seconds-=hours*3600;
      var minutes=Math.floor(seconds/60);seconds-=minutes*60;
      if(output)output.textContent=(days?days+"d ":"")+String(hours).padStart(2,"0")+"h "+String(minutes).padStart(2,"0")+"min "+String(seconds).padStart(2,"0")+"s";
    }
    function renderReviewBar(){
      var bar=document.getElementById("vz-review-bar");
      var heading=document.getElementById("vz-review-heading");
      var detail=document.getElementById("vz-review-detail");
      var output=document.getElementById("vz-deadline-countdown");
      if(!bar)return;
      bar.setAttribute("data-state",reviewStatus);
      if(reviewStatus==="approved"){
        if(heading)heading.textContent="Plano aprovado";
        if(detail)detail.textContent="Versão "+reviewVersion+" · todos os conteúdos foram aprovados";
        if(output)output.textContent="APROVADO";
      }else if(reviewStatus==="adjustments"){
        if(heading)heading.textContent="Ajustes solicitados";
        if(detail)detail.textContent="Versão "+reviewVersion+" · revisão concluída, aguardando atualização";
        if(output)output.textContent="REVISÃO CONCLUÍDA";
      }else{
        if(heading)heading.textContent="Prazo para aprovação";
        if(detail)detail.textContent="Versão "+reviewVersion+(deadlineLabel?" · até "+deadlineLabel+" · depois, aprovação automática":"");
        if(deadlineAt)updateDeadline();else if(output)output.textContent="EM REVISÃO";
      }
    }
    renderReviewBar();
    updateDeadline();
    if(deadlineAt)window.setInterval(updateDeadline,1000);
  })();`;
}

function notFound() {
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plano não encontrado</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f5f8;color:#101010;font-family:Arial,sans-serif}.box{max-width:520px;padding:40px;border:1px solid #e6e1ee;background:white}span{color:#6435e7;font-size:12px;font-weight:700;text-transform:uppercase}h1{font-size:38px;margin:12px 0}p{color:#6b6674;line-height:1.6}</style></head><body><main class="box"><span>Vizantu Planos</span><h1>Este plano não está disponível.</h1><p>Confira o endereço recebido ou solicite um novo link à equipe responsável.</p></main></body></html>`, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });
}

function closedPlan(title: string, deadlineAt: string, reviewVersion: number) {
  const deadline = escapeHtml(formatApprovalDeadline(deadlineAt));
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Prazo encerrado</title><style>body{box-sizing:border-box;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f2f7;color:#17131d;font-family:Arial,sans-serif}.box{box-sizing:border-box;width:min(100%,620px);padding:42px;border:1px solid #ded8e8;border-top:5px solid #79a729;background:#fff;box-shadow:0 22px 60px #2b20351a}.eyebrow{display:block;color:#6435e7;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{margin:14px 0 12px;font-size:clamp(30px,6vw,48px);line-height:1.05}p{margin:0;color:#665f6d;font-size:15px;line-height:1.65}.approved{margin-top:24px;padding:15px 17px;border-left:4px solid #79a729;background:#f2f8e8;color:#3e5d12;font-weight:700}.date{display:block;margin-top:18px;color:#857e8c;font-size:12px}@media(max-width:560px){.box{padding:30px 24px}}</style></head><body><main class="box"><span class="eyebrow">Vizantu Planos · Versão ${reviewVersion}</span><h1>Prazo de aprovação encerrado.</h1><p>Este link foi fechado porque o período de avaliação terminou.</p><div class="approved">O plano “${title}” foi aprovado automaticamente conforme a regra informada no início da avaliação.</div><span class="date">Prazo encerrado em ${deadline} (horário de Brasília).</span></main></body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) return notFound();
  const result = await getPlan(slug);
  if (!result) return notFound();

  const title = escapeHtml(result.plan.title);
  const storedApprovals = await getPlanApprovals(slug);
  const approvals = applyPlanDeadline(result.plan, storedApprovals);
  if (result.plan.approvalDeadline && approvals.autoApproved) return closedPlan(title, result.plan.approvalDeadline, result.plan.reviewVersion || 1);

  const nonce = randomBytes(18).toString("base64");
  const documentUrl = `/api/plans/${encodeURIComponent(slug)}/document`;
  const deadlineAt = result.plan.kind === "presentation" ? undefined : result.plan.approvalDeadline;
  const summary = summarizeApprovals(approvals);
  const reviewVersion = result.plan.reviewVersion || 1;
  const reviewStatus = summary.roundComplete
    ? summary.status === "approved" ? "approved" : "adjustments"
    : "active";
  const deadlineBar = result.plan.kind !== "presentation"
    ? `<aside id="vz-review-bar" class="vz-deadline" data-state="${reviewStatus}" aria-label="Status da revisão"><div><strong id="vz-review-heading">Status da revisão</strong><span id="vz-review-detail">Versão ${reviewVersion}</span></div><time id="vz-deadline-countdown"${deadlineAt ? ` datetime="${escapeHtml(deadlineAt)}"` : ""}>Calculando…</time></aside>`
    : "";
  const hasReviewBar = result.plan.kind !== "presentation";
  const frameHeight = hasReviewBar ? "calc(100% - 62px)" : "100%";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#fff}.vz-deadline{box-sizing:border-box;height:62px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:10px 20px;background:#17131d;border-bottom:3px solid #9147ff;color:#fff;font-family:Arial,sans-serif}.vz-deadline[data-state=approved]{border-bottom-color:#8fbd3d}.vz-deadline[data-state=adjustments]{border-bottom-color:#e56a3c}.vz-deadline div{min-width:0}.vz-deadline strong,.vz-deadline span{display:block}.vz-deadline strong{font-size:12px}.vz-deadline span{margin-top:3px;color:#cfc9d7;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vz-deadline time{flex:none;color:#c9ee78;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}.vz-deadline[data-state=adjustments] time{color:#ffb08f}iframe{display:block;width:100%;height:${frameHeight};border:0;background:#fff}noscript{position:fixed;inset:0;display:grid;place-items:center;padding:30px;font:16px Arial,sans-serif}@media(max-width:620px){.vz-deadline{height:76px;padding:9px 13px;gap:10px}.vz-deadline span{max-width:210px}.vz-deadline time{font-size:11px}iframe{height:${hasReviewBar ? "calc(100% - 76px)" : "100%"}}}</style></head><body>${deadlineBar}<iframe id="vz-plan-frame" data-vizantu-plan-frame data-src="${documentUrl}" title="${title}" sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox"></iframe><noscript>Ative o JavaScript para visualizar este plano.</noscript><script nonce="${nonce}" data-vizantu-reviewer-host>${reviewerHostScript(slug, deadlineAt, reviewVersion, reviewStatus)}</script></body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; frame-src 'self'; connect-src 'self'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`,
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
