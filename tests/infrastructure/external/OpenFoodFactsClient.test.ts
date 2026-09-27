import { describe, it, expect, vi } from 'vitest';
import { OpenFoodFactsClient } from '../../../src/infrastructure/external/OpenFoodFactsClient.js';

describe('OpenFoodFactsClient', () => {
  it('returns formatted product when product_name_es and brands are present', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        code: '8410123456789',
        product: {
          product_name: 'Whole Milk',
          product_name_es: 'Leche Entera',
          brands: 'Pascual',
        },
      }),
    });

    const client = new OpenFoodFactsClient(1500, mockFetch as unknown as typeof fetch);
    const result = await client.fetchProduct('8410123456789');

    expect(result).not.toBeNull();
    expect(result?.barcode).toBe('8410123456789');
    expect(result?.name).toBe('Leche Entera (Pascual)');

    // Verify User-Agent header
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('8410123456789.json'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': OpenFoodFactsClient.USER_AGENT,
        }),
      })
    );
  });

  it('falls back to product_name when product_name_es is not available', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        code: '3017620422003',
        product: {
          product_name: 'Nutella 400g',
          brands: 'Ferrero',
        },
      }),
    });

    const client = new OpenFoodFactsClient(1500, mockFetch as unknown as typeof fetch);
    const result = await client.fetchProduct('3017620422003');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Nutella 400g (Ferrero)');
  });

  it('does not duplicate brand if brand is already present in product name', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name_es: 'Hacendado Yogur Griego',
          brands: 'Hacendado',
        },
      }),
    });

    const client = new OpenFoodFactsClient(1500, mockFetch as unknown as typeof fetch);
    const result = await client.fetchProduct('8480000123456');

    expect(result?.name).toBe('Hacendado Yogur Griego');
  });

  it('returns null when product status is 0 (not found)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 0,
        status_verbose: 'product not found',
      }),
    });

    const client = new OpenFoodFactsClient(1500, mockFetch as unknown as typeof fetch);
    const result = await client.fetchProduct('0000000000000');

    expect(result).toBeNull();
  });

  it('returns null when API returns HTTP 404', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const client = new OpenFoodFactsClient(1500, mockFetch as unknown as typeof fetch);
    const result = await client.fetchProduct('8410123456789');

    expect(result).toBeNull();
  });

  it('returns null when API returns HTTP 500', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const client = new OpenFoodFactsClient(1500, mockFetch as unknown as typeof fetch);
    const result = await client.fetchProduct('8410123456789');

    expect(result).toBeNull();
  });

  it('returns null on network failure without throwing', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error (DNS lookup failed)'));

    const client = new OpenFoodFactsClient(1500, mockFetch as unknown as typeof fetch);
    const result = await client.fetchProduct('8410123456789');

    expect(result).toBeNull();
  });

  it('returns null when JSON parsing fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    const client = new OpenFoodFactsClient(1500, mockFetch as unknown as typeof fetch);
    const result = await client.fetchProduct('8410123456789');

    expect(result).toBeNull();
  });

  it('aborts with AbortController and returns null when request exceeds timeout', async () => {
    // Simulate a slow API hanging past the timeout
    const mockFetch = vi.fn().mockImplementation((_url: string, options: { signal: AbortSignal }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({ status: 1, product: { product_name: 'Too Late' } }),
          });
        }, 500);

        options.signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          const abortErr = new Error('The operation was aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    });

    const client = new OpenFoodFactsClient(50, mockFetch as unknown as typeof fetch);
    const result = await client.fetchProduct('8410123456789');

    expect(result).toBeNull();
  });

  it('returns null for empty barcode', async () => {
    const mockFetch = vi.fn();
    const client = new OpenFoodFactsClient(1500, mockFetch as unknown as typeof fetch);

    expect(await client.fetchProduct('')).toBeNull();
    expect(await client.fetchProduct('   ')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
