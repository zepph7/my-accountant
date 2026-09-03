/// Client-side mirrors of the API's money rules (see
/// `lib/money-validation.ts` in the RN app and
/// `backend/src/validators/common.validator.ts`). The API remains the
/// authority; these exist to answer on the device instead of after a round
/// trip.
library my__accountant.shared.money_validation;

final _amountPattern = RegExp(r'^\d+(\.\d{1,2})?$');
const _ceiling = 10000000000;

/// Strips what people type but the API will not take: grouping commas,
/// spaces, and a currency symbol pasted in from somewhere else.
String normalizeAmount(String value) =>
    value.replaceAll(RegExp(r'[\s,]'), '').replaceFirst(RegExp(r'^[^\d.-]+'), '');

/// A transaction amount, which must be greater than zero.
String? validateAmount(String value) {
  final amount = normalizeAmount(value);
  if (amount.isEmpty) return 'Enter an amount.';
  if (!_amountPattern.hasMatch(amount)) {
    return 'Use digits and at most two decimals, like 1500 or 1500.50.';
  }
  final n = num.parse(amount);
  if (n <= 0) return 'The amount must be more than zero.';
  if (n >= _ceiling) return 'That amount is too large.';
  return null;
}

/// A wallet balance, which unlike a transaction may legitimately be zero.
String? validateBalance(String value) {
  final amount = normalizeAmount(value);
  if (amount.isEmpty) return 'Enter a balance, or 0 if it is empty.';
  if (!_amountPattern.hasMatch(amount)) return 'Use digits and at most two decimals.';
  if (num.parse(amount) >= _ceiling) return 'That balance is too large.';
  return null;
}

/// A distribution percentage: 0-100, at most two decimals.
String? validatePercentage(String value) {
  final percent = value.trim();
  if (percent.isEmpty) return 'Enter a percentage.';
  if (!RegExp(r'^\d{1,3}(\.\d{1,2})?$').hasMatch(percent)) {
    return 'Use a number with at most two decimals.';
  }
  final n = num.parse(percent);
  if (n < 0 || n > 100) return 'Use a value between 0 and 100.';
  return null;
}

String? validateLabel(String value, String noun) {
  if (value.trim().isEmpty) return 'Enter a $noun.';
  if (value.trim().length > 255) return 'That $noun is too long.';
  return null;
}
