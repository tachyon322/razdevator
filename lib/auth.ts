import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { parseAffiliateCookies } from "@cashx/sdk";
import { enqueueAttribution } from "./cashx";
import { getDb } from "./db";

export const auth = betterAuth({
  // Одно соединение с SQLite на процесс (общее с lib/db.ts).
  database: getDb(),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: {
    // Сессия читается из подписанной куки (без запроса к БД) до 5 минут.
    // Лимиты при этом считаются свежим чтением из БД — см. getUserUsage().
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  user: {
    additionalFields: {
      plan: {
        type: "string",
        required: false,
        defaultValue: "free",
        input: false,
      },
      generationsUsed: {
        type: "number",
        required: false,
        defaultValue: 0,
        input: false,
      },
      balanceRub: {
        type: "number",
        required: false,
        defaultValue: 0,
        input: false,
      },
      planRenewsAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Единая точка регистрации (форма и quick-auth): атрибуция партнёру
        // берётся из cookie aff_ref / click_token, выставленных трекером.
        after: async (user, ctx) => {
          const headers = ctx?.request?.headers ?? ctx?.headers;
          const { ref, clickToken } = parseAffiliateCookies(
            headers?.get("cookie"),
          );
          enqueueAttribution(user.id, ref, clickToken);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
