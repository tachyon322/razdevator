import { AuthForm } from "../../components/AuthForm";

export const metadata = {
  title: "Вход — Раздеватор",
  description: "Войдите в аккаунт Раздеватор.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center py-16 sm:py-24">
      <div className="container-page flex justify-center">
        <AuthForm mode="login" next={next} />
      </div>
    </main>
  );
}
