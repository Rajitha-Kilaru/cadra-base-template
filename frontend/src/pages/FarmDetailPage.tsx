import { useParams, Link, useNavigate } from 'react-router-dom';
import { useFarm, useDeleteFarm } from '../api/hooks';
import { ApiError } from '../api/client';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import { useState } from 'react';

export function FarmDetailPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const { data: farm, isLoading, error, refetch } = useFarm(farmId);
  const deleteMut = useDeleteFarm();
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete farm "${farm?.name}" (${farmId})?`)) return;
    setDeleteErr(null);
    await deleteMut.mutateAsync(farmId!).catch(err => {
      setDeleteErr(err instanceof ApiError ? err.message : 'Failed to delete');
    });
    if (!deleteErr) navigate('/farms');
  }

  if (isLoading) return <Loading />;
  if (error) {
    const is404 = error instanceof ApiError && error.status === 404;
    return is404
      ? (
        <div className="not-found-page">
          <div className="not-found-code">404</div>
          <div className="not-found-message">Farm not found.</div>
          <div className="not-found-actions">
            <Link to="/farms" className="btn btn-primary">Back to Farms</Link>
          </div>
        </div>
      )
      : <ErrorMessage error={error} onRetry={refetch} />;
  }
  if (!farm) return null;

  return (
    <div>
      <div className="detail-header">
        <div className="detail-header-left">
          <Link to="/farms" className="detail-back">← Farms</Link>
          <div className="detail-title-row">
            <span className="detail-id">{farm.id}</span>
          </div>
          <span className="detail-farm">{farm.name}</span>
        </div>
        <div className="detail-header-right">
          <Link to={`/farms/${farm.id}/edit`} className="btn btn-primary">Edit</Link>
          <button className="btn btn-danger" onClick={handleDelete} disabled={deleteMut.isPending}>
            {deleteMut.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {deleteErr && <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', color: 'var(--color-danger)' }}>{deleteErr}</div>}

      <div className="card">
        <div className="card-header">
          <div className="card-header-left">
            <span className="card-header-title">Farm Information</span>
          </div>
        </div>
        <div className="card-body">
          <div className="order-info-grid">
            <div className="order-info-item">
              <span className="order-info-label">Farm ID</span>
              <span className="order-info-value">{farm.id}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Name</span>
              <span className="order-info-value">{farm.name}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">State</span>
              <span className="order-info-value">{farm.state ?? '—'}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Credit Hold</span>
              <span className="order-info-value">
                <span className={`status-badge ${farm.credit_hold ? 'status-BACKORDERED' : 'status-DELIVERED'}`}>
                  {farm.credit_hold ? 'YES' : 'NO'}
                </span>
              </span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Created</span>
              <span className="order-info-value">{new Date(farm.created_at).toLocaleString()}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Updated</span>
              <span className="order-info-value">{new Date(farm.updated_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}