import 'session.dart';
import 'token_storage.dart';

const _accessKey = 'ma.access_token';
const _refreshKey = 'ma.refresh_token';

/// The session for the running process, persisted to secure storage only
/// when "remember me" is on. Mirrors `lib/session.ts` in the RN app: the
/// in-memory copy is the source of truth for the process, storage is only
/// how a session survives a cold start, and a token refresh must never
/// silently upgrade a non-remembered session into a remembered one.
class SecureSessionStore {
  SecureSessionStore(this._storage);

  final TokenStorage _storage;
  Session? _current;

  Session? get current => _current;

  Future<void> save(Session session, {required bool remember}) async {
    _current = session;
    if (!remember) return;
    await _writeBoth(session);
  }

  Future<void> updateStored(Session session) async {
    _current = session;
    final storedRefresh = await _safeRead(_refreshKey);
    if (storedRefresh == null) return;
    await _writeBoth(session);
  }

  Future<Session?> restore() async {
    final refresh = await _safeRead(_refreshKey);
    if (refresh == null) return null;
    final access = await _safeRead(_accessKey);
    _current = Session(accessToken: access ?? '', refreshToken: refresh);
    return _current;
  }

  Future<void> clear() async {
    _current = null;
    await _safeDelete(_accessKey);
    await _safeDelete(_refreshKey);
  }

  Future<void> _writeBoth(Session session) async {
    await Future.wait([
      _safeWrite(_accessKey, session.accessToken),
      _safeWrite(_refreshKey, session.refreshToken),
    ]);
  }

  Future<String?> _safeRead(String key) async {
    try {
      return await _storage.read(key);
    } catch (_) {
      return null;
    }
  }

  Future<void> _safeWrite(String key, String value) async {
    try {
      await _storage.write(key, value);
    } catch (_) {
      // Keystore unavailable; the in-memory session still works for this run.
    }
  }

  Future<void> _safeDelete(String key) async {
    try {
      await _storage.delete(key);
    } catch (_) {}
  }
}
