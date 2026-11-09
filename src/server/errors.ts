import "server-only";

/**
 * Error model (ENGINEERING §5): stable codes, one HTTP status and one default UK-English message per code,
 * all here. Expected failures travel as `Result` values; unexpected ones are caught at the action/route
 * boundary, logged with the request id and shown as INTERNAL's message.
 */
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "MFA_REQUIRED"
  | "REAUTH_REQUIRED"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "LIMIT_REACHED"
  | "PLAN_RESTRICTED"
  | "RATE_LIMITED"
  | "INTERNAL";

export const ERROR_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  MFA_REQUIRED: 403,
  REAUTH_REQUIRED: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  LIMIT_REACHED: 403,
  PLAN_RESTRICTED: 402,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You don't have access to this.",
  MFA_REQUIRED: "Please confirm it's you with your authenticator app.",
  REAUTH_REQUIRED: "For your security, please sign in again.",
  NOT_FOUND: "We couldn't find that.",
  VALIDATION: "Please check the highlighted fields.",
  CONFLICT: "That has just changed. Please refresh and try again.",
  LIMIT_REACHED: "That's over the limit allowed here.",
  PLAN_RESTRICTED: "This isn't included in the shop's current plan.",
  RATE_LIMITED: "Too many attempts. Please try again in a minute.",
  INTERNAL: "Something went wrong. Please try again.",
};

/** Typed error with a user-safe message (defaults to the code's message). Never put internals in `message`. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: AppErrorCode,
    message: string = ERROR_MESSAGES[code],
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = ERROR_STATUS[code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

export type ResultError<E extends AppErrorCode = AppErrorCode> = {
  code: E;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

/** What every action returns (ENGINEERING §4 step 7). */
export type Result<T, E extends AppErrorCode = AppErrorCode> =
  { ok: true; data: T } | { ok: false; error: ResultError<E> };

export function errorResult(err: AppError): { ok: false; error: ResultError } {
  return {
    ok: false,
    error: {
      code: err.code,
      message: err.message,
      ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
    },
  };
}
