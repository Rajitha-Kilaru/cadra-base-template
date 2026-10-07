import { Link, useNavigate } from 'react-router-dom';
import { useOrders } from '../api/hooks';
import { useListFilters } from '../hooks/useListFilters';
import { STATUSES } from '../domain/lifecycle';
import { Loading } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';

export function OrderListPage() {
  const { filters, setStatus, setQ, setPage, clearFilters } = useListFilters();
  const { data, isLoading, isFetching, error, refetch } = useOrders(filters);
  const navigate = useNavigate();

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-header-title">Orders</h1>
        <p className="page-header-subtitle">Find and track farm orders from draft through delivery.</p>
      </div>

      <div className="card">
        <div className="filter-card">
          <div className="filter-input">
            <input
              className="form-input"
              type="search"
              defaultValue={filters.q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search order ID or farm name"
            />
          </div>
          <div className="filter-select">
            <select className="form-select" value={filters.status} onChange={e => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Link to="/orders/new" className="btn btn-primary">+ New Order</Link>
        </div>
      </div>

      {isLoading && <Loading />}
      {isFetching && !isLoading && (
        <div className="refetch-indicator">
          <div className="refetch-spinner" />
          Updating…
        </div>
      )}
      {error && <ErrorMessage error={error} onRetry={refetch} />}
      {data && data.items.length === 0 && (
        <div className="card">
          <EmptyState
            message="No orders match the current filters."
            actions={filters.status || filters.q ? [{ label: 'Clear filters', onClick: clearFilters }] : undefined}
          />
        </div>
      )}
      {data && data.items.length > 0 && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Farm</th>
                  <th>Field</th>
                  <th>Status</th>
                  <th className="numeric">Lines</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(o => (
                  <tr key={o.order_id}>
                    <td><Link className="order-id-link" to={`/orders/${o.order_id}`}>{o.order_id}</Link></td>
                    <td>
                      <div className="farm-cell">
                        <span className="farm-name">{o.farm_name ?? 'Unknown farm'}</span>
                        <span className="farm-id">{o.farm_id}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-muted text-small">
                        {o.field.crop} / {o.field.state} / stage {o.field.growth_stage}
                      </span>
                    </td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="numeric"><span className="lines-cell">{o.line_count}</span></td>
                    <td><span className="text-muted text-small">{new Date(o.created_at).toLocaleString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total > 0 && (
            <div className="pagination">
              <button
                className="btn btn-secondary btn-sm"
                disabled={filters.page <= 1}
                onClick={() => setPage(filters.page - 1)}
              >
                Prev
              </button>
              <span className="pagination-info">
                Page {filters.page} of {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={filters.page >= totalPages}
                onClick={() => setPage(filters.page + 1)}
              >
                Next
              </button>
              <span className="pagination-info">({data.total} total)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}