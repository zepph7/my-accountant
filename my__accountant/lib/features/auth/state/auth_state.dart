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
