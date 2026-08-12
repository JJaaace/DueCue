import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { demoRouter } from "./routes/demo.js";
import { healthRouter } from "./routes/health.js";
import { syncRouter } from "./routes/sync.js";
import { recommendationRouter } from "./routes/recommendations.js";
import { feedbackRouter } from "./routes/feedback.js";
import { notificationRouter } from "./routes/notifications.js";
import { calendarRouter } from "./routes/calendar.js";
import { dataRouter } from "./routes/data.js";
import { importRouter } from "./routes/imports.js";

export const app = express();
const localFrontendOrigins = new Set([env.FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"]);
app.use(cors({ origin(origin, callback) {
  // Browser-less tools have no Origin header; production still accepts only its configured frontend origin.
  if (!origin || localFrontendOrigins.has(origin)) return callback(null, true);
  return callback(new Error(`CORS rejected origin: ${origin}`));
} }));
app.use(express.json());
app.use("/api", healthRouter);
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
  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(400).json({ error: message });
});
