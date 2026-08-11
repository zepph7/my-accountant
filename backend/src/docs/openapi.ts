import { env } from '../config/env';

/**
 * OpenAPI 3.1 description of the API, served at /api/docs.
 *
 * Written by hand rather than generated from the Zod schemas: the validators
 * are the runtime contract and this is the human one, and a generated document
 * tends to describe shapes without ever explaining the rules that make this API
 * what it is — the distribution invariant, the inclusive date bounds, the
 * warning-not-error percentage total. Those live in the descriptions below.
 */

const money = {
  type: 'string',
  pattern: '^\\d+(\\.\\d{1,2})?$',
  example: '1250.00',
  description: 'Decimal string, 2 places. Never a float — see the money notes in the README.',
};

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    description: 'Hard ceiling of 100. Pagination a caller can opt out of is not pagination.',
  },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
];

const rangeParams = [
  {
    name: 'from',
    in: 'query',
    schema: { type: 'string', example: '2026-03-01' },
    description: 'Local wall-clock start, inclusive. Interpreted in the user timezone.',
  },
  {
    name: 'to',
    in: 'query',
    schema: { type: 'string', example: '2026-03-31' },
    description:
      'Local wall-clock end. A bare date covers the WHOLE of that day — `to=2026-03-31` includes the 31st.',
  },
];

const jsonBody = (schema: unknown, required = true) => ({
  required,
  content: { 'application/json': { schema } },
});

const okResponse = (description: string, dataSchema: unknown = { type: 'object' }) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: dataSchema,
        },
      },
    },
  },
});

const listResponse = (description: string, itemRef: string) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'array', items: { $ref: `#/components/schemas/${itemRef}` } },
          pagination: { $ref: '#/components/schemas/Pagination' },
        },
      },
    },
  },
});

const errors = {
  400: { $ref: '#/components/responses/BadRequest' },
  401: { $ref: '#/components/responses/Unauthorized' },
  404: { $ref: '#/components/responses/NotFound' },
};

/** The five CRUD operations shared by every simple named-record resource. */
const crud = (
  tag: string,
  name: string,
  schemaRef: string,
  createRef: string,
  updateRef = createRef
) => ({
  get: {
    tags: [tag],
    summary: `List ${name}`,
    parameters: paginationParams,
    responses: { 200: listResponse(`A page of ${name}`, schemaRef), ...errors },
  },
  post: {
    tags: [tag],
    summary: `Create a ${name.replace(/s$/, '')}`,
    requestBody: jsonBody({ $ref: `#/components/schemas/${createRef}` }),
    responses: { 201: okResponse('Created'), ...errors },
  },
  itemOps: {
    get: {
      tags: [tag],
      summary: `Fetch one`,
      responses: { 200: okResponse('Found'), ...errors },
    },
    patch: {
      tags: [tag],
      summary: `Update`,
      requestBody: jsonBody({ $ref: `#/components/schemas/${updateRef}` }),
      responses: { 200: okResponse('Updated'), ...errors },
    },
    delete: {
      tags: [tag],
      summary: `Soft-delete`,
      responses: { 204: { description: 'Deleted' }, ...errors },
    },
  },
});

const idParam = [
  { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
];

const withIdParam = (item: Record<string, unknown>) => {
  const out: Record<string, unknown> = { parameters: idParam };
  for (const [verb, op] of Object.entries(item)) out[verb] = op;
  return out;
};

const sources = crud('Income sources', 'income sources', 'NamedRecord', 'NameInput');
const expenseCats = crud('Expense categories', 'expense categories', 'NamedRecord', 'NameInput');
const distCats = crud(
  'Distribution',
  'distribution categories',
  'DistributionCategory',
  'DistributionCategoryInput',
  'DistributionCategoryUpdate'
);

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'My Accountant API',
    version: '1.0.0',
    description: [
      'Personal finance API. Income is recorded once and automatically split across',
      'user-configured distribution categories inside a single database transaction;',
      'expenses are recorded freely against their own categories and are never split.',
      '',
      '**Money** is always a decimal string, never a JSON number. Every amount is',
      'NUMERIC in Postgres and is computed on integer cents in the application, so no',
      'value ever passes through a binary float.',
      '',
      '**Tenancy** is enforced in the repository layer: `user_id` is in the WHERE',
      'clause of every financial query. Another user\'s record returns 404, not 403 —',
      'confirming a record exists is itself a leak.',
      '',
      '**Soft deletes** are used throughout. Deleting frees a name for reuse via',
      'partial unique indexes limited to live rows.',
    ].join('\n'),
  },
  servers: [{ url: `http://localhost:${env.port}/api`, description: 'Local' }],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Income' },
    { name: 'Income sources' },
    { name: 'Expenses' },
    { name: 'Expense categories' },
    { name: 'Distribution' },
    { name: 'Overview' },
    { name: 'Reports' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness — never touches the database',
        security: [],
        responses: { 200: okResponse('Process is up') },
      },
    },
    '/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness — 503 when the database is unreachable',
        security: [],
        responses: { 200: okResponse('Ready'), 503: { description: 'Degraded' } },
      },
    },

    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register, seeding the default 60/20/10/10 distribution',
        security: [],
        requestBody: jsonBody({ $ref: '#/components/schemas/RegisterInput' }),
        responses: { 201: okResponse('Registered'), 400: errors[400], 409: { description: 'Email taken' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Exchange credentials for an access + refresh token pair',
        security: [],
        requestBody: jsonBody({ $ref: '#/components/schemas/LoginInput' }),
        responses: { 200: okResponse('Authenticated'), 401: errors[401] },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh token',
        description:
          'Refresh tokens are single-use. Presenting one twice is treated as theft: the entire token chain for that user is revoked.',
        security: [],
        requestBody: jsonBody({ $ref: '#/components/schemas/RefreshInput' }, false),
        responses: { 200: okResponse('Rotated'), 401: errors[401] },
      },
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Revoke the current refresh token (idempotent)', responses: { 204: { description: 'Logged out' } } },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The authenticated user',
        description: 'Read fresh from the database, so it includes phone and name — not just the token claims.',
        responses: { 200: okResponse('Current user'), 401: errors[401] },
      },
      patch: {
        tags: ['Auth'],
        summary: 'Update your own profile',
        description:
          'Partial update; at least one field required. `email` is not updatable here — it is the key ' +
          'Google sign-in matches on, so changing it needs a verification flow rather than a PATCH. ' +
          'A changed `timezone` only affects reports once the access token is refreshed, because the ' +
          'zone is a JWT claim and authentication does not query the database per request.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProfileInput' } } },
        },
        responses: {
          200: okResponse('Updated user'),
          400: errors[400],
          401: errors[401],
          409: { description: 'That phone number belongs to another account.' },
        },
      },
    },
    '/auth/google': {
      get: { tags: ['Auth'], summary: 'Begin the Google OAuth 2.0 handshake', security: [], responses: { 302: { description: 'Redirect to Google' } } },
    },
    '/auth/google/callback': {
      get: { tags: ['Auth'], summary: 'OAuth callback (state-verified)', security: [], responses: { 302: { description: 'Redirect to the client' } } },
    },

    '/income-sources': { get: sources.get, post: sources.post },
    '/income-sources/{id}': withIdParam(sources.itemOps),

    '/incomes': {
      get: {
        tags: ['Income'],
        summary: 'List income',
        parameters: [
          ...paginationParams,
          ...rangeParams,
          { name: 'sourceId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'wallet', in: 'query', schema: { $ref: '#/components/schemas/Wallet' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['date', 'amount', 'created_at'] } },
        ],
        responses: { 200: listResponse('A page of income', 'Income'), ...errors },
      },
      post: {
        tags: ['Income'],
        summary: 'Record income and distribute it',
        description: [
          'Creates the income and its splits in ONE transaction. A persisted income with',
          'no splits is corrupt data, so either both land or neither does.',
          '',
          'Splits are floored in basis points and the remainder is given to the largest',
          'category, so the parts sum EXACTLY to the whole — no rounding dust.',
          '',
          'If the configured percentages do not total 100 the response carries a',
          '`warning`; it is never an error, because a user mid-edit is a normal state.',
        ].join('\n'),
        requestBody: jsonBody({ $ref: '#/components/schemas/IncomeInput' }),
        responses: { 201: okResponse('Recorded, with its distribution'), ...errors },
      },
    },
    '/incomes/{id}': {
      parameters: idParam,
      get: { tags: ['Income'], summary: 'Fetch income with its distribution', responses: { 200: okResponse('Found'), ...errors } },
      patch: {
        tags: ['Income'],
        summary: 'Update income, recomputing splits when the amount changes',
        description:
          'Recomputation uses the CURRENT percentages, not the ones originally applied — editing an income is a correction, and it should reflect how the user budgets now.',
        requestBody: jsonBody({ $ref: '#/components/schemas/IncomeUpdate' }),
        responses: { 200: okResponse('Updated'), ...errors },
      },
      delete: { tags: ['Income'], summary: 'Soft-delete the income and its splits together', responses: { 204: { description: 'Deleted' }, ...errors } },
    },

    '/expense-categories': { get: expenseCats.get, post: expenseCats.post },
    '/expense-categories/{id}': withIdParam(expenseCats.itemOps),

    '/expenses': {
      get: {
        tags: ['Expenses'],
        summary: 'List expenses',
        parameters: [
          ...paginationParams,
          ...rangeParams,
          { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'wallet', in: 'query', schema: { $ref: '#/components/schemas/Wallet' } },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Matches description or payee.' },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['occurred_at', 'amount', 'created_at'] } },
        ],
        responses: { 200: listResponse('A page of expenses', 'Expense'), ...errors },
      },
      post: {
        tags: ['Expenses'],
        summary: 'Record an expense',
        description:
          'Expenses are NOT distributed — the spec is explicit that they are spent freely against a category. `occurredAt` accepts a full timestamp (which is what makes the hourly report possible) or a bare date when the time is unknown.',
        requestBody: jsonBody({ $ref: '#/components/schemas/ExpenseInput' }),
        responses: { 201: okResponse('Recorded'), ...errors },
      },
    },
    '/expenses/{id}': {
      parameters: idParam,
      get: { tags: ['Expenses'], summary: 'Fetch one', responses: { 200: okResponse('Found'), ...errors } },
      patch: { tags: ['Expenses'], summary: 'Update', requestBody: jsonBody({ $ref: '#/components/schemas/ExpenseUpdate' }), responses: { 200: okResponse('Updated'), ...errors } },
      delete: { tags: ['Expenses'], summary: 'Soft-delete', responses: { 204: { description: 'Deleted' }, ...errors } },
    },

    '/distribution-categories': {
      get: {
        tags: ['Distribution'],
        summary: 'List distribution categories with their percentage total',
        parameters: paginationParams,
        responses: { 200: listResponse('A page of categories', 'DistributionCategory'), ...errors },
      },
      post: distCats.post,
    },
    '/distribution-categories/{id}': withIdParam({
      ...distCats.itemOps,
      delete: {
        tags: ['Distribution'],
        summary: 'Retire a category',
        description:
          'Soft-delete. Past splits are left untouched — they are the record of how income was actually divided. Returns 200 with the new percentage total rather than 204, because removing a category almost always breaks 100%.',
        responses: { 200: okResponse('Retired, with the new total'), ...errors },
      },
    }),

    '/overview': {
      get: { tags: ['Overview'], summary: 'Snapshot history', parameters: paginationParams, responses: { 200: listResponse('Snapshots', 'Overview'), ...errors } },
      post: {
        tags: ['Overview'],
        summary: 'Record a balance snapshot',
        description:
          'Append-only. There is no PATCH and no DELETE — a reconciliation you can edit after the fact is not a reconciliation. Correcting means recording a new snapshot.',
        requestBody: jsonBody({ $ref: '#/components/schemas/OverviewInput' }),
        responses: { 201: okResponse('Recorded'), ...errors },
      },
    },
    '/overview/current': {
      get: {
        tags: ['Overview'],
        summary: 'Live derived balances per wallet',
        description:
          'Latest snapshot + everything recorded since. The cut-off is `created_at`, not the business date: the snapshot is what the user actually counted, so only entries made afterwards move the balance.',
        responses: { 200: okResponse('Derived balances'), ...errors },
      },
    },

    '/reports/summary': {
      get: {
        tags: ['Reports'],
        summary: 'Income, expenses, net, and the distribution breakdown',
        description: 'Defaults to the current calendar month in the user timezone.',
        parameters: rangeParams,
        responses: { 200: okResponse('Summary'), ...errors },
      },
    },
    '/reports/distribution': {
      get: {
        tags: ['Reports'],
        summary: 'Configured percentages vs. what was actually applied',
        description:
          'The two legitimately differ: `percentage_applied` is snapshotted onto each split, so a category whose percentage changed mid-period shows an effective share matching neither the old nor the new setting.',
        parameters: rangeParams,
        responses: { 200: okResponse('Distribution report'), ...errors },
      },
    },
    '/reports/cashflow': {
      get: {
        tags: ['Reports'],
        summary: 'Income vs. expenses per period, gap-filled',
        description:
          'Every bucket in the window is returned, including empty ones — a series with holes draws a chart that hides the quiet month. Hourly is deliberately NOT offered here: income carries no time of day, so an hourly cashflow would stack every paycheque at midnight. Use /reports/expenses for that.',
        parameters: [
          { name: 'groupBy', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month', 'year'], default: 'month' } },
          ...rangeParams,
        ],
        responses: { 200: okResponse('Cashflow series'), ...errors },
      },
    },
    '/reports/expenses': {
      get: {
        tags: ['Reports'],
        summary: 'Expense breakdown, down to hourly',
        description:
          'Bucketed with `occurred_at AT TIME ZONE <user timezone>`, so a 01:00 local purchase lands on the local day rather than the previous UTC one.',
        parameters: [
          { name: 'groupBy', in: 'query', schema: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'year'], default: 'day' } },
          ...rangeParams,
          { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'wallet', in: 'query', schema: { $ref: '#/components/schemas/Wallet' } },
        ],
        responses: { 200: okResponse('Expense series'), ...errors },
      },
    },
    '/dashboard': {
      get: {
        tags: ['Reports'],
        summary: 'Derived balances, current month, and recent activity in one read',
        responses: { 200: okResponse('Dashboard'), ...errors },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    responses: {
      BadRequest: { description: 'Validation failed. Unknown fields are rejected, not ignored.' },
      Unauthorized: { description: 'Missing, malformed, or expired access token.' },
      NotFound: {
        description:
          "Not found. Also returned for another user's record — confirming existence would itself leak.",
      },
    },
    schemas: {
      Wallet: { type: 'string', enum: ['cash', 'account', 'mpesa'] },
      Money: money,
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['email', 'phone', 'password', 'firstName', 'lastName'],
        description:
          'Both an email and a phone number are required. The email is what lets a later ' +
          'Google sign-in link to this account instead of creating a duplicate; the phone ' +
          'is the key for phone-based features. Accounts created via Google OAuth have no ' +
          'phone — that path does not go through this endpoint.',
        properties: {
          email: { type: 'string', format: 'email' },
          password: {
            type: 'string',
            minLength: 10,
            maxLength: 72,
            description: 'Capped at 72 because bcrypt truncates beyond 72 bytes.',
          },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          timezone: { type: 'string', example: 'Africa/Nairobi', description: 'IANA name; validated against the tz database.' },
          phone: {
            type: 'string',
            example: '+254712345678',
            description:
              'Required and unique. Must be E.164 — separators are stripped, but local ' +
              'formats like 0712345678 are rejected rather than guessed at, since ' +
              'inferring a country code can silently claim someone else’s number.',
          },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['password'],
        description:
          'Supply exactly one of `email` or `phone`, plus the password. Sending both is a 400.',
        properties: {
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', example: '+254712345678' },
          password: { type: 'string' },
        },
        oneOf: [{ required: ['email'] }, { required: ['phone'] }],
      },
      UpdateProfileInput: {
        type: 'object',
        minProperties: 1,
        description: 'At least one field. Omitted fields are left unchanged.',
        properties: {
          phone: { type: 'string', example: '+254712345678', description: 'E.164; must not belong to another account.' },
          firstName: { type: 'string', maxLength: 100 },
          lastName: { type: 'string', maxLength: 100 },
          timezone: { type: 'string', example: 'Africa/Nairobi' },
        },
      },
      RefreshInput: {
        type: 'object',
        properties: { refreshToken: { type: 'string', description: 'Optional — the httpOnly cookie is used when omitted.' } },
      },
      NameInput: { type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 255 } } },
      NamedRecord: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Income: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          date: { type: 'string', format: 'date' },
          amount: money,
          notes: { type: 'string', nullable: true },
          wallet: { $ref: '#/components/schemas/Wallet' },
          source_name: { type: 'string', nullable: true },
        },
      },
      IncomeInput: {
        type: 'object',
        required: ['date', 'amount'],
        properties: {
          sourceId: { type: 'string', format: 'uuid', nullable: true },
          date: { type: 'string', format: 'date' },
          amount: money,
          notes: { type: 'string', nullable: true },
          wallet: { $ref: '#/components/schemas/Wallet' },
        },
      },
      IncomeUpdate: {
        type: 'object',
        minProperties: 1,
        properties: {
          sourceId: { type: 'string', format: 'uuid', nullable: true },
          date: { type: 'string', format: 'date' },
          amount: money,
          notes: { type: 'string', nullable: true },
          wallet: { $ref: '#/components/schemas/Wallet' },
        },
      },
      Expense: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          occurred_at: { type: 'string', format: 'date-time' },
          amount: money,
          description: { type: 'string', nullable: true },
          payee: { type: 'string', nullable: true },
          wallet: { $ref: '#/components/schemas/Wallet' },
          category_name: { type: 'string', nullable: true },
        },
      },
      ExpenseInput: {
        type: 'object',
        required: ['occurredAt', 'amount'],
        properties: {
          categoryId: { type: 'string', format: 'uuid', nullable: true },
          occurredAt: { type: 'string', example: '2026-03-16T01:30:00+03:00', description: 'RFC 3339 timestamp, or a bare date.' },
          amount: money,
          description: { type: 'string', nullable: true },
          payee: { type: 'string', nullable: true },
          wallet: { $ref: '#/components/schemas/Wallet' },
        },
      },
      ExpenseUpdate: {
        type: 'object',
        minProperties: 1,
        properties: {
          categoryId: { type: 'string', format: 'uuid', nullable: true },
          occurredAt: { type: 'string' },
          amount: money,
          description: { type: 'string', nullable: true },
          payee: { type: 'string', nullable: true },
          wallet: { $ref: '#/components/schemas/Wallet' },
        },
      },
      DistributionCategory: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          percentage: { type: 'string', example: '60.00' },
        },
      },
      DistributionCategoryInput: {
        type: 'object',
        required: ['name', 'percentage'],
        properties: {
          name: { type: 'string', maxLength: 255 },
          percentage: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
            example: '20.00',
            description:
              'A total other than 100% across all categories is a WARNING, never an error — editing a set of percentages has to pass through invalid intermediate states.',
          },
        },
      },
      DistributionCategoryUpdate: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: { type: 'string' },
          percentage: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        },
      },
      Overview: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          cash_wallet: money,
          account_balance: money,
          mpesa_balance: money,
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      OverviewInput: {
        type: 'object',
        properties: {
          cashWallet: { ...money, default: '0.00' },
          accountBalance: { ...money, default: '0.00' },
          mpesaBalance: { ...money, default: '0.00' },
        },
      },
    },
  },

  security: [{ bearerAuth: [] }],
};

export default openApiDocument;
