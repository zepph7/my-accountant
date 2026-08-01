import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middlewares/validate.middleware';
import {
  createOverviewSchema,
  currentOverviewSchema,
  listOverviewSchema,
} from '../validators/overview.validator';
import * as controller from '../controllers/overview.controller';

const router = Router();

/**
 * No PATCH and no DELETE: `overview` is an append-only ledger of the moments
 * the user counted their money. Correcting a snapshot means recording a new
 * one, which is also what keeps the derived balances honest.
 */
router.get('/', validate({ query: listOverviewSchema }), asyncHandler(controller.list));
router.get(
  '/current',
  validate({ query: currentOverviewSchema }),
  asyncHandler(controller.current)
);
router.post('/', validate({ body: createOverviewSchema }), asyncHandler(controller.create));

export default router;
