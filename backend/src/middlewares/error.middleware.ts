import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { captureError } from '../config/sentry';
import { ApiError } from '../utils/ApiError';

/**
 * Maps Postgres SQLSTATEs onto HTTP status codes.
 *
 * Without this a duplicate email surfaces as a 500 and the client cannot tell a
 * bug from "that address is taken". The messages are intentionally generic —
 * the driver's own message quotes constraint names and column values, which
 * leaks schema internals to anyone probing the API.
 */
const PG_ERROR_MAP: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'That record already exists' },
  '23503': { status: 409, message: 'Related record does not exist or is still referenced' },
  '23514': { status: 422, message: 'A value violates a database constraint' },
  '22P02': { status: 400, message: 'Malformed identifier' },
  '23502': { status: 400, message: 'A required field is missing' },
};

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  // Required for Express to register this as an error handler — its 4-arity is
  // the signal. Removing it silently turns this into a normal middleware.
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal server error';
  let errors: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else {
    const code = (err as { code?: string }).code;
    const mapped = code ? PG_ERROR_MAP[code] : undefined;
    if (mapped) {
      statusCode = mapped.status;
      message = mapped.message;
    }
  }

  const log = statusCode >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
  log(
    { err, statusCode, method: req.method, url: req.originalUrl, userId: req.user?.id },
    'request failed'
  );

  /**
   * Only 5xx reaches Sentry. A 404 or a rejected password is the system working
   * as designed — reporting those would bury the failures that matter under
   * routine client mistakes.
   */
  if (statusCode >= 500) {
    captureError(err, {
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.id,
      requestId: res.getHeader('x-request-id'),
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
    // Stack traces expose file paths and internal structure. Never in prod.
    ...(env.isProduction ? {} : { stack: err.stack }),
  });
};
