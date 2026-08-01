import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middlewares/validate.middleware';
import { uuidParam } from '../validators/common.validator';
import { createSourceSchema, listSourcesSchema } from '../validators/income.validator';
import * as controller from '../controllers/income.controller';

const router = Router();

router.get('/', validate({ query: listSourcesSchema }), asyncHandler(controller.listSources));

router.post('/', validate({ body: createSourceSchema }), asyncHandler(controller.createSource));

router.get('/:id', validate({ params: uuidParam() }), asyncHandler(controller.getSource));

router.patch(
  '/:id',
  validate({ params: uuidParam(), body: createSourceSchema }),
  asyncHandler(controller.updateSource)
);

router.delete('/:id', validate({ params: uuidParam() }), asyncHandler(controller.removeSource));

export default router;
