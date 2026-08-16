import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

declare global {
  namespace Express { interface Request { userId?: string; } }
}

type UserRecord = { id: string };
type UserRepository = {
  user: {
    findUnique: (args: unknown) => Promise<UserRecord | null>;
    upsert: (args: unknown) => Promise<UserRecord>;
  };
};

export type ClerkTokenVerifier = (token: string) => Promise<{ subject: string }>;
export class AuthenticationError extends Error {}

const demoEmail = "demo@duecue.local";
const clerkEmail = (subject: string) => `clerk-${subject}@users.duecue.local`;
const bearerToken = (authorization?: string) => {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
};

export async function verifyClerkToken(token: string) {
  const verified = await verifyToken(token, {
    secretKey: env.CLERK_SECRET_KEY,
    jwtKey: env.CLERK_JWT_KEY,
    authorizedParties: env.CLERK_AUTHORIZED_PARTIES?.split(",").map((item) => item.trim()).filter(Boolean),
  });
  if (!verified.sub) throw new AuthenticationError("Clerk token does not identify a user.");
  return { subject: verified.sub };
}

/** Resolves the local demo user only in dev mode; Clerk identities always get isolated workspaces. */
export async function resolveAuthenticatedUser(input: {
  mode?: "dev" | "clerk";
  authorization?: string;
  requestedDevUserId?: string;
  repository?: UserRepository;
  verify?: ClerkTokenVerifier;
} = {}): Promise<UserRecord> {
  const mode = input.mode ?? env.AUTH_MODE;
  const repository = input.repository ?? prisma;
  if (mode === "dev") {
    const user = input.requestedDevUserId
      ? await repository.user.findUnique({ where: { id: input.requestedDevUserId } })
      : await repository.user.findUnique({ where: { email: demoEmail } });
    if (!user) throw new AuthenticationError("No local demo user. Run the demo seed first.");
    return user;
  }

  const token = bearerToken(input.authorization);
  if (!token) throw new AuthenticationError("Authentication required.");
  let identity: { subject: string };
  try {
    identity = await (input.verify ?? verifyClerkToken)(token);
  } catch {
    throw new AuthenticationError("Authentication required.");
  }
  return repository.user.upsert({
    where: { authProviderId: identity.subject },
    update: {},
    create: {
      authProviderId: identity.subject,
      // Clerk's subject is the stable identity. Email collection stays optional and private to Clerk.
      email: clerkEmail(identity.subject),
      name: "DueCue student",
      settings: { create: {} },
    },
  });
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolveAuthenticatedUser({
      authorization: req.header("authorization"),
      requestedDevUserId: env.AUTH_MODE === "dev" ? req.header("x-duecue-user-id") ?? undefined : undefined,
    });
    req.userId = user.id;
    next();
  } catch (error) {
    if (error instanceof AuthenticationError) return res.status(401).json({ error: error.message });
    next(error);
  }
}
