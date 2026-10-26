import { useRef, type ReactNode } from "react";
import { useEditorTooltip } from "../../hooks/useEditorTooltip";
import "./editor-controls.css";

interface Props {
  label: string;
  tooltip?: string;
  icon: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  compact?: boolean;
  onClick: () => void;
}

export function EditorAction({ label, tooltip = label, icon, disabled = false, pressed, compact = false, onClick }: Props) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltipState = useEditorTooltip(anchor, tooltip);
  return <span ref={anchor} className="editor-action" {...tooltipState.trigger}>
    <button type="button" className={`flow-button editor-action__button${compact ? " editor-action__button--compact" : ""}`}
      aria-label={label} aria-disabled={disabled} aria-pressed={pressed} aria-describedby={tooltipState.descriptionId}
      onClick={() => { if (!disabled) { tooltipState.hide(); onClick(); } }}>
      {icon}<span className={compact ? "sr-only" : undefined}>{label}</span>
    </button>
    {tooltipState.portal}
  </span>;
}
