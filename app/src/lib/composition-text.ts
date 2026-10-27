export const compositionNameLimit = 120;

export function isCompositionName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Array.from(value).length <= compositionNameLimit;
}
