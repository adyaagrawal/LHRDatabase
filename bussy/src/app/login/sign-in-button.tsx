"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignInButton({ next }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={signIn} disabled={busy} className="btn-primary w-full text-base">
        <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
          <path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" />
        </svg>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {err && (
        <p role="alert" className="field-error">
          {err}
        </p>
      )}
    </>
  );
}
