import { formatDateTime } from "../lib/format";
import type { ProjectMeta } from "../lib/types";

interface Props {
  project: ProjectMeta;
  onBack: () => void;
}

/**
 * Workspace M1 — projeto aberto com roadmap honesto das próximas etapas.
 * Funcionalidades futuras aparecem como "em desenvolvimento" (marcos M2+),
 * sem fingir funcionamento.
 */
export function ProjectView({ project, onBack }: Props) {
  const nextSteps: Array<{ label: string; hint: string; milestone: string }> = [
    {
      label: "Importar mídia",
      hint: "Vídeos do seu computador, com validação e metadados.",
      milestone: "M2 — em desenvolvimento",
    },
    {
      label: "Legendas automáticas",
      hint: "Transcrição sincronizada com edição de legendas.",
      milestone: "M3 — planejado",
    },
    {
      label: "Cortes inteligentes",
      hint: "Análise de conteúdo e seleção dos melhores trechos.",
      milestone: "M4 — planejado",
    },
    {
      label: "Exportar MP4",
      hint: "Renderização local do resultado final.",
      milestone: "M3 — planejado",
    },
  ];

  return (
    <div className="workspace">
      <div className="workspace__head">
        <button className="btn btn--ghost" onClick={onBack}>
          ← Voltar
        </button>
        <h2 className="workspace__title" data-testid="workspace-title">
          {project.name}
        </h2>
      </div>
      <p className="workspace__meta">
        Criado em {formatDateTime(project.created_at_ms)} ·{" "}
        {project.last_opened_at_ms
          ? `aberto em ${formatDateTime(project.last_opened_at_ms)}`
          : "primeira abertura"}
      </p>

      <div className="next-steps" aria-label="Próximas etapas deste projeto">
        {nextSteps.map((s) => (
          <div className="next-steps__row" key={s.label}>
            <div className="next-steps__label">
              <strong>{s.label}</strong>
              <span>{s.hint}</span>
            </div>
            <span className="next-steps__milestone">{s.milestone}</span>
          </div>
        ))}
      </div>

      <p className="workspace__note">
        Protótipo funcional M1 — a interface é provisória e será refinada com a
        aprovação visual do mantenedor. O projeto já é persistido localmente.
      </p>
    </div>
  );
}
