"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card max-w-xl p-6">
      <h1 className="section-title">This page didn't load</h1>
      <p className="mt-2 text-muted">
        {error.message || "BUSSY hit an unexpected error."} If it keeps happening, send Rohan a
        screenshot{error.digest ? ` with code ${error.digest}` : ""}.
      </p>
      <button type="button" className="btn-primary mt-4" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
