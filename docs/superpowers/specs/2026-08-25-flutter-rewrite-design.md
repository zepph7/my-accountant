# My Accountant — Flutter Rewrite

Status: approved, ready for implementation planning
Date: 2026-08-25

## Goal

Build full feature parity for My Accountant in the existing `my__accountant`
Flutter project (currently an untouched `flutter create` scaffold), so it
becomes a complete, independently usable replacement for the
`my_accountant` Expo/React Native app. `my_accountant` is left untouched as
a fallback/reference — this spec does not delete or modify anything in it,
and no decision about retiring it is made here.

Both projects talk to the same existing backend API (envelope-style REST,
JWT access/refresh tokens) — no backend changes are in scope.

## Non-goals

- Modifying `my_accountant` (RN) in any way.
- Backend/API changes.
- Deciding when/whether to retire the RN app.
- Web/desktop targets beyond whatever `flutter create` already scaffolded
  (android/ios are the shipping targets, matching the RN app's `ios`/
  `android` config in `app.json`).
- Pixel-perfect animation parity — visual *color/typography* parity matters;
  gesture/animation fidelity does not.

## Screen & feature inventory (source of truth: `my_accountant/app/**`)

Reproduced 1:1 unless noted:

- **Auth**: login (single identifier field — email or phone — plus
  password), register (email + phone + password + first/last name),
  Google OAuth (server-driven redirect, no native Google SDK).
- **Tabs**: home/dashboard, income list, expenses list, reports, settings.
- **Income**: list (paginated, filterable by date/wallet/source), detail
  view (shows distribution split + warning if percentages don't total
  100), create/edit form.
- **Expense**: list (paginated, filterable by date/wallet/category/search),
  detail view, create/edit form.
- **Settings**: profile (edit name/phone/timezone), income sources CRUD,
  expense categories CRUD, distribution categories CRUD (with percentage
  total warning), wallet balances (overview: cash/account/mpesa).
- **Reports** (all under the reports tab, likely as sub-tabs/segments):
  summary, cashflow (day/week/month/year granularity), expense report
  (hour/day/week/month/year granularity, filterable by category/wallet),
  distribution report.

## Architecture

Feature-first layout under `lib/`:

```
lib/
  main.dart                 # ProviderScope + MaterialApp.router
  core/
    network/
      dio_client.dart        # dio instance, base URL from --dart-define
      envelope.dart          # {success,data,message,errors,pagination} unwrap
      api_exception.dart     # ApiException: status, message, fieldErrors, isTransient
      auth_interceptor.dart  # attaches bearer token; single-flight refresh+replay on 401
    storage/
      secure_session_store.dart  # flutter_secure_storage, mirrors lib/session.ts semantics
    theme/
      palette.dart           # ported from constants/palette.js
      app_theme.dart         # light/dark ThemeData built from palette.dart
    router/
      app_router.dart        # go_router: auth guard, shell route for tabs, nested routes
  features/
    auth/{data,state,screens,widgets}/
    income/{data,state,screens,widgets}/
    expense/{data,state,screens,widgets}/
    overview/{data,state,screens,widgets}/     # dashboard + balances
    reports/{data,state,screens,widgets}/
    settings/{data,state,screens,widgets}/     # profile, sources, categories, distribution
  shared/
    widgets/                 # money-formatted text, paginated list view, loading/error states
    format.dart               # ported from lib/format.ts, money-validation.ts
```

Each feature's `data/` layer is a repository (plain class, dio-backed) plus
hand-written model classes with `fromJson`/`toJson` factory constructors —
no codegen (no `freezed`/`json_serializable`), matching the explicit,
no-magic style of `lib/endpoints.ts`. **Money fields are `String`
everywhere, never parsed to `double`/`num`** — same rationale as the RN
code: `NUMERIC(14,2)` round-trips exactly through a string and not through
a float, and this is a finance app.

Each feature's `state/` layer is Riverpod providers/notifiers:
`AsyncNotifier`/`FutureProvider.family` for lists and detail fetches
(mirroring `use-query.ts` / `use-paged-list.ts`), plain `Notifier` for
local form state.

## Networking

- `dio` instance, base URL read via `String.fromEnvironment('API_BASE_URL')`
  passed with `--dart-define` at run/build time (mirrors
  `EXPO_PUBLIC_API_URL`; local dev value is `http://10.34.125.26:3000`,
  same LAN-IP requirement as the RN app since Android/iOS simulators/devices
  can't reach `localhost` on the dev machine).
- Response interceptor unwraps the envelope; a non-2xx or
  `success: false` throws `ApiException(status, message, fieldErrors)`,
  built from the same `errors: [{field, message}]` shape `toFieldErrors`
  parses in `lib/api.ts`, including per-request field-name renaming (used
  by login, where both `email` and `phone` inputs map to the API's single
  `identifier` field).
- 401 handling reproduces `lib/api.ts` exactly: on 401 (and a refresh token
  in storage), await a single shared in-flight refresh (a static
  `Future<Session?>` guarding concurrent callers so a burst of requests
  doesn't present a rotated-and-now-stale refresh token to the server —
  the API treats replay as theft and revokes the whole session), replay
  the original request once with the new access token, and if that also
  401s, clear the stored session and notify the auth provider so the
  router redirects to `/login`.
- Listing endpoints return `{data, pagination}` at the top level (not
  nested under `data`), and some (distribution categories) add extra
  top-level fields like `totalPercentage` — the envelope unwrap must
  preserve those extras exactly like the RN `request()` does, not just
  return `data`.

## Secure storage / sessions

`flutter_secure_storage` (Keychain on iOS, EncryptedSharedPreferences on
Android) stores `access_token` / `refresh_token`, gated by the same
"remember me" contract as `lib/session.ts`:

- In-memory session is the source of truth for the running process.
- `saveSession(session, remember)` only persists to secure storage when
  `remember` is true; otherwise the session dies with the process.
- `updateStoredSession` (called after a token refresh) only rewrites
  storage if a session was already stored — a refresh must never silently
  upgrade a non-remembered session into a remembered one.
- `restoreSession` on cold start needs only a refresh token to consider the
  session restorable (access token is short-lived and gets re-minted on
  first authenticated request).

## Auth flows

`authProvider` (Riverpod `AsyncNotifier<AuthState>`) reproduces
`providers/auth-provider.tsx` 1:1: three-valued status (`loading` /
`authenticated` / `unauthenticated`) — not a bool, because "haven't
checked storage yet" is a real state and collapsing it to `unauthenticated`
would bounce a returning user to login on every cold start. On construction
it restores the stored session, and if one exists, proves it's live by
calling `/api/auth/me` (a revoked refresh token or unreachable server both
resolve to signing out — a signed-in shell with no data is worse than
asking to sign in again).

`signIn`/`signUp`/`signOut`/`refreshUser` map directly to the RN
functions. Sign-out revokes server-side first (best-effort — a network
failure still completes the local sign-out, since stranding a user in a
signed-in state because of a dropped connection is the worse failure).

**Google OAuth** is server-driven, same as RN — no `google_sign_in` SDK
needed:
1. Open `${baseUrl}/api/auth/google` in a system browser auth session
   (`flutter_web_auth_2`, the Flutter equivalent of
   `expo-web-browser`'s `openAuthSessionAsync` — uses
   `ASWebAuthenticationSession` on iOS / Custom Tabs on Android, required
   because Google refuses to serve its consent screen inside an embedded
   WebView).
2. Register the `myaccountant://auth/callback` redirect URL scheme in
   `android/app/src/main/AndroidManifest.xml` (intent-filter) and
   `ios/Runner/Info.plist` (`CFBundleURLTypes`) — this is the same scheme
   already declared in the RN app's `app.json` (`"scheme": "myaccountant"`),
   reused rather than reinvented so the backend's redirect config doesn't
   need to change.
3. On return, parse `access_token` / `refresh_token` / `message` off the
   callback URL's query string; a non-success browser result (user backed
   out) resolves to `null`, not an error.
4. Fetch `/api/auth/me` with the new access token to get the profile, since
   the redirect carries tokens but not the user object.

## Navigation (go_router)

- Root redirect guard (`GoRouter(redirect: ...)`, refreshed via a
  `GoRouterRefreshStream`/`Listenable` bridged from `authProvider`)
  reproduces `app/_layout.tsx`: unauthenticated → `/login`; authenticated
  hitting an auth route → tabs root.
- `/login`, `/register` — outside the shell, no bottom nav.
- `ShellRoute` for the 5 tabs (home, income, expenses, reports, settings),
  matching `app/(tabs)/_layout.tsx`.
- Nested routes: `/income/new`, `/income/:id`, `/expense/new`,
  `/expense/:id`.
- Settings sub-routes: `/settings/profile`, `/settings/sources`,
  `/settings/categories`, `/settings/distribution`, `/settings/balances`.

## Theming

`palette.dart` is a direct port of `constants/palette.js` — same hex
values, same light/dark derivation logic (dark mode steps `primary` up to
`primaryLight` for contrast, semantic colors lighten one step, backgrounds
pull toward blue rather than neutral grey), same brand tokens
(`brandFill`/`onBrandFill`/`brandWash`), same allocation-band colors and
default percentages (Essentials 60 / Savings 20 / Investments 10 /
Emergency 10, sourced from the same values as `DEFAULT_DISTRIBUTION` on
the backend). Exposed as a `ThemeExtension<AppColors>` so widgets read
`Theme.of(context).extension<AppColors>()!` instead of hardcoding hex.
`ThemeData` (light + dark) uses `ThemeMode.system` to match
`userInterfaceStyle: "automatic"`. No custom fonts — the RN app ships none,
so Flutter's default (Roboto/SF) is correct parity, not a gap.

## Error handling

`ApiException.isTransient` (status 0 or ≥500) is preserved so screens can
distinguish "retry might work" from "this request is wrong" — same
distinction the RN code draws. Field-level errors surface next to the
relevant form input via the same `fieldErrors` map pattern.

## Testing

`flutter_test` + `mocktail`, scoped to logic that actually carries risk
(matching the RN app's own testing footprint, which has none in the mobile
client today — this is not a regression, it's parity plus a bit more
rigor where it's cheap):

- Envelope unwrap + `ApiException` construction (including field-error
  renaming).
- Single-flight refresh-and-replay behavior under concurrent 401s.
- Secure-session-store "remember me" gating (save/update/restore/clear).
- Money-string form validation (port of `lib/money-validation.ts`).

No blanket widget-test coverage mandate — screens get tests where a
regression would be expensive to catch late (forms, auth), not everywhere.

## Build order

Sequential phases, one implementation plan:

0. **Foundation** — `pubspec.yaml` deps (`dio`, `flutter_riverpod`,
   `go_router`, `flutter_secure_storage`, `flutter_web_auth_2`), folder
   scaffold, `palette.dart`/`app_theme.dart`, dio client + interceptors,
   secure session store, router shell with auth guard (screens can be
   stubs at this point).
1. **Auth** — login, register, Google OAuth (incl. platform URL-scheme
   registration), profile screen, `authProvider` fully wired.
2. **Income & Expense CRUD** — lists (paginated/filterable), detail/edit,
   create, income-sources and expense-categories management screens.
3. **Overview/balances + Dashboard** — home tab, `/settings/balances`.
4. **Reports** — summary, cashflow, expense report, distribution report,
   `/settings/distribution`.
5. **Platform polish** — app icons/splash, Android
   `applicationId`/iOS bundle id set to match the RN app's
   `com.zepph7.my_accountant` (or a deliberately-chosen alternative if the
   two apps need to coexist on one device — flag this for a decision at
   that phase, since identical ids would conflict on the same device),
   smoke test on Android + iOS.

## Open items to flag during implementation (not blocking this spec)

- Whether the Flutter app's Android `applicationId`/iOS bundle id should
  match the RN app's (`com.zepph7.my_accountant`) or differ, since both
  are being kept side by side — identical ids will conflict if both are
  ever installed on the same test device. Decide in Phase 5.
- `flutter_web_auth_2` vs. a hand-rolled `url_launcher` + `app_links`
  approach — `flutter_web_auth_2` is preferred (closest behavioral match
  to `expo-web-browser`), but if it has a maintenance/platform-support gap
  at implementation time, fall back to the manual approach without
  changing anything else in the Auth flows section.
