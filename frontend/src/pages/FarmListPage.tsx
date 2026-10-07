import { Link } from 'react-router-dom';
import { useFarms, useDeleteFarm } from '../api/hooks';
import { Loading } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { ApiError } from '../api/client';
import { useState } from 'react';

export function FarmListPage() {
  const { data, isLoading, error, refetch } = useFarms();
  const deleteMut = useDeleteFarm();
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete farm "${name}" (${id})?`)) return;
    setDeleteErr(null);
    await deleteMut.mutateAsync(id).catch(err => {
      setDeleteErr(err instanceof ApiError ? err.message : 'Failed to delete');
    });
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-header-title">Farms</h1>
        <p className="page-header-subtitle">View all registered farms and their status.</p>
      </div>

      {deleteErr && <div className="card" style={{ marginBottom: 16, padding: 12, background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', color: 'var(--color-danger)' }}>{deleteErr}</div>}

      {isLoading && <Loading />}
      {error && <ErrorMessage error={error} onRetry={refetch} />}
      {data && data.items.length === 0 && (
        <div className="card">
          <EmptyState
            message="No farms found."
            actions={[{ label: '+ New Farm', onClick: () => window.location.href = '/farms/new' }]}
          />
        </div>
      )}
      {data && data.items.length > 0 && (
        <div className="card">
          <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--color-border-light)' }}>
            <Link to="/farms/new" className="btn btn-primary">+ New Farm</Link>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>State</th>
                  <th>Credit Hold</th>
                  <th>Created</th>
                  <th className="numeric">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(f => (
                  <tr key={f.id}>
                    <td>
                      <Link className="order-id-link" to={`/farms/${f.id}`}>{f.id}</Link>
                    </td>
                    <td><span className="farm-name">{f.name}</span></td>
                    <td><span className="text-muted text-small">{f.state ?? '—'}</span></td>
                    <td>
                      <span className={`status-badge ${f.credit_hold ? 'status-BACKORDERED' : 'status-DELIVERED'}`}>
                        {f.credit_hold ? 'YES' : 'NO'}
                      </span>
                    </td>
                    <td><span className="text-muted text-small">{new Date(f.created_at).toLocaleString()}</span></td>
                    <td className="numeric">
                      <div className="ops-actions" style={{ justifyContent: 'flex-end' }}>
                        <Link to={`/farms/${f.id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(f.id, f.name)} disabled={deleteMut.isPending}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}