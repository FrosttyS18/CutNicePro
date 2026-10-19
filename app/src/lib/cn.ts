/** Joiner de classes (o oficial usa tailwind-merge; aqui só concatena —
 *  integração isolada do FlipButton do Animate UI sem migrar a UI p/ Tailwind). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
