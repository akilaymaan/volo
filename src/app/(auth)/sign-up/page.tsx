import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create account" };

export default function SignUp() {
  return (
    <>
      <h1 className="text-3xl font-bold">Create your account</h1>
      <p className="mb-8 mt-2 text-muted-foreground">Set up your first AI interview in a few minutes.</p>
      <AuthForm mode="sign-up" />
    </>
  );
}
