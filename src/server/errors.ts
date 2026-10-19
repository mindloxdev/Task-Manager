/** Typed application errors, mapped to consistent HTTP responses. */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const unauthenticated = (message = "You need to sign in to do that.") =>
  new AppError("UNAUTHENTICATED", message);

export const forbidden = (message = "You do not have permission to do that.") =>
  new AppError("FORBIDDEN", message);

export const notFound = (message = "That record does not exist, or you cannot see it.") =>
  new AppError("NOT_FOUND", message);

export const validation = (message: string, details?: unknown) =>
  new AppError("VALIDATION", message, details);

export const conflict = (message: string) => new AppError("CONFLICT", message);
