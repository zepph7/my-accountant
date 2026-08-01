import type { Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { ok } from '../utils/ApiResponse';
import * as reportService from '../services/report.service';
import type {
  CashflowReportQuery,
  ExpenseReportQuery,
  SummaryReportQuery,
} from '../validators/report.validator';

/**
 * Reports are read-only projections of data the user already owns, so these
 * handlers do nothing but pass the authenticated actor through. The actor —
 * never a client-supplied id — is what scopes every query downstream.
 */
const requireActor = (req: Request): reportService.Actor => {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, timezone: req.user.timezone };
};

// Validated query lives on res.locals: req.query is a getter in Express 5.
const query = <T>(res: Response): T => res.locals.query as T;

export const summary = async (req: Request, res: Response) =>
  ok(res, await reportService.summary(requireActor(req), query<SummaryReportQuery>(res)));

export const distribution = async (req: Request, res: Response) =>
  ok(res, await reportService.distribution(requireActor(req), query<SummaryReportQuery>(res)));

export const cashflow = async (req: Request, res: Response) =>
  ok(res, await reportService.cashflow(requireActor(req), query<CashflowReportQuery>(res)));

export const expenses = async (req: Request, res: Response) =>
  ok(res, await reportService.expenses(requireActor(req), query<ExpenseReportQuery>(res)));

export const dashboard = async (req: Request, res: Response) =>
  ok(res, await reportService.dashboard(requireActor(req)));
