import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../config/env.js";

describe("production environment safety", () => {
  it("cannot silently start with development authentication or localhost services", () => {
    expect(() => parseEnvironment({ NODE_ENV: "production", AUTH_MODE: "dev" })).toThrow();
  });

  it("accepts explicit hosted services and Clerk verification configuration", () => {
    const result = parseEnvironment({
      NODE_ENV: "production",
      AUTH_MODE: "clerk",
      DATABASE_URL: "postgresql://user:password@database.example.com/duecue?sslmode=require",
      FRONTEND_URL: "https://duecue.example.com",
      FRONTEND_URLS: "https://preview-one.vercel.app/, https://preview-two.vercel.app",
      PUBLIC_API_URL: "https://api.duecue.example.com",
      CLERK_SECRET_KEY: "test-secret-key",
    });
    expect(result.AUTH_MODE).toBe("clerk");
    expect(result.FRONTEND_URL).toBe("https://duecue.example.com");
    expect(result.FRONTEND_URLS).toContain("preview-one.vercel.app");
  });

  it("rejects malformed configured Preview origins", () => {
    expect(() => parseEnvironment({ FRONTEND_URLS: "https://valid.vercel.app, not-an-origin" })).toThrow();
  });
});
