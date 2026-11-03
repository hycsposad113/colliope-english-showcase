# Architecture

```mermaid
flowchart LR
  Web[React UI] --> Client[HTTP client / bridge]
  Client --> Jobs[Job pipeline]
  Jobs --> CLI[CLI port]
  Jobs --> Contracts[Zod contracts]
  Client --> Pack[Session pack]
  Pack --> Voice[Voice provider port]
  Voice --> Report[Extraction and preview]
  Report --> Confirm[Human confirmation]
  Confirm --> Store[In-memory transaction]
  Store --> XP[XP policy]
```

The offline demo assembles these components in one process. The UI, bridge and voice HTTP service are separate examples and are not started by the demo. The original application used locally authenticated CLI tools; the demonstration invokes a synthetic provider.

```mermaid
sequenceDiagram
  participant U as Learner
  participant J as Job pipeline
  participant L as Fake CLI
  participant V as Zod
  participant R as Report service
  U->>J: Request proposal
  J->>L: Prompt
  L-->>J: Invalid structured output
  J->>V: Validate
  V-->>J: Field errors
  J->>L: Original prompt + errors
  L-->>J: Corrected JSON
  J->>V: Validate
  V-->>U: Proposal and session pack
  U->>R: Synthetic report
  R-->>U: Preview
  U->>R: Explicit confirmation
  R-->>U: XP receipt
```

```mermaid
stateDiagram-v2
  [*] --> issued
  issued --> reported: import valid report
  reported --> reported: identical pending replay
  reported --> confirmed: explicit confirmation
  reported --> rejected: reject report
  issued --> expired: expiry
```

The diagram summarizes the demonstrated report path. `rejected` is a report state; expiry is checked against the pack at operation time. Other pack states exist in the implementation.

## Errors and retries

The pipeline validates JSON and schema output, includes field errors in a bounded retry, and records failure or quota waiting. The process adapter bounds input and output and terminates timed-out subprocesses. Report extraction requires one ordered delimiter pair and validates the versioned schema. Import rejects ownership, state and evidence conflicts. A replay of identical pending evidence is idempotent; a confirmed report is not importable again.

## Data recording

The demo stores synthetic jobs, pack, report and XP in process memory and writes a small synthetic result to `demo/out/`. The in-memory report store serializes transactions and commits a copy on success. It is not durable or distributed, and does not establish a production privacy, retention, authorization or database transaction policy. See [extraction map](docs/extraction-map.md) for the boundaries of each adapter.
