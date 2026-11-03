// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/common/problem-details.ts; adapted: framework exception and response interfaces replace NestJS and Express.
export interface ProblemDetails { type: string; title: string; status: number; detail: string; instance: string }
export interface HttpExceptionPort { getStatus(): number; getResponse(): unknown }
const titles: Record<number, string> = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error', 503: 'Service Unavailable' };
function isHttpException(value: unknown): value is HttpExceptionPort {
  return typeof value === 'object' && value !== null && 'getStatus' in value && typeof value.getStatus === 'function' && 'getResponse' in value && typeof value.getResponse === 'function';
}
export function toProblemDetails(exception: unknown, instance: string): ProblemDetails {
  const http = isHttpException(exception);
  const status = http ? exception.getStatus() : 500;
  const response = http ? exception.getResponse() : undefined;
  let detail = 'An unexpected error occurred';
  if (typeof response === 'string') detail = response;
  else if (response && typeof response === 'object' && 'message' in response) {
    const message = response.message;
    detail = Array.isArray(message) ? message.join('; ') : String(message);
  } else if (exception instanceof Error && status < 500) detail = exception.message;
  return { type: 'about:blank', title: titles[status] ?? 'Internal Server Error', status, detail, instance };
}
export interface ProblemResponse { status(code: number): ProblemResponse; type(value: string): ProblemResponse; json(value: ProblemDetails): void }
export function writeProblem(exception: unknown, originalUrl: string, response: ProblemResponse): void {
  const problem = toProblemDetails(exception, originalUrl);
  response.status(problem.status).type('application/problem+json').json(problem);
}
