import { AuthForm } from "../../components/AuthForm";

export const metadata = {
  title: "Регистрация — Раздеватор",
  description: "Создайте аккаунт Раздеватор.",
};

export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center py-16 sm:py-24">
      <div className="container-page flex justify-center">
        <AuthForm mode="register" />
      </div>
    </main>
  );
}
