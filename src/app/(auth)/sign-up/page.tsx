import { AuthForm } from "@/components/auth-form";
import { redirect } from "next/navigation";

export const metadata = { title: "Create account" };

export default function SignUp() {
  if (process.env.ENABLE_EMAIL_SIGNUP !== "1") redirect("/sign-in");
  return (
    <>
      <h1 className="text-3xl font-bold">Create your account</h1>
      <p className="mb-8 mt-2 text-muted-foreground">Set up your first AI interview in a few minutes.</p>
      <AuthForm mode="sign-up" />
    </>
  );
}
