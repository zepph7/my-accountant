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
