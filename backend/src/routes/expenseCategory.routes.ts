import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middlewares/validate.middleware';
import { uuidParam } from '../validators/common.validator';
import {
  createExpenseCategorySchema,
  listExpenseCategoriesSchema,
} from '../validators/expense.validator';
import * as controller from '../controllers/expense.controller';

const router = Router();

router.get(
  '/',
  validate({ query: listExpenseCategoriesSchema }),
  asyncHandler(controller.listCategories)
);
router.post(
  '/',
  validate({ body: createExpenseCategorySchema }),
  asyncHandler(controller.createCategory)
);
router.get('/:id', validate({ params: uuidParam() }), asyncHandler(controller.getCategory));
router.patch(
  '/:id',
  validate({ params: uuidParam(), body: createExpenseCategorySchema }),
  asyncHandler(controller.updateCategory)
);
router.delete('/:id', validate({ params: uuidParam() }), asyncHandler(controller.removeCategory));

export default router;
