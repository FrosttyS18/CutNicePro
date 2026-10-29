import { useRef } from "react";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { useEditorTooltip } from "../../hooks/useEditorTooltip";
import {
  EXPORT_CODECS, EXPORT_FRAME_RATES, EXPORT_QUALITIES, EXPORT_RESOLUTIONS,
  type ExportCapabilities, type ResolvedExportOptions,
} from "../../lib/composition-export";
import { AppSelect } from "../AppSelect";

interface Props {
  id: string;
  value: ResolvedExportOptions;
  bitrate: string;
  sourceRate: number;
  disabled: boolean;
  loading: boolean;
  capabilities: ExportCapabilities | null;
  capabilityError: boolean;
  onRetry: () => void;
  onChange: (value: ResolvedExportOptions) => void;
  onBitrateChange: (value: string) => void;
}

function UnavailableCodecs({ capabilities }: { capabilities: ExportCapabilities }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const unavailable = EXPORT_CODECS.filter(codec => !capabilities.codecs.some(item => item.codec === codec.value && item.supported));
  const description = unavailable.map(codec => `${codec.label}: ${capabilities.codecs.find(item => item.codec === codec.value)?.reason || "Não disponível neste computador."}`).join(" ");
  const tooltip = useEditorTooltip(anchor, description);
  if (!unavailable.length) return null;
  return <span ref={anchor} tabIndex={0} className="composition-export__codec-help"
    aria-label="Por que alguns codecs estão indisponíveis" aria-describedby={tooltip.descriptionId} {...tooltip.trigger}>
    <InfoIcon size={16} aria-hidden="true"/>{tooltip.portal}
  </span>;
}

export function CompositionExportOptions(props: Props) {
  const { id, value, disabled, capabilities, onChange } = props;
  const lossless = value.codec === "rle";
  const requiresMov = lossless || value.codec === "hevcAlpha";
  const currentCodec = capabilities?.codecs.find(item => item.codec === value.codec);
  const showOriginalRate = value.frameRate === "original" || !EXPORT_FRAME_RATES.some(item => Math.abs(item.rate - props.sourceRate) < .001);
  const originalRate = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(props.sourceRate);

  function changeCodec(next: string) {
    const codec = EXPORT_CODECS.find(item => item.value === next);
    if (!codec || !capabilities?.codecs.some(item => item.codec === codec.value && item.supported)) return;
    onChange({ ...value, codec: codec.value,
      ...(codec.value === "hevcAlpha" ? { format: "mov" } as const : {}),
      ...(codec.value === "rle" ? { format: "mov", quality: "high", bitrateMode: "vbr", bitrateKbps: undefined } as const : {}) });
  }

  function changeFrameRate(next: string) {
    if (next === "original") { onChange({ ...value, frameRate: "original" }); return; }
    const option = EXPORT_FRAME_RATES.find(item => item.value === next);
    if (option) onChange({ ...value, frameRate: option.value });
  }

  return <div className="composition-export__options">
    <div className="composition-export__field">
      <label htmlFor={`${id}-resolution`}>Resolução</label>
      <AppSelect id={`${id}-resolution`} name="exportResolution" aria-label="Resolução"
        value={value.resolution} disabled={disabled} onChange={event => {
          const option = EXPORT_RESOLUTIONS.find(item => item.value === event.target.value);
          if (option) onChange({ ...value, resolution: option.value });
        }}>
        {value.resolution === "original" && <option value="original">Original</option>}
        {EXPORT_RESOLUTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </AppSelect>
    </div>

    <div className="composition-export__field">
      <label htmlFor={`${id}-quality`}>Taxa de bits</label>
      <AppSelect id={`${id}-quality`} name="exportQuality" aria-label="Taxa de bits"
        value={value.quality} disabled={disabled || lossless} onChange={event => {
          const option = EXPORT_QUALITIES.find(item => item.value === event.target.value);
          if (!option) return;
          const next = { ...value, quality: option.value };
          if (option.value !== "custom") {
            next.bitrateMode = "vbr";
            delete next.bitrateKbps;
          }
          onChange(next);
        }}>
        {EXPORT_QUALITIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </AppSelect>
      {lossless && <p className="composition-export__hint">RLE usa compressão sem perdas.</p>}
    </div>
    {value.quality === "custom" && !lossless && <div className="composition-export__custom-bitrate">
      <div className="composition-export__field">
        <label htmlFor={`${id}-bitrate`}>Kbps</label>
        <input className="flow-input" id={`${id}-bitrate`} name="exportBitrate" type="number"
          min={100} max={500000} step={1} inputMode="numeric" value={props.bitrate} disabled={disabled}
          onChange={event => props.onBitrateChange(event.target.value)}/>
      </div>
      <fieldset className="composition-export__bitrate-mode" disabled={disabled}>
        <legend>Modo da taxa de bits</legend>
        <div>
          <label><input type="radio" name={`${id}-bitrate-mode`} value="cbr" checked={value.bitrateMode === "cbr"}
            onChange={() => onChange({ ...value, bitrateMode: "cbr" })}/>CBR (constante)</label>
          <label><input type="radio" name={`${id}-bitrate-mode`} value="vbr" checked={value.bitrateMode === "vbr"}
            onChange={() => onChange({ ...value, bitrateMode: "vbr" })}/>VBR (variável)</label>
        </div>
      </fieldset>
    </div>}
    <div className="composition-export__field">
      <div className="composition-export__label-row">
        <label htmlFor={`${id}-codec`}>Codec</label>
        {capabilities && <UnavailableCodecs capabilities={capabilities}/>}
      </div>
      <AppSelect id={`${id}-codec`} name="exportCodec" aria-label="Codec" value={value.codec}
        disabled={disabled || props.loading || !capabilities} onChange={event => changeCodec(event.target.value)}>
        {EXPORT_CODECS.map(item => <option key={item.value} value={item.value}
          disabled={!capabilities?.codecs.some(capability => capability.codec === item.value && capability.supported)}>
          {item.label}
        </option>)}
      </AppSelect>
      {props.loading && <p className="composition-export__hint" role="status">Verificando codecs…</p>}
      {props.capabilityError && <div className="composition-export__capability-error">
        <p className="composition-export__error" role="alert">Não foi possível verificar os codecs.</p>
        <button type="button" className="flow-button dialog-action--secondary" disabled={disabled} onClick={props.onRetry}>
          Tentar novamente
        </button>
      </div>}
      {capabilities && !currentCodec?.supported && <p className="composition-export__error" role="alert">
        {currentCodec?.reason || "Este codec não está disponível neste computador."} Escolha outro codec.
      </p>}
    </div>

    <div className="composition-export__field">
      <label htmlFor={`${id}-format`}>Formato</label>
      <AppSelect id={`${id}-format`} name="exportFormat" aria-label="Formato" value={value.format} disabled={disabled}
        onChange={event => {
          if (event.target.value === "mov" || event.target.value === "mp4" && !requiresMov) onChange({ ...value, format: event.target.value });
        }}>
        <option value="mov">MOV</option><option value="mp4" disabled={requiresMov}>MP4</option>
      </AppSelect>
    </div>

    <div className="composition-export__field">
      <label htmlFor={`${id}-fps`}>Taxa de quadros</label>
      <AppSelect id={`${id}-fps`} name="exportFrameRate" aria-label="Taxa de quadros" value={value.frameRate}
        disabled={disabled} onChange={event => changeFrameRate(event.target.value)}>
        {showOriginalRate && <option value="original">{`${originalRate} fps (original)`}</option>}
        {EXPORT_FRAME_RATES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </AppSelect>
    </div>
  </div>;
}
