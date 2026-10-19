/**
 * CutNicePro 03B.6 — Geração de POSTERS a partir dos 20 MP4 reais da CDN.
 * Edge (mesma engine do WebView2): carrega cada vídeo, busca um frame não
 * preto (sequência de seeks), captura via canvas 2D em ~480px de largura e
 * salva PNG local em app/src/assets/posters/.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const BASE = "https://pub-d187d959393643849829e2af107e1fd4.r2.dev/cutNicePro";
const OUT = "C:/CutNicePro/app/src/assets/posters";
const FILES = [
  ...Array.from({ length: 7 }, (_, i) => `1-1/1-1_0${i + 1}.mp4`),
  ...Array.from({ length: 7 }, (_, i) => `9-16/9-16_0${i + 1}.mp4`),
  "16-9/16-9_01.mp4", "16-9/16-9_02.mp4", "16-9/16-9_03.mp4",
  "16-9/16-9_05.mp4", "16-9/16-9_06.mp4", "16-9/16-9_07.mp4",
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext();
// O bucket R2 não envia Access-Control-Allow-Origin; interceptamos a resposta
// e injetamos o header SÓ nesta sessão de geração de posters (o produto usa
// o proxy cnpmedia:// com ACAO própria).
await context.route("**r2.dev/**", async (route) => {
  const resp = await route.fetch();
  const headers = { ...resp.headers(), "access-control-allow-origin": "*" };
  await route.fulfill({ response: resp, headers });
});
const page = await context.newPage();

const report = [];
for (const f of FILES) {
  const id = f.replace("/", "-").replace(".mp4", "");
  const r = await page.evaluate(async ({ BASE, f }) => {
    const v = document.createElement("video");
    v.src = BASE + "/" + f;
    v.muted = true;
    v.crossOrigin = "anonymous";
    v.preload = "auto";
    const waitMeta = () => new Promise((res, rej) => {
      v.onloadedmetadata = res;
      v.onerror = () => rej(new Error("load " + (v.error?.code ?? "?")));
      setTimeout(() => rej(new Error("timeout")), 30000);
    });
    await waitMeta();
    const dur = v.duration || 0;
    const isBlack = (ctx, w, h) => {
      const d = ctx.getImageData(0, 0, w, h).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 40) sum += d[i] + d[i + 1] + d[i + 2];
      return sum / (d.length / 40 * 3) < 12; // média RGB < 12 = preto
    };
    // procura frame não preto em frações da duração
    const seeks = [0.1, 0.25, 0.5, 0.75, 0.05, 0.9, 0.35].map((x) => Math.min(dur * x, Math.max(0, dur - 0.1)));
    for (const t of seeks) {
      await new Promise((res) => {
        v.onseeked = res;
        v.currentTime = t;
        setTimeout(res, 4000);
      });
      const W = 480;
      const H = Math.round((v.videoHeight / Math.max(1, v.videoWidth)) * W);
      if (!v.videoWidth || !H) continue;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      ctx.drawImage(v, 0, 0, W, H);
      if (!isBlack(ctx, W, H)) {
        return { ok: true, w: v.videoWidth, h: v.videoHeight, dur: +dur.toFixed(1), at: +t.toFixed(2), data: c.toDataURL("image/png") };
      }
    }
    return { ok: false, w: v.videoWidth, h: v.videoHeight, dur: +dur.toFixed(1) };
  }, { BASE, f });
  if (r.ok) {
    fs.writeFileSync(`${OUT}/${id}.png`, Buffer.from(r.data.split(",")[1], "base64"));
    console.log(`OK  ${id}.png  ${r.w}x${r.h} ${r.dur}s frame@${r.at}s`);
  } else {
    console.log(`FALHA ${id}: sem frame não-preto (${r.w}x${r.h}, ${r.dur}s)`);
  }
  report.push({ file: f, ...{ w: r.w, h: r.h, dur: r.dur, ok: r.ok } });
  v_cleanup: ;
}
fs.writeFileSync("C:/CutNicePro/docs/reports/evidence/03b6/cdn-audit.json", JSON.stringify(report, null, 1));
await browser.close();
console.log(`${report.filter((r) => r.ok).length}/${FILES.length} posters gerados`);
