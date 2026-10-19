export type CancelState = "running" | "confirming" | "cancelling" | "error";
export function cancelStep(state: CancelState, event: "request" | "confirm" | "continue" | "failed"): CancelState {
  if (state === "cancelling") return event === "failed" ? "error" : state;
  if (event === "request") return state === "running" ? "confirming" : "running";
  if (event === "continue") return "running";
  if (event === "confirm" && (state === "confirming" || state === "error")) return "cancelling";
  return state;
}
