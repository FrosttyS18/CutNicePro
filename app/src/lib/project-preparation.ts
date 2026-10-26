export type PreparationStage = "validating" | "importing" | "checking-transcription" | "extracting" | "transcribing" | "saving";

export interface PreparationProgress {
  stage: PreparationStage;
  percent: number | null;
  remainingSeconds: number | null;
}

export const preparationLabels: Record<PreparationStage, string> = {
  validating: "Validando arquivo…",
  importing: "Importando vídeo…",
  "checking-transcription": "Verificando transcrição local…",
  extracting: "Preparando áudio…",
  transcribing: "Transcrevendo…",
  saving: "Preparando projeto…",
};

export function createPreparationTracker() {
  let sample: { stage: PreparationStage; completed: number; time: number } | null = null;
  return (stage: PreparationStage, completed?: number, total?: number, time = performance.now()): PreparationProgress => {
    const measured = completed !== undefined && total !== undefined && Number.isFinite(completed)
      && Number.isFinite(total) && total > 0 && completed >= 0 && completed <= total;
    const percent = measured ? completed / total * 100 : null;
    if (!measured) { sample = null; return { stage, percent, remainingSeconds: null }; }
    if (!sample || sample.stage !== stage || completed < sample.completed) sample = { stage, completed, time };
    const elapsed = (time - sample.time) / 1000;
    const advance = completed - sample.completed;
    const remainingSeconds = elapsed >= 1 && advance > 0 && completed < total
      ? Math.ceil((total - completed) * elapsed / advance) : null;
    return { stage, percent, remainingSeconds };
  };
}
