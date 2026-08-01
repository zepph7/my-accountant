import type { Response } from 'express';
import type { Paginated, PaginationMeta } from '../types/models';

/**
 * One response shape for the whole API: { success, message?, data? }.
 * Errors use the same envelope (see error.middleware) so clients never have to
 * branch on shape to find out what happened.
 */
export const ok = <T>(res: Response, data: T, message?: string, statusCode = 200) =>
  res.status(statusCode).json({ success: true, ...(message ? { message } : {}), data });

export const created = <T>(res: Response, data: T, message = 'Created') =>
  ok(res, data, message, 201);

export const noContent = (res: Response) => res.status(204).send();

export const buildPagination = (page: number, limit: number, total: number): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});

/**
 * `extra` carries resource-level facts that belong beside the page rather than
 * inside each row — the distribution list, for instance, ships the percentage
 * total so a settings screen can warn without a second request.
 */
export const paginated = <T>(
  res: Response,
  payload: Paginated<T>,
  message?: string,
  extra?: Record<string, unknown>
) => res.status(200).json({ success: true, ...(message ? { message } : {}), ...payload, ...extra });
