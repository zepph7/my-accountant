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
