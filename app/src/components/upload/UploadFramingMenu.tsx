import { useEffect, useId, useRef, useState } from "react";
import { CropIcon } from "@phosphor-icons/react/dist/csr/Crop";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { defaultSplitScreen } from "../../lib/split-screen";
import type { UploadOptions } from "../../lib/workspace-types";
import { editorAspectRatios } from "./tools";

interface Props { options: UploadOptions; disabled: boolean; onChange: (value: UploadOptions) => void }

export function UploadFramingMenu({ options, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const choose = (patch: Partial<UploadOptions>) => { onChange({ ...options, ...patch }); setOpen(false); trigger.current?.focus(); };
  const label = options.splitScreen ? "Duas pessoas" : options.ratio === "original" ? "Original" : `${options.ratio} · ${options.fit === "cover" ? "Preencher" : "Completo"}`;
  const presets: { label: string; detail: string; layout: string; active: boolean; patch: Partial<UploadOptions> }[] = [
    { label: "Preencher 9:16", detail: "Foco no assunto", layout: "fill", active: !options.splitScreen && options.ratio === "9:16" && options.fit === "cover", patch: { ratio: "9:16", fit: "cover" } },
    { label: "Vídeo completo", detail: "Quadro inteiro em 9:16", layout: "fit", active: !options.splitScreen && options.ratio === "9:16" && options.fit === "contain", patch: { ratio: "9:16", fit: "contain" } },
    { label: "Duas pessoas", detail: "Um painel sobre o outro", layout: "split", active: Boolean(options.splitScreen), patch: { ratio: "9:16", splitScreen: defaultSplitScreen() } },
    { label: "Original", detail: "Proporção da fonte", layout: "original", active: options.ratio === "original", patch: { ratio: "original" } },
  ];
  return <div className="upload-framing" ref={root}>
    <button type="button" ref={trigger} className="upload-chip" disabled={disabled} aria-label="Enquadramento" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)}><CropIcon size={15} aria-hidden="true"/>{label}<CaretDownIcon size={12} aria-hidden="true"/></button>
    {open && <div className="upload-framing__menu" id={id} role="group" aria-label="Opções de enquadramento">
      <p>Enquadramento</p>
      <div className="upload-framing__presets">
        {presets.map(preset => <button key={preset.layout} type="button" aria-pressed={preset.active} onClick={() => choose({ ...(options.splitScreen ? { splitScreen: null } : {}), ...preset.patch })}>
          <span className="upload-framing__sample" data-layout={preset.layout} aria-hidden="true"/><strong>{preset.label}</strong><span>{preset.detail}</span>
        </button>)}
      </div>
      <div className="upload-framing__ratios" role="group" aria-label="Outros formatos">
        {editorAspectRatios.filter(value => value !== "original").map(ratio => <button key={ratio} type="button" aria-pressed={options.ratio === ratio}
          onClick={() => choose({ ratio, ...(ratio !== "9:16" && options.splitScreen ? { splitScreen: null } : {}) })}>{ratio}</button>)}
      </div>
    </div>}
  </div>;
}
