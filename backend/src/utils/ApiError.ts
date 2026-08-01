/**
 * Operational errors — the ones we anticipated and can describe safely to a
 * client. The `isOperational` flag is what lets the error middleware decide
 * between echoing a message and returning a generic 500: anything that is not
 * an ApiError is a bug we did not foresee, and its message may leak internals.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational = true;
  public readonly errors?: unknown;

  constructor(statusCode: number, message: string, errors?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Bad request', errors?: unknown) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }

  /** Semantically valid shape, but the values violate a business rule. */
  static unprocessable(message = 'Unprocessable entity', errors?: unknown) {
    return new ApiError(422, message, errors);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}
