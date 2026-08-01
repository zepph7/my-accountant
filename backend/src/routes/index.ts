import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { checkDatabase } from '../config/db';
import authRoutes from './auth.routes';
import incomeRoutes from './income.routes';
import incomeSourceRoutes from './incomeSource.routes';
import expenseRoutes from './expense.routes';
import expenseCategoryRoutes from './expenseCategory.routes';
import distributionCategoryRoutes from './distributionCategory.routes';
import overviewRoutes from './overview.routes';
import reportRoutes from './report.routes';
import { dashboardSchema } from '../validators/report.validator';
import { validate } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import * as reportController from '../controllers/report.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { openApiDocument } from '../docs/openapi';

const router = Router();

/**
 * /health is a liveness probe — "the process is up". It must never touch the
 * database, or a brief DB blip would make an orchestrator kill a perfectly
 * healthy container.
 *
 * /ready is a readiness probe — "this instance can serve traffic", which does
 * require the database, and returns 503 when it cannot.
 */
router.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime() });
});

router.get('/ready', async (_req, res) => {
  const dbReady = await checkDatabase();
  res.status(dbReady ? 200 : 503).json({
    success: dbReady,
    status: dbReady ? 'ready' : 'degraded',
    checks: { database: dbReady ? 'up' : 'down' },
  });
});

/**
 * Interactive docs. Unauthenticated on purpose — the document describes the
 * contract, it does not expose data, and requiring a token to read the API
 * reference makes the reference useless to anyone integrating against it.
 */
router.get('/docs.json', (_req, res) => {
  res.json(openApiDocument);
});
router.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: 'My Accountant API',
    swaggerOptions: { persistAuthorization: true },
  })
);

router.use('/auth', authRoutes);

// Everything below requires a valid access token. Mounting `authenticate` here
// rather than per-route means a new financial router cannot be added without
// authentication by accident.
router.use('/income-sources', authenticate, incomeSourceRoutes);
router.use('/incomes', authenticate, incomeRoutes);
router.use('/expense-categories', authenticate, expenseCategoryRoutes);
router.use('/expenses', authenticate, expenseRoutes);
router.use('/distribution-categories', authenticate, distributionCategoryRoutes);
router.use('/overview', authenticate, overviewRoutes);
router.use('/reports', authenticate, reportRoutes);

// The dashboard is a single composed read rather than a resource, so it sits at
// the top level instead of under /reports — it is what the client loads first.
router.get(
  '/dashboard',
  authenticate,
  validate({ query: dashboardSchema }),
  asyncHandler(reportController.dashboard)
);

export default router;
