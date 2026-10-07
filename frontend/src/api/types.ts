export type OrderStatus =
  | 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'BACKORDERED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface Field {
  crop: string;
  state: string;
  growth_stage: number;
}

export interface Line {
  line_id: string;
  product_code: string;
  description: string | null;
  qty: number;
  unit_price_snapshot: number;
}

export interface Note {
  note_id: string;
  author: 'farm' | 'ops';
  text: string;
  created_at: string;
}

export interface OrderSummary {
  order_id: string;
  farm_id: string;
  farm_name: string | null;
  field: Field;
  status: OrderStatus;
  line_count: number;
  created_at: string;
  updated_at: string;
}

export interface OrderDetail extends OrderSummary {
  lines: Line[];
  notes: Note[];
}

export interface ListResponse {
  items: OrderSummary[];
  page: number;
  page_size: number;
  total: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface CreateOrderRequest {
  farm_id: string;
  field: Field;
  idempotency_key: string;
}

export interface AddLineRequest {
  product_code: string;
  qty: number;
}

export interface TransitionRequest {
  to: OrderStatus;
}

export interface AddNoteRequest {
  author: 'farm' | 'ops';
  text: string;
}

export interface Farm {
  id: string;
  name: string;
  credit_hold: boolean;
  state: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  code: string;
  description: string;
  active: boolean;
  unit_price: number;
  stock_available: number;
  stock_reserved: number;
  created_at: string;
  updated_at: string;
}

export interface ProductLabel {
  crop: string;
  state: string;
  stage_min: number;
  stage_max: number;
}

export interface ProductDetail extends Product {
  labels: ProductLabel[];
}

export interface FarmListResponse {
  items: Farm[];
}

export interface ProductListResponse {
  items: Product[];
}