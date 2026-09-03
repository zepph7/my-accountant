/// Client-side mirrors of the rules the API already enforces (see
/// `lib/auth-validation.ts` in the RN app). These exist to answer the user
/// on the device instead of after a round trip — the API stays the
/// authority, and its rejection is still shown.

final _e164 = RegExp(r'^\+[1-9]\d{1,14}$');
final _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

String normalizePhone(String value) => value.trim().replaceAll(RegExp(r'[\s\-().]'), '');

bool isPhone(String value) => _e164.hasMatch(normalizePhone(value));
bool isEmail(String value) => _email.hasMatch(value.trim());

String? validateEmail(String value) {
  if (value.trim().isEmpty) return 'Enter your email address.';
  if (!isEmail(value)) return 'Enter a complete email address, like you@example.com.';
  if (value.trim().length > 255) return 'That email address is too long.';
  return null;
}

String? validatePhone(String value) {
  if (value.trim().isEmpty) return 'Enter your phone number.';
  if (!isPhone(value)) return 'Start with your country code, like +254 712 345 678.';
  return null;
}

enum IdentifierKind { email, phone }

/// The test is the leading character rather than a full match: anything
/// starting with `+` or a digit can only be an attempt at a phone number, so
/// a half-typed one gets the phone error explaining the country code, not a
/// confusing complaint about a missing `@`.
IdentifierKind identifierKind(String value) {
  final trimmed = value.trim();
  return RegExp(r'^[+\d]').hasMatch(trimmed) ? IdentifierKind.phone : IdentifierKind.email;
}

String? validateIdentifier(String value) {
  if (value.trim().isEmpty) return 'Enter your email address or phone number.';
  return identifierKind(value) == IdentifierKind.phone ? validatePhone(value) : validateEmail(value);
}

/// The credential shape the API expects, keyed by what the user actually
/// typed — exactly one of [email]/[phone] is set.
class IdentifierCredential {
  const IdentifierCredential({this.email, this.phone});

  final String? email;
  final String? phone;
}

IdentifierCredential identifierCredential(String value) =>
    identifierKind(value) == IdentifierKind.phone
        ? IdentifierCredential(phone: normalizePhone(value))
        : IdentifierCredential(email: value.trim());

String? validatePassword(String value) {
  if (value.isEmpty) return 'Enter a password.';
  if (value.length < 10) return 'Use at least 10 characters.';
  // The server caps at 72 because bcrypt ignores anything past 72 bytes.
  if (value.length > 72) return 'Use at most 72 characters.';
  if (!RegExp(r'[a-z]').hasMatch(value) ||
      !RegExp(r'[A-Z]').hasMatch(value) ||
      !RegExp(r'\d').hasMatch(value)) {
    return 'Include a capital letter, a lower case letter and a number.';
  }
  return null;
}

String? validateName(String value, String label) {
  if (value.trim().isEmpty) return 'Enter your $label.';
  if (value.trim().length > 100) return 'That $label is too long.';
  return null;
}
