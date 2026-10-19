import { spawn } from "node:child_process";
import fs from "node:fs";

const exporting = process.argv[2] === "--export";
const ids = process.argv.slice(exporting ? 3 : 2).map(Number);
if (!ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
  throw new Error("Informe os IDs dos nodes para leitura.");
}
const client = spawn("C:/Program Files/FigCraft/figcraft-cli.exe", ["mcp", "--attach", "7979"]);
const waiting = new Map();
let sequence = 0;
client.stdout.setEncoding("utf8");
let buffer = "";
client.stdout.on("data", (chunk) => {
  buffer += chunk;
  let start = 0;
  let end;
  while ((end = buffer.indexOf("\n", start)) >= 0) {
    try {
      const reply = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      start = 0;
      waiting.get(reply.id)?.(reply);
    } catch {
      start = end + 1;
    }
  }
});
client.stderr.on("data", (data) => process.stderr.write(data));
const call = (method, params) => new Promise((resolve) => {
  const id = ++sequence;
  waiting.set(id, resolve);
  client.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
});
const timeout = setTimeout(() => { client.kill(); process.exitCode = 1; }, 45000);
try {
  await call("initialize", {
    protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "CutNicePro", version: "1" },
  });
  client.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  fs.mkdirSync("docs/reports/evidence/03c", { recursive: true });
  for (const id of ids) {
    if (exporting) {
      const path = `C:/CutNicePro/docs/reports/evidence/03c/figcraft-${id}.png`;
      const reply = await call("tools/call", { name: "export", arguments: { ids: [id], format: "png", scale: 2, path } });
      if (reply.error || reply.result?.isError) throw new Error(JSON.stringify(reply));
      console.log(JSON.stringify({ id, path, bytes: fs.statSync(path).size }));
      continue;
    }
    const reply = await call("tools/call", { name: "get_node", arguments: { id, depth: 8 } });
    if (reply.error || reply.result?.isError) throw new Error(JSON.stringify(reply));
    const text = reply.result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
    const node = JSON.parse(text);
    fs.writeFileSync(`docs/reports/evidence/03c/figcraft-node-${id}.json`, JSON.stringify(node, null, 2));
    const walk = (value, depth = 0) => {
      if (value.name) console.log(JSON.stringify({ depth, id: value.id, name: value.name, text: value.characters,
        bounds: value.absoluteBounds, fills: value.fills, fontSize: value.fontSize, radius: value.cornerRadius }));
      for (const child of value.children ?? []) walk(child, depth + 1);
    };
    walk(node.node ?? node);
  }
} finally {
  clearTimeout(timeout);
  client.kill();
}
