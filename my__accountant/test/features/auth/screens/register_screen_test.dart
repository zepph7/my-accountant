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
