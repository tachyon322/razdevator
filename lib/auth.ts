import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

mkdirSync("./data", { recursive: true });

export const auth = betterAuth({
  database: new Database("./data/auth.db"),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  plugins: [nextCookies()],
});
