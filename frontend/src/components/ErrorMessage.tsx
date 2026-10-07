import { ApiError } from '../api/client';

interface ErrorMessageProps {
  error: ApiError | Error | unknown;
  onRetry?: () => void;
}
export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  const code = error instanceof ApiError ? error.code : 'ERROR';
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return (
    <div className="error-alert">
      <div className="error-alert-content">
        <div className="error-alert-code">{code}</div>
        <div className="error-alert-message">{message}</div>
        {onRetry && (
          <div className="error-alert-actions">
            <button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );
}