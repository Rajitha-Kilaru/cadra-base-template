interface LoadingProps {
  label?: string;
}
export function Loading({ label = 'Loading…' }: LoadingProps) {
  return (
    <div className="loading-container">
      <div className="spinner" />
      <span className="loading-label">{label}</span>
    </div>
  );
}