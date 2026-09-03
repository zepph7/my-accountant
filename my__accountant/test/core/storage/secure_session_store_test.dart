import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/storage/secure_session_store.dart';
import 'package:my__accountant/core/storage/session.dart';
import 'package:my__accountant/core/storage/token_storage.dart';

class FakeTokenStorage implements TokenStorage {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

void main() {
  late FakeTokenStorage storage;
  late SecureSessionStore store;

  setUp(() {
    storage = FakeTokenStorage();
    store = SecureSessionStore(storage);
  });

  test('current is null before anything is saved or restored', () {
    expect(store.current, isNull);
  });

  test('save with remember:false sets current but does not persist', () async {
    await store.save(const Session(accessToken: 'a', refreshToken: 'r'), remember: false);
    expect(store.current?.accessToken, 'a');
    expect(storage.values, isEmpty);
  });

  test('save with remember:true persists both tokens', () async {
    await store.save(const Session(accessToken: 'a', refreshToken: 'r'), remember: true);
    expect(storage.values['ma.access_token'], 'a');
    expect(storage.values['ma.refresh_token'], 'r');
  });

  test('updateStored does not persist when nothing was stored before', () async {
    await store.updateStored(const Session(accessToken: 'a2', refreshToken: 'r2'));
    expect(store.current?.accessToken, 'a2');
    expect(storage.values, isEmpty);
  });

  test('updateStored rewrites storage when a session was already stored', () async {
    await store.save(const Session(accessToken: 'a', refreshToken: 'r'), remember: true);
    await store.updateStored(const Session(accessToken: 'a2', refreshToken: 'r2'));
    expect(storage.values['ma.access_token'], 'a2');
    expect(storage.values['ma.refresh_token'], 'r2');
  });

  test('restore returns null when no refresh token is stored', () async {
    expect(await store.restore(), isNull);
  });

  test('restore rebuilds the session from a stored refresh token alone', () async {
    storage.values['ma.refresh_token'] = 'r';
    final restored = await store.restore();
    expect(restored?.refreshToken, 'r');
    expect(restored?.accessToken, '');
    expect(store.current?.refreshToken, 'r');
  });

  test('clear empties storage and current', () async {
    await store.save(const Session(accessToken: 'a', refreshToken: 'r'), remember: true);
    await store.clear();
    expect(store.current, isNull);
    expect(storage.values, isEmpty);
  });
}
