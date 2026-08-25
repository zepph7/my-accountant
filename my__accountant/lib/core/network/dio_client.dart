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
