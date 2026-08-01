import type { Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { buildPagination, created, ok, paginated } from '../utils/ApiResponse';
import * as service from '../services/distributionCategory.service';

const requireUser = (req: Request) => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
};

const requireId = (req: Request): string => {
  const value = req.params.id;
  if (typeof value !== 'string') throw ApiError.badRequest('Invalid identifier');
  return value;
};

interface ListQuery {
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  search?: string;
}

export const list = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const q = res.locals.query as ListQuery;

  const [{ rows, total }, totalPercentage] = await Promise.all([
    service.list(user.id, q),
    service.summary(user.id),
  ]);

  return paginated(
    res,
    { data: rows, pagination: buildPagination(q.page, q.limit, total) },
    undefined,
    { totalPercentage }
  );
};

export const getById = async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await service.getById(user.id, requireId(req)));
};

export const create = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await service.create(user.id, req.body);
  return created(
    res,
    { ...(result.data as object), totalPercentage: result.totalPercentage },
    result.warning ?? 'Distribution category created'
  );
};

export const update = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await service.update(user.id, requireId(req), req.body);
  return ok(
    res,
    { ...(result.data as object), totalPercentage: result.totalPercentage },
    result.warning ?? 'Distribution category updated'
  );
};

/**
 * Returns 200 with the new total rather than a bare 204.
 *
 * Removing a category almost always breaks the 100% total, and a 204 has
 * nowhere to say so — the client would have to guess that it should re-fetch.
 */
export const remove = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await service.remove(user.id, requireId(req));
  return ok(
    res,
    { totalPercentage: result.totalPercentage },
    result.warning ?? 'Distribution category removed'
  );
};
