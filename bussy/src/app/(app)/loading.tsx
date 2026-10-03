export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-6">
      <div className="h-12 w-72 rounded bg-line2" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-line2" />
        ))}
      </div>
      <div className="h-72 rounded-lg bg-line2" />
    </div>
  );
}
