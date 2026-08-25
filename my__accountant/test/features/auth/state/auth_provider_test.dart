import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/api_exception.dart';
import 'package:my__accountant/core/storage/secure_session_store.dart';
import 'package:my__accountant/core/storage/session.dart';
import 'package:my__accountant/core/network/providers.dart';
import 'package:my__accountant/features/auth/data/auth_models.dart';
import 'package:my__accountant/features/auth/data/auth_providers.dart';
import 'package:my__accountant/features/auth/data/auth_repository.dart';
import 'package:my__accountant/features/auth/data/google_auth.dart';
import 'package:my__accountant/features/auth/state/auth_provider.dart';
import 'package:my__accountant/features/auth/state/auth_state.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

class MockGoogleAuthService extends Mock implements GoogleAuthService {}

class MockSecureSessionStore extends Mock implements SecureSessionStore {}

AuthenticatedUser _user() => const AuthenticatedUser(
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
    );

void main() {
  late MockAuthRepository repository;
  late MockGoogleAuthService googleAuth;
  late MockSecureSessionStore sessionStore;
  late ProviderContainer container;

  setUpAll(() {
    registerFallbackValue(const Session(accessToken: '', refreshToken: ''));
  });

  setUp(() {
    repository = MockAuthRepository();
    googleAuth = MockGoogleAuthService();
    sessionStore = MockSecureSessionStore();
    container = ProviderContainer(overrides: [
      authRepositoryProvider.overrideWithValue(repository),
      googleAuthServiceProvider.overrideWithValue(googleAuth),
      sessionStoreProvider.overrideWithValue(sessionStore),
    ]);
    addTearDown(container.dispose);
  });

  Future<void> pumpBootstrap() => Future<void>.delayed(Duration.zero);

  test('bootstraps to unauthenticated when there is no stored session', () async {
    when(() => sessionStore.restore()).thenAnswer((_) async => null);

    container.read(authProvider);
    await pumpBootstrap();

    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
  });

  test('bootstraps to authenticated when the stored session is still valid', () async {
    when(() => sessionStore.restore())
        .thenAnswer((_) async => const Session(accessToken: 'a', refreshToken: 'r'));
    when(() => repository.getProfile()).thenAnswer((_) async => _user());

    container.read(authProvider);
    await pumpBootstrap();

    final state = container.read(authProvider);
    expect(state.status, AuthStatus.authenticated);
    expect(state.user?.id, 'u1');
  });

  test('signs out when the stored session no longer validates', () async {
    when(() => sessionStore.restore())
        .thenAnswer((_) async => const Session(accessToken: 'a', refreshToken: 'r'));
    when(() => repository.getProfile()).thenThrow(ApiException(401, 'expired'));
    when(() => sessionStore.clear()).thenAnswer((_) async {});

    container.read(authProvider);
    await pumpBootstrap();

    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
    verify(() => sessionStore.clear()).called(1);
  });

  test('signInWithPassword adopts the session and sets authenticated', () async {
    when(() => sessionStore.restore()).thenAnswer((_) async => null);
    when(() => repository.signIn(email: 'a@b.com', phone: null, password: 'Abcdefghij1'))
        .thenAnswer((_) async => AuthResult(accessToken: 'a', refreshToken: 'r', user: _user()));
    when(() => sessionStore.save(any(), remember: any(named: 'remember')))
        .thenAnswer((_) async {});

    container.read(authProvider);
    await pumpBootstrap();

    await container
        .read(authProvider.notifier)
        .signInWithPassword(email: 'a@b.com', password: 'Abcdefghij1', remember: true);

    final state = container.read(authProvider);
    expect(state.status, AuthStatus.authenticated);
    expect(state.user?.email, 'a@b.com');
    verify(() => sessionStore.save(any(), remember: true)).called(1);
  });

  test('signInWithGoogle returns false and leaves state unauthenticated when canceled', () async {
    when(() => sessionStore.restore()).thenAnswer((_) async => null);
    when(() => googleAuth.continueWithGoogle()).thenAnswer((_) async => null);

    container.read(authProvider);
    await pumpBootstrap();

    final result = await container.read(authProvider.notifier).signInWithGoogle(remember: true);

    expect(result, isFalse);
    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
  });

  test('signOut revokes server-side, clears storage, and sets unauthenticated', () async {
    when(() => sessionStore.restore())
        .thenAnswer((_) async => const Session(accessToken: 'a', refreshToken: 'r'));
    when(() => repository.getProfile()).thenAnswer((_) async => _user());
    when(() => sessionStore.current).thenReturn(const Session(accessToken: 'a', refreshToken: 'r'));
    when(() => repository.signOutRemote('r')).thenAnswer((_) async {});
    when(() => sessionStore.clear()).thenAnswer((_) async {});

    container.read(authProvider);
    await pumpBootstrap();

    await container.read(authProvider.notifier).signOut();

    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
    verify(() => repository.signOutRemote('r')).called(1);
    verify(() => sessionStore.clear()).called(1);
  });

  test('refreshUser re-reads the profile and updates the user only', () async {
    when(() => sessionStore.restore())
        .thenAnswer((_) async => const Session(accessToken: 'a', refreshToken: 'r'));
    when(() => repository.getProfile()).thenAnswer((_) async => _user());

    container.read(authProvider);
    await pumpBootstrap();

    final updated = _user();
    when(() => repository.getProfile()).thenAnswer((_) async => updated);
    await container.read(authProvider.notifier).refreshUser();

    expect(container.read(authProvider).status, AuthStatus.authenticated);
    expect(container.read(authProvider).user?.id, updated.id);
  });
}
