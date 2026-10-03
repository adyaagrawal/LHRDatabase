import type { Metadata } from "next";
import { SignInButton } from "./sign-in-button";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col md:flex-row">
      <section className="flex flex-col justify-between bg-side px-8 py-10 text-[#EDEAE4] md:w-[44%] md:px-14 md:py-14">
        <div>
          <p className="font-display text-7xl font-bold uppercase leading-none tracking-wide text-white md:text-8xl">
            BUSSY
          </p>
          <p className="mt-4 max-w-sm text-base text-[#C9C5BC]">
            Purchasing for Longhorn Racing Combustion. Submit requests, track approvals, and log
            packages when they land.
          </p>
        </div>
        <div className="mt-10 h-2 w-24 bg-accent" aria-hidden />
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="section-title text-3xl">Sign in</h1>
          <p className="mt-2 text-muted">
            Use your Google account. New accounts wait for Matthew, Sid or Rohan to approve them.
          </p>
          {error && (
            <p role="alert" className="mt-4 rounded-md bg-chip-rejectedBg px-3 py-2 text-sm text-chip-rejectedFg">
              {error === "auth"
                ? "Google sign-in didn't finish. Try again."
                : decodeURIComponent(error)}
            </p>
          )}
          <div className="mt-6">
            <SignInButton next={next} />
          </div>
          <p className="mt-6 text-sm text-muted">
            Trouble signing in? Text Rohan at 908-922-2404.
          </p>
        </div>
      </section>
    </main>
  );
}
