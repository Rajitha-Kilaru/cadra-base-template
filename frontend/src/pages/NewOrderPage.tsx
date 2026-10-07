import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCreateOrder } from '../api/hooks';
import { ApiError } from '../api/client';
import { FieldError } from '../components/FieldError';
import { MutationError } from '../components/MutationError';

export function NewOrderPage() {
  const navigate = useNavigate();
  const mutate = useCreateOrder();
  const idempotencyKey = useRef(crypto.randomUUID());

  const [farmId, setFarmId] = useState('');
  const [crop, setCrop] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [growthStage, setGrowthStage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mutationErr, setMutationErr] = useState<ApiError | null>(null);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!farmId.trim()) e.farm_id = 'Farm ID is required';
    if (!crop.trim()) e.crop = 'Crop is required';
    if (!stateCode.trim()) e.state = 'State is required';
    if (growthStage === '' || !Number.isInteger(Number(growthStage))) e.growth_stage = 'Growth stage must be a whole number';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMutationErr(null);
    if (!validate()) return;
    const result = await mutate.mutateAsync({
      farm_id: farmId.trim(),
      field: { crop: crop.trim(), state: stateCode.trim().toUpperCase(), growth_stage: parseInt(growthStage, 10) },
      idempotency_key: idempotencyKey.current,
    }).catch(err => { setMutationErr(err instanceof ApiError ? err : new ApiError(0, 'ERROR', err.message)); return null; });
    if (result) navigate(`/orders/${result.order_id}`);
  }

  return (
    <div>
      <div className="page-header">
        <Link to="/" className="detail-back">← Orders</Link>
        <h1 className="page-header-title" style={{ marginTop: 8 }}>New Order</h1>
        <p className="page-header-subtitle">Create a new farm input order.</p>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-header">
          <div className="card-header-left">
            <span className="card-header-title">Order Details</span>
            <span className="card-header-desc">Enter the field and crop information to create an order.</span>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="farmId">Farm ID</label>
                <input
                  id="farmId"
                  className={`form-input${errors.farm_id ? ' has-error' : ''}`}
                  value={farmId}
                  onChange={e => setFarmId(e.target.value)}
                  placeholder="e.g. F-001"
                />
                <FieldError message={errors.farm_id || null} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="crop">Crop</label>
                <input
                  id="crop"
                  className={`form-input${errors.crop ? ' has-error' : ''}`}
                  value={crop}
                  onChange={e => setCrop(e.target.value)}
                  placeholder="e.g. SOYBEAN"
                />
                <FieldError message={errors.crop || null} />
              </div>
            </div>
            <div className="form-row" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="state">State</label>
                <input
                  id="state"
                  className={`form-input${errors.state ? ' has-error' : ''}`}
                  value={stateCode}
                  onChange={e => setStateCode(e.target.value)}
                  maxLength={2}
                  placeholder="e.g. IA"
                />
                <span className="form-helper">Two-letter state code.</span>
                <FieldError message={errors.state || null} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="growthStage">Growth Stage</label>
                <input
                  id="growthStage"
                  className={`form-input${errors.growth_stage ? ' has-error' : ''}`}
                  type="number"
                  min={1}
                  max={5}
                  value={growthStage}
                  onChange={e => setGrowthStage(e.target.value)}
                  placeholder="1-5"
                />
                <span className="form-helper">Growth stage of the crop (1-5).</span>
                <FieldError message={errors.growth_stage || null} />
              </div>
            </div>
            <div className="form-info" style={{ marginTop: 16 }}>
              A unique idempotency key prevents duplicate orders if the request is retried.
              Submitting the same details again will not create a duplicate.
            </div>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={mutate.isPending}>
                {mutate.isPending ? 'Creating...' : 'Create order'}
              </button>
              {mutate.isPending && <span className="loading-label">Saving...</span>}
            </div>
            {mutationErr && <div style={{ marginTop: 12 }}><MutationError error={mutationErr} /></div>}
          </form>
        </div>
      </div>
    </div>
  );
}