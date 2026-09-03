/// Display formatting — mirrors `lib/format.ts` in the RN app, scoped to
/// what this plan's screens need (money/date/percent; report-only helpers
/// like `compactMoney`/`bucketLabel` are deferred to the reports plan).
/// Everything here takes the API's decimal strings and never converts them
/// to a number for arithmetic — only for rendering, and only at the last
/// step.

const currencyCode = String.fromEnvironment('CURRENCY', defaultValue: 'KES');

String _groupThousands(String whole) {
  final buffer = StringBuffer();
  for (var i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 == 0) buffer.write(',');
    buffer.write(whole[i]);
  }
  return buffer.toString();
}

/// `1234.5` -> `1,234.50`. Cents are always shown.
String money(Object? value) {
  final raw = (value ?? '0').toString();
  final negative = raw.startsWith('-');
  final unsigned = negative ? raw.substring(1) : raw;
  final segments = unsigned.split('.');
  final whole = segments.isNotEmpty && segments[0].isNotEmpty ? segments[0] : '0';
  final fraction = segments.length > 1 ? segments[1] : '';
  final cents = ('$fraction' '00').substring(0, 2);
  return '${negative ? '-' : ''}${_groupThousands(whole)}.$cents';
}

/// `1,234.50 KES`, for totals that need naming.
String currency(Object? value) => '${money(value)} $currencyCode';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

({int y, int m, int d}) _parts(String value) {
  final datePart = value.split('T').first;
  final segments = datePart.split('-');
  final y = segments.isNotEmpty ? int.tryParse(segments[0]) ?? 0 : 0;
  final m = segments.length > 1 ? int.tryParse(segments[1]) ?? 1 : 1;
  final d = segments.length > 2 ? int.tryParse(segments[2]) ?? 1 : 1;
  return (y: y, m: m, d: d);
}

/// `2026-08-09` -> `9 Aug 2026`.
String longDate(String? value) {
  if (value == null || value.isEmpty) return '—';
  final p = _parts(value);
  return '${p.d} ${_months[p.m - 1]} ${p.y}';
}

/// `2026-08-09` -> `9 Aug`, for lists where the year is implied.
String shortDate(String? value) {
  if (value == null || value.isEmpty) return '—';
  final p = _parts(value);
  final thisYear = DateTime.now().year;
  return p.y == thisYear ? '${p.d} ${_months[p.m - 1]}' : '${p.d} ${_months[p.m - 1]} ${p.y}';
}

/// `2026-08-09T14:05:00Z` -> `9 Aug, 14:05` in the device's zone.
String dateTime(String? value) {
  if (value == null || value.isEmpty) return '—';
  final at = DateTime.tryParse(value);
  if (at == null) return longDate(value);
  final local = at.toLocal();
  final time =
      '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  return '${local.day} ${_months[local.month - 1]}, $time';
}

/// Today as `YYYY-MM-DD` in the device's zone, for date inputs.
String today() {
  final now = DateTime.now();
  return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
}

/// `12.5` -> `12.5%`, trimming a trailing `.0`.
String percent(Object? value) {
  final n = num.tryParse((value ?? 0).toString()) ?? 0;
  return n == n.roundToDouble() ? '${n.toInt()}%' : '${n.toStringAsFixed(1)}%';
}
