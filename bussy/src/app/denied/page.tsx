import type { Metadata } from "next";

export const metadata: Metadata = { title: "Access denied" };

export default function DeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <p className="font-display text-5xl font-bold uppercase">BUSSY</p>
        <h1 className="mt-6 section-title">Your access request was declined</h1>
        <p className="mt-3 text-muted">
          If you're on Longhorn Racing Combustion and think this is a mistake, text Rohan
          (908-922-2404) or message Matthew or Sid with the Google email you signed in with.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="btn-secondary" type="submit">
            Sign out and try another account
          </button>
        </form>
      </div>
    </main>
  );
}
