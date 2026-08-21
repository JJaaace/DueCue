import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app.js";
import { clearDemoSessionsForTests } from "../services/demo/demoSessionService.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(clearDemoSessionsForTests);
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

describe("public anonymous demo routes", () => {
  it("accepts the headers required by the browser client", async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization, X-DueCue-Demo-Session",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("x-duecue-demo-session");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("authorization");
  });

  it("creates and restores a demo without Clerk authentication", async () => {
    const created = await fetch(`${baseUrl}/api/public/demo/session`, { method: "POST", headers: { "Content-Type": "application/json" } });
    expect(created.status).toBe(201);
    const payload = await created.json() as { sessionId: string; session: { stage: number } };
    expect(payload.session.stage).toBe(1);

    const restored = await fetch(`${baseUrl}/api/public/demo/state`, { headers: { "X-DueCue-Demo-Session": payload.sessionId } });
    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({ active: true, session: { stage: 1 } });
  });
});
