import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middlewares/validate.middleware';
import { uuidParam } from '../validators/common.validator';
import {
  createExpenseSchema,
  listExpensesSchema,
  updateExpenseSchema,
} from '../validators/expense.validator';
import * as controller from '../controllers/expense.controller';

const router = Router();

router.get('/', validate({ query: listExpensesSchema }), asyncHandler(controller.list));
router.post('/', validate({ body: createExpenseSchema }), asyncHandler(controller.create));
router.get('/:id', validate({ params: uuidParam() }), asyncHandler(controller.getById));
router.patch(
  '/:id',
  validate({ params: uuidParam(), body: updateExpenseSchema }),
  asyncHandler(controller.update)
);
router.delete('/:id', validate({ params: uuidParam() }), asyncHandler(controller.remove));

export default router;
