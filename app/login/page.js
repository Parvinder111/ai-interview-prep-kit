import AuthForm from "@/components/AuthForm.js";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <AuthForm mode="login" />
    </main>
  );
}
