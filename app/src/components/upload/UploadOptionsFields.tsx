import { AppSelect } from "../AppSelect";
import { captionModels, type ToolId } from "./tools";
import type { UploadOptions } from "../../lib/workspace-types";
import { UploadFramingMenu } from "./UploadFramingMenu";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { ClosedCaptioningIcon } from "@phosphor-icons/react/dist/csr/ClosedCaptioning";

interface Props {
  options: UploadOptions;
  disabled: boolean;
  onChange: (options: UploadOptions) => void;
}

export function UploadOptionsFields({ options, disabled, onChange }: Props) {
  return <>
    <span className="upload-option-chip">
      <SlidersHorizontalIcon size={15} aria-hidden="true" />
      <AppSelect aria-label="Objetivo" value={options.tool} disabled={disabled} onChange={event => onChange({ ...options, tool: event.target.value as ToolId })}>
        <option value="editor">Editar vídeo</option><option value="clips">Criar cortes</option>
        <option value="captions">Legendar</option><option value="reframe">Enquadrar</option>
      </AppSelect>
    </span>
    <UploadFramingMenu options={options} disabled={disabled} onChange={onChange}/>
    <span className="upload-option-chip">
      <ClosedCaptioningIcon size={15} aria-hidden="true" />
      <AppSelect aria-label="Estilo de legenda" value={options.model} disabled={disabled} onChange={event => onChange({ ...options, model: Number(event.target.value) })}>
        {captionModels.map((caption, index) => <option key={caption} value={index}>{index === 0 ? "Legendas" : caption}</option>)}
      </AppSelect>
    </span>
  </>;
}
