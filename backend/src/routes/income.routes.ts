import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middlewares/validate.middleware';
import { uuidParam } from '../validators/common.validator';
import {
  createIncomeSchema,
  listIncomesSchema,
  updateIncomeSchema,
} from '../validators/income.validator';
import * as controller from '../controllers/income.controller';

// Mounted behind `authenticate` in routes/index.ts — every handler here is
// user-scoped and there is no unauthenticated path into it.
const router = Router();

router.get('/', validate({ query: listIncomesSchema }), asyncHandler(controller.list));

router.post('/', validate({ body: createIncomeSchema }), asyncHandler(controller.create));

router.get('/:id', validate({ params: uuidParam() }), asyncHandler(controller.getById));

router.patch(
  '/:id',
  validate({ params: uuidParam(), body: updateIncomeSchema }),
  asyncHandler(controller.update)
);

router.delete('/:id', validate({ params: uuidParam() }), asyncHandler(controller.remove));

export default router;
