import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const MAX_ATTEMPTS = 5;

const DIGITS = "0123456789";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const PASSWORD_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomString(chars: string, length: number): string {
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function randomLogin(): string {
  return `User${randomString(DIGITS, 3)}${randomString(LOWER, 2)}`;
}

function randomPassword(): string {
  return randomString(PASSWORD_CHARS, 8);
}

function fail() {
  return NextResponse.json(
    { message: "Не удалось создать аккаунт, попробуйте ещё раз" },
    { status: 502 },
  );
}

export async function POST() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const login = randomLogin();
    const password = randomPassword();
    const email = `${login.toLowerCase()}@razdevator.local`;

    let response: Response;
    try {
      response = await auth.api.signUpEmail({
        body: { email, password, name: login },
        asResponse: true,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "USER_ALREADY_EXISTS") continue;
      return fail();
    }

    if (!response.ok) {
      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as { code?: string } | null;
      if (body?.code === "USER_ALREADY_EXISTS") continue;
      return fail();
    }

    const data = (await response.json()) as { user?: { id?: string } };
    if (!data.user?.id) return fail();

    const out = NextResponse.json({ email, login, password });
    for (const cookie of response.headers.getSetCookie()) {
      out.headers.append("set-cookie", cookie);
    }
    return out;
  }

  return fail();
}
