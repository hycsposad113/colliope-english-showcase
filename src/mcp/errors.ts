// Extracted from a larger private codebase (CALLIOPE). Source: apps/mcp/src/errors.ts; adapted: standalone error type
export class CalliopeClientError extends Error {
  constructor(
    message: string,
    readonly code:
      | "API_UNAVAILABLE"
      | "API_IDENTITY_MISMATCH"
      | "API_RESPONSE_INVALID"
      | "API_RESPONSE_TOO_LARGE"
      | "API_REQUEST_FAILED",
  ) {
    super(message);
    this.name = "CalliopeClientError";
  }
}
