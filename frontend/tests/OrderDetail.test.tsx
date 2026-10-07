import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrderDetailPage } from '../src/pages/OrderDetailPage';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function TestWrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/orders/ORD-6001']}>
        <Routes>
          <Route path="/orders/:orderId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => { mockFetch.mockReset(); });

describe('OrderDetailPage', () => {
  it('shows loading state initially', () => {
    mockFetch.mockResolvedValue(new Promise(() => {})); // never resolves
    render(<TestWrapper><OrderDetailPage /></TestWrapper>);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows 404 message when order not found', async () => {
    mockFetch.mockResolvedValue({
      ok: false, status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Order not found' } })),
    });
    render(<TestWrapper><OrderDetailPage /></TestWrapper>);
    await waitFor(() => expect(screen.getByText('Order not found.')).toBeTruthy());
  });

  it('shows order data and add-line form for DRAFT', async () => {
    const orderData = {
      order_id: 'ORD-6001', farm_id: 'F-020', farm_name: 'Test Farm',
      field: { crop: 'SOYBEAN', state: 'IA', growth_stage: 2 },
      status: 'DRAFT', line_count: 1, created_at: '2026-06-20T10:00:00Z', updated_at: '2026-06-20T10:00:00Z',
      lines: [{ line_id: 'L-7001', product_code: 'FNG-1112', description: 'Product', qty: 1, unit_price_snapshot: 54.20 }],
      notes: [{ note_id: 'N-7001', author: 'farm', text: 'Test note', created_at: '2026-06-20T10:05:00Z' }],
    };
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify(orderData)),
    });
    render(<TestWrapper><OrderDetailPage /></TestWrapper>);

    await waitFor(() => {
      expect(screen.getByText((c: string) => c.includes('ORD-6001'))).toBeTruthy();
      expect(screen.getByText((c: string) => c.includes('SOYBEAN'))).toBeTruthy();
      expect(screen.getByText((c: string) => c.includes('DRAFT'))).toBeTruthy();
      expect(screen.getAllByText('Add line').length).toBeGreaterThan(0);
      expect(screen.getByText('Test note')).toBeTruthy();
    });
  });
});