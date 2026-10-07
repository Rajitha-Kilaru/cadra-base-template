import { ApiError } from '../api/client';

interface MutationErrorProps {
  error: ApiError | null;
}
export function MutationError({ error }: MutationErrorProps) {
  if (!error) return null;
  return (
    <div className="error-alert" role="alert">
      <div className="error-alert-content">
        <div className="error-alert-code">{error.code}</div>
        <div className="error-alert-message">{error.message}</div>
      </div>
    </div>
  );
}