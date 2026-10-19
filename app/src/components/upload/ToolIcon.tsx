import type { ToolId } from "./tools";

export function ToolIcon({ tool }: { tool: ToolId }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tool === "captions" ? <>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M10 9a3 3 0 1 0 0 6M19 9a3 3 0 1 0 0 6" />
      </> : tool === "clips" ? <>
        <rect x="2" y="4" width="20" height="16" rx="3" />
        <path d="M9 4v16M15 4v16" />
      </> : tool === "reframe" ? <>
        <path d="M5 2v15a2 2 0 0 0 2 2h15M2 5h15a2 2 0 0 1 2 2v15M9 9h6v6H9z" />
      </> : <>
        <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
        <path d="m8.2 8.2 12 12M8.2 15.8 20 4M14 12l6 8" />
      </>}
    </svg>
  );
}
