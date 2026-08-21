import cors from "cors";
import express from "express";
import { z } from "zod";
import { env } from "./config/env.js";
import { buildAllowedOrigins, CorsOriginError, isOriginAllowed } from "./config/cors.js";
import { demoRouter } from "./routes/demo.js";
import { healthRouter } from "./routes/health.js";
import { syncRouter } from "./routes/sync.js";
import { recommendationRouter } from "./routes/recommendations.js";
import { feedbackRouter } from "./routes/feedback.js";
import { notificationRouter } from "./routes/notifications.js";
import { calendarRouter } from "./routes/calendar.js";
import { dataRouter } from "./routes/data.js";
import { importRouter } from "./routes/imports.js";
import { publicDemoRouter } from "./routes/publicDemo.js";

export const app = express();
const allowedOrigins = buildAllowedOrigins({ nodeEnv: env.NODE_ENV, frontendUrl: env.FRONTEND_URL, frontendUrls: env.FRONTEND_URLS });
app.use(cors({ origin(origin, callback) {
  // Server-to-server clients and calendar readers may omit Origin. Browser traffic stays explicitly allowlisted.
  if (isOriginAllowed(origin, allowedOrigins)) return callback(null, true);
  return callback(new CorsOriginError());
}, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization", "X-DueCue-Demo-Session"] }));
app.use(express.json());
app.use("/api", healthRouter);
app.use("/api", publicDemoRouter);
app.use("/api", demoRouter);
app.use("/api", syncRouter);
app.use("/api", recommendationRouter);
app.use("/api", feedbackRouter);
app.use("/api", notificationRouter);
app.use("/api", calendarRouter);
app.use("/api", dataRouter);
app.use("/api", importRouter);
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: "The request was not valid." });
  if (error instanceof CorsOriginError) return res.status(403).json({ error: "This frontend is not allowed to access DueCue." });
  console.error("DueCue API error", error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
  res.status(500).json({ error: "DueCue could not complete that request." });
});
