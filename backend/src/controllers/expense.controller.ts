import type { Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { buildPagination, created, noContent, ok, paginated } from '../utils/ApiResponse';
import * as expenseService from '../services/expense.service';
import * as categories from '../repositories/expenseCategory.repository';
import type { ExpenseFilters } from '../repositories/expense.repository';

const requireUser = (req: Request) => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
};

const requireId = (req: Request, key = 'id'): string => {
  const value = req.params[key];
  if (typeof value !== 'string') throw ApiError.badRequest('Invalid identifier');
  return value;
};

const listQuery = <T>(res: Response): T => res.locals.query as T;

export const list = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const filters = listQuery<ExpenseFilters>(res);
  const { rows, total } = await expenseService.list(user.id, filters);

  return paginated(res, {
    data: rows,
    pagination: buildPagination(filters.page, filters.limit, total),
  });
};

export const getById = async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await expenseService.getById(user.id, requireId(req)));
};

export const create = async (req: Request, res: Response) => {
  const user = requireUser(req);
  // The timezone comes from the token so the overspend alert measures "this
  // month" the way the user experiences it.
  return created(
    res,
    await expenseService.create(user.id, req.body, user.timezone),
    'Expense recorded'
  );
};

export const update = async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await expenseService.update(user.id, requireId(req), req.body), 'Expense updated');
};

export const remove = async (req: Request, res: Response) => {
  const user = requireUser(req);
  await expenseService.remove(user.id, requireId(req));
  return noContent(res);
};

/* ------------------------------------------------------------- categories */

export const listCategories = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const q = listQuery<{
    page: number;
    limit: number;
    sort: string;
    order: 'asc' | 'desc';
    search?: string;
  }>(res);

  const { rows, total } = await categories.findAll(user.id, q);
  return paginated(res, { data: rows, pagination: buildPagination(q.page, q.limit, total) });
};

export const getCategory = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const category = await categories.findById(user.id, requireId(req));
  if (!category) throw ApiError.notFound('Expense category not found');
  return ok(res, category);
};

export const createCategory = async (req: Request, res: Response) => {
  const user = requireUser(req);
  return created(res, await categories.create(user.id, req.body.name), 'Expense category created');
};

export const updateCategory = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const category = await categories.update(user.id, requireId(req), req.body.name);
  if (!category) throw ApiError.notFound('Expense category not found');
  return ok(res, category, 'Expense category updated');
};

export const removeCategory = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const deleted = await categories.softDelete(user.id, requireId(req));
  if (!deleted) throw ApiError.notFound('Expense category not found');
  return noContent(res);
};
