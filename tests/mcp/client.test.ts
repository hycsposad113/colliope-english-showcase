// Extracted from a larger private codebase (CALLIOPE). Source: apps/mcp/src/calliope-client.ts; adapted: synthetic offline fetch tests.
import { describe, expect, it, vi } from 'vitest';
import { CalliopeClient } from '../../src/mcp/calliope-client';
describe('MCP API client', () => {
  it('retries reads once but does not retry writes', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(new Response('{}'));
    const client = new CalliopeClient({ fetcher, identityChecked: true });
    await expect(client.getProgress({})).resolves.toEqual({}); expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockReset().mockRejectedValue(new Error('network'));
    await expect(client.importVoiceReport({ rawText: 'synthetic' })).rejects.toMatchObject({ code: 'API_UNAVAILABLE' }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('fails closed on identity mismatch and remote URL', async () => {
    expect(() => new CalliopeClient({ baseUrl: 'http://example.com/api' })).toThrow();
    const client = new CalliopeClient({ fetcher: vi.fn().mockResolvedValue(new Response('{"service":"other"}')) });
    await expect(client.getProgress({})).rejects.toMatchObject({ code: 'API_IDENTITY_MISMATCH' });
  });
  it('rejects malformed and oversized responses', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('invalid'));
    const client = new CalliopeClient({ fetcher, identityChecked: true });
    await expect(client.validateVoiceReport({})).rejects.toMatchObject({ code: 'API_RESPONSE_INVALID' });
    fetcher.mockResolvedValue(new Response('{}', { headers: { 'content-length': '1048577' } }));
    await expect(client.validateVoiceReport({})).rejects.toMatchObject({ code: 'API_RESPONSE_TOO_LARGE' });
  });
});
