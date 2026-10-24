/**
 * Uso: npx eslint src --format json | node ../tools/ci/lint-budget.mjs
 */
import { readFileSync } from "node:fs";

const DEBT = {};
const WARNINGS_BUDGET = 0;

let files;
try {
  files = JSON.parse(readFileSync(0, "utf8"));
} catch {
  console.error("lint-budget: entrada JSON inválida (stderr do eslint não é JSON)");
  process.exit(2);
}
const counts = {};
let warnings = 0;
for (const file of files) {
  for (const message of file.messages) {
    if (message.severity === 1) { warnings += 1; continue; }
    counts[message.ruleId ?? "unknown"] = (counts[message.ruleId ?? "unknown"] ?? 0) + 1;
  }
}
const failures = [];
const reminders = [];
for (const [rule, count] of Object.entries(counts)) {
  const ceiling = DEBT[rule];
  if (ceiling === undefined) failures.push(`regra NOVA com erros: ${rule} (${count}) — corrija antes de subir`);
  else if (count > ceiling) failures.push(`regra ${rule} PIOROU: ${count} > ${ceiling}`);
  else if (count < ceiling) reminders.push(`regra ${rule} melhorou (${count} < ${ceiling}) — REDUZA o teto em DEBT para travar o ganho`);
}
for (const rule of Object.keys(DEBT)) {
  if (!(rule in counts)) reminders.push(`regra ${rule} zerou — REMOVA-a de DEBT`);
}
if (warnings > WARNINGS_BUDGET) failures.push(`avisos: ${warnings} > ${WARNINGS_BUDGET}`);
if (failures.length) {
  console.error("lint-budget: FALHA");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
for (const r of reminders) console.warn("lint-budget: " + r);
console.log(`lint-budget: OK (contagem atual — ${Object.entries(counts).map(([r, c]) => `${r}:${c}`).join(", ") || "sem erros"}; avisos ${warnings}/${WARNINGS_BUDGET})`);
