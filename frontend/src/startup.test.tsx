import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, resolveApiBaseUrl } from "./api";
import { StartupScreen } from "./components/StartupScreen";
import { shouldLaunchAnonymousTour } from "./demoLifecycle";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("DueCue startup experience", () => {
  it("renders the branded accessible startup state", () => {
    const markup = renderToStaticMarkup(<StartupScreen />);
    expect(markup).toContain("Preparing your academic workspace");
    expect(markup).toContain("role=\"status\"");
    expect(markup).toContain("DueCue");
  });

  it("stops retrying after the configured startup limit", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "not ready" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    const request = api("/health", { attempts: 3, timeoutMs: 100 });
    const rejection = expect(request).rejects.toMatchObject({ kind: "server", retryable: true });
    await vi.runAllTimersAsync();
    await rejection;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not retry authentication failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { "Content-Type": "application/json" } }));
    await expect(api("/me", { attempts: 4 })).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("launches once for a new visitor and respects completed or skipped markers", () => {
    expect(shouldLaunchAnonymousTour(undefined)).toBe(true);
    expect(shouldLaunchAnonymousTour("active")).toBe(true);
    expect(shouldLaunchAnonymousTour("completed")).toBe(false);
    expect(shouldLaunchAnonymousTour("skipped")).toBe(false);
  });

  it("requires an explicit production API and normalizes its URL", () => {
    expect(resolveApiBaseUrl("https://duecue-api.onrender.com/", true)).toBe("https://duecue-api.onrender.com");
    expect(() => resolveApiBaseUrl(undefined, true)).toThrowError(ApiError);
    expect(resolveApiBaseUrl(undefined, false)).toBe("");
  });

  it("keeps direct SPA navigation on the frontend entry point", () => {
    const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { rewrites: Array<{ source: string; destination: string }> };
    expect(config.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
  });
});
