import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in" };

export default function SignIn() {
  return (
    <>
      <h1 className="text-3xl font-bold">Welcome back</h1>
      <p className="mb-8 mt-2 text-muted-foreground">Sign in to review your interviews.</p>
      <AuthForm mode="sign-in" />
    </>
  );
}
