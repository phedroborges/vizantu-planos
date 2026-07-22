import { randomBytes } from "node:crypto";
import { isAllowedSlug } from "@/lib/slug";
import { getPlan } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function reviewerHostScript(slug: string) {
  return `(function(){
    "use strict";
    var slug=${JSON.stringify(slug)};
    var frame=document.getElementById("vz-plan-frame");
    var profilesKey="vizantu-reviewer-profiles:v1";
    var activeKey="vizantu-reviewer-active:v1";
    var memoryProfiles=[];
    var memoryActive="";

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
    function send(){
      if(!frame||!frame.contentWindow)return;
      var current=state();
      frame.contentWindow.postMessage({type:"vizantu:identity:state",slug:slug,active:current.active,profiles:current.profiles},"*");
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
  })();`;
}

function notFound() {
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plano não encontrado</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f5f8;color:#101010;font-family:Arial,sans-serif}.box{max-width:520px;padding:40px;border:1px solid #e6e1ee;background:white}span{color:#6435e7;font-size:12px;font-weight:700;text-transform:uppercase}h1{font-size:38px;margin:12px 0}p{color:#6b6674;line-height:1.6}</style></head><body><main class="box"><span>Vizantu Planos</span><h1>Este plano não está disponível.</h1><p>Confira o endereço recebido ou solicite um novo link à equipe responsável.</p></main></body></html>`, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) return notFound();
  const result = await getPlan(slug);
  if (!result) return notFound();

  const nonce = randomBytes(18).toString("base64");
  const title = escapeHtml(result.plan.title);
  const documentUrl = `/api/plans/${encodeURIComponent(slug)}/document`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#fff}iframe{display:block;width:100%;height:100%;border:0;background:#fff}noscript{position:fixed;inset:0;display:grid;place-items:center;padding:30px;font:16px Arial,sans-serif}</style></head><body><iframe id="vz-plan-frame" data-vizantu-plan-frame data-src="${documentUrl}" title="${title}" sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox"></iframe><noscript>Ative o JavaScript para visualizar este plano.</noscript><script nonce="${nonce}" data-vizantu-reviewer-host>${reviewerHostScript(slug)}</script></body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; frame-src 'self'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`,
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
