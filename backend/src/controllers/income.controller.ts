import type { Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { buildPagination, created, noContent, ok, paginated } from '../utils/ApiResponse';
import * as incomeService from '../services/income.service';
import * as sources from '../repositories/incomeSource.repository';
import type { IncomeFilters } from '../repositories/income.repository';

/**
 * req.user is guaranteed by `authenticate`, but the type is optional so that a
 * route mounted without it fails to compile rather than at runtime. This throws
 * rather than asserting non-null, so a misconfigured route is a clean 401.
 */
const requireUser = (req: Request) => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
};

// Parsed query lives on res.locals because req.query is read-only in Express 5.
const listQuery = <T>(res: Response): T => res.locals.query as T;

/**
 * Express 5 types route params as `string | string[]` — a repeated `:id` in the
 * path would produce an array. The uuid validator already rejects that, but
 * narrowing here keeps the repository signatures honest instead of casting.
 */
const requireId = (req: Request, key = 'id'): string => {
  const value = req.params[key];
  if (typeof value !== 'string') throw ApiError.badRequest('Invalid identifier');
  return value;
};

export const list = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const filters = listQuery<IncomeFilters>(res);
  const { rows, total } = await incomeService.list(user.id, filters);

  return paginated(res, {
    data: rows,
    pagination: buildPagination(filters.page, filters.limit, total),
  });
};

export const getById = async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await incomeService.getById(user.id, requireId(req)));
};

export const create = async (req: Request, res: Response) => {
  const user = requireUser(req);
  return created(res, await incomeService.create(user.id, req.body), 'Income recorded');
};

export const update = async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await incomeService.update(user.id, requireId(req), req.body), 'Income updated');
};

export const remove = async (req: Request, res: Response) => {
  const user = requireUser(req);
  await incomeService.remove(user.id, requireId(req));
  return noContent(res);
};

/* ---------------------------------------------------------------- sources */

export const listSources = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const q = listQuery<{
    page: number;
    limit: number;
    sort: string;
    order: 'asc' | 'desc';
    search?: string;
  }>(res);

  const { rows, total } = await sources.findAll(user.id, q);
  return paginated(res, { data: rows, pagination: buildPagination(q.page, q.limit, total) });
};

export const getSource = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const source = await sources.findById(user.id, requireId(req));
  if (!source) throw ApiError.notFound('Income source not found');
  return ok(res, source);
};

export const createSource = async (req: Request, res: Response) => {
  const user = requireUser(req);
  return created(res, await sources.create(user.id, req.body.name), 'Income source created');
};

export const updateSource = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const source = await sources.update(user.id, requireId(req), req.body.name);
  if (!source) throw ApiError.notFound('Income source not found');
  return ok(res, source, 'Income source updated');
};

export const removeSource = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const deleted = await sources.softDelete(user.id, requireId(req));
  if (!deleted) throw ApiError.notFound('Income source not found');
  return noContent(res);
};
