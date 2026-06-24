import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 5000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  frontendUrl: (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  jwtExpiresIn: "7d" as const,
  qrTokenExpiresMinutes: 5,
  magicLinkExpiresMinutes: 15,
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  fromEmail: process.env.FROM_EMAIL ?? "noreply@medschedule.app",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
};
