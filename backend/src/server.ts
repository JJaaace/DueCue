import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { app } from "./app.js";
import { startLocalJobs } from "./jobs/scheduler.js";

const server = app.listen(env.PORT, () => console.log(`DueCue API listening on http://localhost:${env.PORT}`));
startLocalJobs();
async function shutdown() { await prisma.$disconnect(); server.close(() => process.exit(0)); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
