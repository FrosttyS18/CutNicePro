export function mediaFileName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? "";
}

export function mediaProjectName(path: string): string {
  const name = mediaFileName(path).replace(/\.[^.]+$/, "").trim();
  return Array.from(name || "Novo projeto").slice(0, 80).join("");
}

export function importedProjectDisplayName(name: string, originalName?: string): string {
  return /^(?:[a-z]:[/\\]|\\\\)/i.test(name) ? mediaProjectName(originalName || name) : name;
}
