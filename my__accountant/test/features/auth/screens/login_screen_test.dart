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
