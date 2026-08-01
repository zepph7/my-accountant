import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middlewares/validate.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import { authLimiter } from '../middlewares/rateLimiter.middleware';
import { loginSchema, refreshSchema, registerSchema } from '../validators/auth.validator';
import * as controller from '../controllers/auth.controller';

const router = Router();

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(controller.register)
);

router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));

// Not rate-limited by authLimiter: a legitimate client refreshes on a schedule,
// and reuse detection already handles the abuse case.
router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(controller.refresh));

router.post('/logout', validate({ body: refreshSchema }), asyncHandler(controller.logout));

router.get('/me', authenticate, asyncHandler(controller.me));

router.get('/google', asyncHandler(controller.googleRedirect));
router.get('/google/callback', asyncHandler(controller.googleCallback));

export default router;
