import { NextResponse } from "next/server";

/**
 * Standard API Response Utilities
 *
 * Provides consistent response formats across all API endpoints.
 */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

// Standard error codes
export const ErrorCodes = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PLAN_LIMIT: "PLAN_LIMIT",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/**
 * Create a successful response
 */
export function success<T>(data: T, meta?: ApiResponse["meta"]): NextResponse {
  const body: ApiResponse<T> = {
    success: true,
    data,
  };

  if (meta) {
    body.meta = meta;
  }

  return NextResponse.json(body);
}

/**
 * Create an error response
 */
export function error(
  code: keyof typeof ErrorCodes | string,
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  const errorObj: ApiError = {
    code,
    message,
  };

  if (details !== undefined) {
    errorObj.details = details;
  }

  const body: ApiResponse = {
    success: false,
    error: errorObj,
  };

  return NextResponse.json(body, { status });
}

/**
 * Common error responses
 */
export const errors = {
  badRequest: (message: string, details?: unknown) =>
    error(ErrorCodes.BAD_REQUEST, message, 400, details),

  unauthorized: (message = "Authentication required") =>
    error(ErrorCodes.UNAUTHORIZED, message, 401),

  forbidden: (message = "Access denied") =>
    error(ErrorCodes.FORBIDDEN, message, 403),

  notFound: (resource = "Resource") =>
    error(ErrorCodes.NOT_FOUND, `${resource} not found`, 404),

  conflict: (message: string) =>
    error(ErrorCodes.CONFLICT, message, 409),

  rateLimited: (retryAfter?: number) => {
    const response = error(
      ErrorCodes.RATE_LIMITED,
      "Rate limit exceeded. Please try again later.",
      429
    );
    if (retryAfter) {
      response.headers.set("Retry-After", retryAfter.toString());
    }
    return response;
  },

  validationError: (details: unknown) =>
    error(ErrorCodes.VALIDATION_ERROR, "Validation failed", 400, details),

  planLimit: (message: string) =>
    error(ErrorCodes.PLAN_LIMIT, message, 403),

  insufficientCredits: (required: number, remaining: number) =>
    error(
      ErrorCodes.INSUFFICIENT_CREDITS,
      `Insufficient credits. Required: ${required}, Remaining: ${remaining}`,
      402
    ),

  internal: (message = "An unexpected error occurred") =>
    error(ErrorCodes.INTERNAL_ERROR, message, 500),
};

/**
 * Pagination configuration
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/**
 * Parse and validate pagination parameters
 */
export function parsePagination(searchParams: URLSearchParams): {
  page: number;
  limit: number;
  skip: number;
} {
  let page = parseInt(searchParams.get("page") || "", 10);
  let limit = parseInt(searchParams.get("limit") || "", 10);

  // Validate and apply defaults
  if (isNaN(page) || page < 1) {
    page = PAGINATION.DEFAULT_PAGE;
  }

  if (isNaN(limit) || limit < 1) {
    limit = PAGINATION.DEFAULT_LIMIT;
  }

  // Apply maximum limit
  if (limit > PAGINATION.MAX_LIMIT) {
    limit = PAGINATION.MAX_LIMIT;
  }

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Create pagination metadata
 */
export function paginationMeta(
  page: number,
  limit: number,
  total: number
): ApiResponse["meta"] {
  return {
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}
