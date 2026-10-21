import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Layout do editor: painéis redimensionáveis ARRASTANDO a borda divisória
 * (sem botões). Persistido em localStorage (preferência local da janela).
 * Limites mínimos/máximos impedem layouts inutilizáveis; os painéis laterais
 * (transcrição + inspetor) jamais somem com o canvas: a soma dos dois é
 * limitada pela largura da janela menos o espaço mínimo do canvas.
 */
export interface EditorLayout {
  transcriptWidth: number;
  timelineHeight: number;
  inspectorWidth: number;
}

const KEY = "cnp-editor-layout";
const LIMITS = {
  transcriptWidth: [240, 560] as const,
  timelineHeight: [130, 420] as const,
  inspectorWidth: [300, 500] as const,
};

const DEFAULTS: EditorLayout = {
  transcriptWidth: 320,
  timelineHeight: 220,
  inspectorWidth: 360,
};

/** Espaço mínimo reservado ao canvas (coluna central + gaps + paddings). */
const CANVAS_MIN = 560;

function clamp(value: number, [min, max]: readonly [number, number]) {
  return Math.min(max, Math.max(min, value));
}

function load(): EditorLayout {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = { ...DEFAULTS, ...JSON.parse(raw) } as EditorLayout;
    parsed.transcriptWidth = clamp(parsed.transcriptWidth, LIMITS.transcriptWidth);
    parsed.timelineHeight = clamp(parsed.timelineHeight, LIMITS.timelineHeight);
    parsed.inspectorWidth = clamp(parsed.inspectorWidth, LIMITS.inspectorWidth);
    return parsed;
  } catch {
    return DEFAULTS;
  }
}

export function useEditorLayout() {
  const [layout, setLayout] = useState<EditorLayout>(load);
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
      // preferência local: falha de storage não bloqueia a edição
    }
  }, [layout]);

  /** Inicia o arraste da borda divisória; o mouse move ajusta o painel. */
  const beginResize = useCallback(
    (edge: "transcript" | "timeline" | "inspector") => (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const start = { ...layoutRef.current };
      const move = (moveEvent: PointerEvent) => {
        const lateralBudget = Math.max(
          LIMITS.transcriptWidth[0] + LIMITS.inspectorWidth[0],
          window.innerWidth - CANVAS_MIN,
        );
        if (edge === "transcript") {
          const max = Math.min(LIMITS.transcriptWidth[1], lateralBudget - start.inspectorWidth);
          const next = clamp(start.transcriptWidth + (moveEvent.clientX - startX), [LIMITS.transcriptWidth[0], max]);
          setLayout((current) => ({ ...current, transcriptWidth: next }));
        } else if (edge === "inspector") {
          // divisória na borda ESQUERDA: arrastar para a esquerda amplia o painel
          const max = Math.min(LIMITS.inspectorWidth[1], lateralBudget - start.transcriptWidth);
          const next = clamp(start.inspectorWidth + (startX - moveEvent.clientX), [LIMITS.inspectorWidth[0], max]);
          setLayout((current) => ({ ...current, inspectorWidth: next }));
        } else {
          const next = clamp(start.timelineHeight - (moveEvent.clientY - startY), LIMITS.timelineHeight);
          setLayout((current) => ({ ...current, timelineHeight: next }));
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [],
  );

  return { layout, beginResize };
}
