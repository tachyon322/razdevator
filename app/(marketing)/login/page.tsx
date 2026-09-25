import { AuthForm } from "../../components/AuthForm";

export const metadata = {
  title: "Вход — Раздеватор",
  description: "Войдите в аккаунт Раздеватор.",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center py-16 sm:py-24">
      <div className="container-page flex justify-center">
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
