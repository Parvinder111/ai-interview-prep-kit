import AuthForm from "@/components/AuthForm.js";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <AuthForm mode="register" />
    </main>
  );
}
