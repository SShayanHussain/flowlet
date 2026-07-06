import { resolvePath } from "./graph";

/**
 * Tiny mustache-lite templating for node configs: `{{path.to.value}}` is replaced
 * with the value at that dot-path in the input data. No logic, no eval — path
 * lookup only. Objects/arrays are JSON-stringified; null/undefined render "".
 */
export function renderTemplate(template: string, data: unknown): string {
  return template.replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (_match, path: string) => {
    const value = path === "$" ? data : resolvePath(data, path);
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}
