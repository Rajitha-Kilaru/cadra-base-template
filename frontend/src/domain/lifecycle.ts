// Domain copy of the lifecycle transition table (pure, no dependencies).
import type { OrderStatus } from '../api/types';

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED', 'BACKORDERED'],
  BACKORDERED: ['CONFIRMED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const STATUSES: OrderStatus[] = Object.keys(TRANSITIONS) as OrderStatus[];

export const LINE_EDITABLE: OrderStatus[] = ['DRAFT', 'SUBMITTED'];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// Human-readable action labels for ops buttons.
export const TRANSITION_LABELS: Partial<Record<OrderStatus, string>> = {
  SUBMITTED: 'Submit',
  CONFIRMED: 'Confirm',
  SHIPPED: 'Ship',
  DELIVERED: 'Deliver',
  CANCELLED: 'Cancel',
  BACKORDERED: 'Backorder',
};

export function getNextMoves(status: OrderStatus): OrderStatus[] {
  return TRANSITIONS[status] ?? [];
}