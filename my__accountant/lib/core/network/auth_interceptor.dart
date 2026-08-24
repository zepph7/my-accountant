import 'package:dio/dio.dart';

import '../storage/secure_session_store.dart';
import '../storage/session.dart';
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
