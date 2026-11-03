// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/mcp-bridge.controller.ts, apps/mcp/src/server.ts; adapted: injected synthetic service and registry tests.
import { describe, expect, it, vi } from 'vitest';
import { McpBridge, type BridgePorts } from '../../src/mcp/bridge';
import { registerCalliopeTools, type ToolDefinition } from '../../src/mcp/server';
import { CalliopeClient } from '../../src/mcp/calliope-client';
function ports(): BridgePorts { return { resolveLearner: vi.fn().mockResolvedValue('learner'), getOrCreateMission: vi.fn(), createSessionPack: vi.fn(), getProgress: vi.fn(), validateReport: vi.fn(), importReport: vi.fn(), confirmReport: vi.fn(), rejectReport: vi.fn(), project: (_operation, value) => value }; }
describe('bridge', () => {
  it('rejects a confirmation whose body and path differ before service invocation', async () => { const p = ports(); await expect(new McpBridge(p).confirmReport('a', { reportId: 'b', confirmationToken: 'synthetic' })).rejects.toThrow('match'); expect(p.confirmReport).not.toHaveBeenCalled(); });
  it('hides projection exceptions', async () => { const p = ports(); p.project = () => { throw new Error('private detail'); }; await expect(new McpBridge(p).progress({})).rejects.toThrow('MCP output did not match'); });
  it('registers tools and rejects invalid input without invoking services', async () => { const definitions: ToolDefinition[] = []; const client = new CalliopeClient({ identityChecked: true, fetcher: vi.fn() }); registerCalliopeTools({ registerTool: item => definitions.push(item) }, client); expect(definitions).toHaveLength(7); const result = await definitions.find(x => x.name.endsWith('confirm_voice_report'))!.invoke({ reportId: 'a' }); expect(result.isError).toBe(true); });
});
