/// Called when the refresh token is refused. `AuthNotifier` registers a
/// handler so a dead session sends the user to the sign-in screen instead of
/// leaving every screen showing an unexplained error. Mirrors
/// `setSignedOutHandler` in `lib/api.ts`.
void Function()? _onSignedOut;

void setSignedOutHandler(void Function()? handler) => _onSignedOut = handler;

void notifySignedOut() => _onSignedOut?.call();
