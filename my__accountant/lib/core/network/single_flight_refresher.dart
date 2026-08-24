/// Runs at most one instance of an async action at a time. Every caller of
/// [run] while an action is in flight awaits the same result instead of
/// starting a second one. Used for token refresh: a screen firing six
/// requests at once must not present a rotated-and-now-stale refresh token
/// to the server five times — see `AuthInterceptor`.
class SingleFlightRefresher<T> {
  Future<T>? _inFlight;

  Future<T> run(Future<T> Function() action) {
    return _inFlight ??= action().whenComplete(() => _inFlight = null);
  }
}
