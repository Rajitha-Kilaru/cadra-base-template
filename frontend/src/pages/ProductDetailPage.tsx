import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProduct, useDeleteProduct } from '../api/hooks';
import { ApiError } from '../api/client';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import { useState } from 'react';

export function ProductDetailPage() {
  const { productCode } = useParams<{ productCode: string }>();
  const navigate = useNavigate();
  const { data: product, isLoading, error, refetch } = useProduct(productCode);
  const deleteMut = useDeleteProduct();
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete product "${product?.description}" (${productCode})?`)) return;
    setDeleteErr(null);
    await deleteMut.mutateAsync(productCode!).catch(err => {
      setDeleteErr(err instanceof ApiError ? err.message : 'Failed to delete');
    });
    if (!deleteErr) navigate('/products');
  }

  if (isLoading) return <Loading />;
  if (error) {
    const is404 = error instanceof ApiError && error.status === 404;
    return is404
      ? (
        <div className="not-found-page">
          <div className="not-found-code">404</div>
          <div className="not-found-message">Product not found.</div>
          <div className="not-found-actions">
            <Link to="/products" className="btn btn-primary">Back to Products</Link>
          </div>
        </div>
      )
      : <ErrorMessage error={error} onRetry={refetch} />;
  }
  if (!product) return null;

  return (
    <div>
      <div className="detail-header">
        <div className="detail-header-left">
          <Link to="/products" className="detail-back">← Products</Link>
          <div className="detail-title-row">
            <span className="detail-id">{product.code}</span>
            <span className={`status-badge ${product.active ? 'status-DELIVERED' : 'status-CANCELLED'}`}>
              {product.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <span className="detail-farm">{product.description}</span>
        </div>
        <div className="detail-header-right">
          <Link to={`/products/${product.code}/edit`} className="btn btn-primary">Edit</Link>
          <button className="btn btn-danger" onClick={handleDelete} disabled={deleteMut.isPending}>
            {deleteMut.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {deleteErr && <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', color: 'var(--color-danger)' }}>{deleteErr}</div>}

      <div className="card">
        <div className="card-header">
          <div className="card-header-left">
            <span className="card-header-title">Product Information</span>
          </div>
        </div>
        <div className="card-body">
          <div className="order-info-grid">
            <div className="order-info-item">
              <span className="order-info-label">Code</span>
              <span className="order-info-value">{product.code}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Description</span>
              <span className="order-info-value">{product.description}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Unit Price</span>
              <span className="order-info-value">${Number(product.unit_price).toFixed(2)}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Stock Available</span>
              <span className="order-info-value">{product.stock_available}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Stock Reserved</span>
              <span className="order-info-value">{product.stock_reserved}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Created</span>
              <span className="order-info-value">{new Date(product.created_at).toLocaleString()}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Updated</span>
              <span className="order-info-value">{new Date(product.updated_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {product.labels && product.labels.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="card-header-title">Labels</span>
              <span className="card-header-desc">{product.labels.length} label{product.labels.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="card-body">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Crop</th>
                    <th>State</th>
                    <th className="numeric">Stage Min</th>
                    <th className="numeric">Stage Max</th>
                  </tr>
                </thead>
                <tbody>
                  {product.labels.map((l, i) => (
                    <tr key={i}>
                      <td><span style={{ fontWeight: 500 }}>{l.crop}</span></td>
                      <td className="text-muted">{l.state === '*' ? 'All' : l.state}</td>
                      <td className="numeric">{l.stage_min}</td>
                      <td className="numeric">{l.stage_max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}