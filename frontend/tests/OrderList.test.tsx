import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrderListPage } from '../src/pages/OrderListPage';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

afterEach(() => { mockFetch.mockReset(); });

describe('OrderListPage', () => {
  it('shows empty state when no orders match', async () => {
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ items: [], page: 1, page_size: 20, total: 0 })),
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/?q=zzzz']}>
          <Routes>
            <Route path="/" element={<OrderListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('No orders match the current filters.')).toBeTruthy();
    });
  });

  it('shows rows when orders exist', async () => {
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({
        items: [{
          order_id: 'ORD-6001', farm_id: 'F-020', farm_name: 'Elmhurst Farm',
          field: { crop: 'SOYBEAN', state: 'IA', growth_stage: 2 },
          status: 'DRAFT', line_count: 1, created_at: '2026-06-20T10:00:00Z', updated_at: '2026-06-20T10:00:00Z',
        }],
        page: 1, page_size: 20, total: 1,
      })),
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<OrderListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText((c: string) => c.includes('ORD-6001'))).toBeTruthy();
      expect(screen.getByText('Elmhurst Farm')).toBeTruthy();
    });
  });

  it('shows error state with retry when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<OrderListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('NETWORK_ERROR')).toBeTruthy();
      expect(screen.getByText((c: string) => c.includes('Network error: Network failure'))).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    });
  });
});