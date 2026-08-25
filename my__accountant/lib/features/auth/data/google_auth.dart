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
