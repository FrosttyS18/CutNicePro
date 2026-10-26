import { useId, useRef, useState, type ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { useEditorTooltip } from "../../hooks/useEditorTooltip";

interface Props { name: string; count: number; children: ReactNode }

export function ClipProjectGroup({ name, count, children }: Props) {
  const [open, setOpen] = useState(true);
  const contentId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const label = `${open ? "Recolher" : "Expandir"} clipes de ${name}`;
  const tooltip = useEditorTooltip(button, label);
  return <section className="clip-project-group" aria-label={`Clipes de ${name}`}>
    <header>
      <button ref={button} type="button" className="clip-project-group__toggle" aria-label={label} aria-expanded={open} aria-controls={contentId}
        aria-describedby={tooltip.descriptionId} {...tooltip.trigger} onClick={() => { tooltip.hide(); setOpen(value => !value); }}>
        <CaretDownIcon size={18} aria-hidden="true"/>
      </button>
      <h3>{name}</h3><span>{count} {count === 1 ? "clipe" : "clipes"}</span>
    </header>
    {tooltip.portal}
    <div id={contentId} className="clip-gallery" hidden={!open}>{open && children}</div>
  </section>;
}
