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

const base='C:/CutNicePro/docs/reports/evidence/03e';
fs.mkdirSync(base,{recursive:true});
try {
  await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'CutNicePro-read',version:'1'}});
  client.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const document=await tool('open_file',{path:'C:/CutNicePro/design/cutnicepro-fase01-propostas.figcraft'});
  fs.writeFileSync(base+'/figcraft-document.json',JSON.stringify(document,null,2));
  for(const id of [2262,2391,2440]) {
    const node=await tool('get_node',{id,depth:8});
    fs.writeFileSync(base+'/figcraft-node-'+id+'.json',JSON.stringify(node,null,2));
    console.log(JSON.stringify({id,status:'READ'}));
  }
} finally {clearTimeout(timer);client.kill();}
