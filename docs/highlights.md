# If you have ten minutes: eight places to start

1. [Job pipeline](../src/llm/job-pipeline.ts#L55): follow job states, structured validation and error-driven retry.
   The in-memory queue also shows the scope of its idempotency key.
2. [Local CLI worker](../src/llm/local-cli-worker.ts#L59): inspect subprocess bounds, cancellation and timeout.
   Provider fallback is implemented in the same file.
3. [Session pack](../src/report/session-pack.ts#L61): see bounded context and deterministic hashing.
   Its inputs are simplified relative to the private service.
4. [Report extraction](../src/report/report-extract.ts#L24): inspect delimiter and versioned schema validation.
   Errors avoid echoing submitted evidence.
5. [Report import](../src/report/report-import.ts#L101): follow ownership, preview and explicit confirmation.
   Its store serializes transactions in one process only.
6. [XP policy](../src/game/xp-policy.ts#L308): inspect evidence-aware classification and scoring.
   Missing timing does not become invented evidence.
7. [Confirmation UI](../src/web/ReportConfirmation.tsx#L51): examine the human review boundary.
   It is a representative component rather than a complete application.
8. [Voice service](../services/voice/main.py#L82): inspect injected speech providers and bounded failures.
   The bundled providers are synthetic, with no model inference.
