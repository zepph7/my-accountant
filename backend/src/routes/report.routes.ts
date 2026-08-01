import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middlewares/validate.middleware';
import {
  cashflowReportSchema,
  distributionReportSchema,
  expenseReportSchema,
  summaryReportSchema,
} from '../validators/report.validator';
import * as controller from '../controllers/report.controller';

const router = Router();

router.get('/summary', validate({ query: summaryReportSchema }), asyncHandler(controller.summary));
router.get(
  '/distribution',
  validate({ query: distributionReportSchema }),
  asyncHandler(controller.distribution)
);
router.get(
  '/cashflow',
  validate({ query: cashflowReportSchema }),
  asyncHandler(controller.cashflow)
);
/**
 * The addendum's daily/hourly breakdown. It lives on its own path rather than
 * as a granularity of /cashflow because income has no time of day to report at
 * that resolution — see report.validator.
 */
router.get(
  '/expenses',
  validate({ query: expenseReportSchema }),
  asyncHandler(controller.expenses)
);

export default router;
