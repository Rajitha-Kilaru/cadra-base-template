import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useCreateProduct, useUpdateProduct, useProduct } from '../api/hooks';
import { ApiError } from '../api/client';
import { FieldError } from '../components/FieldError';
import { MutationError } from '../components/MutationError';

interface LabelRow {
  crop: string;
  state: string;
  stage_min: number;
  stage_max: number;
}

export function ProductFormPage() {
  const { productCode } = useParams<{ productCode: string }>();
  const isEdit = !!productCode;
  const navigate = useNavigate();
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const { data: existing } = useProduct(isEdit ? productCode : undefined);

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [stockAvailable, setStockAvailable] = useState('0');
  const [stockReserved, setStockReserved] = useState('0');
  const [active, setActive] = useState(true);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mutationErr, setMutationErr] = useState<ApiError | null>(null);

  useEffect(() => {
    if (existing) {
      setCode(existing.code);
      setDescription(existing.description);
      setUnitPrice(String(existing.unit_price));
      setStockAvailable(String(existing.stock_available));
      setStockReserved(String(existing.stock_reserved));
      setActive(existing.active);
      setLabels((existing as any).labels || []);
    }
  }, [existing]);

  function addLabel() {
    setLabels([...labels, { crop: '', state: '', stage_min: 1, stage_max: 5 }]);
  }

  function updateLabel(i: number, field: keyof LabelRow, value: string | number) {
    const copy = [...labels];
    (copy[i] as any)[field] = value;
    setLabels(copy);
  }

  function removeLabel(i: number) {
    setLabels(labels.filter((_, idx) => idx !== i));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!isEdit && !code.trim()) e.code = 'Product code is required';
    if (!description.trim()) e.description = 'Description is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMutationErr(null);
    if (!validate()) return;
    const payload = {
      description: description.trim(),
      active,
      unit_price: parseFloat(unitPrice) || 0,
      stock_available: parseInt(stockAvailable, 10) || 0,
      stock_reserved: parseInt(stockReserved, 10) || 0,
      labels: labels.filter(l => l.crop.trim()),
    };
    const mutate = isEdit ? updateMut : createMut;
    const result = await mutate.mutateAsync(
      isEdit ? { code: productCode!, ...payload } : { code: code.trim().toUpperCase(), ...payload }
    ).catch(err => { setMutationErr(err instanceof ApiError ? err : new ApiError(0, 'ERROR', err.message)); return null; });
    if (result) navigate('/products');
  }

  return (
    <div>
      <div className="page-header">
        <Link to="/products" className="detail-back">← Products</Link>
        <h1 className="page-header-title" style={{ marginTop: 8 }}>{isEdit ? 'Edit Product' : 'New Product'}</h1>
        <p className="page-header-subtitle">{isEdit ? `Editing ${productCode}` : 'Add a new product to the catalog.'}</p>
      </div>

      <div className="card" style={{ maxWidth: 700 }}>
        <div className="card-header">
          <div className="card-header-left">
            <span className="card-header-title">Product Details</span>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="prodCode">Product Code</label>
                <input
                  id="prodCode"
                  className={`form-input${errors.code ? ' has-error' : ''}`}
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="e.g. FNG-1112"
                  disabled={isEdit}
                />
                <FieldError message={errors.code || null} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prodDesc">Description</label>
                <input
                  id="prodDesc"
                  className={`form-input${errors.description ? ' has-error' : ''}`}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Product name"
                />
                <FieldError message={errors.description || null} />
              </div>
            </div>
            <div className="form-row" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="prodPrice">Unit Price</label>
                <input
                  id="prodPrice"
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitPrice}
                  onChange={e => setUnitPrice(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prodStock">Stock Available</label>
                <input
                  id="prodStock"
                  className="form-input"
                  type="number"
                  min="0"
                  value={stockAvailable}
                  onChange={e => setStockAvailable(e.target.value)}
                />
              </div>
            </div>
            <div className="form-row" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="prodReserved">Stock Reserved</label>
                <input
                  id="prodReserved"
                  className="form-input"
                  type="number"
                  min="0"
                  value={stockReserved}
                  onChange={e => setStockReserved(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 24 }}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={e => setActive(e.target.checked)}
                  />
                  Active
                </label>
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="card-header-title">Labels</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addLabel}>+ Add Label</button>
              </div>
              {labels.length === 0 && <p className="text-muted text-small">No labels defined.</p>}
              {labels.map((l, i) => (
                <div key={i} className="form-row" style={{ marginTop: 8, alignItems: 'end' }}>
                  <div className="form-group">
                    <label className="form-label">Crop</label>
                    <input className="form-input" value={l.crop} onChange={e => updateLabel(i, 'crop', e.target.value)} placeholder="SOYBEAN" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input className="form-input" value={l.state} onChange={e => updateLabel(i, 'state', e.target.value)} maxLength={2} placeholder="IA or *" />
                  </div>
                  <div className="form-group" style={{ maxWidth: 80 }}>
                    <label className="form-label">Min</label>
                    <input className="form-input" type="number" min={1} max={5} value={l.stage_min} onChange={e => updateLabel(i, 'stage_min', parseInt(e.target.value) || 1)} />
                  </div>
                  <div className="form-group" style={{ maxWidth: 80 }}>
                    <label className="form-label">Max</label>
                    <input className="form-input" type="number" min={1} max={5} value={l.stage_max} onChange={e => updateLabel(i, 'stage_max', parseInt(e.target.value) || 5)} />
                  </div>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLabel(i)}>X</button>
                </div>
              ))}
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? 'Saving...' : (isEdit ? 'Update Product' : 'Create Product')}
              </button>
              <Link to="/products" className="btn btn-secondary">Cancel</Link>
            </div>
            {mutationErr && <div style={{ marginTop: 12 }}><MutationError error={mutationErr} /></div>}
          </form>
        </div>
      </div>
    </div>
  );
}