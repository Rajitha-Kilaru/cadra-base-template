import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrderDetailPage } from '../src/pages/OrderDetailPage';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const order = {
  order_id: 'ORD-6001', farm_id: 'F-020', farm_name: 'Test Farm',
  field: { crop: 'SOYBEAN', state: 'IA', growth_stage: 2 },
  status: 'DRAFT', line_count: 0, created_at: '2026-06-20T10:00:00Z', updated_at: '2026-06-20T10:00:00Z',
  lines: [],
  notes: [],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/orders/ORD-6001']}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => { mockFetch.mockReset(); });
afterEach(() => {});

describe('AddLineForm server-rejected change', () => {
  it('shows LABEL_MISMATCH and keeps the user input', async () => {
    const user = userEvent.setup();
    // 1st fetch: order detail; 2nd fetch: add line rejected
    mockFetch
      .mockResolvedValueOnce({
        ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify(order)),
      })
      .mockResolvedValueOnce({
        ok: false, status: 422,
        text: () => Promise.resolve(JSON.stringify({
          error: { code: 'LABEL_MISMATCH', message: 'FNG-9999 is not labelled for SOYBEAN in IA at growth stage 2' }
        })),
      });

    renderPage();
    await waitFor(() => expect(screen.getByText((c: string) => c.includes('ORD-6001'))).toBeTruthy());

    const codeInput = screen.getByPlaceholderText('FNG-1112');
    await user.type(codeInput, 'FNG-9999');
    await user.type(screen.getByLabelText('Qty:'), '1');
    await user.click(screen.getByRole('button', { name: 'Add line' }));

    await waitFor(() => {
      expect(screen.getByText('LABEL_MISMATCH')).toBeTruthy();
      expect(screen.getByText((c: string) => c.includes('FNG-9999 is not labelled for SOYBEAN in IA'))).toBeTruthy();
    });
    // Input kept for correction
    expect((screen.getByPlaceholderText('FNG-1112') as HTMLInputElement).value).toBe('FNG-9999');
  });
});