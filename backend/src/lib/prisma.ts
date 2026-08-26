import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  // Import connection config may contain bearer-style calendar URLs. Route/service logging is sanitized explicitly.
  log: [],
});
