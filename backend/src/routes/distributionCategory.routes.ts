import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middlewares/validate.middleware';
import { uuidParam } from '../validators/common.validator';
import {
  createDistributionCategorySchema,
  listDistributionCategoriesSchema,
  updateDistributionCategorySchema,
} from '../validators/distributionCategory.validator';
import * as controller from '../controllers/distributionCategory.controller';

const router = Router();

router.get('/', validate({ query: listDistributionCategoriesSchema }), asyncHandler(controller.list));
router.post(
  '/',
  validate({ body: createDistributionCategorySchema }),
  asyncHandler(controller.create)
);
router.get('/:id', validate({ params: uuidParam() }), asyncHandler(controller.getById));
router.patch(
  '/:id',
  validate({ params: uuidParam(), body: updateDistributionCategorySchema }),
  asyncHandler(controller.update)
);
router.delete('/:id', validate({ params: uuidParam() }), asyncHandler(controller.remove));

export default router;
