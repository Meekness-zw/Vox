import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { isDbEnabled } from "@/lib/db";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sign in to your Vox dashboard.
      </p>
      <div className="mt-6">
        <AuthForm mode="login" />
      </div>
      {!isDbEnabled && (
        <p className="mt-4 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          Demo mode — sign in with <strong>demo@vox.ai</strong> /{" "}
          <strong>demo1234</strong>.
        </p>
      )}
    </div>
  );
}
