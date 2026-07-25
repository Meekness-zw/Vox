import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account" };
// Auth forms contain Server Action identifiers that must match the active
// deployment. Rendering per request prevents a stale prerender from submitting
// an action ID belonging to an older Vercel build.
export const dynamic = "force-dynamic";

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
