interface EmptyStateProps {
  message: string;
  actions?: { label: string; onClick: () => void }[];
}
export function EmptyState({ message, actions }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="14" height="12" rx="1.5" />
          <line x1="6" y1="8" x2="14" y2="8" />
          <line x1="6" y1="11" x2="12" y2="11" />
        </svg>
      </div>
      <p className="empty-state-message">{message}</p>
      {actions && actions.length > 0 && (
        <div className="empty-state-actions">
          {actions.map(a => (
            <button key={a.label} className="btn btn-secondary btn-sm" onClick={a.onClick}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}