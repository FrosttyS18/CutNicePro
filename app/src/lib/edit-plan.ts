/**
 * EditPlan v1 — funções puras do plano de edição multi-intervalo (M2).
 * Tempo em SEGUNDOS fracionários sobre a MÍDIA ORIGINAL (sourceTime);
 * outputTime é derivado (soma das durações dos segmentos anteriores).
 * A prévia, a timeline e a exportação consomem estas mesmas funções.
 */
import type { EditPlan, EditSegment, EditorSettings } from "./workspace-types";

/** Duração mínima de um segmento/intervalo (paridade do render: 0,05 s). */
export const MIN_SEGMENT = 0.05;

export function normalizePlan(plan: EditPlan | null | undefined): EditSegment[] {
  return [...(plan?.segments ?? [])]
    .filter((s) => Number.isFinite(s.sourceStart) && Number.isFinite(s.sourceEnd))
    .map((s) => ({ sourceStart: Math.max(0, s.sourceStart), sourceEnd: s.sourceEnd }))
    .filter((s) => s.sourceEnd - s.sourceStart >= MIN_SEGMENT)
    .sort((a, b) => a.sourceStart - b.sourceStart);
}

export function planIsValid(segments: EditSegment[], duration: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0 || segments.length === 0) return false;
  let previousEnd = -Infinity;
  for (const s of segments) {
    if (s.sourceStart < 0 || s.sourceEnd > duration + 1e-6) return false;
    if (s.sourceEnd - s.sourceStart < MIN_SEGMENT) return false;
    if (s.sourceStart < previousEnd - 1e-6) return false; // sobreposição
    previousEnd = s.sourceEnd;
  }
  return true;
}

/** Segmentos EFETIVOS do corte: plano validado ou intervalo único do trim. */
export function effectiveSegments(settings: EditorSettings, duration: number | null | undefined): EditSegment[] {
  const single: EditSegment[] = [{
    sourceStart: settings.trimStart,
    sourceEnd: settings.trimEnd ?? duration ?? settings.trimStart,
  }];
  if (!duration || !settings.editPlan) return single;
  const segments = normalizePlan(settings.editPlan);
  return planIsValid(segments, duration) ? segments : single;
}

export function planDuration(segments: EditSegment[]): number {
  return segments.reduce((total, s) => total + (s.sourceEnd - s.sourceStart), 0);
}

/** outputTime → sourceTime (clamp nas bordas da composição). Convenção
 *  end-exclusive nas junções: o output exato do fim de um segmento mapeia
 *  para o INÍCIO do próximo (retomada coerente da reprodução). */
export function toSourceTime(segments: EditSegment[], outputTime: number): number {
  let offset = 0;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const length = segment.sourceEnd - segment.sourceStart;
    const atEnd = outputTime >= offset + length - 1e-9;
    if (!atEnd || index === segments.length - 1) {
      return segment.sourceStart + Math.min(Math.max(outputTime - offset, 0), length);
    }
    offset += length;
  }
  return segments.length ? segments[segments.length - 1].sourceEnd : 0;
}

/** sourceTime → outputTime (dentro de um segmento; gap devolve o fim do anterior). */
export function toOutputTime(segments: EditSegment[], sourceTime: number): number {
  let offset = 0;
  for (const s of segments) {
    if (sourceTime < s.sourceStart) return offset; // gap: fim acumulado do anterior
    if (sourceTime <= s.sourceEnd) return offset + (sourceTime - s.sourceStart);
    offset += s.sourceEnd - s.sourceStart;
  }
  return offset;
}

/** Índice do segmento que contém o tempo da fonte, ou -1 se está num vão. */
export function segmentIndexAt(segments: EditSegment[], sourceTime: number): number {
  return segments.findIndex((s) => sourceTime >= s.sourceStart - 1e-6 && sourceTime <= s.sourceEnd + 1e-6);
}

/** Seek em tempo da FONTE: dentro de vão salta para o próximo segmento; após o fim, para o último frame. */
export function snapSeek(segments: EditSegment[], sourceTime: number): number {
  const index = segmentIndexAt(segments, sourceTime);
  if (index >= 0) return segments[index].sourceStart === segments[index].sourceEnd ? sourceTime : Math.min(Math.max(sourceTime, segments[index].sourceStart), segments[index].sourceEnd);
  const next = segments.find((s) => s.sourceStart > sourceTime);
  if (next) return next.sourceStart;
  return segments.length ? segments[segments.length - 1].sourceEnd : 0;
}

/** Próximo salto de composição a partir de sourceTime (fim do segmento atual → próximo início), se houver. */
export function nextBoundary(segments: EditSegment[], sourceTime: number): { from: number; to: number } | null {
  const index = segmentIndexAt(segments, sourceTime);
  if (index < 0 || index >= segments.length - 1) return null;
  return { from: segments[index].sourceEnd, to: segments[index + 1].sourceStart };
}

/** Divide no playhead o segmento que o contém (gap: sem efeito). */
export function splitAt(segments: EditSegment[], sourceTime: number): EditSegment[] | null {
  const index = segmentIndexAt(segments, sourceTime);
  if (index < 0) return null;
  const segment = segments[index];
  const left = sourceTime - segment.sourceStart;
  const right = segment.sourceEnd - sourceTime;
  if (left < MIN_SEGMENT || right < MIN_SEGMENT) return null;
  const next = segments.slice();
  next.splice(index, 1, { sourceStart: segment.sourceStart, sourceEnd: sourceTime }, { sourceStart: sourceTime, sourceEnd: segment.sourceEnd });
  return next;
}

/** Remove o segmento que contém o tempo (mín. 1 segmento deve sobrar). */
export function removeAt(segments: EditSegment[], sourceTime: number): EditSegment[] | null {
  const index = segmentIndexAt(segments, sourceTime);
  if (index < 0 || segments.length <= 1) return null;
  return segments.filter((_, i) => i !== index);
}
