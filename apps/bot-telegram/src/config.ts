import { z } from "zod";

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required to start the bot"),
  /** Server-to-server secret; the bot is a privileged client, not a public one. */
  INTERNAL_API_TOKEN: z.string().min(16, "INTERNAL_API_TOKEN must be at least 16 characters"),
  PUBLIC_API_URL: z.string().default("http://127.0.0.1:3000"),
  PUBLIC_WEB_URL: z.string().default("http://127.0.0.1:5173"),
});

export type BotConfig = {
  botToken: string;
  internalToken: string;
  apiBase: string;
  webUrl: string;
};

export function loadConfig(raw: NodeJS.ProcessEnv = process.env): BotConfig {
  const parsed = EnvSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid bot configuration:\n${issues}`);
  }

  return {
    botToken: parsed.data.TELEGRAM_BOT_TOKEN,
    internalToken: parsed.data.INTERNAL_API_TOKEN,
    apiBase: `${parsed.data.PUBLIC_API_URL.replace(/\/+$/, "")}/api`,
    webUrl: parsed.data.PUBLIC_WEB_URL.replace(/\/+$/, ""),
  };
}
