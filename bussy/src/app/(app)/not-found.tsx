import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card max-w-xl p-6">
      <h1 className="section-title">Not found</h1>
      <p className="mt-2 text-muted">That request or page doesn't exist.</p>
      <Link href="/" className="btn-secondary mt-4">
        Back to the dashboard
      </Link>
    </div>
  );
}
