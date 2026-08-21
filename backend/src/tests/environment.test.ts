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
      PUBLIC_API_URL: "https://api.duecue.example.com",
      CLERK_SECRET_KEY: "test-secret-key",
    });
    expect(result.AUTH_MODE).toBe("clerk");
    expect(result.FRONTEND_URL).toBe("https://duecue.example.com");
  });
});
