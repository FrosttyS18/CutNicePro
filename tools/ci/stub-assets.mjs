/**
 * Stand-ins de binários ainda não commitados (atualização 17 / CI).
 *
 * O código commitado referencia binários do mantenedor (posters, fontes,
 * ícones) que hoje estão UNTRACKED — no checkout do CI eles não existem e
 * o build quebra (vite: "Failed to resolve import"; rust: include_bytes!
 * de arquivo ausente; tauri-build: ícones do bundle).
 *
 * Este script cria stand-ins MÍNIMOS e determinísticos APENAS para os
 * arquivos ausentes (idempotente), permitindo que o CI valide o CÓDIGO.
 * Quando o mantenedor commitar os binários reais, este script não cria
 * nada (tudo já existe) e pode ser REMOVIDO junto com o passo do workflow.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");

// PNG 1×1 opaco (o menor PNG válido; conteúdo é irrelevante para compilar)
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
// ICO 1×1 mínimo (apenas existência é validada no check)
const ICO_1PX = Buffer.from(
  "AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAAAAAAAAAAAAAAAAAAA////AAD///8A",
  "base64",
);
// stand-in de fonte: bytes suficientes para include_bytes (conteúdo
// irrelevante para compilação e testes de unidade)
const TTF_STUB = Buffer.from("/* stand-in de fonte para CI — binário real ainda nao commitado */");

const criados = [];

const garantir = (caminhoRelativo, bytes) => {
  const alvo = join(ROOT, caminhoRelativo);
  if (existsSync(alvo) && statSync(alvo).size > 0) return;
  mkdirSync(dirname(alvo), { recursive: true });
  writeFileSync(alvo, bytes);
  criados.push(caminhoRelativo);
};

// 1) Ícones do bundle (tauri.conf.json → tauri-build)
for (const icone of ["app/src-tauri/icons/icon.ico", "app/src-tauri/icons/32x32.png", "app/src-tauri/icons/128x128.png", "app/src-tauri/icons/icon.png"]) {
  garantir(icone, icone.endsWith(".ico") ? ICO_1PX : PNG_1PX);
}

// 2) Fontes com include_bytes! em src-tauri/src/render/pipeline.rs
const PIPELINE = "app/src-tauri/src/render/pipeline.rs";
const regexFontes = /include_bytes!\("!?\.\.\/\.\.\/resources\/fonts\/([^"]+)"\)/g;
for (const m of readFileSync(join(ROOT, PIPELINE), "utf8").matchAll(regexFontes)) {
  garantir(`app/src-tauri/resources/fonts/${m[1]}`, TTF_STUB);
}

// 3) Imports estáticos do frontend (.png/.jpg/.svg/.webp/.avif)
const EXT_IMG = /\.(png|jpe?g|svg|webp|avif)$/i;
const walk = (dir) => {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entrada.name);
    if (entrada.isDirectory()) walk(p);
    else if (/\.(ts|tsx|css)$/.test(entrada.name)) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/(?:from\s+|import\()(["'])(\.{1,2}\/[^"']+)\1/g)) {
        const spec = m[2];
        if (!EXT_IMG.test(spec)) continue;
        const alvo = resolve(dirname(p), spec);
        if (!existsSync(alvo)) garantir(alvo.slice(ROOT.length + 1).replace(/\\/g, "/"), PNG_1PX);
      }
    }
  }
};
walk(join(ROOT, "app", "src"));

if (criados.length) {
  console.log(`stub-assets: ${criados.length} stand-in(s) criado(s) para o CI:`);
  for (const c of criados) console.log("  - " + c);
  console.log("stub-assets: REMOVA este passo quando os binários reais forem commitados.");
} else {
  console.log("stub-assets: nenhum stand-in necessário (binários presentes).");
}
