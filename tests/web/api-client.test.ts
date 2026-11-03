// Extracted from a larger private codebase (CALLIOPE). Source: apps/web/src/lib/api.ts, apps/api/src/common/problem-details.ts; adapted: offline synthetic response tests and framework-independent exceptions.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPost } from '../../src/web/api-client';
import { toProblemDetails } from '../../src/http/problem-details';
afterEach(() => vi.unstubAllGlobals());
describe('API errors', () => {
  it('extracts problem details from non-success JSON', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Invalid input' }), { status: 400 }))); await expect(apiGet('/example')).rejects.toMatchObject({ status: 400, message: 'Invalid input' }); });
  it('wraps network failures and serializes request bodies', async () => { const fetcher = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetcher); await expect(apiPost('/example', { value: 1 })).rejects.toMatchObject({ status: 0 }); expect(fetcher.mock.calls[0][1].body).toBe('{"value":1}'); });
  it('does not expose unexpected internal exception messages', () => { expect(toProblemDetails(new Error('private detail'), '/example')).toMatchObject({ status: 500, detail: 'An unexpected error occurred' }); expect(toProblemDetails({ getStatus: () => 400, getResponse: () => ({ message: ['one', 'two'] }) }, '/example').detail).toBe('one; two'); });
});
