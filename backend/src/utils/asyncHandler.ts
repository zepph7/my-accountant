import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so a rejected promise reaches the error
 * middleware.
 *
 * Express 5 forwards rejections automatically, but only for handlers it
 * recognises as returning a promise. Wrapping explicitly keeps behaviour
 * identical regardless of how the handler is written, and means a forgotten
 * try/catch surfaces as a 500 through the normal path rather than an
 * unhandled rejection that kills the process.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
