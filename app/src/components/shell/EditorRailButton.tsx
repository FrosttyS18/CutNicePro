import { useRef } from "react";
import { ScissorsIcon } from "@phosphor-icons/react/dist/csr/Scissors";
import { useEditorTooltip } from "../../hooks/useEditorTooltip";

interface Props { active: boolean; busy: boolean; onClick: () => void }
export function EditorRailButton({ active, busy, onClick }: Props) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useEditorTooltip(anchor, "Editor");
  return <span ref={anchor} {...tooltip.trigger}>
    <button type="button" className={active ? "rail__btn rail__btn--active" : "rail__btn"}
      aria-label="Editor" aria-current={active ? "page" : undefined} aria-busy={busy} disabled={busy}
      aria-describedby={tooltip.descriptionId} onClick={() => { tooltip.hide(); onClick(); }}>
      <ScissorsIcon size={24} aria-hidden="true"/>
    </button>{tooltip.portal}
  </span>;
}
