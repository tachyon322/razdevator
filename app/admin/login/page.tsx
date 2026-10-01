import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { adminPassword } from "@/lib/admin-session";
import { LoginForm } from "./LoginForm";

export default async function AdminLoginPage() {
  if (!adminPassword()) notFound();
  if (await isAdmin()) redirect("/admin");

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-panel p-6 sm:p-7">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">
          Админка
        </h1>
        <p className="mt-1 text-sm text-muted">Введите пароль администратора.</p>
        <LoginForm />
      </div>
    </main>
  );
}
