export class AppError extends Error {
  modelDiagnostics?: {
    requestId?: string;
    finishReason: string | null;
    maxCompletionTokens: number;
    responseChars: number;
    usage: Record<string, number>;
  };
  // Schema metadata (field paths + issue codes) for model-feedback retries. Never model values.
  schemaIssues?: { path: string; code: string }[];
  constructor(
    public code: string,
    public status = 400,
    message = code,
  ) {
    super(message);
  }
}
export function assert(condition: unknown, code: string, status = 400): asserts condition {
  if (!condition) throw new AppError(code, status);
}
