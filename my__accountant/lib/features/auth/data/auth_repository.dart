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
