import { describe, expect, it } from "vitest";
import { buildAllowedOrigins, isOriginAllowed, normalizeOrigin } from "../config/cors.js";

describe("CORS origin allowlist", () => {
  const production = "https://due-cue-frontend.vercel.app";
  const preview = "https://due-cue-frontend-1bcz4yyub-jace14.vercel.app";
  const allowed = buildAllowedOrigins({ nodeEnv: "production", frontendUrl: `${production}/`, frontendUrls: ` ${preview}/ ` });

  it("accepts the exact normalized production origin", () => {
    expect(normalizeOrigin(`${production}/`)).toBe(production);
    expect(isOriginAllowed(production, allowed)).toBe(true);
  });

  it("accepts an explicitly configured Preview origin", () => {
    expect(isOriginAllowed(preview, allowed)).toBe(true);
  });

  it("rejects an unrelated Vercel deployment", () => {
    expect(isOriginAllowed("https://unrelated-project.vercel.app", allowed)).toBe(false);
  });

  it("allows requests without an Origin header", () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
  });

  it("adds localhost only outside production", () => {
    const development = buildAllowedOrigins({ nodeEnv: "development", frontendUrl: production });
    expect(isOriginAllowed("http://localhost:5173", development)).toBe(true);
    expect(isOriginAllowed("http://localhost:5173", allowed)).toBe(false);
  });
});
