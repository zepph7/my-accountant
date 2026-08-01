import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/ApiError';

interface Schemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Validates and REPLACES req.body/params/query with the parsed result.
 *
 * Replacing matters: Zod strips unknown keys by default, so downstream code
 * sees only declared fields. That is what stops a client from smuggling
 * `{ "role": "admin" }` or `{ "user_id": "<someone else>" }` into a create
 * payload and having it reach an INSERT.
 *
 * req.query is a getter in Express 5 and cannot be assigned, so the parsed
 * value goes on `res.locals.query` instead — handlers read it from there.
 */
export const validate =
  (schemas: Schemas) => (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) res.locals.query = schemas.query.parse(req.query);
      return next();
    } catch (err) {
      const issues = (err as { issues?: { path: (string | number)[]; message: string }[] }).issues;

      if (!issues) return next(err);

      return next(
        ApiError.badRequest(
          'Validation failed',
          issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message }))
        )
      );
    }
  };
