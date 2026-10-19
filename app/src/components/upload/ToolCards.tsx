import { ToolIcon } from "./ToolIcon";
import { videoTools, type ToolId } from "./tools";

export function ToolCards({ onSelect }: { onSelect: (tool: ToolId) => void }) {
  return (
    <section className="upload-tools" aria-labelledby="upload-tools-heading">
      <h2 id="upload-tools-heading" className="upload-sr-only">Ferramentas de vídeo</h2>
      {videoTools.map((tool) => (
        <article className="tool-card" key={tool.id}>
          <h3><span className="tool-icon"><ToolIcon tool={tool.id} /></span>{tool.title}</h3>
          <div className={`tool-card__preview tool-card__preview--${tool.id}`} aria-hidden="true">
            {tool.id === "captions" ? <span>SUAS IDEIAS.<br /><strong>EM CADA PALAVRA.</strong></span>
              : tool.id === "clips" ? <><span className="tool-card__landscape" /><span className="tool-card__arrow">→</span><span className="tool-card__portrait" /></>
              : tool.id === "reframe" ? <span className="tool-card__crop"><span /></span>
              : <span className="tool-card__timeline"><i /><i /><i /><i /></span>}
          </div>
          <p>{tool.description}</p>
          <button type="button" className="upload-primary" onClick={() => onSelect(tool.id)}
            aria-label={`Iniciar ${tool.title}`}>Iniciar</button>
        </article>
      ))}
    </section>
  );
}
