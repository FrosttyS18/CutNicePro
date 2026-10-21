#!/usr/bin/env node
/**
 * Encerra processos de desenvolvimento ÓRFÃOS do CutNicePro — somente os
 * comprovadamente criados por este repositório:
 *   - node/vite cuja linha de comando aponta para C:\CutNicePro\app\node_modules
 *   - cutnicepro.exe cujo caminho do executável esteja sob C:\CutNicePro
 * Não encerra processos de outros projetos nem node genéricos.
 * Uso: node tools/dev/cleanup-dev.js   (ou: npm run dev:clean)
 */
const { execSync } = require("node:child_process");

const REPO = "C:\\CutNicePro";
const killed = [];
const skipped = [];

function listProcesses() {
  const out = execSync(
    'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match \'^node\\.exe$|^cutnicepro\\.exe$\' } | Select-Object ProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress"',
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function ownsRepo(proc) {
  const cmd = String(proc.CommandLine ?? "");
  const exe = String(proc.ExecutablePath ?? "");
  if (proc.Name === "node.exe") {
    return cmd.includes(`${REPO}\\app\\node_modules`) || cmd.includes("C:/CutNicePro/app/node_modules");
  }
  if (proc.Name === "cutnicepro.exe") {
    return exe.toUpperCase().startsWith(REPO.toUpperCase());
  }
  return false;
}

for (const proc of listProcesses()) {
  if (!proc || !proc.ProcessId) continue;
  if (ownsRepo(proc)) {
    try {
      execSync(`taskkill /PID ${proc.ProcessId} /T /F`, { stdio: "ignore" });
      killed.push(`${proc.Name} (${proc.ProcessId})`);
    } catch {
      skipped.push(`${proc.Name} (${proc.ProcessId}) — falha ao encerrar`);
    }
  } else {
    skipped.push(`${proc.Name} (${proc.ProcessId}) — fora do repositório, preservado`);
  }
}

if (killed.length) console.log("Encerrados (órfãos do projeto):");
killed.forEach((entry) => console.log(`  - ${entry}`));
if (skipped.length) {
  console.log("Não encerrados:");
  skipped.forEach((entry) => console.log(`  - ${entry}`));
}
if (!killed.length) console.log("Nenhum processo de desenvolvimento do CutNicePro em execução.");
