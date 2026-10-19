export function installInputModality(target: Document): () => void {
  const options = { capture: true };
  target.documentElement.dataset.inputModality = "pointer";
  const pointer = () => { target.documentElement.dataset.inputModality = "pointer"; };
  const keyboard = (event: KeyboardEvent) => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey && ["Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      target.documentElement.dataset.inputModality = "keyboard";
    }
  };
  target.addEventListener("pointerdown", pointer, options); target.addEventListener("keydown", keyboard, options);
  return () => { target.removeEventListener("pointerdown", pointer, options); target.removeEventListener("keydown", keyboard, options); };
}
