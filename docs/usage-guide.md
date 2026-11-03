# Usage guide

Run `npm ci`, `npm test`, and `npm run demo` from the repository root. The output follows a synthetic interview exercise from invalid proposal through validation repair, pack creation, fake speech, report extraction, preview and explicit confirmation. The same pending report is submitted twice to demonstrate idempotency; two concurrent confirmation requests then compete, and one is rejected. The resulting synthetic summary is written to `demo/out/result.json`.

The in-memory store and queue reset when the process exits. There is no real learner, speech model, database, queue server or remote LLM in this run. `node --import tsx demo/run.ts` is an alternative when the `tsx` CLI cannot create its IPC socket.
