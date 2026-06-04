import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Create your workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Start building AI voice & chat agents in minutes.
      </p>
      <div className="mt-6">
        <AuthForm mode="signup" />
      </div>
    </div>
  );
}
