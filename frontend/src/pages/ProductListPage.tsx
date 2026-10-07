import { Link } from 'react-router-dom';
import { useProducts, useDeleteProduct } from '../api/hooks';
import { Loading } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { ApiError } from '../api/client';
import { useState } from 'react';

export function ProductListPage() {
  const { data, isLoading, error, refetch } = useProducts();
  const deleteMut = useDeleteProduct();
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  async function handleDelete(code: string, desc: string) {
    if (!confirm(`Delete product "${desc}" (${code})?`)) return;
    setDeleteErr(null);
    await deleteMut.mutateAsync(code).catch(err => {
      setDeleteErr(err instanceof ApiError ? err.message : 'Failed to delete');
    });
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-header-title">Products</h1>
        <p className="page-header-subtitle">Browse all products and check stock levels.</p>
      </div>

      {deleteErr && <div className="card" style={{ marginBottom: 16, padding: 12, background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', color: 'var(--color-danger)' }}>{deleteErr}</div>}

      {isLoading && <Loading />}
      {error && <ErrorMessage error={error} onRetry={refetch} />}
      {data && data.items.length === 0 && (
        <div className="card">
          <EmptyState
            message="No products found."
            actions={[{ label: '+ New Product', onClick: () => window.location.href = '/products/new' }]}
          />
        </div>
      )}
      {data && data.items.length > 0 && (
        <div className="card">
          <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--color-border-light)' }}>
            <Link to="/products/new" className="btn btn-primary">+ New Product</Link>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Active</th>
                  <th className="numeric">Price</th>
                  <th className="numeric">Available</th>
                  <th className="numeric">Reserved</th>
                  <th className="numeric">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(p => (
                  <tr key={p.code}>
                    <td>
                      <Link className="order-id-link" to={`/products/${p.code}`}>{p.code}</Link>
                    </td>
                    <td><span className="farm-name">{p.description}</span></td>
                    <td>
                      <span className={`status-badge ${p.active ? 'status-DELIVERED' : 'status-CANCELLED'}`}>
                        {p.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="numeric">${Number(p.unit_price).toFixed(2)}</td>
                    <td className="numeric">{p.stock_available}</td>
                    <td className="numeric">{p.stock_reserved}</td>
                    <td className="numeric">
                      <div className="ops-actions" style={{ justifyContent: 'flex-end' }}>
                        <Link to={`/products/${p.code}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.code, p.description)} disabled={deleteMut.isPending}>Delete</button>
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