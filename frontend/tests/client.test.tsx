import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError, listOrders } from '../src/api/client';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => { mockFetch.mockReset(); });

describe('ApiError', () => {
  it('constructs with status, code, message', () => {
    const err = new ApiError(422, 'LABEL_MISMATCH', 'Not labelled');
    expect(err.status).toBe(422);
    expect(err.code).toBe('LABEL_MISMATCH');
    expect(err.message).toBe('Not labelled');
    expect(err.name).toBe('ApiError');
  });
});

describe('API request error handling', () => {
  it('throws ApiError on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));
    await expect(listOrders()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('throws ApiError with parsed error envelope', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve(JSON.stringify({
        error: { code: 'LABEL_MISMATCH', message: 'FNG-1112 is not labelled for CANOLA in ND' }
      })),
    });
    await expect(listOrders()).rejects.toMatchObject({
      status: 422,
      code: 'LABEL_MISMATCH',
      message: 'FNG-1112 is not labelled for CANOLA in ND',
    });
  });

  it('throws UNKNOWN_ERROR on non-JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });
    await expect(listOrders()).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
      status: 500,
    });
  });

  it('parses successful JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ items: [], page: 1, page_size: 20, total: 0 })),
    });
    const result = await listOrders();
    expect(result.items).toEqual([]);
    expect(result.page).toBe(1);
  });
});