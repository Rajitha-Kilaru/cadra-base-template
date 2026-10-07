import type {
  OrderDetail, OrderSummary, ListResponse,
  CreateOrderRequest, AddLineRequest, TransitionRequest, AddNoteRequest,
  Farm, FarmListResponse, ProductDetail, ProductListResponse,
  ApiErrorBody,
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
if (!BASE_URL) console.error('VITE_API_BASE_URL is not set');

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
  const url = `${BASE_URL}${path}${params ? buildQuery(params) : ''}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(err => {
    throw new ApiError(0, 'NETWORK_ERROR', `Network error: ${err.message}`);
  });

  const text = await res.text().catch(() => '');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = null; }

  if (!res.ok) {
    const errorBody = parsed as ApiErrorBody | null;
    const code = errorBody?.error?.code || 'UNKNOWN_ERROR';
    const message = errorBody?.error?.message || `HTTP ${res.status}`;
    throw new ApiError(res.status, code, message);
  }
  return parsed as T;
}

export function listOrders(params?: { status?: string; q?: string; page?: number; page_size?: number }): Promise<ListResponse> {
  return request<ListResponse>('GET', '/api/orders', undefined, params as Record<string, unknown>);
}

export function getOrder(orderId: string): Promise<OrderDetail> {
  return request<OrderDetail>('GET', `/api/orders/${encodeURIComponent(orderId)}`);
}

export function createOrder(data: CreateOrderRequest): Promise<OrderDetail> {
  return request<OrderDetail>('POST', '/api/orders', data);
}

export function addLine(orderId: string, data: AddLineRequest): Promise<OrderDetail> {
  return request<OrderDetail>('POST', `/api/orders/${encodeURIComponent(orderId)}/lines`, data);
}

export function transition(orderId: string, data: TransitionRequest): Promise<OrderDetail> {
  return request<OrderDetail>('POST', `/api/orders/${encodeURIComponent(orderId)}/transition`, data);
}

export function addNote(orderId: string, data: AddNoteRequest): Promise<OrderDetail> {
  return request<OrderDetail>('POST', `/api/orders/${encodeURIComponent(orderId)}/notes`, data);
}

export function listFarms(): Promise<FarmListResponse> {
  return request<FarmListResponse>('GET', '/api/farms');
}

export function getFarm(id: string): Promise<Farm> {
  return request<Farm>('GET', `/api/farms/${encodeURIComponent(id)}`);
}

export function listProducts(): Promise<ProductListResponse> {
  return request<ProductListResponse>('GET', '/api/products');
}

export function getProduct(code: string): Promise<ProductDetail> {
  return request<ProductDetail>('GET', `/api/products/${encodeURIComponent(code)}`);
}

export function createFarm(data: { id: string; name: string; credit_hold?: boolean; state?: string }): Promise<{ id: string }> {
  return request('POST', '/api/farms', data);
}

export function updateFarm(id: string, data: { name: string; credit_hold?: boolean; state?: string }): Promise<{ id: string }> {
  return request('PUT', `/api/farms/${encodeURIComponent(id)}`, data);
}

export function deleteFarm(id: string): Promise<{ deleted: string }> {
  return request('DELETE', `/api/farms/${encodeURIComponent(id)}`);
}

export function createProduct(data: { code: string; description: string; active?: boolean; unit_price?: number; stock_available?: number; stock_reserved?: number; labels?: { crop: string; state: string; stage_min: number; stage_max: number }[] }): Promise<{ code: string }> {
  return request('POST', '/api/products', data);
}

export function updateProduct(code: string, data: { description: string; active?: boolean; unit_price?: number; stock_available?: number; stock_reserved?: number; labels?: { crop: string; state: string; stage_min: number; stage_max: number }[] }): Promise<{ code: string }> {
  return request('PUT', `/api/products/${encodeURIComponent(code)}`, data);
}

export function deleteProduct(code: string): Promise<{ deleted: string }> {
  return request('DELETE', `/api/products/${encodeURIComponent(code)}`);
}