import { spawn } from "node:child_process";
import fs from "node:fs";

const client = spawn("C:/Program Files/FigCraft/figcraft-cli.exe", ["mcp"]);
let buffer = "";
let sequence = 0;
const waiting = new Map();
client.stdout.setEncoding("utf8");
client.stdout.on("data", (chunk) => {
  buffer += chunk;
  let search = 0;
  let end;
  while ((end = buffer.indexOf("\n", search)) >= 0) {
    try {
      const reply = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1); search = 0; waiting.get(reply.id)?.(reply);
    } catch { search = end + 1; }
  }
});
const call = (method, params) => new Promise((resolve) => {
  const id = ++sequence; waiting.set(id, resolve);
  client.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
});
async function tool(name, args) {
  const reply = await call("tools/call", { name, arguments: args });
  if (reply.error || reply.result?.isError) throw new Error(JSON.stringify(reply));
  const text = reply.result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
  return text ? JSON.parse(text) : reply.result;
}
const timer = setTimeout(() => { client.kill(); process.exitCode = 1; }, 45000);
const base = "C:/CutNicePro/design/handoff/03d";
fs.mkdirSync(base, { recursive: true });
const frames = [];
try {
  await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "CutNicePro", version: "1" } });
  client.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  await tool("run_command", { command: "file.new", params: { name: "CutNicePro 03D - Fluxo UI v1 DRAFT" } });
  for (const [index, screen] of ["Preparação", "Visão do projeto", "Editor"].entries()) {
    const root = await tool("create_node", { type: "frame", name: `03D v1 DRAFT - ${screen}`, x: index * 1340, y: 0, width: 1280, height: 800, props: { fill: "#000000", clip: true } });
    const parent = root.id ?? root.node?.id;
    const rectangles = [[0, 0, 92, 800, "#000000"], [116, 58, 1140, 718, "#0A0A0A"]];
    const texts = [[20, 16, "03D v1 · DRAFT · revisão do mantenedor", 16, "#02C2BE"], [142, 74, "Meus Projetos  /  " + screen, 12, "#929292"]];
    if (index === 0) {
      rectangles.push([388, 200, 504, 402, "#09090B"], [412, 498, 456, 6, "#02C2BE"], [412, 536, 456, 40, "#FFFFFF"]);
      texts.push([412, 228, "Preparando seu projeto", 22, "#FFFFFF"], [412, 276, "Demonstração de interface · IA ainda não conectada", 12, "#929292"],
        [412, 336, "01  Vídeo selecionado", 16, "#FFFFFF"], [412, 388, "02  Transcrição de demonstração", 16, "#FFFFFF"],
        [412, 440, "03  Interface preparada", 16, "#FFFFFF"], [480, 545, "Abrir editor de demonstração", 14, "#000000"]);
    } else if (index === 1) {
      rectangles.push([310, 160, 650, 365, "#151515"], [310, 550, 650, 180, "#111111"], [984, 160, 220, 300, "#151515"]);
      texts.push([142, 112, "Título do projeto", 24, "#FFFFFF"], [1090, 120, "Editar título", 12, "#929292"], [520, 320, "Vídeo de origem", 22, "#929292"],
        [332, 572, "Transcrição · DEMONSTRAÇÃO", 16, "#FFFFFF"], [332, 616, "00:00  Texto ilustrativo; não extraído do vídeo.", 14, "#929292"],
        [1006, 190, "Editar vídeo", 16, "#FFFFFF"], [1006, 244, "Legendas", 14, "#FFFFFF"], [1006, 298, "Enquadramento", 14, "#FFFFFF"], [1006, 352, "Exportar (prévia)", 14, "#FFFFFF"]);
    } else {
      rectangles.push([142, 160, 260, 400, "#111111"], [426, 160, 560, 315, "#151515"], [1010, 160, 220, 400, "#111111"], [142, 612, 1088, 100, "#172A28"]);
      texts.push([142, 116, "Voltar ao projeto  /  Editor", 20, "#FFFFFF"], [906, 116, "Salvar alterações    Exportar", 14, "#929292"],
        [158, 180, "Transcrição de exemplo", 14, "#FFFFFF"], [158, 230, "Buscar palavras ou trechos", 12, "#929292"], [610, 300, "Prévia local", 22, "#929292"],
        [1026, 182, "Legendas · Texto", 14, "#FFFFFF"], [1026, 236, "Enquadrar · Áudio", 14, "#FFFFFF"], [1026, 290, "16:9  /  Ajustar", 14, "#929292"],
        [162, 634, "Linha do tempo  ·  reprodução e intervalo da prévia", 16, "#FFFFFF"], [162, 676, "Arquivo original preservado · renderização ainda não integrada", 12, "#929292"]);
    }
    for (const [x, y, width, height, fill] of rectangles) await tool("create_node", { type: "rectangle", parent, name: "Superfície", x, y, width, height, props: { fill, cornerRadius: 12 } });
    for (const [x, y, text, fontSize, fill] of texts) await tool("create_node", { type: "text", parent, name: text, x, y, width: 1080 - x + 142, height: 36, text, props: { fontFamily: "Poppins", fontSize, fill, textAutoResize: "height" } });
    const inspected = await tool("get_node", { id: parent, depth: 2 });
    fs.writeFileSync(`${base}/frame-${index + 1}.json`, JSON.stringify(inspected, null, 2));
    await tool("export", { ids: [parent], format: "png", scale: 1, path: `${base}/frame-${index + 1}.png` });
    frames.push({ id: parent, name: screen });
  }
  await tool("save_file", { path: `${base}/flow-ui-v1.figcraft` });
  fs.writeFileSync(`${base}/manifest.json`, JSON.stringify({ version: 1, state: "DRAFT", frames, aestheticApproval: "PENDING HUMAN APPROVAL" }, null, 2));
  console.log(JSON.stringify(frames));
} finally { clearTimeout(timer); client.kill(); }
