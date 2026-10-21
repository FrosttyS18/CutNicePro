/**
 * MODO APONTAR v6 (atualização 15) — INSPECTOR estilo Figma:
 * - F7 LIGA/DESLIGA (desligado, navegação 100% normal);
 * - LIGADO: o clique NÃO interage com a interface (navegação/botões do app
 *   são bloqueados) — clicar abre o compositor de comentário (avatar +
 *   "Adicionar comentário" + enviar); Enter envia e deixa apenas um PING
 *   fixo onde você clicou;
 * - O PING acompanha o conteúdo ao rolar a página (camada ancorada no
 *   documento, não na tela) e segue o elemento em redesenho de layout;
 * - HOVER no pingo revela o texto do pedido; CLIQUE no pingo abre o cartão
 *   do comentário: Editar, Responder (mais comentários) e Remover;
 * - Registro separa `pedido` × `objeto` (seletor estável + retângulo em %
 *   da viewport + coordenadas do documento) para a IA corrigir o componente
 *   exato; grava em docs/reports/evidence/editor15/pointer-feedback.json.
 */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
import fs from "node:fs";

const PORT = Number(process.env.POINTER_PORT || 9381);
const OUT = process.env.POINTER_OUT || "C:/CutNicePro/docs/reports/evidence/editor15/pointer-feedback.json";
const log = (m) => console.log(`[pointer6] ${m}`);

function injecaoApontar() {
  const iniciar = () => {
    // Blindagem: com N cópias da injeção vivas, só a PRIMEIRA instala handlers.
    if (document.__pointerV6Ativo) return;
    document.__pointerV6Ativo = true;
    window.__pointerV6Versao = 6;
    const estado = {
      ativo: sessionStorage.getItem("pointer-v6-ativo") === "1",
      registros: JSON.parse(sessionStorage.getItem("pointer-v6-registros") || "[]"),
    };
    window.__pointerV6 = { get registros() { return estado.registros; } };
    const salvarSessao = () => {
      sessionStorage.setItem("pointer-v6-registros",
        JSON.stringify(estado.registros.map(({ _el, _vis, ...resto }) => resto)));
      sessionStorage.setItem("pointer-v6-ativo", estado.ativo ? "1" : "0");
    };

    // ── camadas ──────────────────────────────────────────────────────────
    // fixa (viewport): hover, tooltip, compositor, cartão, botão Anotar
    const overlay = document.createElement("div");
    overlay.id = "pointer-v6-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
    // ancorada no DOCUMENTO: os pings rolam junto com o conteúdo
    const docLayer = document.createElement("div");
    docLayer.id = "pointer-v6-doc";
    docLayer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:0;z-index:2147483645;pointer-events:none;";
    // botão "Anotar Ativado/Desativado" (referência do mantenedor): clicável,
    // no padrão do projeto (escuro, arredondado, ícone cursor + estado colorido)
    const banner = document.createElement("button");
    banner.type = "button";
    banner.setAttribute("aria-pressed", "false");
    banner.title = "Alternar anotações (F7)";
    banner.style.cssText = "position:fixed;bottom:18px;right:18px;pointer-events:auto;border:0;border-radius:16px;" +
      "background:#2b2b2b;box-shadow:0 10px 30px rgba(0,0,0,.5);cursor:pointer;display:flex;align-items:center;" +
      "gap:16px;padding:18px 28px;z-index:2147483647;";
    const iconCursor = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.6" ' +
      'stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M3.5 4.2 20.2 11.1 13 13 11.1 20.2 Z"/></svg>';
    const pintarBanner = () => {
      banner.setAttribute("aria-pressed", estado.ativo ? "true" : "false");
      banner.innerHTML = `${iconCursor}<span style="font:500 24px system-ui;white-space:nowrap;">` +
        `Anotar <span style="color:${estado.ativo ? "#4ade80" : "#8a8a8a"};font-weight:700;">` +
        `${estado.ativo ? "Ativado" : "Desativado"}</span></span>`;
    };
    banner.addEventListener("click", () => {
      estado.ativo = !estado.ativo;
      if (!estado.ativo && caixaAberta) fecharCompositor(Boolean(caixaAberta.input.value.trim()));
      if (!estado.ativo) fecharCartao();
      salvarSessao(); pintarBanner();
    });
    overlay.appendChild(banner);
    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(docLayer);
    pintarBanner();
    const ajustarAlturaDoc = () => {
      docLayer.style.height = `${document.documentElement.scrollHeight}px`;
    };
    ajustarAlturaDoc();
    window.addEventListener("resize", ajustarAlturaDoc);

    const seletorDe = (el) => {
      const partes = [];
      for (let n = el; n && n.nodeType === 1 && partes.length < 8; n = n.parentElement) {
        if (n.id) { partes.unshift("#" + n.id); break; }
        if (n.dataset && n.dataset.testid) { partes.unshift(`[data-testid="${n.dataset.testid}"]`); break; }
        let sel = n.tagName.toLowerCase();
        const classe = (typeof n.className === "string" ? n.className : "").trim().split(/\s+/)
          .filter(c => c && c !== "sr-only")[0];
        if (classe) sel += "." + classe;
        const pai = n.parentElement;
        if (pai) {
          const irmaos = [...pai.children].filter(o => o.tagName === n.tagName);
          if (irmaos.length > 1) sel += `:nth-of-type(${irmaos.indexOf(n) + 1})`;
        }
        partes.unshift(sel);
      }
      return partes.join(" > ");
    };
    const encurtar = (v, t) => { const x = String(v ?? "").trim(); return x.length > t ? x.slice(0, t - 1) + "…" : x; };
    const nossaUI = (alvo) => alvo && alvo.closest && (alvo.closest("#pointer-v6-overlay") || alvo.closest("#pointer-v6-doc"));

    // ── HOVER estilo DevTools (só visual; não bloqueia) ──────────────────
    const hoverBox = document.createElement("div");
    hoverBox.style.cssText = "position:fixed;display:none;border:2px dashed #4dabf7;border-radius:3px;" +
      "pointer-events:none;background:rgba(77,171,247,.08);";
    const tip = document.createElement("div");
    tip.style.cssText = "position:fixed;display:none;pointer-events:none;background:#0d0d0d;border:1px solid #444;" +
      "border-radius:6px;color:#fff;font:11px/1.5 ui-monospace,Consolas,monospace;padding:6px 9px;max-width:420px;" +
      "box-shadow:0 8px 22px rgba(0,0,0,.55);white-space:nowrap;";
    overlay.appendChild(hoverBox); overlay.appendChild(tip);
    document.addEventListener("mousemove", (ev) => {
      const sobrePingo = ev.target && ev.target.closest && ev.target.closest("#pointer-v6-doc");
      if (!estado.ativo || (caixaAberta && caixaAberta.caixa.contains(ev.target))) {
        hoverBox.style.display = "none"; tip.style.display = "none"; return;
      }
      const alvo = ev.target;
      if (!alvo || alvo === document.body || alvo === document.documentElement || nossaUI(alvo)) {
        hoverBox.style.display = "none";
        if (!sobrePingo) tip.style.display = "none"; // o pingo controla a própria bolha
        return;
      }
      const r = alvo.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) { hoverBox.style.display = "none"; tip.style.display = "none"; return; }
      hoverBox.style.cssText = `position:fixed;display:block;left:${r.x - 2}px;top:${r.y - 2}px;` +
        `width:${r.width + 4}px;height:${r.height + 4}px;border:2px dashed #4dabf7;border-radius:3px;` +
        "pointer-events:none;background:rgba(77,171,247,.08);";
      const cs = getComputedStyle(alvo);
      tip.innerHTML =
        `<b>${alvo.tagName.toLowerCase()}${alvo.id ? "#" + alvo.id : ""}</b> ` +
        `${Math.round(r.width)}×${Math.round(r.height)}<br>` +
        `color ${cs.color} &nbsp; bg ${cs.backgroundColor}<br>` +
        `font ${cs.fontSize} ${encurtar(cs.fontFamily.split(",")[0], 26)}`;
      tip.style.display = "block";
      tip.style.left = `${Math.min(ev.clientX + 16, innerWidth - tip.offsetWidth - 12)}px`;
      tip.style.top = `${Math.min(ev.clientY + 18, innerHeight - tip.offsetHeight - 12)}px`;
    }, true);

    // ── PING: marcador em gota + BALÃO de hover no padrão do projeto ─────
    const balao = document.createElement("div");
    balao.style.cssText = "position:fixed;display:none;pointer-events:none;background:#262626;border:1px solid #3a3a3a;" +
      "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.55);padding:10px 14px;max-width:300px;z-index:2147483647;";
    overlay.appendChild(balao);
    let balaoVisivelPara = null;
    const mostrarBalao = (registro, vr) => {
      balao.innerHTML =
        `<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">` +
        `<span style="width:14px;height:14px;border-radius:50%;background:#0ca678;border:1.5px solid #fff;display:inline-block;"></span>` +
        `<b style="color:#fff;font:600 12px system-ui;">Pedido ${registro.n}</b>` +
        `<span style="color:#8a8a8a;font:11px system-ui;">· ${encurtar(registro.horario ? new Date(registro.horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "agora", 8)}</span></div>` +
        `<div style="color:#e8e8e8;font:13px/1.45 system-ui;white-space:pre-wrap;overflow-wrap:anywhere;">${encurtar(registro.pedido || "(sem texto)", 220)}</div>` +
        `<div style="color:#7a7a7a;font:10px system-ui;margin-top:5px;">clique para gerenciar</div>`;
      balao.style.display = "block";
      balao.style.left = `${Math.min(vr.x + 16, innerWidth - balao.offsetWidth - 12)}px`;
      balao.style.top = `${Math.max(12, vr.y - balao.offsetHeight - 10)}px`;
      balaoVisivelPara = registro.n;
    };
    const pingDe = (registro) => {
      const pin = document.createElement("div");
      // gota estilizada: círculo com bico, contorno branco, número ao centro
      pin.innerHTML =
        `<span style="position:absolute;inset:0 0 8px 0;background:#0ca678;border:2px solid #ffffff;` +
        "border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(0,0,0,.55);display:block;" +
        '"></span><span style="position:absolute;inset:0 0 8px 0;display:flex;align-items:center;justify-content:center;' +
        'transform:rotate(45deg);color:#ffffff;font:800 11px system-ui;text-shadow:0 1px 2px rgba(0,0,0,.55);">' +
        `${registro.n}</span>`;
      pin.style.cssText = `position:absolute;left:${registro.doc.x - 9}px;top:${registro.doc.y - 9}px;` +
        "width:24px;height:30px;pointer-events:auto;cursor:pointer;z-index:5;";
      pin.addEventListener("mouseenter", () => mostrarBalao(registro, pin.getBoundingClientRect()));
      pin.addEventListener("mouseleave", () => { balao.style.display = "none"; balaoVisivelPara = null; });
      pin.addEventListener("click", (e2) => { e2.stopPropagation(); balao.style.display = "none"; abrirCartao(registro); });
      docLayer.appendChild(pin);
      return pin;
    };
    const reposicionar = (registro) => {
      if (!registro._el || !registro._el.isConnected) return;
      const r = registro._el.getBoundingClientRect();
      const ping = registro._ping;
      ping.style.left = `${Math.round(r.x + (registro.ancora.dxPct / 100) * r.width) + scrollX - 9}px`;
      ping.style.top = `${Math.round(r.y + (registro.ancora.dyPct / 100) * r.height) + scrollY - 9}px`;
    };
    const reposicionarTodos = () => estado.registros.forEach(reposicionar);
    window.addEventListener("scroll", reposicionarTodos, true);
    window.addEventListener("resize", () => { ajustarAlturaDoc(); reposicionarTodos(); });

    // ── CARTÃO do comentário (abre ao clicar no pino) ────────────────────
    let cartao = null;
    const fecharCartao = () => { if (cartao) { cartao.el.remove(); cartao = null; } };
    const abrirCartao = (registro) => {
      fecharCartao(); fecharCompositor();
      const vr = registro._ping.getBoundingClientRect();
      const el = document.createElement("div");
      el.style.cssText = `position:fixed;left:${Math.min(vr.x + 16, innerWidth - 320)}px;` +
        `top:${Math.min(vr.y, innerHeight - 240)}px;width:300px;pointer-events:auto;background:#1c1c1c;` +
        "border:1px solid #333;border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.6);z-index:2147483647;overflow:hidden;";
      const corpo = () => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #2c2c2c;">
          <b style="color:#fff;font:600 12px system-ui;">Comentário ${registro.n}</b>
          <span data-acao="fechar" style="color:#9a9a9a;cursor:pointer;font:700 13px system-ui;">✕</span>
        </div>
        <div style="padding:10px 12px;display:flex;gap:8px;">
          <span style="flex:none;width:24px;height:24px;border-radius:50%;background:#0ca678;color:#fff;font:700 11px/24px system-ui;text-align:center;">${registro.n}</span>
          <div style="min-width:0;">
            <div data-pedido style="color:#fff;font:13px system-ui;white-space:pre-wrap;overflow-wrap:anywhere;">${encurtar(registro.pedido || "(vazio)", 400)}</div>
            <div style="color:#7a7a7a;font:10px system-ui;margin-top:4px;">${encurtar(registro.objeto.tag + " " + (registro.objeto.rotulo || registro.objeto.texto || ""), 90)}</div>
          </div>
        </div>
        ${(registro.respostas || []).map((r2, i2) => `
        <div style="padding:4px 12px 4px 44px;display:flex;gap:8px;">
          <div style="color:#d0d0d0;font:12px system-ui;white-space:pre-wrap;overflow-wrap:anywhere;">${encurtar(r2, 300)}</div>
          <span data-resp="${i2}" style="margin-left:auto;color:#7a7a7a;cursor:pointer;font:11px system-ui;">remover</span>
        </div>`).join("")}
        <div style="display:flex;gap:6px;padding:8px 12px;">
          <input data-responder placeholder="Adicionar comentário…" style="flex:1;background:#0d0d0d;border:1px solid #333;border-radius:14px;color:#fff;font:12px system-ui;padding:7px 12px;outline:none;">
          <button data-enviar style="background:#0ca678;border:0;border-radius:14px;width:30px;height:30px;color:#fff;cursor:pointer;">↑</button>
        </div>
        <div style="display:flex;gap:6px;padding:0 12px 10px;">
          <button data-editar style="flex:1;background:#262626;border:0;border-radius:6px;color:#fff;font:12px system-ui;padding:7px 0;cursor:pointer;">Editar</button>
          <button data-remover style="flex:1;background:#262626;border:0;border-radius:6px;color:#ff8787;font:12px system-ui;padding:7px 0;cursor:pointer;">Remover</button>
        </div>`;
      el.innerHTML = corpo();
      overlay.appendChild(el);
      cartao = { el, registro };
      el.querySelector('[data-acao="fechar"]').addEventListener("click", fecharCartao);
      el.querySelector("[data-editar]").addEventListener("click", () => {
        fecharCartao();
        const r = registro._el ? registro._el.getBoundingClientRect() : registro.retangulo.px;
        abrirCompositor({ x: r.x + 20, y: r.y + 10 }, registro, true);
      });
      el.querySelector("[data-remover]").addEventListener("click", () => removerRegistro(registro));
      const responderInput = el.querySelector("[data-responder]");
      const enviarResposta = () => {
        const texto = responderInput.value.trim();
        if (!texto) return;
        registro.respostas = registro.respostas || [];
        registro.respostas.push(texto);
        salvarSessao(); abrirCartao(registro);
      };
      el.querySelector("[data-enviar]").addEventListener("click", enviarResposta);
      responderInput.addEventListener("keydown", (e3) => {
        if (e3.key === "Enter") { e3.preventDefault(); enviarResposta(); }
        e3.stopPropagation();
      });
    };

    // ── COMPOSITOR (avatar + campo + enviar) ─────────────────────────────
    let caixaAberta = null;
    const fecharCompositor = (registrar) => {
      if (!caixaAberta) return;
      const { el, input, ponto, aoRegistrar } = caixaAberta;
      const texto = input.value.trim();
      el.remove();
      caixaAberta = null;
      if (registrar && aoRegistrar) aoRegistrar(texto, ponto);
    };
    const abrirCompositor = (ponto, registroEdicao, ehEdicao) => {
      fecharCompositor(false); fecharCartao();
      const el = document.createElement("div");
      el.style.cssText = `position:fixed;left:${Math.min(ponto.x, innerWidth - 360)}px;` +
        `top:${Math.min(ponto.y + 14, innerHeight - 70)}px;width:340px;pointer-events:auto;background:#1c1c1c;` +
        "border:1px solid #0ca678;border-radius:22px;padding:6px 8px;display:flex;gap:8px;align-items:center;" +
        "box-shadow:0 14px 40px rgba(0,0,0,.6);z-index:2147483647;";
      const dot = document.createElement("span");
      dot.style.cssText = "flex:none;width:26px;height:26px;border-radius:50%;background:#0ca678;border:2px solid #fff;";
      const input = document.createElement("input");
      input.placeholder = "Adicionar comentário";
      if (ehEdicao && registroEdicao) input.value = registroEdicao.pedido || "";
      input.style.cssText = "flex:1;background:transparent;border:0;color:#fff;font:13px system-ui;outline:none;min-width:0;";
      const enviar = document.createElement("button");
      enviar.textContent = "↑";
      enviar.style.cssText = "flex:none;width:28px;height:28px;border-radius:50%;border:0;background:#3a3a3a;color:#9a9a9a;font:700 14px system-ui;cursor:pointer;";
      el.appendChild(dot); el.appendChild(input); el.appendChild(enviar);
      overlay.appendChild(el);
      const aoRegistrar = (texto) => {
        if (ehEdicao && registroEdicao) {
          registroEdicao.pedido = texto;
          salvarSessao();
          return;
        }
        const alvo = document.elementFromPoint(ponto.x, ponto.y) || document.body;
        const r = alvo.getBoundingClientRect();
        const registro = {
          n: estado.registros.length + 1,
          pedido: texto,
          seletor: seletorDe(alvo),
          objeto: {
            tag: alvo.tagName.toLowerCase(),
            id: alvo.id || undefined,
            classes: (typeof alvo.className === "string" ? alvo.className : "").slice(0, 120) || undefined,
            rotulo: (alvo.getAttribute && (alvo.getAttribute("aria-label") || alvo.getAttribute("title"))) || undefined,
            texto: ((alvo.innerText || "").replace(/\s+/g, " ").slice(0, 90)) || undefined,
            cor: getComputedStyle(alvo).color,
            fundo: getComputedStyle(alvo).backgroundColor,
            fonte: `${getComputedStyle(alvo).fontSize} ${encurtar(getComputedStyle(alvo).fontFamily.split(",")[0], 30)}`,
          },
          retangulo: {
            xPct: +(r.x / innerWidth * 100).toFixed(1), yPct: +(r.y / innerHeight * 100).toFixed(1),
            wPct: +(r.width / innerWidth * 100).toFixed(1), hPct: +(r.height / innerHeight * 100).toFixed(1),
            px: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          },
          ancora: {
            dxPct: +(((ponto.x - r.x) / Math.max(1, r.width)) * 100).toFixed(1),
            dyPct: +(((ponto.y - r.y) / Math.max(1, r.height)) * 100).toFixed(1),
          },
          doc: { x: Math.round(ponto.x + scrollX), y: Math.round(ponto.y + scrollY) },
          viewport: { w: innerWidth, h: innerHeight },
          respostas: [],
          horario: new Date().toISOString(),
        };
        registro._el = alvo;
        estado.registros.push(registro);
        salvarSessao();
        registro._ping = pingDe(registro);
        ajustarAlturaDoc();
      };
      const enviarAgora = () => fecharCompositor(true);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); enviarAgora(); }
        if (e.key === "Escape") { e.preventDefault(); fecharCompositor(false); }
        e.stopPropagation();
      });
      enviar.addEventListener("click", enviarAgora);
      input.focus();
      caixaAberta = { el, input, aoRegistrar, ponto };
    };

    const removerRegistro = (registro) => {
      if (registro._ping) registro._ping.remove();
      estado.registros = estado.registros.filter(r => r !== registro);
      // renumera os pings restantes
      estado.registros.forEach((r, i) => {
        r.n = i + 1;
        if (r._ping) r._ping.childNodes[1].textContent = String(r.n);
      });
      salvarSessao();
      fecharCartao();
    };

    const desativar = () => {
      fecharCompositor(false); fecharCartao();
      hoverBox.style.display = "none"; tip.style.display = "none";
      estado.ativo = false;
      salvarSessao(); pintarBanner();
    };

    window.addEventListener("keydown", (ev) => {
      const digitando = ev.target && ["INPUT", "TEXTAREA", "SELECT"].includes(ev.target.tagName);
      if (ev.key === "F7" && !digitando) {
        ev.preventDefault();
        estado.ativo = !estado.ativo;
        if (!estado.ativo) desativar(); else { salvarSessao(); pintarBanner(); }
      }
    }, true);

    // ── BLOQUEIO de interação + abertura do compositor ───────────────────
    for (const tipo of ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "auxclick"]) {
      document.addEventListener(tipo, (ev) => {
        if (!estado.ativo) return;
        if (nossaUI(ev.target)) return;          // nossa UI funciona normal
        ev.preventDefault(); ev.stopPropagation(); // o app NÃO interage
        if (tipo === "click" && !caixaAberta) {
          ajustarAlturaDoc();
          abrirCompositor({ x: ev.clientX, y: ev.clientY }, null, false);
        }
      }, true);
    }
    document.addEventListener("contextmenu", (ev) => {
      if (!estado.ativo) return;
      if (nossaUI(ev.target)) return;
      ev.preventDefault(); ev.stopPropagation();
    }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
await sleep(2500);
const context = browser.contexts()[0];
const page = context.pages().find((p) => !p.url().startsWith("chrome-error")) ?? context.pages()[0];
await page.locator("body").innerText({ timeout: 8000 }).catch(() => {});
const versaoPre = await page.evaluate(() => window.__pointerV6Versao ?? 0).catch(() => 0);
if (versaoPre < 6) {
  await page.addInitScript(injecaoApontar);
  await page.reload(); await sleep(3000);
  // espera a casca do app ficar pronta (splash some) antes de navegar
  for (let i = 0; i < 20; i++) {
    const corpo = await page.locator("body").innerText().catch(() => "");
    if (corpo.includes("Início") || corpo.includes("Meus Projetos")) break;
    await sleep(1000);
  }
  const versaoViva = await page.evaluate(() => window.__pointerV6Versao ?? 0).catch(() => 0);
  if (versaoViva !== 6) {
    log(`AVISO: a cópia ATIVA na página é a v${versaoViva}. Encerrando — reinicie o app para atualizar.`);
    await browser.close().catch(() => {});
    process.exit(3);
  }
  log("inspector v6 instalado — F7 liga/desliga; gravação em " + OUT);
} else {
  log(`injeção v${versaoPre} já ativa nesta página — adotando (sem registrar nova cópia).`);
}
log("gravador ativo — NÃO executa testes automáticos (evita interferir em outras automações)");

let ultimo = "";
let erros = 0;
while (erros < 6) {
  await sleep(3000);
  let registros;
  try {
    registros = await page.evaluate(() => {
      const pilha = sessionStorage.getItem("pointer-v6-registros");
      return pilha ? JSON.parse(pilha) : null;
    });
    if (registros === null) continue;
    erros = 0;
  } catch { erros++; continue; }
  const atual = JSON.stringify(registros);
  if (atual !== ultimo) {
    fs.writeFileSync(OUT, JSON.stringify({ atualizadoEm: new Date().toISOString(), versao: 6, cliques: registros }, null, 2));
    if (ultimo !== "") log(`${registros.length} apontamento(s)`);
    ultimo = atual;
  }
}
log("página/app indisponível — encerrando (arquivo preservado).");
await browser.close().catch(() => {});
