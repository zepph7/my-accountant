import type { Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { buildPagination, created, ok, paginated } from '../utils/ApiResponse';
import * as service from '../services/overview.service';

const requireUser = (req: Request) => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
};

export const list = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const q = res.locals.query as { page: number; limit: number; order: 'asc' | 'desc' };
  const { rows, total } = await service.list(user.id, q);

  return paginated(res, { data: rows, pagination: buildPagination(q.page, q.limit, total) });
};

export const current = async (req: Request, res: Response) =>
  ok(res, await service.current(requireUser(req).id));

export const create = async (req: Request, res: Response) => {
  const user = requireUser(req);
  return created(res, await service.create(user.id, req.body), 'Balance snapshot recorded');
};
