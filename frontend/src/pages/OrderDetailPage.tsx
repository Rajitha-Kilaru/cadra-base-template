import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useOrder, useAddLine, useTransition, useAddNote } from '../api/hooks';
import { ApiError } from '../api/client';
import { LINE_EDITABLE, getNextMoves, TRANSITION_LABELS } from '../domain/lifecycle';
import type { OrderStatus } from '../api/types';
import { Loading } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { FieldError } from '../components/FieldError';
import { MutationError } from '../components/MutationError';
import { StatusBadge } from '../components/StatusBadge';

function normaliseProductCode(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/[\s_-]+/g, '');
  const m = s.match(/^([A-Z]{2,3})(\d{4})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function NoteAvatar({ author }: { author: string }) {
  const initial = author === 'farm' ? 'F' : 'O';
  return <div className="note-avatar">{initial}</div>;
}

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { data: order, isLoading, error, refetch } = useOrder(orderId);

  // Line form
  const addLineMut = useAddLine(orderId);
  const [lineCode, setLineCode] = useState('');
  const [lineQty, setLineQty] = useState('');
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [lineMutationErr, setLineMutationErr] = useState<ApiError | null>(null);

  // Transition
  const transitionMut = useTransition(orderId);
  const [transitionErr, setTransitionErr] = useState<ApiError | null>(null);

  // Note form
  const addNoteMut = useAddNote(orderId);
  const [noteAuthor, setNoteAuthor] = useState<'farm' | 'ops'>('farm');
  const [noteText, setNoteText] = useState('');
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({});
  const [noteMutationErr, setNoteMutationErr] = useState<ApiError | null>(null);

  if (isLoading) return <Loading />;
  if (error) {
    const is404 = error instanceof ApiError && error.status === 404;
    return is404
      ? (
        <div className="not-found-page">
          <div className="not-found-code">404</div>
          <div className="not-found-message">Order not found.</div>
          <p className="not-found-detail">The requested order could not be found.</p>
          <div className="not-found-actions">
            <Link to="/" className="btn btn-primary">Back to Orders</Link>
          </div>
        </div>
      )
      : <ErrorMessage error={error} onRetry={refetch} />;
  }
  if (!order) return null;

  const canEditLines = LINE_EDITABLE.includes(order.status);
  const nextMoves = getNextMoves(order.status);

  // --- line form ---
  function validateLine(): boolean {
    const e: Record<string, string> = {};
    if (!lineCode.trim()) e.product_code = 'Product code is required';
    else if (!normaliseProductCode(lineCode)) e.product_code = 'Invalid product code format (expected AAA-9999)';
    const qty = parseInt(lineQty, 10);
    if (!lineQty.trim()) e.qty = 'Quantity is required';
    else if (!/^\d+$/.test(lineQty) || qty < 1) e.qty = 'Quantity must be a positive whole number';
    setLineErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleAddLine(e: React.FormEvent) {
    e.preventDefault();
    setLineMutationErr(null);
    if (!validateLine()) return;
    const normalised = normaliseProductCode(lineCode)!;
    const result = await addLineMut.mutateAsync({ product_code: normalised, qty: parseInt(lineQty, 10) })
      .catch(err => { setLineMutationErr(err instanceof ApiError ? err : new ApiError(0, 'ERROR', err.message)); return null; });
    if (result) { setLineCode(''); setLineQty(''); setLineErrors({}); }
  }

  // --- transition ---
  async function handleTransition(to: OrderStatus) {
    if (to === 'CANCELLED' && !confirm('Cancel this order?')) return;
    setTransitionErr(null);
    await transitionMut.mutateAsync({ to }).catch(err => {
      setTransitionErr(err instanceof ApiError ? err : new ApiError(0, 'ERROR', err.message));
    });
  }

  // --- note form ---
  function validateNote(): boolean {
    const e: Record<string, string> = {};
    if (!noteText.trim()) e.text = 'Note text is required';
    else if (noteText.trim().length > 2000) e.text = 'Note text must be at most 2000 characters';
    setNoteErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    setNoteMutationErr(null);
    if (!validateNote()) return;
    const result = await addNoteMut.mutateAsync({ author: noteAuthor, text: noteText.trim() })
      .catch(err => { setNoteMutationErr(err instanceof ApiError ? err : new ApiError(0, 'ERROR', err.message)); return null; });
    if (result) { setNoteText(''); setNoteErrors({}); }
  }

  const lineTotal = order.lines.reduce((sum, l) => sum + (l.unit_price_snapshot * l.qty), 0);

  return (
    <div>
      {/* Header */}
      <div className="detail-header">
        <div className="detail-header-left">
          <Link to="/" className="detail-back">← Orders</Link>
          <div className="detail-title-row">
            <span className="detail-id">{order.order_id}</span>
            <StatusBadge status={order.status} />
          </div>
          <span className="detail-farm">{order.farm_name ?? 'Unknown farm'} ({order.farm_id})</span>
        </div>
        <div className="detail-header-right">
          {nextMoves.map(to => {
            const label = to === 'CONFIRMED' && order.status === 'BACKORDERED' ? 'Un-backorder' : (TRANSITION_LABELS[to] ?? to);
            const isDanger = to === 'CANCELLED';
            return (
              <button
                key={to}
                className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}${transitionMut.isPending ? ' btn-pending' : ''}`}
                disabled={transitionMut.isPending}
                onClick={() => handleTransition(to)}
              >
                {transitionMut.isPending ? 'Saving...' : label}
              </button>
            );
          })}
        </div>
      </div>

      {transitionErr && (
        <div style={{ marginBottom: 16 }}>
          <MutationError error={transitionErr} />
        </div>
      )}

      {/* Order Information */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-left">
            <span className="card-header-title">Order Information</span>
          </div>
        </div>
        <div className="card-body">
          <div className="order-info-grid">
            <div className="order-info-item">
              <span className="order-info-label">Farm</span>
              <span className="order-info-value">{order.farm_name ?? 'Unknown farm'}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Farm ID</span>
              <span className="order-info-value">{order.farm_id}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Crop</span>
              <span className="order-info-value">{order.field.crop}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">State</span>
              <span className="order-info-value">{order.field.state}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Growth Stage</span>
              <span className="order-info-value">{order.field.growth_stage}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Created</span>
              <span className="order-info-value">{new Date(order.created_at).toLocaleString()}</span>
            </div>
            <div className="order-info-item">
              <span className="order-info-label">Updated</span>
              <span className="order-info-value">{new Date(order.updated_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-left">
            <span className="card-header-title">Products</span>
            <span className="card-header-desc">
              {order.lines.length === 0
                ? 'No products added yet.'
                : `${order.lines.length} product${order.lines.length === 1 ? '' : 's'}`
              }
            </span>
          </div>
        </div>
        <div className="card-body">
          {order.lines.length === 0 && <EmptyState message="No lines yet." />}
          {order.lines.length > 0 && (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Product Code</th>
                    <th>Description</th>
                    <th className="numeric">Quantity</th>
                    <th className="numeric">Unit Price</th>
                    <th className="numeric">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map(l => (
                    <tr key={l.line_id}>
                      <td><span style={{ fontWeight: 500 }}>{l.product_code}</span></td>
                      <td className="text-muted">{l.description ?? '—'}</td>
                      <td className="numeric">{l.qty}</td>
                      <td className="numeric">${l.unit_price_snapshot?.toFixed(2)}</td>
                      <td className="numeric" style={{ fontWeight: 600 }}>${(l.unit_price_snapshot * l.qty).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canEditLines ? (
            <form onSubmit={handleAddLine} style={{ marginTop: order.lines.length > 0 ? 16 : 0 }}>
              <div className="form-info" style={{ marginBottom: 12 }}>
                The server will verify that the product is active and labelled for this field.
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="lineCode">Product Code</label>
                  <input
                    id="lineCode"
                    className={`form-input${lineErrors.product_code ? ' has-error' : ''}`}
                    value={lineCode}
                    onChange={e => { setLineCode(e.target.value); setLineMutationErr(null); }}
                    placeholder="FNG-1112"
                  />
                  <FieldError message={lineErrors.product_code || null} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="lineQty">Qty:</label>
                  <input
                    id="lineQty"
                    className={`form-input${lineErrors.qty ? ' has-error' : ''}`}
                    type="number"
                    min={1}
                    step={1}
                    value={lineQty}
                    onChange={e => { setLineQty(e.target.value); setLineMutationErr(null); }}
                  />
                  <FieldError message={lineErrors.qty || null} />
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={addLineMut.isPending}>
                  {addLineMut.isPending ? 'Saving...' : 'Add line'}
                </button>
              </div>
              {lineMutationErr && <div style={{ marginTop: 12 }}><MutationError error={lineMutationErr} /></div>}
            </form>
          ) : order.lines.length > 0 && (
            <div className="locked-notice" style={{ marginTop: 16 }}>
              <span>Lines are locked for this order status.</span>
            </div>
          )}

          {order.lines.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, padding: '8px 0', borderTop: '1px solid var(--color-border-light)' }}>
              <div className="order-info-item">
                <span className="order-info-label">Order Total</span>
                <span className="order-info-value">${lineTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-left">
            <span className="card-header-title">Notes</span>
            <span className="card-header-desc">
              {order.notes.length === 0
                ? 'No notes yet.'
                : `${order.notes.length} note${order.notes.length === 1 ? '' : 's'}`
              }
            </span>
          </div>
        </div>
        <div className="card-body">
          {order.notes.length > 0 && (
            <div className="notes-list">
              {[...order.notes]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map(n => (
                  <div key={n.note_id} className="note-item">
                    <NoteAvatar author={n.author} />
                    <div className="note-content">
                      <div className="note-header">
                        <span className="note-author">{n.author}</span>
                        <span className="note-time">{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                      <div className="note-text">{n.text}</div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          <form onSubmit={handleAddNote} className="add-note-form">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="noteAuthor">Author</label>
                <select
                  id="noteAuthor"
                  className="form-select"
                  value={noteAuthor}
                  onChange={e => setNoteAuthor(e.target.value as 'farm' | 'ops')}
                >
                  <option value="farm">Farm</option>
                  <option value="ops">Ops</option>
                </select>
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label" htmlFor="noteText">Note</label>
                  <span className="form-char-count">{noteText.length} / 2000</span>
                </div>
                <textarea
                  id="noteText"
                  className={`form-textarea${noteErrors.text ? ' has-error' : ''}`}
                  value={noteText}
                  onChange={e => { setNoteText(e.target.value); setNoteMutationErr(null); }}
                  maxLength={2000}
                  rows={3}
                />
                <FieldError message={noteErrors.text || null} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={addNoteMut.isPending}>
                {addNoteMut.isPending ? 'Saving...' : 'Add note'}
              </button>
            </div>
            {noteMutationErr && <div><MutationError error={noteMutationErr} /></div>}
          </form>
        </div>
      </div>
    </div>
  );
}