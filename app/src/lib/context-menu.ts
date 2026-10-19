export function suppressNativeContextMenu(target: Pick<EventTarget, "addEventListener" | "removeEventListener">): () => void {
  const prevent = (event: Event) => event.preventDefault();
  target.addEventListener("contextmenu", prevent);
  return () => target.removeEventListener("contextmenu", prevent);
}
