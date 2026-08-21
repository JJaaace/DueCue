const localDevelopmentOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];

export function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  try { return new URL(trimmed).origin; }
  catch { return trimmed.replace(/\/+$/, ""); }
}

export function buildAllowedOrigins(input: { nodeEnv: "development" | "test" | "production"; frontendUrl: string; frontendUrls?: string }) {
  const configured = [input.frontendUrl, ...(input.frontendUrls?.split(",") ?? [])]
    .map(normalizeOrigin)
    .filter(Boolean);
  if (input.nodeEnv !== "production") configured.push(...localDevelopmentOrigins.map(normalizeOrigin));
  return new Set(configured);
}

export const isOriginAllowed = (origin: string | undefined, allowedOrigins: ReadonlySet<string>) => !origin || allowedOrigins.has(normalizeOrigin(origin));

export class CorsOriginError extends Error {
  constructor() { super("Origin is not allowed."); this.name = "CorsOriginError"; }
}
