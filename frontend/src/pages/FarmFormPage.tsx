import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useCreateFarm, useUpdateFarm, useFarm } from '../api/hooks';
import { ApiError } from '../api/client';
import { FieldError } from '../components/FieldError';
import { MutationError } from '../components/MutationError';

export function FarmFormPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const isEdit = !!farmId;
  const navigate = useNavigate();
  const createMut = useCreateFarm();
  const updateMut = useUpdateFarm();
  const { data: existing } = useFarm(isEdit ? farmId : undefined);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [creditHold, setCreditHold] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mutationErr, setMutationErr] = useState<ApiError | null>(null);

  useEffect(() => {
    if (existing) {
      setId(existing.id);
      setName(existing.name);
      setStateCode(existing.state ?? '');
      setCreditHold(existing.credit_hold);
    }
  }, [existing]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!isEdit && !id.trim()) e.id = 'Farm ID is required';
    if (!name.trim()) e.name = 'Farm name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMutationErr(null);
    if (!validate()) return;
    const mutate = isEdit ? updateMut : createMut;
    const result = await mutate.mutateAsync(
      isEdit
        ? { id: farmId!, name: name.trim(), state: stateCode.trim().toUpperCase() || undefined, credit_hold: creditHold }
        : { id: id.trim(), name: name.trim(), state: stateCode.trim().toUpperCase() || undefined, credit_hold: creditHold }
    ).catch(err => { setMutationErr(err instanceof ApiError ? err : new ApiError(0, 'ERROR', err.message)); return null; });
    if (result) navigate('/farms');
  }

  return (
    <div>
      <div className="page-header">
        <Link to="/farms" className="detail-back">← Farms</Link>
        <h1 className="page-header-title" style={{ marginTop: 8 }}>{isEdit ? 'Edit Farm' : 'New Farm'}</h1>
        <p className="page-header-subtitle">{isEdit ? `Editing ${farmId}` : 'Register a new farm.'}</p>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-header">
          <div className="card-header-left">
            <span className="card-header-title">Farm Details</span>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="farmId">Farm ID</label>
                <input
                  id="farmId"
                  className={`form-input${errors.id ? ' has-error' : ''}`}
                  value={id}
                  onChange={e => setId(e.target.value)}
                  placeholder="e.g. F-020"
                  disabled={isEdit}
                />
                <FieldError message={errors.id || null} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="farmName">Farm Name</label>
                <input
                  id="farmName"
                  className={`form-input${errors.name ? ' has-error' : ''}`}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Greenacres Farm"
                />
                <FieldError message={errors.name || null} />
              </div>
            </div>
            <div className="form-row" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="farmState">State</label>
                <input
                  id="farmState"
                  className="form-input"
                  value={stateCode}
                  onChange={e => setStateCode(e.target.value)}
                  maxLength={2}
                  placeholder="e.g. IA"
                />
                <span className="form-helper">Two-letter state code.</span>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 24 }}>
                  <input
                    type="checkbox"
                    checked={creditHold}
                    onChange={e => setCreditHold(e.target.checked)}
                  />
                  Credit Hold
                </label>
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? 'Saving...' : (isEdit ? 'Update Farm' : 'Create Farm')}
              </button>
              <Link to="/farms" className="btn btn-secondary">Cancel</Link>
            </div>
            {mutationErr && <div style={{ marginTop: 12 }}><MutationError error={mutationErr} /></div>}
          </form>
        </div>
      </div>
    </div>
  );
}