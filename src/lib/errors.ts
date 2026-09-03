/**
 * A validation failure with per-field messages, for form display.
 *
 * Replaces the old server-side ApiError.fieldErrors now that writes happen
 * entirely on the device — see useSave (src/hooks/use-save.ts), which reads
 * this exact shape.
 */
export class ValidationError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** A business rule the caller broke (an invariant, not a form mistake). */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
