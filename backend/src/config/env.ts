import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default("postgresql://localhost:5432/duecue"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  AUTH_MODE: z.enum(["dev", "clerk"]).default("dev"),
  EMAIL_MODE: z.enum(["preview", "resend"]).default("preview"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().or(z.string().regex(/<[^>]+@[^>]+>/)).default("DueCue <noreply@example.com>"),
});

export const env = schema.superRefine((value, context) => {
  if (value.EMAIL_MODE === "resend" && !value.RESEND_API_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required when EMAIL_MODE=resend." });
  if (value.NODE_ENV === "production" && value.AUTH_MODE === "dev") context.addIssue({ code: z.ZodIssueCode.custom, path: ["AUTH_MODE"], message: "Production requires AUTH_MODE=clerk." });
}).parse(process.env);
