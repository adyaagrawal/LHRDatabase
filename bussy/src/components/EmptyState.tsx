export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
