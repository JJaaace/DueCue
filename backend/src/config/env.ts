import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default("postgresql://localhost:5432/duecue"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  AUTH_MODE: z.enum(["dev", "clerk"]).default("dev"),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_JWT_KEY: z.string().min(1).optional(),
  CLERK_AUTHORIZED_PARTIES: z.string().optional(),
  EMAIL_MODE: z.enum(["preview", "resend"]).default("preview"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().or(z.string().regex(/<[^>]+@[^>]+>/)).default("DueCue <noreply@example.com>"),
});

const productionSchema = schema.superRefine((value, context) => {
  if (value.EMAIL_MODE === "resend" && !value.RESEND_API_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required when EMAIL_MODE=resend." });
  if (value.NODE_ENV === "production" && value.AUTH_MODE === "dev") context.addIssue({ code: z.ZodIssueCode.custom, path: ["AUTH_MODE"], message: "Production requires AUTH_MODE=clerk." });
  if (value.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(value.FRONTEND_URL)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["FRONTEND_URL"], message: "Production requires the deployed HTTPS frontend origin." });
  if (value.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(value.PUBLIC_API_URL)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["PUBLIC_API_URL"], message: "Production requires the deployed HTTPS API origin." });
  if (value.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(value.DATABASE_URL)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["DATABASE_URL"], message: "Production requires a hosted PostgreSQL database URL." });
  if (value.AUTH_MODE === "clerk" && !value.CLERK_SECRET_KEY && !value.CLERK_JWT_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ["CLERK_SECRET_KEY"], message: "CLERK_SECRET_KEY or CLERK_JWT_KEY is required when AUTH_MODE=clerk." });
});

export const parseEnvironment = (input: NodeJS.ProcessEnv) => productionSchema.parse(input);
export const env = parseEnvironment(process.env);
