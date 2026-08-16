import { describe, expect, it } from "vitest";
import { AuthenticationError, resolveAuthenticatedUser } from "../middleware/auth.js";

const repository = () => {
  const users = new Map<string, { id: string; authProviderId?: string }>([
    ["demo@duecue.local", { id: "demo" }],
  ]);
  return {
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => users.get(where.email ?? where.id ?? "") ?? null,
      upsert: async ({ where, create }: { where: { authProviderId: string }; create: { authProviderId: string } }) => {
        const key = where.authProviderId;
        const existing = users.get(key);
        if (existing) return existing;
        const user = { id: `workspace-${key}`, authProviderId: create.authProviderId };
        users.set(key, user);
        return user;
      },
    },
  };
};

describe("authentication modes", () => {
  it("keeps the seeded local demo workspace available in development", async () => {
    const user = await resolveAuthenticatedUser({ mode: "dev", repository: repository() });
    expect(user.id).toBe("demo");
  });

  it("rejects production-style Clerk requests without a bearer token", async () => {
    await expect(resolveAuthenticatedUser({ mode: "clerk", repository: repository(), verify: async () => ({ subject: "ignored" }) })).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects an invalid Clerk token without creating a workspace", async () => {
    const db = repository();
    await expect(resolveAuthenticatedUser({ mode: "clerk", authorization: "Bearer invalid", repository: db, verify: async () => { throw new Error("signature invalid"); } })).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("verifies a Clerk identity and maps it to one stable DueCue workspace", async () => {
    const db = repository();
    const verifier = async (token: string) => ({ subject: token === "valid-token" ? "user_clerk_123" : "unexpected" });
    const first = await resolveAuthenticatedUser({ mode: "clerk", authorization: "Bearer valid-token", repository: db, verify: verifier });
    const second = await resolveAuthenticatedUser({ mode: "clerk", authorization: "Bearer valid-token", repository: db, verify: verifier });
    expect(first.id).toBe("workspace-user_clerk_123");
    expect(second.id).toBe(first.id);
  });

  it("never falls back to the demo workspace for a Clerk identity", async () => {
    const db = repository();
    const user = await resolveAuthenticatedUser({ mode: "clerk", authorization: "Bearer user-b", repository: db, verify: async () => ({ subject: "user_b" }) });
    expect(user.id).toBe("workspace-user_b");
    expect(user.id).not.toBe("demo");
  });
});
