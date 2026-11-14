export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-stack" role="status" aria-label="Se încarcă datele…">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i} aria-hidden="true">
          <div className="skeleton-line w-sm" />
          <div className="skeleton-line w-lg" />
          <div className="skeleton-line w-md" />
        </div>
      ))}
    </div>
  );
}
