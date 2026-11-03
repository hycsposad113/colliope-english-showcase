// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/local-workers/local-workers.service.ts, services/voice/main.py; adapted: deterministic synthetic providers and in-memory ports for an offline demo.
import type { LocalCli } from '../src/llm/local-cli-worker.js';
export { InMemoryQueue } from '../src/llm/job-pipeline.js';
export { InMemoryReportStore } from '../src/report/report-import.js';

export class FakeLocalCli implements LocalCli {
  readonly inputs: string[] = [];
  constructor(private readonly invalidFirst = true) {}
  async run(input: string): Promise<string> {
    this.inputs.push(input);
    if (this.invalidFirst && this.inputs.length === 1) return JSON.stringify({ topic: 'Interview practice', question: '' });
    return JSON.stringify({ topic: 'Interview practice', question: 'Tell me about a project you built with a team.' });
  }
}
export class FakeStt {
  transcribe(_audio: Uint8Array): string { return 'I built a prototype with my team and tested it with users.'; }
}
export class FakeTts {
  synthesize(_text: string): Uint8Array { return new Uint8Array([0, 127, 255, 127]); }
}
