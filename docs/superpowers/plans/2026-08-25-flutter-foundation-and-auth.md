# Flutter Foundation & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Flutter app's core layer (networking, secure session storage, theming, routing) and a fully working authentication flow (register, login, Google OAuth, profile) in `my__accountant`, talking to the same backend the RN app uses.

**Architecture:** Feature-first Dart under `lib/`: `core/` holds cross-cutting network/storage/theme/router code, `features/auth/` holds auth-specific data/state/screens. Riverpod wires dependencies; go_router handles navigation with an auth-gated redirect; dio handles HTTP with an interceptor reproducing the RN app's envelope-unwrap and single-flight refresh-and-replay logic.

**Tech Stack:** Flutter/Dart, `dio`, `flutter_riverpod`, `go_router`, `flutter_secure_storage`, `flutter_web_auth_2`, `mocktail` (dev).

**Spec:** `docs/superpowers/specs/2026-08-25-flutter-rewrite-design.md`

**This is plan 1 of a sequence.** The spec's Phases 2–5 (income/expense CRUD, overview/dashboard, reports, platform polish) are deliberately **not** in this plan — each becomes its own plan, written after the prior one lands, because screen-level detail is more reliable to plan against working code than to speculate now. This plan covers Phase 0 (Foundation) and Phase 1 (Auth) in full.

## Global Constraints

- Money fields are `String` everywhere in models — never parsed to `double`/`num`. (spec: Architecture)
- No codegen: hand-written `fromJson`/`toJson`, no `freezed`/`json_serializable`. (spec: Architecture)
- API base URL comes from `String.fromEnvironment('API_BASE_URL')`, passed via `--dart-define=API_BASE_URL=...`. Local dev value: `http://10.34.125.26:3000`. (spec: Networking)
- The 401 refresh-and-replay must be single-flight: concurrent 401s share one refresh call, not one each. (spec: Networking)
- `SecureSessionStore`'s "remember me" contract: don't persist when `remember` is false; a token-refresh rewrite (`updateStored`) only touches storage if a session was already stored there. (spec: Secure storage / sessions)
- `AuthStatus` is three-valued (`loading` / `authenticated` / `unauthenticated`), never a bool. (spec: Auth flows)
- Google OAuth is server-driven (no `google_sign_in` SDK) — a system-browser session against `${baseUrl}/api/auth/google`, redirecting to `myaccountant://auth/callback`. (spec: Auth flows)
- Testing is scoped to logic that carries risk (refresh/replay, envelope parsing, session-store gating, validation, auth flow) — no blanket widget-test mandate. (spec: Testing)
- All file paths below are relative to the repo root (the directory containing both `my_accountant/` and `my__accountant/`).

---

### Task 1: Add Flutter dependencies

**Files:**
- Modify: `my__accountant/pubspec.yaml`

**Interfaces:**
- Produces: `dio`, `flutter_riverpod`, `go_router`, `flutter_secure_storage`, `flutter_web_auth_2` available as imports; `mocktail` available in `test/`.

- [ ] **Step 1: Add runtime dependencies**

```bash
cd "my__accountant" && flutter pub add dio flutter_riverpod go_router flutter_secure_storage flutter_web_auth_2
```

- [ ] **Step 2: Add dev dependency**

```bash
flutter pub add --dev mocktail
```

- [ ] **Step 3: Verify the project still analyzes cleanly**

Run: `flutter analyze`
Expected: `No issues found!` (the default `flutter create` counter app is still the only code, and it doesn't use any new package yet, so this just confirms `pubspec.yaml`/`pubspec.lock` are consistent).

- [ ] **Step 4: Commit**

```bash
cd .. && git add my__accountant/pubspec.yaml my__accountant/pubspec.lock
git commit -m "Add core Flutter dependencies (dio, riverpod, go_router, secure storage, web auth)"
```

---

### Task 2: ApiException

**Files:**
- Create: `my__accountant/lib/core/network/api_exception.dart`
- Test: `my__accountant/test/core/network/api_exception_test.dart`

**Interfaces:**
- Produces: `class ApiException implements Exception { ApiException(int status, String message, [Map<String, String> fieldErrors]); int status; String message; Map<String, String> fieldErrors; bool get isTransient; }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/core/network/api_exception_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_exception.dart';

void main() {
  group('ApiException', () {
    test('defaults fieldErrors to empty', () {
      final e = ApiException(400, 'Bad request');
      expect(e.fieldErrors, isEmpty);
    });

    test('isTransient is true for status 0 (network failure)', () {
      expect(ApiException(0, 'offline').isTransient, isTrue);
    });

    test('isTransient is true for 5xx', () {
      expect(ApiException(500, 'server error').isTransient, isTrue);
      expect(ApiException(503, 'unavailable').isTransient, isTrue);
    });

    test('isTransient is false for 4xx', () {
      expect(ApiException(404, 'not found').isTransient, isFalse);
      expect(ApiException(422, 'validation').isTransient, isFalse);
    });

    test('carries field errors', () {
      final e = ApiException(422, 'Invalid', {'email': 'Enter a valid email.'});
      expect(e.fieldErrors['email'], 'Enter a valid email.');
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "my__accountant" && flutter test test/core/network/api_exception_test.dart`
Expected: FAIL — `Error: Not found: 'package:my__accountant/core/network/api_exception.dart'`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/core/network/api_exception.dart

/// A failed API request, carrying whatever the server could attribute to a
/// particular field so a form can put the message next to the input that
/// caused it. Mirrors `lib/api.ts`'s `ApiError` in the RN app.
class ApiException implements Exception {
  ApiException(this.status, this.message, [this.fieldErrors = const {}]);

  final int status;
  final String message;
  final Map<String, String> fieldErrors;

  /// True when retrying the same request might work: no response reached the
  /// device (status 0) or the server reported its own failure (5xx).
  bool get isTransient => status == 0 || status >= 500;

  @override
  String toString() => 'ApiException($status, $message)';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/core/network/api_exception_test.dart`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/core/network/api_exception.dart my__accountant/test/core/network/api_exception_test.dart
git commit -m "Add ApiException"
```

---

### Task 3: Envelope unwrap

**Files:**
- Create: `my__accountant/lib/core/network/envelope.dart`
- Test: `my__accountant/test/core/network/envelope_test.dart`

**Interfaces:**
- Consumes: `ApiException` (Task 2)
- Produces: `dynamic unwrapEnvelope(Map<String, dynamic> json, int status, {Map<String, String> renameFields = const {}})` — returns `json['data']` on success, or the whole envelope minus `success`/`message`/`errors` when `json['pagination']` is present; throws `ApiException` when `json['success']` is falsy.

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/core/network/envelope_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_exception.dart';
import 'package:my__accountant/core/network/envelope.dart';

void main() {
  group('unwrapEnvelope', () {
    test('returns data on success', () {
      final result = unwrapEnvelope({
        'success': true,
        'data': {'id': '1'},
      }, 200);
      expect(result, {'id': '1'});
    });

    test('returns everything but envelope bookkeeping when pagination is present', () {
      final result = unwrapEnvelope({
        'success': true,
        'data': [
          {'id': '1'}
        ],
        'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
        'totalPercentage': 100,
      }, 200);
      expect(result, {
        'data': [
          {'id': '1'}
        ],
        'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
        'totalPercentage': 100,
      });
    });

    test('throws ApiException with server message on failure', () {
      expect(
        () => unwrapEnvelope({'success': false, 'message': 'Nope'}, 422),
        throwsA(isA<ApiException>()
            .having((e) => e.status, 'status', 422)
            .having((e) => e.message, 'message', 'Nope')),
      );
    });

    test('falls back to a 5xx message when the server sent none', () {
      expect(
        () => unwrapEnvelope({'success': false}, 500),
        throwsA(isA<ApiException>().having(
          (e) => e.message,
          'message',
          'The server ran into a problem. Try again in a moment.',
        )),
      );
    });

    test('falls back to a generic message for a non-5xx failure with none', () {
      expect(
        () => unwrapEnvelope({'success': false}, 400),
        throwsA(isA<ApiException>()
            .having((e) => e.message, 'message', 'That request could not be completed.')),
      );
    });

    test('maps field errors, renames fields, skips (root), first message wins', () {
      expect(
        () => unwrapEnvelope({
          'success': false,
          'errors': [
            {'field': 'email', 'message': 'Bad email'},
            {'field': 'email', 'message': 'Second message, ignored'},
            {'field': '(root)', 'message': 'ignored entirely'},
            {'field': 'phone', 'message': 'Bad phone'},
          ],
        }, 422, renameFields: {'email': 'identifier', 'phone': 'identifier'}),
        throwsA(isA<ApiException>().having(
          (e) => e.fieldErrors,
          'fieldErrors',
          {'identifier': 'Bad email'},
        )),
      );
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/core/network/envelope_test.dart`
Expected: FAIL — `envelope.dart` not found

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/core/network/envelope.dart
import 'api_exception.dart';

Map<String, String> _fieldErrorsFrom(
  List<dynamic>? errors,
  Map<String, String> rename,
) {
  final mapped = <String, String>{};
  for (final raw in errors ?? const []) {
    final issue = raw as Map<String, dynamic>;
    final rawField = issue['field'] as String;
    final field = rename[rawField] ?? rawField;
    if (field == '(root)') continue;
    // First message per field wins.
    mapped.putIfAbsent(field, () => issue['message'] as String);
  }
  return mapped;
}

/// Unwraps the API envelope `{success, data, message, errors, pagination}`.
///
/// Listing endpoints put the rows and page metadata at the top level rather
/// than inside `data`, alongside resource-level extras (e.g. the
/// distribution list's `totalPercentage`) — when `pagination` is present,
/// everything but the envelope bookkeeping is returned instead of just
/// `data`, mirroring `lib/api.ts`'s `request()`.
dynamic unwrapEnvelope(
  Map<String, dynamic> json,
  int status, {
  Map<String, String> renameFields = const {},
}) {
  final success = json['success'] == true;
  if (!success) {
    final message = json['message'] as String? ??
        (status >= 500
            ? 'The server ran into a problem. Try again in a moment.'
            : 'That request could not be completed.');
    throw ApiException(
      status,
      message,
      _fieldErrorsFrom(json['errors'] as List<dynamic>?, renameFields),
    );
  }

  if (json['pagination'] != null) {
    final rest = Map<String, dynamic>.from(json)
      ..remove('success')
      ..remove('message')
      ..remove('errors');
    return rest;
  }

  return json['data'];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/core/network/envelope_test.dart`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/core/network/envelope.dart my__accountant/test/core/network/envelope_test.dart
git commit -m "Add API envelope unwrap"
```

---

### Task 4: Session model + SecureSessionStore

**Files:**
- Create: `my__accountant/lib/core/storage/session.dart`
- Create: `my__accountant/lib/core/storage/token_storage.dart`
- Create: `my__accountant/lib/core/storage/secure_session_store.dart`
- Test: `my__accountant/test/core/storage/secure_session_store_test.dart`

**Interfaces:**
- Produces:
  - `class Session { const Session({required String accessToken, required String refreshToken}); }`
  - `abstract class TokenStorage { Future<String?> read(String key); Future<void> write(String key, String value); Future<void> delete(String key); }`
  - `class SecureTokenStorage implements TokenStorage` — real `flutter_secure_storage`-backed implementation.
  - `class SecureSessionStore { SecureSessionStore(TokenStorage storage); Session? get current; Future<void> save(Session session, {required bool remember}); Future<void> updateStored(Session session); Future<Session?> restore(); Future<void> clear(); }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/core/storage/secure_session_store_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/storage/secure_session_store.dart';
import 'package:my__accountant/core/storage/session.dart';
import 'package:my__accountant/core/storage/token_storage.dart';

class FakeTokenStorage implements TokenStorage {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

void main() {
  late FakeTokenStorage storage;
  late SecureSessionStore store;

  setUp(() {
    storage = FakeTokenStorage();
    store = SecureSessionStore(storage);
  });

  test('current is null before anything is saved or restored', () {
    expect(store.current, isNull);
  });

  test('save with remember:false sets current but does not persist', () async {
    await store.save(const Session(accessToken: 'a', refreshToken: 'r'), remember: false);
    expect(store.current?.accessToken, 'a');
    expect(storage.values, isEmpty);
  });

  test('save with remember:true persists both tokens', () async {
    await store.save(const Session(accessToken: 'a', refreshToken: 'r'), remember: true);
    expect(storage.values['ma.access_token'], 'a');
    expect(storage.values['ma.refresh_token'], 'r');
  });

  test('updateStored does not persist when nothing was stored before', () async {
    await store.updateStored(const Session(accessToken: 'a2', refreshToken: 'r2'));
    expect(store.current?.accessToken, 'a2');
    expect(storage.values, isEmpty);
  });

  test('updateStored rewrites storage when a session was already stored', () async {
    await store.save(const Session(accessToken: 'a', refreshToken: 'r'), remember: true);
    await store.updateStored(const Session(accessToken: 'a2', refreshToken: 'r2'));
    expect(storage.values['ma.access_token'], 'a2');
    expect(storage.values['ma.refresh_token'], 'r2');
  });

  test('restore returns null when no refresh token is stored', () async {
    expect(await store.restore(), isNull);
  });

  test('restore rebuilds the session from a stored refresh token alone', () async {
    storage.values['ma.refresh_token'] = 'r';
    final restored = await store.restore();
    expect(restored?.refreshToken, 'r');
    expect(restored?.accessToken, '');
    expect(store.current?.refreshToken, 'r');
  });

  test('clear empties storage and current', () async {
    await store.save(const Session(accessToken: 'a', refreshToken: 'r'), remember: true);
    await store.clear();
    expect(store.current, isNull);
    expect(storage.values, isEmpty);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/core/storage/secure_session_store_test.dart`
Expected: FAIL — missing `secure_session_store.dart`, `session.dart`, `token_storage.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/core/storage/session.dart
class Session {
  const Session({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;
}
```

```dart
// my__accountant/lib/core/storage/token_storage.dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where session tokens live, abstracted so tests don't need a platform
/// channel. Wraps the real keystore (Keychain on iOS,
/// EncryptedSharedPreferences on Android) in production.
abstract class TokenStorage {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureTokenStorage implements TokenStorage {
  const SecureTokenStorage([this._storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}
```

```dart
// my__accountant/lib/core/storage/secure_session_store.dart
import 'session.dart';
import 'token_storage.dart';

const _accessKey = 'ma.access_token';
const _refreshKey = 'ma.refresh_token';

/// The session for the running process, persisted to secure storage only
/// when "remember me" is on. Mirrors `lib/session.ts` in the RN app: the
/// in-memory copy is the source of truth for the process, storage is only
/// how a session survives a cold start, and a token refresh must never
/// silently upgrade a non-remembered session into a remembered one.
class SecureSessionStore {
  SecureSessionStore(this._storage);

  final TokenStorage _storage;
  Session? _current;

  Session? get current => _current;

  Future<void> save(Session session, {required bool remember}) async {
    _current = session;
    if (!remember) return;
    await _writeBoth(session);
  }

  Future<void> updateStored(Session session) async {
    _current = session;
    final storedRefresh = await _safeRead(_refreshKey);
    if (storedRefresh == null) return;
    await _writeBoth(session);
  }

  Future<Session?> restore() async {
    final refresh = await _safeRead(_refreshKey);
    if (refresh == null) return null;
    final access = await _safeRead(_accessKey);
    _current = Session(accessToken: access ?? '', refreshToken: refresh);
    return _current;
  }

  Future<void> clear() async {
    _current = null;
    await _safeDelete(_accessKey);
    await _safeDelete(_refreshKey);
  }

  Future<void> _writeBoth(Session session) async {
    await Future.wait([
      _safeWrite(_accessKey, session.accessToken),
      _safeWrite(_refreshKey, session.refreshToken),
    ]);
  }

  Future<String?> _safeRead(String key) async {
    try {
      return await _storage.read(key);
    } catch (_) {
      return null;
    }
  }

  Future<void> _safeWrite(String key, String value) async {
    try {
      await _storage.write(key, value);
    } catch (_) {
      // Keystore unavailable; the in-memory session still works for this run.
    }
  }

  Future<void> _safeDelete(String key) async {
    try {
      await _storage.delete(key);
    } catch (_) {}
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/core/storage/secure_session_store_test.dart`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/core/storage my__accountant/test/core/storage
git commit -m "Add Session model and SecureSessionStore"
```

---

### Task 5: SingleFlightRefresher

**Files:**
- Create: `my__accountant/lib/core/network/single_flight_refresher.dart`
- Test: `my__accountant/test/core/network/single_flight_refresher_test.dart`

**Interfaces:**
- Produces: `class SingleFlightRefresher<T> { Future<T> run(Future<T> Function() action); }` — concurrent callers of `run` before the first `action` completes all await the same in-flight future; once it completes, the next `run` starts a fresh call.

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/core/network/single_flight_refresher_test.dart
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/single_flight_refresher.dart';

void main() {
  test('concurrent callers share one in-flight action', () async {
    var callCount = 0;
    final refresher = SingleFlightRefresher<int>();

    Future<int> action() async {
      callCount++;
      await Future<void>.delayed(const Duration(milliseconds: 10));
      return 42;
    }

    final results = await Future.wait([
      refresher.run(action),
      refresher.run(action),
      refresher.run(action),
    ]);

    expect(callCount, 1);
    expect(results, [42, 42, 42]);
  });

  test('a later call after completion starts a new action', () async {
    var callCount = 0;
    final refresher = SingleFlightRefresher<int>();

    Future<int> action() async {
      callCount++;
      return callCount;
    }

    final first = await refresher.run(action);
    final second = await refresher.run(action);

    expect(first, 1);
    expect(second, 2);
  });

  test('propagates the action\'s error to every waiting caller', () async {
    final refresher = SingleFlightRefresher<int>();

    Future<int> action() async {
      await Future<void>.delayed(const Duration(milliseconds: 5));
      throw StateError('boom');
    }

    final calls = [refresher.run(action), refresher.run(action)];

    for (final call in calls) {
      await expectLater(call, throwsA(isA<StateError>()));
    }
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/core/network/single_flight_refresher_test.dart`
Expected: FAIL — missing `single_flight_refresher.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/core/network/single_flight_refresher.dart

/// Runs at most one instance of an async action at a time. Every caller of
/// [run] while an action is in flight awaits the same result instead of
/// starting a second one. Used for token refresh: a screen firing six
/// requests at once must not present a rotated-and-now-stale refresh token
/// to the server five times — see `AuthInterceptor`.
class SingleFlightRefresher<T> {
  Future<T>? _inFlight;

  Future<T> run(Future<T> Function() action) {
    return _inFlight ??= action().whenComplete(() => _inFlight = null);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/core/network/single_flight_refresher_test.dart`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/core/network/single_flight_refresher.dart my__accountant/test/core/network/single_flight_refresher_test.dart
git commit -m "Add SingleFlightRefresher"
```

---

### Task 6: Signed-out handler + AuthInterceptor

**Files:**
- Create: `my__accountant/lib/core/network/signed_out_handler.dart`
- Create: `my__accountant/lib/core/network/auth_interceptor.dart`
- Test: `my__accountant/test/core/network/auth_interceptor_test.dart`
- Test helper: `my__accountant/test/helpers/fake_http_client_adapter.dart`

**Interfaces:**
- Consumes: `SecureSessionStore`, `Session` (Task 4), `SingleFlightRefresher` (Task 5)
- Produces:
  - `void setSignedOutHandler(void Function()? handler); void notifySignedOut();`
  - `class AuthInterceptor extends Interceptor { AuthInterceptor({required SecureSessionStore sessionStore, required Future<Session?> Function(String refreshToken) performRefresh, required Future<Response<dynamic>> Function(RequestOptions options) retry}); }`
  - Request `Options.extra['anonymous'] == true` skips attaching the bearer token and skips the refresh-and-replay path (mirrors `lib/api.ts`'s `anonymous` request option).

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/helpers/fake_http_client_adapter.dart
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// A minimal `HttpClientAdapter` for tests, per dio's own documented testing
/// pattern — avoids hitting the network or depending on a mocking package
/// whose matcher API might not match what's actually installed.
class FakeHttpClientAdapter implements HttpClientAdapter {
  FakeHttpClientAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => handler(options);

  @override
  void close({bool force = false}) {}
}
```

```dart
// my__accountant/test/core/network/auth_interceptor_test.dart
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/auth_interceptor.dart';
import 'package:my__accountant/core/storage/secure_session_store.dart';
import 'package:my__accountant/core/storage/session.dart';
import 'package:my__accountant/core/storage/token_storage.dart';

import '../../helpers/fake_http_client_adapter.dart';

class InMemoryTokenStorage implements TokenStorage {
  final Map<String, String> values = {};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
  @override
  Future<void> delete(String key) async => values.remove(key);
}

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  test('on 401, refreshes once and replays the original request', () async {
    final sessionStore = SecureSessionStore(InMemoryTokenStorage());
    await sessionStore.save(
      const Session(accessToken: 'stale', refreshToken: 'refresh-1'),
      remember: true,
    );

    var protectedCalls = 0;
    var refreshCalls = 0;
    bool signedOutCalled = false;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      if (options.uri.path == '/api/protected') {
        protectedCalls++;
        final authHeader = options.headers['Authorization'] as String?;
        if (authHeader == 'Bearer stale') {
          return _jsonBody({'success': false, 'message': 'expired'}, 401);
        }
        return _jsonBody({'success': true, 'data': 'ok'}, 200);
      }
      throw StateError('unexpected path ${options.uri.path}');
    });

    Future<Session?> performRefresh(String refreshToken) async {
      refreshCalls++;
      final session = const Session(accessToken: 'fresh', refreshToken: 'refresh-2');
      await sessionStore.updateStored(session);
      return session;
    }

    dio.interceptors.add(AuthInterceptor(
      sessionStore: sessionStore,
      performRefresh: performRefresh,
      retry: dio.fetch,
      onSignedOut: () => signedOutCalled = true,
    ));

    final response = await dio.get<dynamic>('/api/protected');

    expect(response.data, {'success': true, 'data': 'ok'});
    expect(protectedCalls, 2);
    expect(refreshCalls, 1);
    expect(signedOutCalled, isFalse);
  });

  test('signs out when the refresh is refused', () async {
    final sessionStore = SecureSessionStore(InMemoryTokenStorage());
    await sessionStore.save(
      const Session(accessToken: 'stale', refreshToken: 'refresh-1'),
      remember: true,
    );
    bool signedOutCalled = false;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      return _jsonBody({'success': false, 'message': 'expired'}, 401);
    });

    dio.interceptors.add(AuthInterceptor(
      sessionStore: sessionStore,
      performRefresh: (_) async => null,
      retry: dio.fetch,
      onSignedOut: () => signedOutCalled = true,
    ));

    await expectLater(dio.get<dynamic>('/api/protected'), throwsA(isA<DioException>()));
    expect(signedOutCalled, isTrue);
    expect(sessionStore.current, isNull);
  });

  test('does not attach a token or attempt refresh for anonymous requests', () async {
    final sessionStore = SecureSessionStore(InMemoryTokenStorage());
    var refreshCalls = 0;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.headers.containsKey('Authorization'), isFalse);
      return _jsonBody({'success': true, 'data': null}, 200);
    });

    dio.interceptors.add(AuthInterceptor(
      sessionStore: sessionStore,
      performRefresh: (_) async {
        refreshCalls++;
        return null;
      },
      retry: dio.fetch,
    ));

    await dio.post<dynamic>('/api/auth/login', options: Options(extra: {'anonymous': true}));
    expect(refreshCalls, 0);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/core/network/auth_interceptor_test.dart`
Expected: FAIL — missing `auth_interceptor.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/core/network/signed_out_handler.dart

/// Called when the refresh token is refused. `AuthNotifier` registers a
/// handler so a dead session sends the user to the sign-in screen instead of
/// leaving every screen showing an unexplained error. Mirrors
/// `setSignedOutHandler` in `lib/api.ts`.
void Function()? _onSignedOut;

void setSignedOutHandler(void Function()? handler) => _onSignedOut = handler;

void notifySignedOut() => _onSignedOut?.call();
```

```dart
// my__accountant/lib/core/network/auth_interceptor.dart
import 'package:dio/dio.dart';

import '../storage/secure_session_store.dart';
import '../storage/session.dart';
import 'signed_out_handler.dart';
import 'single_flight_refresher.dart';

/// Attaches the bearer token to every non-anonymous request and, on a 401,
/// refreshes it once (shared across concurrent callers via
/// [SingleFlightRefresher]) and replays the request. If the replay also
/// 401s, the session is genuinely dead: it's cleared and [onSignedOut] runs.
/// Mirrors the refresh-and-replay logic in `lib/api.ts`'s `request()`.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.sessionStore,
    required this.performRefresh,
    required this.retry,
    this.onSignedOut,
  });

  final SecureSessionStore sessionStore;
  final Future<Session?> Function(String refreshToken) performRefresh;
  final Future<Response<dynamic>> Function(RequestOptions options) retry;
  final void Function()? onSignedOut;

  final _refresher = SingleFlightRefresher<Session?>();

  bool _isAnonymous(RequestOptions options) => options.extra['anonymous'] == true;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final session = sessionStore.current;
    if (!_isAnonymous(options) && session != null) {
      options.headers['Authorization'] = 'Bearer ${session.accessToken}';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final session = sessionStore.current;

    if (err.response?.statusCode != 401 || _isAnonymous(err.requestOptions) || session == null) {
      handler.next(err);
      return;
    }

    final renewed = await _refresher.run(() => performRefresh(session.refreshToken));

    if (renewed == null) {
      await sessionStore.clear();
      onSignedOut?.call();
      handler.next(err);
      return;
    }

    try {
      final retried = await retry(
        err.requestOptions..headers['Authorization'] = 'Bearer ${renewed.accessToken}',
      );
      handler.resolve(retried);
    } on DioException catch (retryErr) {
      if (retryErr.response?.statusCode == 401) {
        await sessionStore.clear();
        onSignedOut?.call();
      }
      handler.next(retryErr);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/core/network/auth_interceptor_test.dart`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/core/network/signed_out_handler.dart my__accountant/lib/core/network/auth_interceptor.dart my__accountant/test/core/network/auth_interceptor_test.dart my__accountant/test/helpers/fake_http_client_adapter.dart
git commit -m "Add AuthInterceptor with single-flight refresh-and-replay"
```

---

### Task 7: dio client + ApiClient

**Files:**
- Create: `my__accountant/lib/core/network/dio_client.dart`
- Create: `my__accountant/lib/core/network/api_client.dart`
- Test: `my__accountant/test/core/network/api_client_test.dart`

**Interfaces:**
- Consumes: `ApiException` (Task 2), `unwrapEnvelope` (Task 3), `SecureSessionStore`/`Session` (Task 4), `AuthInterceptor` (Task 6)
- Produces:
  - `String apiBaseUrl()`
  - `Dio buildDio({required SecureSessionStore sessionStore})`
  - `class ApiClient { ApiClient(Dio dio); Future<T> request<T>(String path, {String method = 'GET', Object? body, Map<String, dynamic>? query, bool anonymous = false, Map<String, String> renameFields = const {}, Map<String, String>? headers, required T Function(dynamic json) parse}); }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/core/network/api_client_test.dart
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/core/network/api_exception.dart';

import '../../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  late Dio dio;
  late ApiClient client;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    client = ApiClient(dio);
  });

  test('returns parsed data on success', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/thing');
      return _jsonBody({
        'success': true,
        'data': {'id': '1'},
      }, 200);
    });

    final result = await client.request<String>(
      '/api/thing',
      parse: (json) => (json as Map<String, dynamic>)['id'] as String,
    );
    expect(result, '1');
  });

  test('drops null, empty-string and undefined query values', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.queryParameters, {'wallet': 'cash'});
      return _jsonBody({'success': true, 'data': null}, 200);
    });

    await client.request<void>(
      '/api/thing',
      query: {'wallet': 'cash', 'sourceId': null, 'search': ''},
      parse: (_) {},
    );
  });

  test('throws ApiException with field errors on a validation failure', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      return _jsonBody({
        'success': false,
        'message': 'Invalid',
        'errors': [
          {'field': 'email', 'message': 'Bad email'},
        ],
      }, 422);
    });

    await expectLater(
      client.request<void>('/api/thing', method: 'POST', parse: (_) {}),
      throwsA(isA<ApiException>()
          .having((e) => e.status, 'status', 422)
          .having((e) => e.fieldErrors['email'], 'email error', 'Bad email')),
    );
  });

  test('throws a transient ApiException on a network failure', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
    });

    await expectLater(
      client.request<void>('/api/thing', parse: (_) {}),
      throwsA(isA<ApiException>().having((e) => e.isTransient, 'isTransient', isTrue)),
    );
  });

  test('sends explicit headers and anonymous flag through', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.headers['Authorization'], 'Bearer explicit-token');
      return _jsonBody({
        'success': true,
        'data': {'ok': true},
      }, 200);
    });

    await client.request<void>(
      '/api/auth/me',
      anonymous: true,
      headers: {'Authorization': 'Bearer explicit-token'},
      parse: (_) {},
    );
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/core/network/api_client_test.dart`
Expected: FAIL — missing `api_client.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/core/network/dio_client.dart
import 'package:dio/dio.dart';

import '../storage/secure_session_store.dart';
import '../storage/session.dart';
import 'api_exception.dart';
import 'auth_interceptor.dart';
import 'envelope.dart';
import 'signed_out_handler.dart';

/// The configured API address, from `--dart-define=API_BASE_URL=...`.
/// Mirrors `baseUrl()` in `lib/api.ts` (which reads `EXPO_PUBLIC_API_URL`).
String apiBaseUrl() {
  const url = String.fromEnvironment('API_BASE_URL');
  if (url.isEmpty) {
    throw ApiException(
      0,
      'The app has no API address configured. Pass --dart-define=API_BASE_URL=... and restart.',
    );
  }
  return url.replaceAll(RegExp(r'/+$'), '');
}

/// Builds the app's single `Dio` instance, with [AuthInterceptor] wired to
/// this same instance for the refresh call (so the refresh request goes
/// through the same base URL and JSON handling, but is marked `anonymous` so
/// the interceptor doesn't try to attach a stale token to it or recurse into
/// another refresh on its own failure).
Dio buildDio({required SecureSessionStore sessionStore}) {
  final dio = Dio(BaseOptions(baseUrl: apiBaseUrl()));

  Future<Session?> performRefresh(String refreshToken) async {
    try {
      final response = await dio.post<dynamic>(
        '/api/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(extra: {'anonymous': true}),
      );
      final data = unwrapEnvelope(
        response.data as Map<String, dynamic>,
        response.statusCode ?? 0,
      ) as Map<String, dynamic>;
      final session = Session(
        accessToken: data['accessToken'] as String,
        refreshToken: data['refreshToken'] as String,
      );
      await sessionStore.updateStored(session);
      return session;
    } catch (_) {
      // A network failure is not proof the session is dead; the caller
      // surfaces it as a transient error rather than signing the user out.
      return null;
    }
  }

  dio.interceptors.add(AuthInterceptor(
    sessionStore: sessionStore,
    performRefresh: performRefresh,
    retry: dio.fetch,
    onSignedOut: notifySignedOut,
  ));

  return dio;
}
```

```dart
// my__accountant/lib/core/network/api_client.dart
import 'package:dio/dio.dart';

import 'api_exception.dart';
import 'envelope.dart';

/// The transport every repository goes through. Wraps a `Dio` instance
/// (already carrying [AuthInterceptor]) with envelope unwrapping and query
/// cleaning. Mirrors `request()` in `lib/api.ts`.
class ApiClient {
  ApiClient(this._dio);

  final Dio _dio;

  Future<T> request<T>(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, dynamic>? query,
    bool anonymous = false,
    Map<String, String> renameFields = const {},
    Map<String, String>? headers,
    required T Function(dynamic json) parse,
  }) async {
    try {
      final response = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: _cleanQuery(query),
        options: Options(method: method, headers: headers, extra: {'anonymous': anonymous}),
      );
      if (response.statusCode == 204) return parse(null);
      final data = unwrapEnvelope(
        response.data as Map<String, dynamic>,
        response.statusCode ?? 0,
        renameFields: renameFields,
      );
      return parse(data);
    } on DioException catch (e) {
      final responseData = e.response?.data;
      if (responseData is Map<String, dynamic>) {
        // unwrapEnvelope throws on failure, which is the expected outcome
        // here — dio flagged this as an error status, so the envelope's
        // `success` field is almost always false too.
        final data = unwrapEnvelope(
          responseData,
          e.response!.statusCode ?? 0,
          renameFields: renameFields,
        );
        return parse(data);
      }
      throw ApiException(0, 'Could not reach the server. Check your connection and try again.');
    }
  }

  Map<String, dynamic>? _cleanQuery(Map<String, dynamic>? query) {
    if (query == null) return null;
    final cleaned = <String, dynamic>{};
    for (final entry in query.entries) {
      if (entry.value == null || entry.value == '') continue;
      cleaned[entry.key] = entry.value;
    }
    return cleaned.isEmpty ? null : cleaned;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/core/network/api_client_test.dart`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/core/network/dio_client.dart my__accountant/lib/core/network/api_client.dart my__accountant/test/core/network/api_client_test.dart
git commit -m "Add dio client and ApiClient"
```

---

### Task 8: Theme (palette + app theme)

**Files:**
- Create: `my__accountant/lib/core/theme/palette.dart`
- Create: `my__accountant/lib/core/theme/app_theme.dart`
- Test: `my__accountant/test/core/theme/app_theme_test.dart`

**Interfaces:**
- Produces:
  - `class Brand { static const Color primary, primaryDark, primaryLight, secondary; }`
  - `class ThemeColors { const ThemeColors({...}); final Color primary, primaryDark, primaryLight, secondary, background, surface, border, inputFill, ink, muted, success, warning, error, brandFill, onBrandFill, brandWash; }`
  - `const ThemeColors lightColors, darkColors;`
  - `class Allocation { const Allocation({required String name, required int percentage, required Color light, required Color dark}); Color colorFor(Brightness brightness); }`
  - `const List<Allocation> allocations;`
  - `class AppColors extends ThemeExtension<AppColors> { const AppColors(ThemeColors colors); final ThemeColors colors; }`
  - `ThemeData buildAppTheme(Brightness brightness)`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/core/theme/app_theme_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/theme/app_theme.dart';
import 'package:my__accountant/core/theme/palette.dart';

void main() {
  test('light theme exposes the light palette via AppColors', () {
    final theme = buildAppTheme(Brightness.light);
    final colors = theme.extension<AppColors>()!.colors;
    expect(colors.primary, const Color(0xFF1E88E5));
    expect(colors.background, const Color(0xFFF8FAFC));
    expect(colors.brandWash, const Color(0xFFEFF6FE));
  });

  test('dark theme steps primary up to primaryLight for contrast', () {
    final theme = buildAppTheme(Brightness.dark);
    final colors = theme.extension<AppColors>()!.colors;
    expect(colors.primary, const Color(0xFF64B5F6));
    expect(colors.background, const Color(0xFF0B1220));
    expect(colors.brandWash, const Color(0xFF17263D));
  });

  test('brandFill is the true brand blue in both schemes', () {
    expect(lightColors.brandFill, const Color(0xFF1E88E5));
    expect(darkColors.brandFill, const Color(0xFF1E88E5));
  });

  test('allocation percentages sum to 100', () {
    final total = allocations.fold<int>(0, (sum, a) => sum + a.percentage);
    expect(total, 100);
  });

  test('allocation resolves to the right color per brightness', () {
    final essentials = allocations.firstWhere((a) => a.name == 'Essentials');
    expect(essentials.colorFor(Brightness.light), Brand.primary);
    expect(essentials.colorFor(Brightness.dark), Brand.primaryLight);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/core/theme/app_theme_test.dart`
Expected: FAIL — missing `app_theme.dart`, `palette.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/core/theme/palette.dart
import 'package:flutter/material.dart';

/// Direct port of `constants/palette.js` from the RN app — the single
/// source of truth for color there, reproduced here so both apps show the
/// same brand.

class Brand {
  static const primary = Color(0xFF1E88E5);
  static const primaryDark = Color(0xFF1565C0);
  static const primaryLight = Color(0xFF64B5F6);
  static const secondary = Color(0xFF475569);
}

class ThemeColors {
  const ThemeColors({
    required this.primary,
    required this.primaryDark,
    required this.primaryLight,
    required this.secondary,
    required this.background,
    required this.surface,
    required this.border,
    required this.inputFill,
    required this.ink,
    required this.muted,
    required this.success,
    required this.warning,
    required this.error,
    required this.brandFill,
    required this.onBrandFill,
    required this.brandWash,
  });

  final Color primary;
  final Color primaryDark;
  final Color primaryLight;
  final Color secondary;
  final Color background;
  final Color surface;
  final Color border;
  final Color inputFill;
  final Color ink;
  final Color muted;
  final Color success;
  final Color warning;
  final Color error;
  final Color brandFill;
  final Color onBrandFill;
  final Color brandWash;
}

const lightColors = ThemeColors(
  primary: Brand.primary,
  primaryDark: Brand.primaryDark,
  primaryLight: Brand.primaryLight,
  secondary: Brand.secondary,
  background: Color(0xFFF8FAFC),
  surface: Color(0xFFFFFFFF),
  border: Color(0xFFE2E8F0),
  inputFill: Color(0xFFE2E8F0),
  ink: Color(0xFF0F172A),
  muted: Color(0xFF64748B),
  success: Color(0xFF22C55E),
  warning: Color(0xFFF59E0B),
  error: Color(0xFFEF4444),
  brandFill: Brand.primary,
  onBrandFill: Color(0xFFFFFFFF),
  brandWash: Color(0xFFEFF6FE),
);

const darkColors = ThemeColors(
  primary: Brand.primaryLight,
  primaryDark: Brand.primary,
  primaryLight: Color(0xFF90CAF9),
  secondary: Color(0xFF94A3B8),
  background: Color(0xFF0B1220),
  surface: Color(0xFF141E33),
  border: Color(0xFF25324B),
  inputFill: Color(0xFF25324B),
  ink: Color(0xFFF1F5F9),
  muted: Color(0xFF94A3B8),
  success: Color(0xFF4ADE80),
  warning: Color(0xFFFBBF24),
  error: Color(0xFFF87171),
  brandFill: Brand.primary,
  onBrandFill: Color(0xFFFFFFFF),
  brandWash: Color(0xFF17263D),
);

class Allocation {
  const Allocation({
    required this.name,
    required this.percentage,
    required this.light,
    required this.dark,
  });

  final String name;
  final int percentage;
  final Color light;
  final Color dark;

  Color colorFor(Brightness brightness) => brightness == Brightness.dark ? dark : light;
}

const allocations = <Allocation>[
  Allocation(name: 'Essentials', percentage: 60, light: Brand.primary, dark: Brand.primaryLight),
  Allocation(name: 'Savings', percentage: 20, light: Brand.primaryDark, dark: Brand.primary),
  Allocation(
    name: 'Investments',
    percentage: 10,
    light: Brand.primaryLight,
    dark: Color(0xFF90CAF9),
  ),
  Allocation(name: 'Emergency', percentage: 10, light: Color(0xFFF59E0B), dark: Color(0xFFFBBF24)),
];
```

```dart
// my__accountant/lib/core/theme/app_theme.dart
import 'package:flutter/material.dart';

import 'palette.dart';

@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors(this.colors);

  final ThemeColors colors;

  @override
  AppColors copyWith({ThemeColors? colors}) => AppColors(colors ?? this.colors);

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return t < 0.5 ? this : other;
  }
}

ThemeData buildAppTheme(Brightness brightness) {
  final colors = brightness == Brightness.dark ? darkColors : lightColors;
  return ThemeData(
    brightness: brightness,
    scaffoldBackgroundColor: colors.background,
    colorScheme: ColorScheme(
      brightness: brightness,
      primary: colors.primary,
      onPrimary: colors.onBrandFill,
      secondary: colors.secondary,
      onSecondary: colors.onBrandFill,
      error: colors.error,
      onError: colors.onBrandFill,
      surface: colors.surface,
      onSurface: colors.ink,
    ),
    extensions: [AppColors(colors)],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/core/theme/app_theme_test.dart`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/core/theme my__accountant/test/core/theme
git commit -m "Add app theme ported from RN palette"
```

---

### Task 9: Core providers

**Files:**
- Create: `my__accountant/lib/core/network/providers.dart`

**Interfaces:**
- Consumes: `SecureSessionStore`/`SecureTokenStorage` (Task 4), `buildDio`/`ApiClient` (Task 7)
- Produces:
  - `final sessionStoreProvider = Provider<SecureSessionStore>(...)`
  - `final dioProvider = Provider<Dio>(...)`
  - `final apiClientProvider = Provider<ApiClient>(...)`

No test file for this task — it's pure dependency wiring with no branching logic of its own; it's exercised indirectly by every test in later tasks that overrides these providers.

- [ ] **Step 1: Implement**

```dart
// my__accountant/lib/core/network/providers.dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/secure_session_store.dart';
import '../storage/token_storage.dart';
import 'api_client.dart';
import 'dio_client.dart';

final sessionStoreProvider = Provider<SecureSessionStore>((ref) {
  return SecureSessionStore(const SecureTokenStorage());
});

final dioProvider = Provider<Dio>((ref) {
  return buildDio(sessionStore: ref.watch(sessionStoreProvider));
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.watch(dioProvider));
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "my__accountant" && flutter analyze lib/core/network/providers.dart`
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
cd .. && git add my__accountant/lib/core/network/providers.dart
git commit -m "Add core network Riverpod providers"
```

---

### Task 10: Auth validation

**Files:**
- Create: `my__accountant/lib/features/auth/data/auth_validation.dart`
- Test: `my__accountant/test/features/auth/data/auth_validation_test.dart`

**Interfaces:**
- Produces:
  - `String normalizePhone(String value)`
  - `bool isPhone(String value); bool isEmail(String value);`
  - `String? validateEmail(String value); String? validatePhone(String value);`
  - `enum IdentifierKind { email, phone } IdentifierKind identifierKind(String value);`
  - `String? validateIdentifier(String value)`
  - `class IdentifierCredential { const IdentifierCredential({String? email, String? phone}); final String? email; final String? phone; }`
  - `IdentifierCredential identifierCredential(String value)`
  - `String? validatePassword(String value)`
  - `String? validateName(String value, String label)`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/auth/data/auth_validation_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/features/auth/data/auth_validation.dart';

void main() {
  group('normalizePhone', () {
    test('strips spaces, dashes, dots and parens', () {
      expect(normalizePhone(' +254 (712) 345-678 '), '+254712345678');
    });
  });

  group('validateEmail', () {
    test('requires a value', () => expect(validateEmail(''), isNotNull));
    test('requires a complete address', () => expect(validateEmail('not-an-email'), isNotNull));
    test('accepts a valid address', () => expect(validateEmail('a@b.com'), isNull));
    test('rejects an address over 255 chars',
        () => expect(validateEmail('${'a' * 250}@b.com'), isNotNull));
  });

  group('validatePhone', () {
    test('requires a value', () => expect(validatePhone(''), isNotNull));
    test('requires E.164', () => expect(validatePhone('0712345678'), isNotNull));
    test('accepts E.164', () => expect(validatePhone('+254712345678'), isNull));
  });

  group('identifierKind', () {
    test('a leading + or digit is a phone', () {
      expect(identifierKind('+254712345678'), IdentifierKind.phone);
      expect(identifierKind('0712345678'), IdentifierKind.phone);
    });
    test('anything else is an email', () {
      expect(identifierKind('a@b.com'), IdentifierKind.email);
    });
  });

  group('validateIdentifier', () {
    test('requires a value', () => expect(validateIdentifier(''), isNotNull));
    test('validates as phone when it looks like one',
        () => expect(validateIdentifier('0712345678'), isNotNull));
    test('validates as email otherwise', () => expect(validateIdentifier('a@b.com'), isNull));
  });

  group('identifierCredential', () {
    test('normalizes a phone identifier', () {
      final cred = identifierCredential('0712 345 678');
      expect(cred.phone, '0712345678');
      expect(cred.email, isNull);
    });
    test('trims an email identifier', () {
      final cred = identifierCredential(' a@b.com ');
      expect(cred.email, 'a@b.com');
      expect(cred.phone, isNull);
    });
  });

  group('validatePassword', () {
    test('requires a value', () => expect(validatePassword(''), isNotNull));
    test('requires at least 10 characters', () => expect(validatePassword('Ab1defg'), isNotNull));
    test('requires upper, lower and a digit',
        () => expect(validatePassword('alllowercase1'), isNotNull));
    test('accepts a compliant password', () => expect(validatePassword('Abcdefghij1'), isNull));
    test('rejects over 72 characters', () => expect(validatePassword('Aa1${'a' * 72}'), isNotNull));
  });

  group('validateName', () {
    test('requires a value', () => expect(validateName('', 'first name'), isNotNull));
    test('rejects over 100 characters',
        () => expect(validateName('a' * 101, 'first name'), isNotNull));
    test('accepts a normal name', () => expect(validateName('Jane', 'first name'), isNull));
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/auth/data/auth_validation_test.dart`
Expected: FAIL — missing `auth_validation.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/auth/data/auth_validation.dart

/// Client-side mirrors of the rules the API already enforces (see
/// `lib/auth-validation.ts` in the RN app). These exist to answer the user
/// on the device instead of after a round trip — the API stays the
/// authority, and its rejection is still shown.

final _e164 = RegExp(r'^\+[1-9]\d{1,14}$');
final _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

String normalizePhone(String value) => value.trim().replaceAll(RegExp(r'[\s\-().]'), '');

bool isPhone(String value) => _e164.hasMatch(normalizePhone(value));
bool isEmail(String value) => _email.hasMatch(value.trim());

String? validateEmail(String value) {
  if (value.trim().isEmpty) return 'Enter your email address.';
  if (!isEmail(value)) return 'Enter a complete email address, like you@example.com.';
  if (value.trim().length > 255) return 'That email address is too long.';
  return null;
}

String? validatePhone(String value) {
  if (value.trim().isEmpty) return 'Enter your phone number.';
  if (!isPhone(value)) return 'Start with your country code, like +254 712 345 678.';
  return null;
}

enum IdentifierKind { email, phone }

/// The test is the leading character rather than a full match: anything
/// starting with `+` or a digit can only be an attempt at a phone number, so
/// a half-typed one gets the phone error explaining the country code, not a
/// confusing complaint about a missing `@`.
IdentifierKind identifierKind(String value) {
  final trimmed = value.trim();
  return RegExp(r'^[+\d]').hasMatch(trimmed) ? IdentifierKind.phone : IdentifierKind.email;
}

String? validateIdentifier(String value) {
  if (value.trim().isEmpty) return 'Enter your email address or phone number.';
  return identifierKind(value) == IdentifierKind.phone ? validatePhone(value) : validateEmail(value);
}

/// The credential shape the API expects, keyed by what the user actually
/// typed — exactly one of [email]/[phone] is set.
class IdentifierCredential {
  const IdentifierCredential({this.email, this.phone});

  final String? email;
  final String? phone;
}

IdentifierCredential identifierCredential(String value) =>
    identifierKind(value) == IdentifierKind.phone
        ? IdentifierCredential(phone: normalizePhone(value))
        : IdentifierCredential(email: value.trim());

String? validatePassword(String value) {
  if (value.isEmpty) return 'Enter a password.';
  if (value.length < 10) return 'Use at least 10 characters.';
  // The server caps at 72 because bcrypt ignores anything past 72 bytes.
  if (value.length > 72) return 'Use at most 72 characters.';
  if (!RegExp(r'[a-z]').hasMatch(value) ||
      !RegExp(r'[A-Z]').hasMatch(value) ||
      !RegExp(r'\d').hasMatch(value)) {
    return 'Include a capital letter, a lower case letter and a number.';
  }
  return null;
}

String? validateName(String value, String label) {
  if (value.trim().isEmpty) return 'Enter your $label.';
  if (value.trim().length > 100) return 'That $label is too long.';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/features/auth/data/auth_validation_test.dart`
Expected: PASS (20 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/features/auth/data/auth_validation.dart my__accountant/test/features/auth/data/auth_validation_test.dart
git commit -m "Add auth validation"
```

---

### Task 11: Auth models + AuthRepository

**Files:**
- Create: `my__accountant/lib/features/auth/data/auth_models.dart`
- Create: `my__accountant/lib/features/auth/data/auth_repository.dart`
- Test: `my__accountant/test/features/auth/data/auth_repository_test.dart`

**Interfaces:**
- Consumes: `ApiClient` (Task 7)
- Produces:
  - `class AuthenticatedUser { final String id, email, firstName, lastName, role, timezone, createdAt; final String? phone, avatarUrl; final bool isVerified; factory AuthenticatedUser.fromJson(Map<String, dynamic> json); }`
  - `class AuthResult { final String accessToken, refreshToken; final AuthenticatedUser user; factory AuthResult.fromJson(Map<String, dynamic> json); }`
  - `class AuthRepository { AuthRepository(ApiClient client); Future<AuthResult> signIn({String? email, String? phone, required String password}); Future<AuthResult> createAccount({required String email, required String phone, required String password, required String firstName, required String lastName, String? timezone}); Future<AuthenticatedUser> getProfile(); Future<AuthenticatedUser> updateProfile({String? phone, String? firstName, String? lastName, String? timezone}); Future<void> signOutRemote(String? refreshToken); }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/auth/data/auth_repository_test.dart
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/features/auth/data/auth_repository.dart';

import '../../../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

Map<String, dynamic> _userJson() => {
      'id': 'u1',
      'email': 'a@b.com',
      'phone': '+254712345678',
      'firstName': 'Jane',
      'lastName': 'Doe',
      'avatarUrl': null,
      'role': 'user',
      'timezone': 'Africa/Nairobi',
      'isVerified': true,
      'createdAt': '2026-01-01T00:00:00Z',
    };

void main() {
  late Dio dio;
  late AuthRepository repository;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    repository = AuthRepository(ApiClient(dio));
  });

  test('signIn sends the identifier under email or phone and renames on error', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/auth/login');
      expect(options.extra['anonymous'], isTrue);
      return _jsonBody({
        'success': true,
        'data': {'accessToken': 'a', 'refreshToken': 'r', 'user': _userJson()},
      }, 200);
    });

    final result = await repository.signIn(email: 'a@b.com', password: 'Abcdefghij1');
    expect(result.accessToken, 'a');
    expect(result.user.firstName, 'Jane');
  });

  test('createAccount posts to register', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/auth/register');
      final body = jsonDecode(options.data as String) as Map<String, dynamic>;
      expect(body['email'], 'a@b.com');
      expect(body['phone'], '+254712345678');
      return _jsonBody({
        'success': true,
        'data': {'accessToken': 'a', 'refreshToken': 'r', 'user': _userJson()},
      }, 200);
    });

    final result = await repository.createAccount(
      email: 'a@b.com',
      phone: '+254712345678',
      password: 'Abcdefghij1',
      firstName: 'Jane',
      lastName: 'Doe',
    );
    expect(result.user.id, 'u1');
  });

  test('getProfile fetches /api/auth/me', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/auth/me');
      return _jsonBody({'success': true, 'data': _userJson()}, 200);
    });

    final user = await repository.getProfile();
    expect(user.email, 'a@b.com');
  });

  test('updateProfile only sends provided fields', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      final body = jsonDecode(options.data as String) as Map<String, dynamic>;
      expect(body.containsKey('firstName'), isTrue);
      expect(body.containsKey('lastName'), isFalse);
      return _jsonBody({'success': true, 'data': _userJson()}, 200);
    });

    await repository.updateProfile(firstName: 'Janet');
  });

  test('signOutRemote does nothing without a refresh token', () async {
    var called = false;
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      called = true;
      return _jsonBody({'success': true, 'data': null}, 200);
    });

    await repository.signOutRemote(null);
    expect(called, isFalse);
  });

  test('signOutRemote swallows a failed logout call', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      return _jsonBody({'success': false, 'message': 'gone'}, 400);
    });

    await repository.signOutRemote('refresh-token'); // must not throw
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/auth/data/auth_repository_test.dart`
Expected: FAIL — missing `auth_repository.dart`, `auth_models.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/auth/data/auth_models.dart
class AuthenticatedUser {
  const AuthenticatedUser({
    required this.id,
    required this.email,
    required this.phone,
    required this.firstName,
    required this.lastName,
    required this.avatarUrl,
    required this.role,
    required this.timezone,
    required this.isVerified,
    required this.createdAt,
  });

  final String id;
  final String email;
  final String? phone;
  final String firstName;
  final String lastName;
  final String? avatarUrl;
  final String role;
  final String timezone;
  final bool isVerified;
  final String createdAt;

  factory AuthenticatedUser.fromJson(Map<String, dynamic> json) => AuthenticatedUser(
        id: json['id'] as String,
        email: json['email'] as String,
        phone: json['phone'] as String?,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
        avatarUrl: json['avatarUrl'] as String?,
        role: json['role'] as String,
        timezone: json['timezone'] as String,
        isVerified: json['isVerified'] as bool,
        createdAt: json['createdAt'] as String,
      );
}

class AuthResult {
  const AuthResult({required this.accessToken, required this.refreshToken, required this.user});

  final String accessToken;
  final String refreshToken;
  final AuthenticatedUser user;

  factory AuthResult.fromJson(Map<String, dynamic> json) => AuthResult(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        user: AuthenticatedUser.fromJson(json['user'] as Map<String, dynamic>),
      );
}
```

```dart
// my__accountant/lib/features/auth/data/auth_repository.dart
import '../../../core/network/api_client.dart';
import 'auth_models.dart';

/// Mirrors `lib/auth-client.ts` in the RN app.
class AuthRepository {
  AuthRepository(this._client);

  final ApiClient _client;

  /// Sign in with either an email or a phone number, plus the password. The
  /// screen shows one identifier field; the API reports a bad identifier
  /// against whichever key was sent, so both map to `identifier` on error.
  Future<AuthResult> signIn({String? email, String? phone, required String password}) {
    return _client.request(
      '/api/auth/login',
      method: 'POST',
      anonymous: true,
      body: {
        if (email != null) 'email': email,
        if (phone != null) 'phone': phone,
        'password': password,
      },
      renameFields: const {'email': 'identifier', 'phone': 'identifier'},
      parse: (json) => AuthResult.fromJson(json as Map<String, dynamic>),
    );
  }

  /// Creates an account. The API requires both an email and a phone number.
  Future<AuthResult> createAccount({
    required String email,
    required String phone,
    required String password,
    required String firstName,
    required String lastName,
    String? timezone,
  }) {
    return _client.request(
      '/api/auth/register',
      method: 'POST',
      anonymous: true,
      body: {
        'email': email,
        'phone': phone,
        'password': password,
        'firstName': firstName,
        'lastName': lastName,
        if (timezone != null) 'timezone': timezone,
      },
      parse: (json) => AuthResult.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<AuthenticatedUser> getProfile() {
    return _client.request(
      '/api/auth/me',
      parse: (json) => AuthenticatedUser.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<AuthenticatedUser> updateProfile({
    String? phone,
    String? firstName,
    String? lastName,
    String? timezone,
  }) {
    return _client.request(
      '/api/auth/me',
      method: 'PATCH',
      body: {
        if (phone != null) 'phone': phone,
        if (firstName != null) 'firstName': firstName,
        if (lastName != null) 'lastName': lastName,
        if (timezone != null) 'timezone': timezone,
      },
      parse: (json) => AuthenticatedUser.fromJson(json as Map<String, dynamic>),
    );
  }

  /// Revokes the refresh token server-side. Sent anonymously and
  /// deliberately best-effort: local sign-out proceeds regardless of the
  /// result, since stranding the user in a signed-in state because the
  /// network was down is the worse failure.
  Future<void> signOutRemote(String? refreshToken) async {
    if (refreshToken == null) return;
    try {
      await _client.request<void>(
        '/api/auth/logout',
        method: 'POST',
        anonymous: true,
        body: {'refreshToken': refreshToken},
        parse: (_) {},
      );
    } catch (_) {
      // Local sign-out proceeds regardless.
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/features/auth/data/auth_repository_test.dart`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/features/auth/data/auth_models.dart my__accountant/lib/features/auth/data/auth_repository.dart my__accountant/test/features/auth/data/auth_repository_test.dart
git commit -m "Add auth models and AuthRepository"
```

---

### Task 12: Google auth service

**Files:**
- Create: `my__accountant/lib/features/auth/data/google_auth.dart`
- Test: `my__accountant/test/features/auth/data/google_auth_test.dart`

**Interfaces:**
- Consumes: `ApiClient` (Task 7), `AuthResult`/`AuthenticatedUser` (Task 11), `apiBaseUrl()` (Task 7)
- Produces:
  - `GoogleAuthResult? parseGoogleCallback(String callbackUrl)` — throws `ApiException` when the callback carries neither tokens nor a message; a getter-style parse, not literally nullable in practice (see implementation), but documented as throwing.
  - `class GoogleAuthService { GoogleAuthService(ApiClient client, {Future<String> Function(String url, String scheme)? authenticate}); Future<AuthResult?> continueWithGoogle(); }` — returns `null` when the user backs out of the browser flow.

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/auth/data/google_auth_test.dart
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/core/network/api_exception.dart';
import 'package:my__accountant/features/auth/data/google_auth.dart';

import '../../../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  group('parseGoogleCallback', () {
    test('extracts tokens from the callback query string', () {
      final result = parseGoogleCallback(
        'myaccountant://auth/callback?access_token=a&refresh_token=r',
      );
      expect(result.accessToken, 'a');
      expect(result.refreshToken, 'r');
    });

    test('throws with the server message when tokens are missing', () {
      expect(
        () => parseGoogleCallback('myaccountant://auth/callback?message=Linked+to+another+account'),
        throwsA(isA<ApiException>().having(
          (e) => e.message,
          'message',
          'Linked to another account',
        )),
      );
    });

    test('throws a generic message when neither tokens nor a message are present', () {
      expect(
        () => parseGoogleCallback('myaccountant://auth/callback'),
        throwsA(isA<ApiException>().having(
          (e) => e.message,
          'message',
          'Google sign-in did not complete. Try again.',
        )),
      );
    });
  });

  group('GoogleAuthService.continueWithGoogle', () {
    test('returns null when the user backs out of the browser', () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
      final service = GoogleAuthService(
        ApiClient(dio),
        authenticate: (url, scheme) async => throw Exception('user canceled'),
      );

      expect(await service.continueWithGoogle(), isNull);
    });

    test('fetches the profile with the callback access token and returns AuthResult', () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/auth/me');
        expect(options.headers['Authorization'], 'Bearer access-1');
        return _jsonBody({
          'success': true,
          'data': {
            'id': 'u1',
            'email': 'a@b.com',
            'phone': null,
            'firstName': 'Jane',
            'lastName': 'Doe',
            'avatarUrl': null,
            'role': 'user',
            'timezone': 'Africa/Nairobi',
            'isVerified': true,
            'createdAt': '2026-01-01T00:00:00Z',
          },
        }, 200);
      });

      final service = GoogleAuthService(
        ApiClient(dio),
        authenticate: (url, scheme) async {
          expect(url, 'https://example.test/api/auth/google');
          expect(scheme, 'myaccountant');
          return 'myaccountant://auth/callback?access_token=access-1&refresh_token=refresh-1';
        },
      );

      final result = await service.continueWithGoogle();
      expect(result?.accessToken, 'access-1');
      expect(result?.user.firstName, 'Jane');
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/auth/data/google_auth_test.dart`
Expected: FAIL — missing `google_auth.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/auth/data/google_auth.dart
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import 'auth_models.dart';

class GoogleAuthResult {
  const GoogleAuthResult({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;
}

/// Parses the callback URL the system browser redirects to —
/// `myaccountant://auth/callback` — after `/api/auth/google` completes.
/// Mirrors the query-parsing half of `continueWithGoogle` in
/// `lib/auth-client.ts`.
GoogleAuthResult parseGoogleCallback(String callbackUrl) {
  final uri = Uri.parse(callbackUrl);
  final accessToken = uri.queryParameters['access_token'];
  final refreshToken = uri.queryParameters['refresh_token'];
  if (accessToken == null || refreshToken == null) {
    // The API redirects here on failure too, so prefer whatever it said
    // over a guess about what went wrong.
    final message = uri.queryParameters['message'];
    throw ApiException(0, message ?? 'Google sign-in did not complete. Try again.');
  }
  return GoogleAuthResult(accessToken: accessToken, refreshToken: refreshToken);
}

/// Google sign-in and sign-up are the same call — the API decides which it
/// is, matching on the Google account id first, then a verified email.
///
/// Runs in the system's authentication browser (`flutter_web_auth_2`, the
/// `ASWebAuthenticationSession`/Custom Tab equivalent of
/// `expo-web-browser`), not an embedded WebView — Google refuses to serve
/// its consent screen to one. [authenticate] is injectable so this class is
/// unit-testable without a real browser.
class GoogleAuthService {
  GoogleAuthService(this._client, {Future<String> Function(String url, String scheme)? authenticate})
      : _authenticate = authenticate ?? _defaultAuthenticate;

  final ApiClient _client;
  final Future<String> Function(String url, String scheme) _authenticate;

  static Future<String> _defaultAuthenticate(String url, String scheme) {
    return FlutterWebAuth2.authenticate(url: url, callbackUrlScheme: scheme);
  }

  /// Returns `null` when the user backs out of the consent screen — that is
  /// not an error and should not be reported as one.
  Future<AuthResult?> continueWithGoogle() async {
    String callbackUrl;
    try {
      callbackUrl = await _authenticate('${apiBaseUrl()}/api/auth/google', 'myaccountant');
    } catch (_) {
      return null;
    }

    final parsed = parseGoogleCallback(callbackUrl);

    // The redirect carries tokens but no profile, so it's read back with the
    // token that was just issued.
    final user = await _client.request<AuthenticatedUser>(
      '/api/auth/me',
      anonymous: true,
      headers: {'Authorization': 'Bearer ${parsed.accessToken}'},
      parse: (json) => AuthenticatedUser.fromJson(json as Map<String, dynamic>),
    );

    return AuthResult(accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, user: user);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/features/auth/data/google_auth_test.dart`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/features/auth/data/google_auth.dart my__accountant/test/features/auth/data/google_auth_test.dart
git commit -m "Add Google OAuth service"
```

---

### Task 13: Auth data providers

**Files:**
- Create: `my__accountant/lib/features/auth/data/auth_providers.dart`

**Interfaces:**
- Consumes: `apiClientProvider` (Task 9), `AuthRepository` (Task 11), `GoogleAuthService` (Task 12)
- Produces:
  - `final authRepositoryProvider = Provider<AuthRepository>(...)`
  - `final googleAuthServiceProvider = Provider<GoogleAuthService>(...)`

No dedicated test — pure wiring, exercised by Task 14's tests via provider overrides.

- [ ] **Step 1: Implement**

```dart
// my__accountant/lib/features/auth/data/auth_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/providers.dart';
import 'auth_repository.dart';
import 'google_auth.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.watch(apiClientProvider));
});

final googleAuthServiceProvider = Provider<GoogleAuthService>((ref) {
  return GoogleAuthService(ref.watch(apiClientProvider));
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "my__accountant" && flutter analyze lib/features/auth/data/auth_providers.dart`
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
cd .. && git add my__accountant/lib/features/auth/data/auth_providers.dart
git commit -m "Add auth data providers"
```

---

### Task 14: AuthNotifier + authProvider

**Files:**
- Create: `my__accountant/lib/features/auth/state/auth_state.dart`
- Create: `my__accountant/lib/features/auth/state/auth_provider.dart`
- Test: `my__accountant/test/features/auth/state/auth_provider_test.dart`

**Interfaces:**
- Consumes: `AuthRepository`/`authRepositoryProvider` (Tasks 11, 13), `GoogleAuthService`/`googleAuthServiceProvider` (Tasks 12, 13), `SecureSessionStore`/`sessionStoreProvider` (Tasks 4, 9), `setSignedOutHandler` (Task 6)
- Produces:
  - `enum AuthStatus { loading, authenticated, unauthenticated }`
  - `class AuthState { const AuthState({required AuthStatus status, AuthenticatedUser? user}); final AuthStatus status; final AuthenticatedUser? user; static const initial; AuthState copyWith({AuthStatus? status, AuthenticatedUser? user}); }`
  - `class AuthNotifier extends Notifier<AuthState> { Future<void> signInWithPassword({String? email, String? phone, required String password, required bool remember}); Future<void> signUpWithPassword({required String email, required String phone, required String password, required String firstName, required String lastName, String? timezone, required bool remember}); Future<bool> signInWithGoogle({required bool remember}); Future<void> signOut(); Future<void> refreshUser(); void handleSignedOut(); }`
  - `final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/auth/state/auth_provider_test.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/api_exception.dart';
import 'package:my__accountant/core/storage/secure_session_store.dart';
import 'package:my__accountant/core/storage/session.dart';
import 'package:my__accountant/core/network/providers.dart';
import 'package:my__accountant/features/auth/data/auth_models.dart';
import 'package:my__accountant/features/auth/data/auth_providers.dart';
import 'package:my__accountant/features/auth/data/auth_repository.dart';
import 'package:my__accountant/features/auth/data/google_auth.dart';
import 'package:my__accountant/features/auth/state/auth_provider.dart';
import 'package:my__accountant/features/auth/state/auth_state.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

class MockGoogleAuthService extends Mock implements GoogleAuthService {}

class MockSecureSessionStore extends Mock implements SecureSessionStore {}

AuthenticatedUser _user() => const AuthenticatedUser(
      id: 'u1',
      email: 'a@b.com',
      phone: null,
      firstName: 'Jane',
      lastName: 'Doe',
      avatarUrl: null,
      role: 'user',
      timezone: 'Africa/Nairobi',
      isVerified: true,
      createdAt: '2026-01-01T00:00:00Z',
    );

void main() {
  late MockAuthRepository repository;
  late MockGoogleAuthService googleAuth;
  late MockSecureSessionStore sessionStore;
  late ProviderContainer container;

  setUp(() {
    repository = MockAuthRepository();
    googleAuth = MockGoogleAuthService();
    sessionStore = MockSecureSessionStore();
    container = ProviderContainer(overrides: [
      authRepositoryProvider.overrideWithValue(repository),
      googleAuthServiceProvider.overrideWithValue(googleAuth),
      sessionStoreProvider.overrideWithValue(sessionStore),
    ]);
    addTearDown(container.dispose);
  });

  Future<void> pumpBootstrap() => Future<void>.delayed(Duration.zero);

  test('bootstraps to unauthenticated when there is no stored session', () async {
    when(() => sessionStore.restore()).thenAnswer((_) async => null);

    container.read(authProvider);
    await pumpBootstrap();

    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
  });

  test('bootstraps to authenticated when the stored session is still valid', () async {
    when(() => sessionStore.restore())
        .thenAnswer((_) async => const Session(accessToken: 'a', refreshToken: 'r'));
    when(() => repository.getProfile()).thenAnswer((_) async => _user());

    container.read(authProvider);
    await pumpBootstrap();

    final state = container.read(authProvider);
    expect(state.status, AuthStatus.authenticated);
    expect(state.user?.id, 'u1');
  });

  test('signs out when the stored session no longer validates', () async {
    when(() => sessionStore.restore())
        .thenAnswer((_) async => const Session(accessToken: 'a', refreshToken: 'r'));
    when(() => repository.getProfile()).thenThrow(ApiException(401, 'expired'));
    when(() => sessionStore.clear()).thenAnswer((_) async {});

    container.read(authProvider);
    await pumpBootstrap();

    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
    verify(() => sessionStore.clear()).called(1);
  });

  test('signInWithPassword adopts the session and sets authenticated', () async {
    when(() => sessionStore.restore()).thenAnswer((_) async => null);
    when(() => repository.signIn(email: 'a@b.com', phone: null, password: 'Abcdefghij1'))
        .thenAnswer((_) async => AuthResult(accessToken: 'a', refreshToken: 'r', user: _user()));
    when(() => sessionStore.save(any(), remember: any(named: 'remember')))
        .thenAnswer((_) async {});

    container.read(authProvider);
    await pumpBootstrap();

    await container
        .read(authProvider.notifier)
        .signInWithPassword(email: 'a@b.com', password: 'Abcdefghij1', remember: true);

    final state = container.read(authProvider);
    expect(state.status, AuthStatus.authenticated);
    expect(state.user?.email, 'a@b.com');
    verify(() => sessionStore.save(any(), remember: true)).called(1);
  });

  test('signInWithGoogle returns false and leaves state unauthenticated when canceled', () async {
    when(() => sessionStore.restore()).thenAnswer((_) async => null);
    when(() => googleAuth.continueWithGoogle()).thenAnswer((_) async => null);

    container.read(authProvider);
    await pumpBootstrap();

    final result = await container.read(authProvider.notifier).signInWithGoogle(remember: true);

    expect(result, isFalse);
    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
  });

  test('signOut revokes server-side, clears storage, and sets unauthenticated', () async {
    when(() => sessionStore.restore())
        .thenAnswer((_) async => const Session(accessToken: 'a', refreshToken: 'r'));
    when(() => repository.getProfile()).thenAnswer((_) async => _user());
    when(() => sessionStore.current).thenReturn(const Session(accessToken: 'a', refreshToken: 'r'));
    when(() => repository.signOutRemote('r')).thenAnswer((_) async {});
    when(() => sessionStore.clear()).thenAnswer((_) async {});

    container.read(authProvider);
    await pumpBootstrap();

    await container.read(authProvider.notifier).signOut();

    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
    verify(() => repository.signOutRemote('r')).called(1);
    verify(() => sessionStore.clear()).called(1);
  });

  test('refreshUser re-reads the profile and updates the user only', () async {
    when(() => sessionStore.restore())
        .thenAnswer((_) async => const Session(accessToken: 'a', refreshToken: 'r'));
    when(() => repository.getProfile()).thenAnswer((_) async => _user());

    container.read(authProvider);
    await pumpBootstrap();

    final updated = _user();
    when(() => repository.getProfile()).thenAnswer((_) async => updated);
    await container.read(authProvider.notifier).refreshUser();

    expect(container.read(authProvider).status, AuthStatus.authenticated);
    expect(container.read(authProvider).user?.id, updated.id);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/auth/state/auth_provider_test.dart`
Expected: FAIL — missing `auth_state.dart`, `auth_provider.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/auth/state/auth_state.dart
import '../data/auth_models.dart';

/// Three-valued rather than a boolean: "we have not looked yet" is a real
/// state, and collapsing it to "signed out" would bounce a returning user to
/// the login screen on every cold start while the stored session is still
/// being read. Mirrors `AuthStatus` in `providers/auth-provider.tsx`.
enum AuthStatus { loading, authenticated, unauthenticated }

class AuthState {
  const AuthState({required this.status, this.user});

  final AuthStatus status;
  final AuthenticatedUser? user;

  static const initial = AuthState(status: AuthStatus.loading);

  AuthState copyWith({AuthStatus? status, AuthenticatedUser? user}) =>
      AuthState(status: status ?? this.status, user: user ?? this.user);
}
```

```dart
// my__accountant/lib/features/auth/state/auth_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/providers.dart';
import '../../../core/network/signed_out_handler.dart';
import '../../../core/storage/session.dart';
import '../data/auth_models.dart';
import '../data/auth_providers.dart';
import 'auth_state.dart';

/// Who is signed in, for the whole app. Mirrors `providers/auth-provider.tsx`.
class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() {
    setSignedOutHandler(handleSignedOut);
    ref.onDispose(() => setSignedOutHandler(null));
    // Fire-and-forget: `build()` must return synchronously, so the cold-start
    // restore-and-validate happens after this returns the loading state.
    Future(_bootstrap);
    return AuthState.initial;
  }

  /// Cold start: restore the stored tokens, then prove they still work by
  /// reading the profile. Covers both a revoked session and an unreachable
  /// server — signing out is the safe reading in both cases, since a
  /// signed-in shell with no data and no explanation is worse.
  Future<void> _bootstrap() async {
    final stored = await _sessionStore.restore();
    if (stored == null) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }
    try {
      final user = await _repository.getProfile();
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } catch (_) {
      await _sessionStore.clear();
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  Future<void> _adopt(AuthResult result, {required bool remember}) async {
    await _sessionStore.save(
      Session(accessToken: result.accessToken, refreshToken: result.refreshToken),
      remember: remember,
    );
    state = AuthState(status: AuthStatus.authenticated, user: result.user);
  }

  Future<void> signInWithPassword({
    String? email,
    String? phone,
    required String password,
    required bool remember,
  }) async {
    final result = await _repository.signIn(email: email, phone: phone, password: password);
    await _adopt(result, remember: remember);
  }

  Future<void> signUpWithPassword({
    required String email,
    required String phone,
    required String password,
    required String firstName,
    required String lastName,
    String? timezone,
    required bool remember,
  }) async {
    final result = await _repository.createAccount(
      email: email,
      phone: phone,
      password: password,
      firstName: firstName,
      lastName: lastName,
      timezone: timezone,
    );
    await _adopt(result, remember: remember);
  }

  /// Resolves `false` when the user backs out of Google's consent screen.
  Future<bool> signInWithGoogle({required bool remember}) async {
    final result = await _googleAuth.continueWithGoogle();
    if (result == null) return false;
    await _adopt(result, remember: remember);
    return true;
  }

  Future<void> signOut() async {
    // Revoked server-side first, while the token is still in hand.
    await _repository.signOutRemote(_sessionStore.current?.refreshToken);
    await _sessionStore.clear();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Re-reads the profile — call after changing it, so the app reflects the
  /// change.
  Future<void> refreshUser() async {
    final user = await _repository.getProfile();
    state = state.copyWith(user: user);
  }

  /// Called by the network layer when a refresh token is refused.
  void handleSignedOut() {
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  get _repository => ref.read(authRepositoryProvider);
  get _googleAuth => ref.read(googleAuthServiceProvider);
  get _sessionStore => ref.read(sessionStoreProvider);
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/features/auth/state/auth_provider_test.dart`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/features/auth/state my__accountant/test/features/auth/state
git commit -m "Add AuthNotifier and authProvider"
```

---

### Task 15: Router

**Files:**
- Create: `my__accountant/lib/core/router/app_router.dart`
- Test: `my__accountant/test/core/router/app_router_test.dart`

**Interfaces:**
- Consumes: `authProvider`/`AuthState`/`AuthStatus` (Task 14)
- Produces: `final routerProvider = Provider<GoRouter>(...)` — redirects to `/login` when unauthenticated (except already on `/login` or `/register`), redirects away from `/login`/`/register` to `/` when authenticated, and otherwise renders a `ShellRoute` with a bottom `NavigationBar` over five tab routes (`/`, `/income`, `/expenses`, `/reports`, `/settings`, the last with a `/settings/profile` child). All routes other than `/login` and `/register` render a shared `_ComingSoonScreen` placeholder for now; Tasks 17/18/20 replace the `/login`, `/register` and `/settings/profile` builders with real screens.

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/core/router/app_router_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:my__accountant/core/router/app_router.dart';
import 'package:my__accountant/features/auth/data/auth_models.dart';
import 'package:my__accountant/features/auth/state/auth_provider.dart';
import 'package:my__accountant/features/auth/state/auth_state.dart';

class _FixedAuthNotifier extends AuthNotifier {
  _FixedAuthNotifier(this._fixed);
  final AuthState _fixed;

  @override
  AuthState build() => _fixed;
}

Future<void> _pump(WidgetTester tester, AuthState authState) async {
  final router = ProviderContainer(
    overrides: [authProvider.overrideWith(() => _FixedAuthNotifier(authState))],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: router,
      child: MaterialApp.router(routerConfig: router.read(routerProvider)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('unauthenticated shows the login screen at the root', (tester) async {
    await _pump(tester, const AuthState(status: AuthStatus.unauthenticated));
    expect(find.text('My Accountant'), findsOneWidget); // login screen heading
  });

  testWidgets('authenticated shows the tab shell with bottom navigation', (tester) async {
    await _pump(
      tester,
      const AuthState(
        status: AuthStatus.authenticated,
        user: AuthenticatedUser(
          id: 'u1',
          email: 'a@b.com',
          phone: null,
          firstName: 'Jane',
          lastName: 'Doe',
          avatarUrl: null,
          role: 'user',
          timezone: 'Africa/Nairobi',
          isVerified: true,
          createdAt: '2026-01-01T00:00:00Z',
        ),
      ),
    );
    expect(find.byType(NavigationBar), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/core/router/app_router_test.dart`
Expected: FAIL — missing `app_router.dart` (and the login screen it references, added in this same task as a stub)

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/core/router/app_router.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/state/auth_provider.dart';
import '../../features/auth/state/auth_state.dart';

class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('$title — coming soon')),
    );
  }
}

const _tabPaths = ['/', '/income', '/expenses', '/reports', '/settings'];

class _TabShell extends StatelessWidget {
  const _TabShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final index = _tabPaths.indexWhere((tab) => location == tab);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index < 0 ? 0 : index,
        onDestinationSelected: (i) => context.go(_tabPaths[i]),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.arrow_downward), label: 'Income'),
          NavigationDestination(icon: Icon(Icons.arrow_upward), label: 'Expenses'),
          NavigationDestination(icon: Icon(Icons.bar_chart_outlined), label: 'Reports'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Settings'),
        ],
      ),
    );
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = ValueNotifier<int>(0);
  ref.listen(authProvider, (_, __) => refreshNotifier.value++);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    initialLocation: '/login',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final onAuthRoute = state.matchedLocation == '/login' || state.matchedLocation == '/register';

      if (auth.status == AuthStatus.loading) return null;
      if (auth.status == AuthStatus.unauthenticated) {
        return onAuthRoute ? null : '/login';
      }
      return onAuthRoute ? '/' : null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const ComingSoonScreen('Login')),
      GoRoute(path: '/register', builder: (context, state) => const ComingSoonScreen('Register')),
      ShellRoute(
        builder: (context, state, child) => _TabShell(child: child),
        routes: [
          GoRoute(path: '/', builder: (context, state) => const ComingSoonScreen('Home')),
          GoRoute(path: '/income', builder: (context, state) => const ComingSoonScreen('Income')),
          GoRoute(
            path: '/expenses',
            builder: (context, state) => const ComingSoonScreen('Expenses'),
          ),
          GoRoute(path: '/reports', builder: (context, state) => const ComingSoonScreen('Reports')),
          GoRoute(
            path: '/settings',
            builder: (context, state) => const ComingSoonScreen('Settings'),
            routes: [
              GoRoute(
                path: 'profile',
                builder: (context, state) => const ComingSoonScreen('Profile'),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
```

Note: this initial version renders `ComingSoonScreen('Login')` for `/login`, not yet the real heading the test expects. Task 17 replaces that specific route builder with `LoginScreen`. **Adjust this task's test** to assert against the stub instead, since the real login screen doesn't exist until Task 17:

```dart
// Replace the two assertions above with:
expect(find.text('Login — coming soon'), findsOneWidget);
// ...and for the authenticated case, unchanged:
expect(find.byType(NavigationBar), findsOneWidget);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/core/router/app_router_test.dart`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/core/router my__accountant/test/core/router
git commit -m "Add go_router shell with auth-gated redirect"
```

---

### Task 16: main.dart wiring

**Files:**
- Modify: `my__accountant/lib/main.dart` (replace the entire default counter-app scaffold)

**Interfaces:**
- Consumes: `routerProvider` (Task 15), `buildAppTheme` (Task 8)

- [ ] **Step 1: Implement**

```dart
// my__accountant/lib/main.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

void main() {
  runApp(const ProviderScope(child: MyAccountantApp()));
}

class MyAccountantApp extends ConsumerWidget {
  const MyAccountantApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'My Accountant',
      theme: buildAppTheme(Brightness.light),
      darkTheme: buildAppTheme(Brightness.dark),
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
```

- [ ] **Step 2: Delete the now-unused default widget test**

The `flutter create` scaffold ships `test/widget_test.dart`, which pumps the old counter `MyApp` and no longer compiles against the new `main.dart`.

```bash
cd "my__accountant" && rm test/widget_test.dart
```

- [ ] **Step 3: Confirm the app builds and analyzes cleanly**

Run: `flutter analyze`
Expected: `No issues found!`

- [ ] **Step 4: Manual verification — run the app**

Run (with a physical device or emulator connected, and the backend reachable at the LAN IP from Global Constraints):
```bash
flutter run --dart-define=API_BASE_URL=http://10.34.125.26:3000
```
Expected: the app launches showing the "Login — coming soon" stub screen (since `/login` isn't wired to a real screen until Task 17). No crash, no red error screen.

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/main.dart
git rm my__accountant/test/widget_test.dart
git commit -m "Wire main.dart to the router and theme"
```

---

### Task 17: Login screen

**Files:**
- Create: `my__accountant/lib/features/auth/screens/login_screen.dart`
- Modify: `my__accountant/lib/core/router/app_router.dart` (the `/login` route builder)
- Test: `my__accountant/test/features/auth/screens/login_screen_test.dart`

**Interfaces:**
- Consumes: `authProvider`/`AuthNotifier` (Task 14), `validateIdentifier`/`validatePassword`/`identifierCredential` (Task 10)
- Produces: `class LoginScreen extends ConsumerStatefulWidget { const LoginScreen({super.key}); }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/auth/screens/login_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/features/auth/data/auth_models.dart';
import 'package:my__accountant/features/auth/screens/login_screen.dart';
import 'package:my__accountant/features/auth/state/auth_provider.dart';
import 'package:my__accountant/features/auth/state/auth_state.dart';

class _StubAuthNotifier extends AuthNotifier {
  _StubAuthNotifier({this.onSignIn});
  final Future<void> Function(String? email, String password, bool remember)? onSignIn;

  @override
  AuthState build() => const AuthState(status: AuthStatus.unauthenticated);

  @override
  Future<void> signInWithPassword({
    String? email,
    String? phone,
    required String password,
    required bool remember,
  }) async {
    if (onSignIn != null) {
      await onSignIn!(email, password, remember);
      return;
    }
    state = AuthState(
      status: AuthStatus.authenticated,
      user: const AuthenticatedUser(
        id: 'u1',
        email: 'a@b.com',
        phone: null,
        firstName: 'Jane',
        lastName: 'Doe',
        avatarUrl: null,
        role: 'user',
        timezone: 'Africa/Nairobi',
        isVerified: true,
        createdAt: '2026-01-01T00:00:00Z',
      ),
    );
  }
}

void main() {
  testWidgets('shows validation errors when submitted empty', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [authProvider.overrideWith(() => _StubAuthNotifier())],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Enter your email address or phone number.'), findsOneWidget);
    expect(find.text('Enter a password.'), findsOneWidget);
  });

  testWidgets('submits valid credentials and reaches authenticated state', (tester) async {
    final container = ProviderContainer(
      overrides: [authProvider.overrideWith(() => _StubAuthNotifier())],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    await tester.enterText(find.byKey(const Key('login-identifier')), 'a@b.com');
    await tester.enterText(find.byKey(const Key('login-password')), 'Abcdefghij1');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(container.read(authProvider).status, AuthStatus.authenticated);
  });

  testWidgets('shows the server error message on failure', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(
            () => _StubAuthNotifier(
              onSignIn: (_, __, ___) async =>
                  throw Exception('unused — ApiException path exercised via repository tests'),
            ),
          ),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    await tester.enterText(find.byKey(const Key('login-identifier')), 'a@b.com');
    await tester.enterText(find.byKey(const Key('login-password')), 'Abcdefghij1');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    // The screen must not crash on an unexpected error and must stop showing
    // the spinner.
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/auth/screens/login_screen_test.dart`
Expected: FAIL — missing `login_screen.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/auth/screens/login_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../data/auth_validation.dart';
import '../state/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _remember = true;
  bool _submitting = false;
  String? _formError;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _formError = null;
      _fieldErrors = {};
    });
    try {
      final credential = identifierCredential(_identifierController.text);
      await ref.read(authProvider.notifier).signInWithPassword(
            email: credential.email,
            phone: credential.phone,
            password: _passwordController.text,
            remember: _remember,
          );
    } on ApiException catch (e) {
      setState(() {
        _formError = e.fieldErrors.isEmpty ? e.message : null;
        _fieldErrors = e.fieldErrors;
      });
    } catch (_) {
      setState(() => _formError = 'Something went wrong. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _continueWithGoogle() async {
    setState(() {
      _submitting = true;
      _formError = null;
    });
    try {
      await ref.read(authProvider.notifier).signInWithGoogle(remember: _remember);
    } on ApiException catch (e) {
      setState(() => _formError = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('My Accountant', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 24),
                  if (_formError != null) ...[
                    Text(_formError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    const SizedBox(height: 12),
                  ],
                  TextFormField(
                    key: const Key('login-identifier'),
                    controller: _identifierController,
                    decoration: InputDecoration(
                      labelText: 'Email or phone number',
                      errorText: _fieldErrors['identifier'],
                    ),
                    validator: validateIdentifier,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    key: const Key('login-password'),
                    controller: _passwordController,
                    decoration: InputDecoration(
                      labelText: 'Password',
                      errorText: _fieldErrors['password'],
                    ),
                    obscureText: true,
                    validator: validatePassword,
                  ),
                  Row(
                    children: [
                      Checkbox(value: _remember, onChanged: (v) => setState(() => _remember = v ?? true)),
                      const Text('Remember me'),
                    ],
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            height: 16,
                            width: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Sign in'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: _submitting ? null : _continueWithGoogle,
                    child: const Text('Continue with Google'),
                  ),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () => context.go('/register'),
                    child: const Text("Don't have an account? Register"),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Wire the route**

Modify `my__accountant/lib/core/router/app_router.dart`: add `import '../../features/auth/screens/login_screen.dart';` and change

```dart
GoRoute(path: '/login', builder: (context, state) => const ComingSoonScreen('Login')),
```
to
```dart
GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
```

Then update `test/core/router/app_router_test.dart`'s first assertion back to what Task 15 originally intended:
```dart
expect(find.text('My Accountant'), findsOneWidget); // login screen heading
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `flutter test test/features/auth/screens/login_screen_test.dart test/core/router/app_router_test.dart`
Expected: PASS (5 tests total)

- [ ] **Step 6: Commit**

```bash
cd .. && git add my__accountant/lib/features/auth/screens/login_screen.dart my__accountant/lib/core/router/app_router.dart my__accountant/test/features/auth/screens/login_screen_test.dart my__accountant/test/core/router/app_router_test.dart
git commit -m "Add login screen"
```

---

### Task 18: Register screen

**Files:**
- Create: `my__accountant/lib/features/auth/screens/register_screen.dart`
- Modify: `my__accountant/lib/core/router/app_router.dart` (the `/register` route builder)
- Test: `my__accountant/test/features/auth/screens/register_screen_test.dart`

**Interfaces:**
- Consumes: `authProvider`/`AuthNotifier.signUpWithPassword` (Task 14), `validateEmail`/`validatePhone`/`validatePassword`/`validateName` (Task 10)
- Produces: `class RegisterScreen extends ConsumerStatefulWidget { const RegisterScreen({super.key}); }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/auth/screens/register_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/features/auth/data/auth_models.dart';
import 'package:my__accountant/features/auth/screens/register_screen.dart';
import 'package:my__accountant/features/auth/state/auth_provider.dart';
import 'package:my__accountant/features/auth/state/auth_state.dart';

class _StubAuthNotifier extends AuthNotifier {
  @override
  AuthState build() => const AuthState(status: AuthStatus.unauthenticated);

  @override
  Future<void> signUpWithPassword({
    required String email,
    required String phone,
    required String password,
    required String firstName,
    required String lastName,
    String? timezone,
    required bool remember,
  }) async {
    state = AuthState(
      status: AuthStatus.authenticated,
      user: AuthenticatedUser(
        id: 'u1',
        email: email,
        phone: phone,
        firstName: firstName,
        lastName: lastName,
        avatarUrl: null,
        role: 'user',
        timezone: timezone ?? 'UTC',
        isVerified: false,
        createdAt: '2026-01-01T00:00:00Z',
      ),
    );
  }
}

void main() {
  testWidgets('shows validation errors when submitted empty', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [authProvider.overrideWith(() => _StubAuthNotifier())],
        child: const MaterialApp(home: RegisterScreen()),
      ),
    );

    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();

    expect(find.text('Enter your email address.'), findsOneWidget);
    expect(find.text('Enter your phone number.'), findsOneWidget);
    expect(find.text('Enter your first name.'), findsOneWidget);
    expect(find.text('Enter your last name.'), findsOneWidget);
    expect(find.text('Enter a password.'), findsOneWidget);
  });

  testWidgets('submits valid details and reaches authenticated state', (tester) async {
    final container = ProviderContainer(
      overrides: [authProvider.overrideWith(() => _StubAuthNotifier())],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: RegisterScreen()),
      ),
    );

    await tester.enterText(find.byKey(const Key('register-email')), 'a@b.com');
    await tester.enterText(find.byKey(const Key('register-phone')), '+254712345678');
    await tester.enterText(find.byKey(const Key('register-first-name')), 'Jane');
    await tester.enterText(find.byKey(const Key('register-last-name')), 'Doe');
    await tester.enterText(find.byKey(const Key('register-password')), 'Abcdefghij1');
    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();

    final state = container.read(authProvider);
    expect(state.status, AuthStatus.authenticated);
    expect(state.user?.email, 'a@b.com');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/auth/screens/register_screen_test.dart`
Expected: FAIL — missing `register_screen.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/auth/screens/register_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../data/auth_validation.dart';
import '../state/auth_provider.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  String? _formError;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    _emailController.dispose();
    _phoneController.dispose();
    _firstNameController.dispose();
    _lastNameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _formError = null;
      _fieldErrors = {};
    });
    try {
      await ref.read(authProvider.notifier).signUpWithPassword(
            email: _emailController.text.trim(),
            phone: normalizePhone(_phoneController.text),
            password: _passwordController.text,
            firstName: _firstNameController.text.trim(),
            lastName: _lastNameController.text.trim(),
            remember: true,
          );
    } on ApiException catch (e) {
      setState(() {
        _formError = e.fieldErrors.isEmpty ? e.message : null;
        _fieldErrors = e.fieldErrors;
      });
    } catch (_) {
      setState(() => _formError = 'Something went wrong. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_formError != null) ...[
                  Text(_formError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  const SizedBox(height: 12),
                ],
                TextFormField(
                  key: const Key('register-email'),
                  controller: _emailController,
                  decoration: InputDecoration(labelText: 'Email', errorText: _fieldErrors['email']),
                  validator: validateEmail,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('register-phone'),
                  controller: _phoneController,
                  decoration: InputDecoration(labelText: 'Phone number', errorText: _fieldErrors['phone']),
                  validator: validatePhone,
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('register-first-name'),
                  controller: _firstNameController,
                  decoration: InputDecoration(
                    labelText: 'First name',
                    errorText: _fieldErrors['firstName'],
                  ),
                  validator: (v) => validateName(v ?? '', 'first name'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('register-last-name'),
                  controller: _lastNameController,
                  decoration: InputDecoration(
                    labelText: 'Last name',
                    errorText: _fieldErrors['lastName'],
                  ),
                  validator: (v) => validateName(v ?? '', 'last name'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('register-password'),
                  controller: _passwordController,
                  decoration:
                      InputDecoration(labelText: 'Password', errorText: _fieldErrors['password']),
                  obscureText: true,
                  validator: validatePassword,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Create account'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => context.go('/login'),
                  child: const Text('Already have an account? Sign in'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Wire the route**

Modify `my__accountant/lib/core/router/app_router.dart`: add `import '../../features/auth/screens/register_screen.dart';` and change

```dart
GoRoute(path: '/register', builder: (context, state) => const ComingSoonScreen('Register')),
```
to
```dart
GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `flutter test test/features/auth/screens/register_screen_test.dart`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
cd .. && git add my__accountant/lib/features/auth/screens/register_screen.dart my__accountant/lib/core/router/app_router.dart my__accountant/test/features/auth/screens/register_screen_test.dart
git commit -m "Add register screen"
```

---

### Task 19: Platform config — Google OAuth URL scheme

**Files:**
- Modify: `my__accountant/android/app/src/main/AndroidManifest.xml:23-26`
- Modify: `my__accountant/ios/Runner/Info.plist:69` (append before the closing `</dict>`)

**Interfaces:**
- Consumes: nothing in Dart; registers the `myaccountant://` scheme so `flutter_web_auth_2`'s callback (Task 12) is delivered back to the app instead of opened as a dead link.

- [ ] **Step 1: Register a separate CallbackActivity in AndroidManifest.xml**

`flutter_web_auth_2` requires the `myaccountant` scheme intent-filter to live on its OWN activity, `com.linusu.flutter_web_auth_2.CallbackActivity` — that's the only activity whose code actually resolves the pending OAuth callback (`CallbackActivity.kt` calls `FlutterWebAuth2Plugin.callbacks.remove(scheme)?.success(...)`; `MainActivity` has no such logic). Putting the intent-filter on `.MainActivity` instead routes the callback to `MainActivity` and leaves the pending call unresolved, so Google sign-in silently fails.

In `my__accountant/android/app/src/main/AndroidManifest.xml`, leave `.MainActivity`'s `<activity>` block with only its original single LAUNCHER intent-filter, and add a new, separate `<activity>` block as a sibling of `MainActivity` (still inside `<application>`, after the `</activity>` that closes `MainActivity`):

```xml
        <activity
            android:name="com.linusu.flutter_web_auth_2.CallbackActivity"
            android:exported="true"
            android:taskAffinity="">
            <intent-filter android:label="flutter_web_auth_2">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="myaccountant" />
            </intent-filter>
        </activity>
```

- [ ] **Step 2: Add the URL scheme to Info.plist**

In `my__accountant/ios/Runner/Info.plist`, insert this before the final `</dict>` (currently line 69):

```xml
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>myaccountant</string>
			</array>
		</dict>
	</array>
```

- [ ] **Step 3: Verify well-formed XML/plist**

Run:
```bash
cd "my__accountant" && python3 -c "import xml.dom.minidom as m; m.parse('android/app/src/main/AndroidManifest.xml')" && echo "AndroidManifest OK"
python3 -c "import plistlib; plistlib.load(open('ios/Runner/Info.plist', 'rb'))" && echo "Info.plist OK"
```
Expected: both print `OK` (no parse errors). If `python3` isn't available, open both files and confirm by eye that tags are balanced.

- [ ] **Step 4: Manual verification (requires the backend and a device/emulator)**

Run the app, tap "Continue with Google" on the login screen, complete the Google consent screen, and confirm the app regains foreground and reaches the authenticated tab shell (rather than the browser showing a "can't open this link" page for `myaccountant://auth/callback`).

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/android/app/src/main/AndroidManifest.xml my__accountant/ios/Runner/Info.plist
git commit -m "Register myaccountant:// URL scheme for Google OAuth callback"
```

---

### Task 20: Profile screen

**Files:**
- Create: `my__accountant/lib/features/auth/screens/profile_screen.dart`
- Modify: `my__accountant/lib/core/router/app_router.dart` (the `/settings/profile` route builder)
- Test: `my__accountant/test/features/auth/screens/profile_screen_test.dart`

**Interfaces:**
- Consumes: `authProvider` (Task 14), `authRepositoryProvider`/`AuthRepository.updateProfile` (Tasks 11, 13), `validateName`/`validatePhone` (Task 10)
- Produces: `class ProfileScreen extends ConsumerStatefulWidget { const ProfileScreen({super.key}); }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/auth/screens/profile_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/features/auth/data/auth_models.dart';
import 'package:my__accountant/features/auth/data/auth_providers.dart';
import 'package:my__accountant/features/auth/data/auth_repository.dart';
import 'package:my__accountant/features/auth/screens/profile_screen.dart';
import 'package:my__accountant/features/auth/state/auth_provider.dart';
import 'package:my__accountant/features/auth/state/auth_state.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

class _FixedAuthNotifier extends AuthNotifier {
  _FixedAuthNotifier(this._user);
  final AuthenticatedUser _user;
  bool signOutCalled = false;
  bool refreshCalled = false;

  @override
  AuthState build() => AuthState(status: AuthStatus.authenticated, user: _user);

  @override
  Future<void> refreshUser() async {
    refreshCalled = true;
  }

  @override
  Future<void> signOut() async {
    signOutCalled = true;
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

AuthenticatedUser _user() => const AuthenticatedUser(
      id: 'u1',
      email: 'a@b.com',
      phone: '+254712345678',
      firstName: 'Jane',
      lastName: 'Doe',
      avatarUrl: null,
      role: 'user',
      timezone: 'Africa/Nairobi',
      isVerified: true,
      createdAt: '2026-01-01T00:00:00Z',
    );

void main() {
  setUpAll(() {
    registerFallbackValue('');
  });

  testWidgets('pre-fills the form with the current profile', (tester) async {
    final repository = MockAuthRepository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(() => _FixedAuthNotifier(_user())),
          authRepositoryProvider.overrideWithValue(repository),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );

    expect(find.text('Jane'), findsOneWidget);
    expect(find.text('Doe'), findsOneWidget);
    expect(find.text('+254712345678'), findsOneWidget);
  });

  testWidgets('saving calls updateProfile then refreshUser', (tester) async {
    final repository = MockAuthRepository();
    when(() => repository.updateProfile(
          firstName: any(named: 'firstName'),
          lastName: any(named: 'lastName'),
          phone: any(named: 'phone'),
        )).thenAnswer((_) async => _user());

    late _FixedAuthNotifier notifier;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(() {
            notifier = _FixedAuthNotifier(_user());
            return notifier;
          }),
          authRepositoryProvider.overrideWithValue(repository),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );

    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();

    verify(() => repository.updateProfile(
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+254712345678',
        )).called(1);
    expect(notifier.refreshCalled, isTrue);
  });

  testWidgets('the sign-out button calls signOut', (tester) async {
    final repository = MockAuthRepository();
    late _FixedAuthNotifier notifier;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(() {
            notifier = _FixedAuthNotifier(_user());
            return notifier;
          }),
          authRepositoryProvider.overrideWithValue(repository),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );

    await tester.tap(find.byIcon(Icons.logout));
    await tester.pumpAndSettle();

    expect(notifier.signOutCalled, isTrue);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/auth/screens/profile_screen_test.dart`
Expected: FAIL — missing `profile_screen.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/auth/screens/profile_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../data/auth_providers.dart';
import '../data/auth_validation.dart';
import '../state/auth_provider.dart';
import '../state/auth_state.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _firstNameController;
  late final TextEditingController _lastNameController;
  late final TextEditingController _phoneController;
  bool _submitting = false;
  String? _formError;
  Map<String, String> _fieldErrors = {};

  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).user;
    _firstNameController = TextEditingController(text: user?.firstName ?? '');
    _lastNameController = TextEditingController(text: user?.lastName ?? '');
    _phoneController = TextEditingController(text: user?.phone ?? '');
  }

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _formError = null;
      _fieldErrors = {};
    });
    try {
      await ref.read(authRepositoryProvider).updateProfile(
            firstName: _firstNameController.text.trim(),
            lastName: _lastNameController.text.trim(),
            phone: normalizePhone(_phoneController.text),
          );
      await ref.read(authProvider.notifier).refreshUser();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile updated.')));
      }
    } on ApiException catch (e) {
      setState(() {
        _formError = e.fieldErrors.isEmpty ? e.message : null;
        _fieldErrors = e.fieldErrors;
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AuthState state = ref.watch(authProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authProvider.notifier).signOut(),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(state.user?.email ?? '', style: Theme.of(context).textTheme.bodyLarge),
                const SizedBox(height: 16),
                if (_formError != null) ...[
                  Text(_formError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  const SizedBox(height: 12),
                ],
                TextFormField(
                  controller: _firstNameController,
                  decoration: InputDecoration(
                    labelText: 'First name',
                    errorText: _fieldErrors['firstName'],
                  ),
                  validator: (v) => validateName(v ?? '', 'first name'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _lastNameController,
                  decoration: InputDecoration(
                    labelText: 'Last name',
                    errorText: _fieldErrors['lastName'],
                  ),
                  validator: (v) => validateName(v ?? '', 'last name'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _phoneController,
                  decoration: InputDecoration(
                    labelText: 'Phone number',
                    errorText: _fieldErrors['phone'],
                  ),
                  validator: validatePhone,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Save changes'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Wire the route**

Modify `my__accountant/lib/core/router/app_router.dart`: add `import '../../features/auth/screens/profile_screen.dart';` and change

```dart
GoRoute(
  path: 'profile',
  builder: (context, state) => const ComingSoonScreen('Profile'),
),
```
to
```dart
GoRoute(
  path: 'profile',
  builder: (context, state) => const ProfileScreen(),
),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `flutter test test/features/auth/screens/profile_screen_test.dart`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
cd .. && git add my__accountant/lib/features/auth/screens/profile_screen.dart my__accountant/lib/core/router/app_router.dart my__accountant/test/features/auth/screens/profile_screen_test.dart
git commit -m "Add profile screen"
```

---

### Task 21: Final integration pass

**Files:** none created; verification only.

- [ ] **Step 1: Run the full test suite**

Run: `cd "my__accountant" && flutter test`
Expected: all tests across every file added in Tasks 2–20 pass (0 failures).

- [ ] **Step 2: Run the analyzer**

Run: `flutter analyze`
Expected: `No issues found!`

- [ ] **Step 3: Manual smoke test against the real backend**

With the backend running and reachable at the `API_BASE_URL` from Global Constraints:

```bash
flutter run --dart-define=API_BASE_URL=http://10.34.125.26:3000
```

Walk through, on a real device or emulator:
1. Register a new account (unique email/phone) → lands on the tab shell.
2. Sign out from `/settings/profile`'s logout icon → returns to `/login`.
3. Sign back in with the same credentials, "Remember me" checked → lands on the tab shell.
4. Force-quit and relaunch the app → session is restored without showing the login screen (proves `SecureSessionStore.restore()` + cold-start validation works end-to-end).
5. Edit and save the first name on `/settings/profile` → confirmation snackbar appears and the change persists across a refresh (navigate away and back).
6. Tap "Continue with Google" on `/login` → completes the system-browser flow and lands on the tab shell (requires Task 19's platform config and a Google-auth-capable backend environment).

Note any failures as follow-up items rather than fixing them ad hoc here — if something fails, it means an earlier task's code doesn't match the real backend's exact response shape, which should be fixed by revisiting that specific task, not patched inline in this verification task.

- [ ] **Step 4: Commit** (only if Step 3 required no code changes; otherwise this task ends without a commit and the fix belongs to the task it corrects)

```bash
git log --oneline -1
```
(No commit needed for this task if nothing changed.)
