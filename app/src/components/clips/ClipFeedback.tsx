import { useState } from "react";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { clipMessage } from "../../lib/clips";
import type { useClips } from "../../hooks/useClips";
import "./clips.css";

type Props = Pick<ReturnType<typeof useClips>, "job" | "ownedJob" | "notice">;

export function ClipFeedback({ job, ownedJob, notice }: Props) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const failure = ownedJob && job?.state === "failed" ? clipMessage(job.error) : null;
  const text = failure ?? notice;
  const identity = `${job?.jobId}:${job?.state}:${text}`;
  if (!text || dismissed === identity) return null;
  return <div className="clip-feedback" data-error={Boolean(failure)} role={failure ? "alert" : "status"} aria-label="Resultado do processamento">
    <p>{text}</p>
    <button type="button" className="tool-dialog__close" aria-label="Fechar aviso" onClick={() => setDismissed(identity)}>
      <XIcon size={18} aria-hidden="true"/>
    </button>
  </div>;
}
