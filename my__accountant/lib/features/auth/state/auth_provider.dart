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
