# Graph Report - .  (2026-09-03)

## Corpus Check
- 227 files · ~243,114 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1300 nodes · 2741 edges · 116 communities (79 shown, 37 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.78)
- Token cost: 197,990 input · 0 output

## Community Hubs (Navigation)
- Backend API Routes & Middleware
- Backend Reporting Repository
- Mobile Dashboard & Reports Screens
- Mobile Expense/Income Detail Screens
- Mobile Auth & Profile Screens
- Backend Dev Dependencies
- Backend Config (Env, Logger, Sentry)
- Mobile API Endpoints & Sources Settings
- Flutter Linux Plugin Registrant
- Backend User Repository
- Backend App Bootstrap & Security Middleware
- Backend Expense/Income Controllers
- Mobile Expense/Income List Screens
- Backend DB Config & Overview Repository
- Flutter macOS Plugin Registrant
- Backend Auth Middleware & Google OAuth Service
- Flutter Rewrite Plan & Design Docs
- Mobile Distribution Settings & Forms
- Backend Auth Controller
- Mobile Themed UI Components
- Backend Lint Config (oxlint)
- Backend Expense Service
- Backend Auth Service
- Backend TypeScript Config
- Flutter Counter Demo (lib/main.dart)
- Windows Runner Win32 Window (C++)
- Mobile Package Dependencies
- Backend Package Dependencies
- Backend Architecture Rationale (README)
- Mobile Auth Client & API Base
- Backend NPM Scripts
- Windows Runner Flutter Window (C++)
- Backend OpenAPI Docs
- Mobile Categories Settings & Endpoints
- Backend Income Repository
- Windows Runner Entry Point & Utils
- Mobile Expo App Config
- Backend Expense Controller
- Mobile API Client Core
- Mobile Package.json Metadata
- Mobile TypeScript Config
- Windows Runner Win32Window Lifecycle
- Mobile Root Layout & Theme Colors
- Mobile Web Manifest (PWA)
- Auth Implementation Plan (Backend to Flutter)
- Backend Expense Repository
- Mobile Expo Plugins & External Link
- Windows Runner Win32Window Handle Helpers
- Backend Package.json Metadata
- Backend DistributionCategory Controller
- Backend DistributionCategory Repository
- Backend DistributionCategory Service
- Mobile Lint/TypeScript Dev Dependencies
- Mobile reset-project Script
- Backend ExpenseCategory Repository
- Backend IncomeSource Repository
- Flutter Build Configs (CMake/Lints)
- Mobile Android Adaptive Icon Config
- Flutter Plan: API Client Foundation Tasks
- Mobile Color Palette & Tailwind Config
- Mobile Session Storage
- Flutter Plan: Router, Theme & Integration Tasks
- Backend Migration Runner Script
- Backend Migration: Audit Tables
- Mobile EAS/Router Extra Config
- Mobile Tab Layout & Haptic Tab
- Mobile Metro Bundler Config
- Windows Flutter Plugin Registrant
- Mobile Agent Docs (AGENTS.md/CLAUDE.md)
- Mobile Expo Web Config
- Mobile ESLint Config
- Dependency: bullmq
- Dependency: cookie-parser
- Dependency: cors
- Dependency: dotenv
- Dependency: express
- Dependency: express-rate-limit
- Dependency: jsonwebtoken
- Dependency: socket.io
- Dependency: swagger-ui-express
- Dependency: expo
- Dependency: expo-constants
- Dependency: expo-dev-client
- Dependency: expo-haptics
- Dependency: expo-image
- Dependency: expo-linking
- Dependency: expo-secure-store
- Dependency: expo-splash-screen
- Dependency: expo-status-bar
- Dependency: expo-symbols
- Dependency: expo-system-ui
- Dependency: expo-vector-icons
- Dependency: expo-web-browser
- Dependency: nativewind
- Dependency: react-dom
- Dependency: react-native-community-datetimepicker
- Dependency: react-native-reanimated
- Dependency: react-native-safe-area-context
- Dependency: react-native-screens
- Dependency: react-native-web
- Dependency: react-native-worklets
- CLAUDE.md Graphify Workflow Policy

## God Nodes (most connected - your core abstractions)
1. `useThemeColors()` - 77 edges
2. `request()` - 42 edges
3. `ok()` - 31 edges
4. `ApiError` - 26 edges
5. `Win32Window` - 22 edges
6. `useQuery()` - 21 edges
7. `expo-router` - 20 edges
8. `Pressable` - 19 edges
9. `money()` - 19 edges
10. `My Accountant - Flutter Rewrite (spec overview)` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Pause For Approval After Schema Design` --rationale_for--> `My Accountant Backend API (overview)`  [INFERRED]
  prompt copy.md → backend/README.md
- `Plan Global Constraints` --conceptually_related_to--> `Money Is Never A Float (integer cents)`  [INFERRED]
  docs/superpowers/plans/2026-08-25-flutter-foundation-and-auth.md → backend/README.md
- `Transaction + Rounding Rule For Income Distribution` --rationale_for--> `Distribution Is Atomic And Sums Exactly`  [INFERRED]
  prompt copy.md → backend/README.md
- `Task 6: Signed-Out Handler + AuthInterceptor` --conceptually_related_to--> `Auth: JWT Access/Refresh With Rotation And Theft Detection`  [INFERRED]
  docs/superpowers/plans/2026-08-25-flutter-foundation-and-auth.md → backend/README.md
- `My Accountant - Flutter Rewrite (spec overview)` --references--> `my_accountant Expo/React Native App (overview)`  [EXTRACTED]
  docs/superpowers/specs/2026-08-25-flutter-rewrite-design.md → my_accountant/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Flutter Foundation Phase 0 Tasks (Tasks 1-9)** — docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_1_add_flutter_dependencies, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_2_apiexception, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_3_envelope_unwrap, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_4_session_securesessionstore, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_5_singleflightrefresher, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_6_signedout_handler_authinterceptor, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_7_dio_client_apiclient, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_8_theme_palette_app_theme, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_9_core_providers [EXTRACTED 1.00]
- **Flutter Auth Phase 1 Tasks (Tasks 10-20)** — docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_10_auth_validation, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_11_auth_models_authrepository, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_12_google_auth_service, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_13_auth_data_providers, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_14_authnotifier_authprovider, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_15_router, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_16_main_dart_wiring, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_17_login_screen, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_18_register_screen, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_19_platform_config_google_oauth_url_scheme, docs_superpowers_plans_2026_08_25_flutter_foundation_and_auth_task_20_profile_screen [EXTRACTED 1.00]

## Communities (116 total, 37 thin omitted)

### Community 0 - "Backend API Routes & Middleware"
Cohesion: 0.06
Nodes (61): Schemas, validate(), router, router, router, router, router, router (+53 more)

### Community 1 - "Backend Reporting Repository"
Cohesion: 0.07
Nodes (46): BUCKETS, BucketSpec, CashflowBucket, cashflowSeries(), CategoryTotal, DistributionBucket, distributionSeries(), distributionTotals() (+38 more)

### Community 2 - "Mobile Dashboard & Reports Screens"
Cohesion: 0.09
Nodes (41): DashboardScreen(), QuickAction(), Stat(), WALLET_ICON, CASHFLOW_GRAINS, CashflowReport(), EXPENSE_GRAINS, Figure() (+33 more)

### Community 3 - "Mobile Expense/Income Detail Screens"
Cohesion: 0.10
Nodes (31): ExpenseDetailScreen(), IncomeDetailScreen(), BalancesScreen(), ExpenseForm(), WALLET_OPTIONS, IncomeForm(), WALLET_OPTIONS, NameListScreen() (+23 more)

### Community 4 - "Mobile Auth & Profile Screens"
Cohesion: 0.17
Nodes (29): LoginScreen(), deviceTimezone(), OWN_FIELDS, RegisterScreen(), RootNavigator(), Detail(), ProfileScreen(), AuthNotice() (+21 more)

### Community 5 - "Backend Dev Dependencies"
Cohesion: 0.05
Nodes (39): devDependencies, jest, node-pg-migrate, oxlint, pino-pretty, prettier, supertest, @swc/core (+31 more)

### Community 6 - "Backend Config (Env, Logger, Sentry)"
Cohesion: 0.14
Nodes (25): Env, parsed, schema, Logger, captureError(), closeSentry(), cleanupExpiredTokens(), monthlySummary() (+17 more)

### Community 7 - "Mobile API Endpoints & Sources Settings"
Cohesion: 0.08
Nodes (27): Page, Cashflow, CashflowGranularity, createIncomeSource(), Dashboard, deleteIncomeSource(), DistributionCategory, DistributionPage (+19 more)

### Community 8 - "Flutter Linux Plugin Registrant"
Cohesion: 0.09
Nodes (22): FlPluginRegistry, FlView, GApplication, gboolean, gchar, GObject, GtkApplication, fl_register_plugins() (+14 more)

### Community 9 - "Backend User Repository"
Cohesion: 0.10
Nodes (15): CreateUserInput, Executor, UpdateProfileInput, AccessTokenPayload, AuthenticatedUser, Express, Request, AuditAction (+7 more)

### Community 10 - "Backend App Bootstrap & Security Middleware"
Cohesion: 0.10
Nodes (12): app, docsCsp, strictCsp, notFoundHandler(), authLimiter, generalLimiter, Actor, Actor (+4 more)

### Community 11 - "Backend Expense/Income Controllers"
Cohesion: 0.20
Nodes (23): list(), listCategories(), listQuery(), create(), createSource(), getById(), getSource(), list() (+15 more)

### Community 12 - "Mobile Expense/Income List Screens"
Cohesion: 0.16
Nodes (18): ExpensesScreen(), WALLET_FILTERS, WalletFilter, IncomeScreen(), WALLET_FILTERS, WalletFilter, ChipOption, ChipSelect() (+10 more)

### Community 13 - "Backend DB Config & Overview Repository"
Cohesion: 0.11
Nodes (9): checkDatabase(), pool, query(), Executor, OverviewRow, Executor, RefreshTokenRow, emailFor() (+1 more)

### Community 14 - "Flutter macOS Plugin Registrant"
Cohesion: 0.11
Nodes (15): Bool, Cocoa, FlutterAppDelegate, FlutterMacOS, FlutterPluginRegistry, FlutterViewController, Foundation, RegisterGeneratedPlugins() (+7 more)

### Community 15 - "Backend Auth Middleware & Google OAuth Service"
Cohesion: 0.12
Nodes (7): authenticate(), buildAuthUrl(), exchangeCodeForProfile(), getClient(), GoogleProfile, verifyAccessToken(), ApiError

### Community 16 - "Flutter Rewrite Plan & Design Docs"
Cohesion: 0.13
Nodes (21): Plan Global Constraints, Flutter Foundation & Auth Implementation Plan (overview), Task 1: Add Flutter Dependencies, Architecture: Feature-First Layout Under lib/, Auth Flows (three-valued AuthStatus, Google OAuth), Build Order Phase 0: Foundation, Build Order Phase 1: Auth, Build Order Phase 2: Income & Expense CRUD (+13 more)

### Community 17 - "Mobile Distribution Settings & Forms"
Cohesion: 0.21
Nodes (15): DistributionScreen(), Row(), SettingsScreen(), NamedRecord, NameEditor(), Card(), EmptyState(), SectionHeader() (+7 more)

### Community 18 - "Backend Auth Controller"
Cohesion: 0.25
Nodes (17): context(), googleCallback(), login(), logout(), me(), refresh(), register(), setRefreshCookie() (+9 more)

### Community 19 - "Mobile Themed UI Components"
Cohesion: 0.17
Nodes (14): styles, ThemedText(), ThemedTextProps, ThemedView(), ThemedViewProps, Collapsible(), styles, IconMapping (+6 more)

### Community 20 - "Backend Lint Config (oxlint)"
Cohesion: 0.11
Nodes (18): categories, correctness, suspicious, ignorePatterns, dist/**, node_modules/**, plugins, rules (+10 more)

### Community 21 - "Backend Expense Service"
Cohesion: 0.19
Nodes (13): withTransaction(), assertCategoryOwned(), checkOverspend(), create(), CreateExpenseInput, remove(), update(), assertSourceOwned() (+5 more)

### Community 22 - "Backend Auth Service"
Cohesion: 0.24
Nodes (16): DEFAULT_DISTRIBUTION, getProfile(), googleSignIn(), IssueContext, issueTokens(), login(), logout(), refresh() (+8 more)

### Community 23 - "Backend TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, paths, resolveJsonModule (+9 more)

### Community 24 - "Flutter Counter Demo (lib/main.dart)"
Cohesion: 0.12
Nodes (16): build, _counter, createState, _incrementCounter, main, MyApp, MyHomePage, _MyHomePageState (+8 more)

### Community 25 - "Windows Runner Win32 Window (C++)"
Cohesion: 0.18
Nodes (14): wchar_t, Scale(), Create, Destroy, UpdateTheme, Win32Window::Win32Window(), WindowClassRegistrar, class_registered_ (+6 more)

### Community 26 - "Mobile Package Dependencies"
Cohesion: 0.12
Nodes (17): axios, expo-font, expo-router, @expo/ui, dependencies, axios, expo-font, expo-router (+9 more)

### Community 27 - "Backend Package Dependencies"
Cohesion: 0.12
Nodes (17): dependencies, bcryptjs, google-auth-library, helmet, pg, pino, pino-http, @sentry/node (+9 more)

### Community 28 - "Backend Architecture Rationale (README)"
Cohesion: 0.15
Nodes (17): Auth: JWT Access/Refresh With Rotation And Theft Detection, Background Jobs (BullMQ, Off By Default), Balances Are Derived, Not Stored, Deployment & TLS Termination Expectations, Distribution Is Atomic And Sums Exactly, Layered Architecture (routes -> controllers -> services -> repositories), Money Is Never A Float (integer cents), Operational Notes (rate limiting, shutdown, error mapping) (+9 more)

### Community 29 - "Mobile Auth Client & API Base"
Cohesion: 0.24
Nodes (15): baseUrl(), setSignedOutHandler(), AuthenticatedUser, AuthResult, continueWithGoogle(), createAccount(), getProfile(), signIn() (+7 more)

### Community 30 - "Backend NPM Scripts"
Cohesion: 0.12
Nodes (16): scripts, build, dev, format, format:check, lint, lint:fix, migrate (+8 more)

### Community 31 - "Windows Runner Flutter Window (C++)"
Cohesion: 0.13
Nodes (15): DartProject, HWND, LPARAM, LRESULT, UINT, WPARAM, FlutterWindow, flutter_controller_ (+7 more)

### Community 32 - "Backend OpenAPI Docs"
Cohesion: 0.16
Nodes (13): crud(), distCats, errors, expenseCats, idParam, jsonBody(), listResponse(), money (+5 more)

### Community 33 - "Mobile Categories Settings & Endpoints"
Cohesion: 0.17
Nodes (13): CategoryEditor(), request(), updateProfile(), createDistributionCategory(), createExpenseCategory(), deleteDistributionCategory(), deleteExpenseCategory(), getCurrentOverview() (+5 more)

### Community 34 - "Backend Income Repository"
Cohesion: 0.15
Nodes (6): buildWhere(), DistributionLine, Executor, findAll(), IncomeFilters, IncomeRow

### Community 35 - "Windows Runner Entry Point & Utils"
Cohesion: 0.22
Nodes (9): _In_, _In_opt_, wWinMain(), wchar_t, CreateAndAttachConsole(), GetCommandLineArguments(), Utf8FromUtf16(), string (+1 more)

### Community 36 - "Mobile Expo App Config"
Cohesion: 0.14
Nodes (13): reactCompiler, typedRoutes, expo, experiments, icon, ios, name, orientation (+5 more)

### Community 37 - "Backend Expense Controller"
Cohesion: 0.44
Nodes (11): create(), createCategory(), getById(), getCategory(), remove(), removeCategory(), requireId(), requireUser() (+3 more)

### Community 38 - "Mobile API Client Core"
Cohesion: 0.20
Nodes (11): buildUrl(), Envelope, FieldErrors, PaginationMeta, performRefresh(), Query, refreshSession(), RequestOptions (+3 more)

### Community 39 - "Mobile Package.json Metadata"
Cohesion: 0.17
Nodes (11): main, name, private, scripts, android, ios, lint, reset-project (+3 more)

### Community 40 - "Mobile TypeScript Config"
Cohesion: 0.17
Nodes (11): compilerOptions, paths, strict, extends, include, expo-env.d.ts, expo/tsconfig.base, .expo/types/**/*.ts (+3 more)

### Community 41 - "Windows Runner Win32Window Lifecycle"
Cohesion: 0.23
Nodes (12): OnCreate, HWND, Win32Window, child_content_, GetClientArea, OnCreate, quit_on_close_, SetChildContent (+4 more)

### Community 42 - "Mobile Root Layout & Theme Colors"
Cohesion: 0.20
Nodes (7): AuthGate(), navigationTheme, unstable_settings, Allocation, Colors, ColorSchemeName, ThemeColors

### Community 43 - "Mobile Web Manifest (PWA)"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, prefer_related_applications, short_name (+2 more)

### Community 44 - "Auth Implementation Plan (Backend to Flutter)"
Cohesion: 0.36
Nodes (10): Google OAuth Setup And Account Linking, Task 10: Auth Validation, Task 11: Auth Models + AuthRepository, Task 12: Google Auth Service, Task 13: Auth Data Providers, Task 14: AuthNotifier + authProvider, Task 17: Login Screen, Task 18: Register Screen (+2 more)

### Community 45 - "Backend Expense Repository"
Cohesion: 0.22
Nodes (5): buildWhere(), Executor, ExpenseFilters, findAll(), ExpenseRow

### Community 46 - "Mobile Expo Plugins & External Link"
Cohesion: 0.20
Nodes (8): plugins, Props, expo-font, expo-image, expo-secure-store, expo-status-bar, expo-web-browser, @react-native-community/datetimepicker

### Community 47 - "Windows Runner Win32Window Handle Helpers"
Cohesion: 0.36
Nodes (10): HWND, LPARAM, LRESULT, UINT, WPARAM, EnableFullDpiSupportIfAvailable(), GetHandle, GetThisFromHandle (+2 more)

### Community 48 - "Backend Package.json Metadata"
Cohesion: 0.22
Nodes (8): author, description, keywords, license, main, name, type, version

### Community 49 - "Backend DistributionCategory Controller"
Cohesion: 0.44
Nodes (8): create(), getById(), list(), ListQuery, remove(), requireId(), requireUser(), update()

### Community 50 - "Backend DistributionCategory Repository"
Cohesion: 0.22
Nodes (3): DistributionCategoryRow, Executor, totalPercentage()

### Community 51 - "Backend DistributionCategory Service"
Cohesion: 0.31
Nodes (5): create(), DistributionCategoryInput, remove(), update(), withTotal()

### Community 52 - "Mobile Lint/TypeScript Dev Dependencies"
Cohesion: 0.22
Nodes (9): eslint, eslint-config-expo, devDependencies, eslint, eslint-config-expo, @types/react, typescript, typescript (+1 more)

### Community 53 - "Mobile reset-project Script"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 56 - "Flutter Build Configs (CMake/Lints)"
Cohesion: 0.36
Nodes (8): Dart Analyzer Config (flutter_lints, platform dir excludes), Linux Top-Level CMake Build Config, Linux Flutter-Managed CMake Library Rules, Linux Runner Executable Target, Flutter Web index.html Bootstrap Shell, Windows Top-Level CMake Build Config, Windows Flutter-Managed CMake Library Rules, Windows Runner Executable Target

### Community 57 - "Mobile Android Adaptive Icon Config"
Cohesion: 0.25
Nodes (8): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, android

### Community 58 - "Flutter Plan: API Client Foundation Tasks"
Cohesion: 0.43
Nodes (7): Task 2: ApiException, Task 3: Envelope Unwrap, Task 4: Session Model + SecureSessionStore, Task 5: SingleFlightRefresher, Task 6: Signed-Out Handler + AuthInterceptor, Task 7: dio Client + ApiClient, Task 9: Core Providers

### Community 59 - "Mobile Color Palette & Tailwind Config"
Cohesion: 0.43
Nodes (5): allocations, brand, dark, light, { brand, light, dark }

### Community 60 - "Mobile Session Storage"
Cohesion: 0.52
Nodes (6): clearSession(), read(), restoreSession(), saveSession(), updateStoredSession(), write()

### Community 61 - "Flutter Plan: Router, Theme & Integration Tasks"
Cohesion: 0.33
Nodes (6): Task 15: Router (go_router auth-gated redirect), Task 16: main.dart Wiring, Task 21: Final Integration Pass, Task 8: Theme (palette + app theme), Theming (palette.dart port, ThemeExtension<AppColors>), Transaction + Rounding Rule For Income Distribution

### Community 62 - "Backend Migration Runner Script"
Cohesion: 0.40
Nodes (3): path, { readFileSync }, { runner }

### Community 64 - "Mobile EAS/Router Extra Config"
Cohesion: 0.50
Nodes (4): projectId, extra, eas, router

### Community 66 - "Mobile Metro Bundler Config"
Cohesion: 0.50
Nodes (3): config, { getDefaultConfig }, { withNativeWind }

### Community 77 - "Mobile Agent Docs (AGENTS.md/CLAUDE.md)"
Cohesion: 0.67
Nodes (3): Expo v54 Versioned-Docs Directive, my_accountant CLAUDE.md (@AGENTS.md include), my_accountant Expo/React Native App (overview)

### Community 78 - "Mobile Expo Web Config"
Cohesion: 0.67
Nodes (3): web, favicon, output

## Knowledge Gaps
- **354 isolated node(s):** `$schema`, `typescript`, `oxc`, `unicorn`, `correctness` (+349 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ApiError` connect `Backend Auth Middleware & Google OAuth Service` to `Backend API Routes & Middleware`, `Backend Expense Controller`, `Backend Config (Env, Logger, Sentry)`, `Backend App Bootstrap & Security Middleware`, `Backend Expense/Income Controllers`, `Backend DistributionCategory Controller`, `Backend Auth Controller`, `Backend DistributionCategory Service`, `Backend Expense Service`, `Backend Auth Service`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `expo-router` connect `Mobile Expense/Income Detail Screens` to `Mobile Tab Layout & Haptic Tab`, `Mobile Dashboard & Reports Screens`, `Mobile Auth & Profile Screens`, `Mobile Root Layout & Theme Colors`, `Mobile Expense/Income List Screens`, `Mobile Expo Plugins & External Link`, `Mobile Distribution Settings & Forms`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `plugins` connect `Mobile Expo Plugins & External Link` to `Mobile Expense/Income Detail Screens`, `Mobile Expo App Config`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _354 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend API Routes & Middleware` be split into smaller, more focused modules?**
  _Cohesion score 0.05809802012333658 - nodes in this community are weakly interconnected._
- **Should `Backend Reporting Repository` be split into smaller, more focused modules?**
  _Cohesion score 0.07467532467532467 - nodes in this community are weakly interconnected._
- **Should `Mobile Dashboard & Reports Screens` be split into smaller, more focused modules?**
  _Cohesion score 0.08571428571428572 - nodes in this community are weakly interconnected._