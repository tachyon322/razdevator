import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ADMIN_COOKIE, adminPassword, verifyAdminToken } from "./admin-session";

export async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value);
}

/**
 * Пропускает только админа. Без `ADMIN_PASSWORD` админки нет — 404; без
 * cookie — на форму пароля. Вызывается в каждой странице и в каждом Server
 * Action админки: экшены доступны прямым POST, мимо layout.
 */
export async function requireAdmin(): Promise<void> {
  if (!adminPassword()) notFound();
  if (!(await isAdmin())) redirect("/admin/login");
}
