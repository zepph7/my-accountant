# Flutter Income & Expense CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build income and expense tracking in `my__accountant`: paginated filterable lists, create/edit forms, delete, and the income-sources / expense-categories management screens — Phase 2 of the Flutter rewrite, on top of the Foundation & Auth layer plan 1 already shipped.

**Architecture:** Feature-first Dart under `lib/features/income/` and `lib/features/expense/`, following the exact data/state/screens layering plan 1 established. A new generic `Page<T>`/`PaginationMeta` model lives in `lib/core/network/` (shared infra). A new generic `PagedListNotifier<T>` base class in `lib/shared/` implements the paging mechanics once; `IncomeListNotifier`/`ExpenseListNotifier` each subclass it with their own `fetchPage`. Income sources and expense categories share one generic `NamedRecordListScreen` widget (list + add + rename + remove), parameterized by repository callbacks — mirroring the RN app's own `NameListScreen` component.

**Tech Stack:** Same as plan 1 — Flutter/Dart, `dio`, `flutter_riverpod`, `go_router`, `mocktail` (dev). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-25-flutter-rewrite-design.md`
**Prior plan:** `docs/superpowers/plans/2026-08-25-flutter-foundation-and-auth.md` (plan 1 — Foundation & Auth, shipped)

This is plan 2 of the sequence. Plans 3-5 (overview/dashboard, reports, platform polish) still come after this one.

## Global Constraints

- Money fields are `String` everywhere in models — never parsed to `double`/`num`. (plan 1, reaffirmed)
- No codegen: hand-written `fromJson`/`toJson`, no `freezed`/`json_serializable`. (plan 1, reaffirmed)
- Every `flutter test` invocation (scoped or full-suite) needs `--dart-define=API_BASE_URL=https://example.test`. (plan 1 ruling, still applies)
- The Flutter SDK needs an explicit PATH prefix in this dev environment:
  - Bash: `export PATH="/c/Users/Zepphania/develop/flutter/bin:$PATH"`
  - PowerShell: `$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')`
- "Clean `flutter analyze`" means this task's diff introduces zero new issues — not a fixed count. The project accumulates a small number of pre-existing info/warning-level cosmetic lints across files this plan doesn't touch; ignore those.
- `TextFormField.validator` callbacks must wrap any non-nullable-`String`-taking validator function in a closure: `(v) => validateAmount(v ?? '')`, not a bare function reference (`String? Function(String?)?` vs `String Function(String)`).
- Every `catch` block that calls `setState()` after an `await` must start with `if (!mounted) return;`, not just `finally` — established the hard way in plan 1's Task 17.
- Filter state (wallet, search text) lives in the screen widget's local `State`, not in the Riverpod list notifier — the notifier only receives the current filter value through an explicit setter that triggers a reload. This mirrors the RN app's own architecture (`useState` in the screen component, not the data hook) and keeps `PagedListNotifier<T>` filter-agnostic.
- After a create/edit/delete mutation, the screen calls `ref.invalidate(<listProvider>)` before popping back to the list, rather than replicating the RN app's focus-triggered auto-refresh (`useFocusEffect`). This is a deliberate, disclosed simplification — go_router/Riverpod doesn't have a direct equivalent to Expo Router's focus-effect hook, and `invalidate`-on-return achieves the same visible result (the list is fresh when the user sees it again).
- Router additions: `/income/new`, `/income/:id`, `/expense/new`, `/expense/:id` are **top-level routes outside the `ShellRoute`** (full-screen push, bottom nav hidden) — matching the RN app's own routing, where these are stack screens separate from the tab group. `/settings/sources` and `/settings/categories` are **nested children of the existing `/settings` route**, alongside `/settings/profile` from plan 1 — consistent with that precedent.
- All file paths below are relative to the repo root (the directory containing both `my_accountant/` and `my__accountant/`).

---

### Task 1: Page + PaginationMeta model

**Files:**
- Create: `my__accountant/lib/core/network/page.dart`
- Test: `my__accountant/test/core/network/page_test.dart`

**Interfaces:**
- Produces:
  - `class PaginationMeta { final int page, limit, total, totalPages; factory PaginationMeta.fromJson(Map<String, dynamic> json); }`
  - `class Page<T> { final List<T> data; final PaginationMeta pagination; static Page<T> fromJson<T>(Map<String, dynamic> json, T Function(Map<String, dynamic>) itemFromJson); }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/core/network/page_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/page.dart';

class _Item {
  const _Item(this.id);
  final String id;
  factory _Item.fromJson(Map<String, dynamic> json) => _Item(json['id'] as String);
}

void main() {
  group('PaginationMeta', () {
    test('parses from json', () {
      final meta = PaginationMeta.fromJson({'page': 2, 'limit': 20, 'total': 45, 'totalPages': 3});
      expect(meta.page, 2);
      expect(meta.limit, 20);
      expect(meta.total, 45);
      expect(meta.totalPages, 3);
    });
  });

  group('Page.fromJson', () {
    test('parses the data list with the given item parser and the pagination block', () {
      final page = Page.fromJson<_Item>(
        {
          'data': [
            {'id': 'a'},
            {'id': 'b'},
          ],
          'pagination': {'page': 1, 'limit': 20, 'total': 2, 'totalPages': 1},
        },
        _Item.fromJson,
      );
      expect(page.data.map((e) => e.id), ['a', 'b']);
      expect(page.pagination.total, 2);
    });

    test('handles an empty data list', () {
      final page = Page.fromJson<_Item>(
        {
          'data': <dynamic>[],
          'pagination': {'page': 1, 'limit': 20, 'total': 0, 'totalPages': 0},
        },
        _Item.fromJson,
      );
      expect(page.data, isEmpty);
      expect(page.pagination.totalPages, 0);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "my__accountant" && flutter test test/core/network/page_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `page.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/core/network/page.dart

/// A page of results plus its pagination metadata — mirrors `Page<T>` and
/// `PaginationMeta` in `lib/api.ts`. Listing endpoints ship these two
/// together at the top level of the response envelope (see
/// `unwrapEnvelope`'s pagination branch).
class PaginationMeta {
  const PaginationMeta({
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  final int page;
  final int limit;
  final int total;
  final int totalPages;

  factory PaginationMeta.fromJson(Map<String, dynamic> json) => PaginationMeta(
        page: json['page'] as int,
        limit: json['limit'] as int,
        total: json['total'] as int,
        totalPages: json['totalPages'] as int,
      );
}

class Page<T> {
  const Page({required this.data, required this.pagination});

  final List<T> data;
  final PaginationMeta pagination;

  static Page<T> fromJson<T>(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic> json) itemFromJson,
  ) {
    return Page<T>(
      data: (json['data'] as List<dynamic>)
          .map((e) => itemFromJson(e as Map<String, dynamic>))
          .toList(),
      pagination: PaginationMeta.fromJson(json['pagination'] as Map<String, dynamic>),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/core/network/page_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/core/network/page.dart my__accountant/test/core/network/page_test.dart
git commit -m "Add Page and PaginationMeta models"
```

---

### Task 2: money_validation.dart

**Files:**
- Create: `my__accountant/lib/shared/money_validation.dart`
- Test: `my__accountant/test/shared/money_validation_test.dart`

**Interfaces:**
- Produces:
  - `String normalizeAmount(String value)`
  - `String? validateAmount(String value)`
  - `String? validateBalance(String value)`
  - `String? validatePercentage(String value)`
  - `String? validateLabel(String value, String noun)`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/shared/money_validation_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/shared/money_validation.dart';

void main() {
  group('normalizeAmount', () {
    test('strips grouping commas and spaces', () {
      expect(normalizeAmount('1,500.50'), '1500.50');
      expect(normalizeAmount(' 1500 '), '1500');
    });
    test('strips a leading currency symbol', () {
      expect(normalizeAmount('KES 1500'), '1500');
      expect(normalizeAmount(r'$1500'), '1500');
    });
  });

  group('validateAmount', () {
    test('requires a value', () => expect(validateAmount(''), isNotNull));
    test('requires digits with at most two decimals',
        () => expect(validateAmount('12.345'), isNotNull));
    test('accepts a whole number', () => expect(validateAmount('1500'), isNull));
    test('accepts two decimals', () => expect(validateAmount('1500.50'), isNull));
    test('rejects zero', () => expect(validateAmount('0'), isNotNull));
    test('rejects negative-looking input (fails the digit pattern)',
        () => expect(validateAmount('-5'), isNotNull));
    test('rejects an amount at or above the ceiling',
        () => expect(validateAmount('10000000000'), isNotNull));
    test('accepts an amount just under the ceiling',
        () => expect(validateAmount('9999999999.99'), isNull));
  });

  group('validateBalance', () {
    test('requires a value', () => expect(validateBalance(''), isNotNull));
    test('accepts zero, unlike validateAmount', () => expect(validateBalance('0'), isNull));
    test('rejects an out-of-range balance',
        () => expect(validateBalance('10000000000'), isNotNull));
  });

  group('validatePercentage', () {
    test('requires a value', () => expect(validatePercentage(''), isNotNull));
    test('accepts 0', () => expect(validatePercentage('0'), isNull));
    test('accepts 100', () => expect(validatePercentage('100'), isNull));
    test('rejects over 100', () => expect(validatePercentage('100.01'), isNotNull));
    test('rejects negative', () => expect(validatePercentage('-1'), isNotNull));
    test('accepts two decimals', () => expect(validatePercentage('33.33'), isNull));
  });

  group('validateLabel', () {
    test('requires a value', () => expect(validateLabel('', 'name'), isNotNull));
    test('rejects over 255 chars', () => expect(validateLabel('a' * 256, 'name'), isNotNull));
    test('accepts a normal label', () => expect(validateLabel('Salary', 'name'), isNull));
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/shared/money_validation_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `money_validation.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/shared/money_validation.dart

/// Client-side mirrors of the API's money rules (see
/// `lib/money-validation.ts` in the RN app and
/// `backend/src/validators/common.validator.ts`). The API remains the
/// authority; these exist to answer on the device instead of after a round
/// trip.

final _amountPattern = RegExp(r'^\d+(\.\d{1,2})?$');
const _ceiling = 10000000000;

/// Strips what people type but the API will not take: grouping commas,
/// spaces, and a currency symbol pasted in from somewhere else.
String normalizeAmount(String value) =>
    value.replaceAll(RegExp(r'[\s,]'), '').replaceFirst(RegExp(r'^[^\d.]+'), '');

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/shared/money_validation_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (19 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/shared/money_validation.dart my__accountant/test/shared/money_validation_test.dart
git commit -m "Add money validation"
```

---

### Task 3: format.dart

**Files:**
- Create: `my__accountant/lib/shared/format.dart`
- Test: `my__accountant/test/shared/format_test.dart`

**Interfaces:**
- Produces:
  - `const String currencyCode` (from `String.fromEnvironment('CURRENCY', defaultValue: 'KES')`)
  - `String money(Object? value)`
  - `String currency(Object? value)`
  - `String longDate(String? value)`
  - `String shortDate(String? value)`
  - `String dateTime(String? value)`
  - `String today()`
  - `String percent(Object? value)`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/shared/format_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/shared/format.dart';

void main() {
  group('money', () {
    test('groups thousands and always shows two decimals', () {
      expect(money('1234.5'), '1,234.50');
      expect(money('1234567'), '1,234,567.00');
    });
    test('handles null/empty as zero', () {
      expect(money(null), '0.00');
    });
    test('preserves a negative sign', () {
      expect(money('-1234.5'), '-1,234.50');
    });
  });

  group('currency', () {
    test('appends the currency code', () {
      expect(currency('100'), '100.00 $currencyCode');
    });
  });

  group('longDate', () {
    test('formats a bare date', () => expect(longDate('2026-08-09'), '9 Aug 2026'));
    test('formats a date with a time component',
        () => expect(longDate('2026-08-09T14:05:00Z'), '9 Aug 2026'));
    test('returns an em dash for null/empty', () {
      expect(longDate(null), '—');
      expect(longDate(''), '—');
    });
  });

  group('shortDate', () {
    test('omits the year for the current year', () {
      final thisYear = DateTime.now().year;
      expect(shortDate('$thisYear-08-09'), '9 Aug');
    });
    test('includes the year for a different year',
        () => expect(shortDate('2020-08-09'), '9 Aug 2020'));
  });

  group('dateTime', () {
    test('formats date and time', () {
      final result = dateTime('2026-08-09T14:05:00Z');
      expect(result, contains('9 Aug'));
      expect(result, contains(':'));
    });
    test('returns an em dash for null', () => expect(dateTime(null), '—'));
  });

  group('today', () {
    test('matches YYYY-MM-DD format', () {
      expect(today(), matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    });
  });

  group('percent', () {
    test('trims a trailing .0', () => expect(percent('12.0'), '12%'));
    test('keeps one decimal otherwise', () => expect(percent('12.5'), '12.5%'));
    test('handles null as zero', () => expect(percent(null), '0%'));
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/shared/format_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `format.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/shared/format.dart

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/shared/format_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/shared/format.dart my__accountant/test/shared/format_test.dart
git commit -m "Add display formatting"
```

---

### Task 4: Income models + IncomeRepository

**Files:**
- Create: `my__accountant/lib/features/income/data/income_models.dart`
- Create: `my__accountant/lib/features/income/data/income_repository.dart`
- Test: `my__accountant/test/features/income/data/income_repository_test.dart`

**Interfaces:**
- Consumes: `ApiClient` (plan 1), `Page`/`PaginationMeta` (Task 1)
- Produces:
  - `enum Wallet { cash, account, mpesa }` with `String get value` (the wire name) and `static Wallet fromWire(String value)`; `const walletLabels = {Wallet.cash: 'Cash', Wallet.account: 'Bank account', Wallet.mpesa: 'M-Pesa'};`
  - `class Income { final String id, userId, date, amount, createdAt, updatedAt; final String? sourceId, sourceName, notes; final Wallet wallet; factory Income.fromJson(Map<String, dynamic> json); }`
  - `class IncomeSplit { final String id, distributionCategoryId, categoryName, amount, percentageApplied; factory IncomeSplit.fromJson(Map<String, dynamic> json); }`
  - `class IncomeDetail extends Income { final List<IncomeSplit> distribution; final String? warning; factory IncomeDetail.fromJson(Map<String, dynamic> json); }`
  - `class IncomeInput { final String? sourceId, notes; final String date, amount; final Wallet wallet; const IncomeInput({required this.sourceId, required this.date, required this.amount, required this.notes, required this.wallet}); Map<String, dynamic> toJson(); }`
  - `class IncomeRepository { IncomeRepository(ApiClient client); Future<Page<Income>> listIncomes({int page, int limit, String? sourceId, Wallet? wallet, String? from, String? to}); Future<IncomeDetail> getIncome(String id); Future<IncomeDetail> createIncome(IncomeInput input); Future<IncomeDetail> updateIncome(String id, IncomeInput input); Future<void> deleteIncome(String id); }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/income/data/income_repository_test.dart
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/features/income/data/income_models.dart';
import 'package:my__accountant/features/income/data/income_repository.dart';

import '../../../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

Map<String, dynamic> _incomeJson({String id = 'i1'}) => {
      'id': id,
      'user_id': 'u1',
      'source_id': 's1',
      'source_name': 'Salary',
      'date': '2026-08-01',
      'amount': '50000.00',
      'notes': null,
      'wallet': 'account',
      'created_at': '2026-08-01T00:00:00Z',
      'updated_at': '2026-08-01T00:00:00Z',
    };

Map<String, dynamic> _incomeDetailJson() => {
      ..._incomeJson(),
      'distribution': [
        {
          'id': 'd1',
          'distribution_category_id': 'dc1',
          'category_name': 'Essentials',
          'amount': '30000.00',
          'percentage_applied': '60.00',
        },
      ],
    };

void main() {
  late Dio dio;
  late IncomeRepository repository;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    repository = IncomeRepository(ApiClient(dio));
  });

  test('listIncomes sends filters as query params and parses a page', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/incomes');
      expect(options.uri.queryParameters['page'], '2');
      expect(options.uri.queryParameters['wallet'], 'cash');
      return _jsonBody({
        'success': true,
        'data': [_incomeJson()],
        'pagination': {'page': 2, 'limit': 20, 'total': 21, 'totalPages': 2},
      }, 200);
    });

    final page = await repository.listIncomes(page: 2, wallet: Wallet.cash);
    expect(page.data.single.id, 'i1');
    expect(page.pagination.total, 21);
  });

  test('getIncome fetches the detail with distribution', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/incomes/i1');
      return _jsonBody({'success': true, 'data': _incomeDetailJson()}, 200);
    });

    final detail = await repository.getIncome('i1');
    expect(detail.distribution.single.categoryName, 'Essentials');
  });

  test('createIncome posts the full input body', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/incomes');
      final body = options.data as Map<String, dynamic>;
      expect(body['sourceId'], 's1');
      expect(body['amount'], '50000.00');
      expect(body['wallet'], 'account');
      return _jsonBody({'success': true, 'data': _incomeDetailJson()}, 200);
    });

    await repository.createIncome(const IncomeInput(
      sourceId: 's1',
      date: '2026-08-01',
      amount: '50000.00',
      notes: null,
      wallet: Wallet.account,
    ));
  });

  test('updateIncome patches and can surface a distribution warning', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.method, 'PATCH');
      return _jsonBody({
        'success': true,
        'data': {..._incomeDetailJson(), 'warning': 'Distribution percentages total 90%.'},
      }, 200);
    });

    final result = await repository.updateIncome(
      'i1',
      const IncomeInput(sourceId: null, date: '2026-08-01', amount: '1', notes: null, wallet: Wallet.cash),
    );
    expect(result.warning, 'Distribution percentages total 90%.');
  });

  test('deleteIncome sends DELETE', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.method, 'DELETE');
      expect(options.uri.path, '/api/incomes/i1');
      return ResponseBody.fromString('', 204);
    });

    await repository.deleteIncome('i1');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/income/data/income_repository_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `income_models.dart`, `income_repository.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/income/data/income_models.dart

/// Mirrors the `Wallet` union in `lib/endpoints.ts`.
enum Wallet {
  cash,
  account,
  mpesa;

  String get value => name;

  static Wallet fromWire(String value) => Wallet.values.firstWhere((w) => w.name == value);
}

const walletLabels = <Wallet, String>{
  Wallet.cash: 'Cash',
  Wallet.account: 'Bank account',
  Wallet.mpesa: 'M-Pesa',
};

class Income {
  const Income({
    required this.id,
    required this.userId,
    required this.sourceId,
    required this.sourceName,
    required this.date,
    required this.amount,
    required this.notes,
    required this.wallet,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String userId;
  final String? sourceId;
  final String? sourceName;
  final String date;
  final String amount;
  final String? notes;
  final Wallet wallet;
  final String createdAt;
  final String updatedAt;

  factory Income.fromJson(Map<String, dynamic> json) => Income(
        id: json['id'] as String,
        userId: json['user_id'] as String,
        sourceId: json['source_id'] as String?,
        sourceName: json['source_name'] as String?,
        date: json['date'] as String,
        amount: json['amount'] as String,
        notes: json['notes'] as String?,
        wallet: Wallet.fromWire(json['wallet'] as String),
        createdAt: json['created_at'] as String,
        updatedAt: json['updated_at'] as String,
      );
}

class IncomeSplit {
  const IncomeSplit({
    required this.id,
    required this.distributionCategoryId,
    required this.categoryName,
    required this.amount,
    required this.percentageApplied,
  });

  final String id;
  final String distributionCategoryId;
  final String categoryName;
  final String amount;
  final String percentageApplied;

  factory IncomeSplit.fromJson(Map<String, dynamic> json) => IncomeSplit(
        id: json['id'] as String,
        distributionCategoryId: json['distribution_category_id'] as String,
        categoryName: json['category_name'] as String,
        amount: json['amount'] as String,
        percentageApplied: json['percentage_applied'] as String,
      );
}

/// The `warning` field is present when the configured distribution
/// percentages do not total 100 — the record still saved, this reports
/// what actually happened to the money.
class IncomeDetail extends Income {
  const IncomeDetail({
    required super.id,
    required super.userId,
    required super.sourceId,
    required super.sourceName,
    required super.date,
    required super.amount,
    required super.notes,
    required super.wallet,
    required super.createdAt,
    required super.updatedAt,
    required this.distribution,
    this.warning,
  });

  final List<IncomeSplit> distribution;
  final String? warning;

  factory IncomeDetail.fromJson(Map<String, dynamic> json) => IncomeDetail(
        id: json['id'] as String,
        userId: json['user_id'] as String,
        sourceId: json['source_id'] as String?,
        sourceName: json['source_name'] as String?,
        date: json['date'] as String,
        amount: json['amount'] as String,
        notes: json['notes'] as String?,
        wallet: Wallet.fromWire(json['wallet'] as String),
        createdAt: json['created_at'] as String,
        updatedAt: json['updated_at'] as String,
        distribution: (json['distribution'] as List<dynamic>)
            .map((e) => IncomeSplit.fromJson(e as Map<String, dynamic>))
            .toList(),
        warning: json['warning'] as String?,
      );
}

/// The form that produces this always supplies every field (even when
/// clearing one to null), so — unlike a partial PATCH type — nothing here
/// is optional-and-omittable.
class IncomeInput {
  const IncomeInput({
    required this.sourceId,
    required this.date,
    required this.amount,
    required this.notes,
    required this.wallet,
  });

  final String? sourceId;
  final String date;
  final String amount;
  final String? notes;
  final Wallet wallet;

  Map<String, dynamic> toJson() => {
        'sourceId': sourceId,
        'date': date,
        'amount': amount,
        'notes': notes,
        'wallet': wallet.value,
      };
}
```

```dart
// my__accountant/lib/features/income/data/income_repository.dart
import '../../../core/network/api_client.dart';
import '../../../core/network/page.dart';
import 'income_models.dart';

/// Mirrors the income half of `lib/endpoints.ts`.
class IncomeRepository {
  IncomeRepository(this._client);

  final ApiClient _client;

  Future<Page<Income>> listIncomes({
    int page = 1,
    int limit = 20,
    String? sourceId,
    Wallet? wallet,
    String? from,
    String? to,
  }) {
    return _client.request(
      '/api/incomes',
      query: {
        'page': page,
        'limit': limit,
        if (sourceId != null) 'sourceId': sourceId,
        if (wallet != null) 'wallet': wallet.value,
        if (from != null) 'from': from,
        if (to != null) 'to': to,
      },
      parse: (json) => Page.fromJson<Income>(json as Map<String, dynamic>, Income.fromJson),
    );
  }

  Future<IncomeDetail> getIncome(String id) {
    return _client.request(
      '/api/incomes/$id',
      parse: (json) => IncomeDetail.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<IncomeDetail> createIncome(IncomeInput input) {
    return _client.request(
      '/api/incomes',
      method: 'POST',
      body: input.toJson(),
      parse: (json) => IncomeDetail.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<IncomeDetail> updateIncome(String id, IncomeInput input) {
    return _client.request(
      '/api/incomes/$id',
      method: 'PATCH',
      body: input.toJson(),
      parse: (json) => IncomeDetail.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> deleteIncome(String id) {
    return _client.request<void>('/api/incomes/$id', method: 'DELETE', parse: (_) {});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/features/income/data/income_repository_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/features/income/data my__accountant/test/features/income/data
git commit -m "Add income models and IncomeRepository"
```

---

### Task 5: NamedRecord + IncomeSourceRepository + ExpenseCategoryRepository

**Files:**
- Create: `my__accountant/lib/shared/named_record.dart`
- Create: `my__accountant/lib/features/income/data/income_source_repository.dart`
- Create: `my__accountant/lib/features/expense/data/expense_category_repository.dart`
- Test: `my__accountant/test/shared/named_record_repository_test.dart`

**Interfaces:**
- Consumes: `ApiClient`, `Page` (Task 1)
- Produces:
  - `class NamedRecord { final String id, name; factory NamedRecord.fromJson(Map<String, dynamic> json); }`
  - `class IncomeSourceRepository { IncomeSourceRepository(ApiClient client); Future<Page<NamedRecord>> list({String? search}); Future<NamedRecord> create(String name); Future<NamedRecord> rename(String id, String name); Future<void> remove(String id); }`
  - `class ExpenseCategoryRepository` — identical shape to `IncomeSourceRepository`, hitting `/api/expense-categories` instead of `/api/income-sources`.

Both repositories are deliberately duplicated (not a shared base class) — they're four thin methods each hitting different paths, and RN's own `sources.tsx`/`categories.tsx` make the same call: reuse the generic *screen*, not the data layer. See Task 17 for the shared UI.

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/shared/named_record_repository_test.dart
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/features/expense/data/expense_category_repository.dart';
import 'package:my__accountant/features/income/data/income_source_repository.dart';

import '../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  group('IncomeSourceRepository', () {
    late Dio dio;
    late IncomeSourceRepository repository;

    setUp(() {
      dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
      repository = IncomeSourceRepository(ApiClient(dio));
    });

    test('list hits /api/income-sources and parses a page', () async {
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/income-sources');
        expect(options.uri.queryParameters['limit'], '100');
        return _jsonBody({
          'success': true,
          'data': [
            {'id': 's1', 'name': 'Salary'}
          ],
          'pagination': {'page': 1, 'limit': 100, 'total': 1, 'totalPages': 1},
        }, 200);
      });

      final page = await repository.list();
      expect(page.data.single.name, 'Salary');
    });

    test('create posts the name', () async {
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/income-sources');
        expect((options.data as Map<String, dynamic>)['name'], 'Freelance');
        return _jsonBody({
          'success': true,
          'data': {'id': 's2', 'name': 'Freelance'},
        }, 200);
      });

      final created = await repository.create('Freelance');
      expect(created.id, 's2');
    });

    test('rename patches by id', () async {
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/income-sources/s1');
        expect(options.method, 'PATCH');
        return _jsonBody({
          'success': true,
          'data': {'id': 's1', 'name': 'Salary (new job)'},
        }, 200);
      });

      final renamed = await repository.rename('s1', 'Salary (new job)');
      expect(renamed.name, 'Salary (new job)');
    });

    test('remove deletes by id', () async {
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/income-sources/s1');
        expect(options.method, 'DELETE');
        return ResponseBody.fromString('', 204);
      });

      await repository.remove('s1');
    });
  });

  group('ExpenseCategoryRepository', () {
    test('list hits /api/expense-categories', () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/expense-categories');
        return _jsonBody({
          'success': true,
          'data': <dynamic>[],
          'pagination': {'page': 1, 'limit': 100, 'total': 0, 'totalPages': 0},
        }, 200);
      });

      final repository = ExpenseCategoryRepository(ApiClient(dio));
      final page = await repository.list();
      expect(page.data, isEmpty);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/shared/named_record_repository_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing files

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/shared/named_record.dart

/// A user-owned name with an id — income sources and expense categories are
/// both this shape. Mirrors `NamedRecord` in `components/forms/name-list.tsx`.
class NamedRecord {
  const NamedRecord({required this.id, required this.name});

  final String id;
  final String name;

  factory NamedRecord.fromJson(Map<String, dynamic> json) =>
      NamedRecord(id: json['id'] as String, name: json['name'] as String);
}
```

```dart
// my__accountant/lib/features/income/data/income_source_repository.dart
import '../../../core/network/api_client.dart';
import '../../../core/network/page.dart';
import '../../../shared/named_record.dart';

class IncomeSourceRepository {
  IncomeSourceRepository(this._client);

  final ApiClient _client;

  Future<Page<NamedRecord>> list({String? search}) {
    return _client.request(
      '/api/income-sources',
      query: {'limit': 100, 'sort': 'name', 'order': 'asc', if (search != null) 'search': search},
      parse: (json) => Page.fromJson<NamedRecord>(json as Map<String, dynamic>, NamedRecord.fromJson),
    );
  }

  Future<NamedRecord> create(String name) {
    return _client.request(
      '/api/income-sources',
      method: 'POST',
      body: {'name': name},
      parse: (json) => NamedRecord.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<NamedRecord> rename(String id, String name) {
    return _client.request(
      '/api/income-sources/$id',
      method: 'PATCH',
      body: {'name': name},
      parse: (json) => NamedRecord.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> remove(String id) {
    return _client.request<void>('/api/income-sources/$id', method: 'DELETE', parse: (_) {});
  }
}
```

```dart
// my__accountant/lib/features/expense/data/expense_category_repository.dart
import '../../../core/network/api_client.dart';
import '../../../core/network/page.dart';
import '../../../shared/named_record.dart';

class ExpenseCategoryRepository {
  ExpenseCategoryRepository(this._client);

  final ApiClient _client;

  Future<Page<NamedRecord>> list({String? search}) {
    return _client.request(
      '/api/expense-categories',
      query: {'limit': 100, 'sort': 'name', 'order': 'asc', if (search != null) 'search': search},
      parse: (json) => Page.fromJson<NamedRecord>(json as Map<String, dynamic>, NamedRecord.fromJson),
    );
  }

  Future<NamedRecord> create(String name) {
    return _client.request(
      '/api/expense-categories',
      method: 'POST',
      body: {'name': name},
      parse: (json) => NamedRecord.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<NamedRecord> rename(String id, String name) {
    return _client.request(
      '/api/expense-categories/$id',
      method: 'PATCH',
      body: {'name': name},
      parse: (json) => NamedRecord.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> remove(String id) {
    return _client.request<void>('/api/expense-categories/$id', method: 'DELETE', parse: (_) {});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/shared/named_record_repository_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/shared/named_record.dart my__accountant/lib/features/income/data/income_source_repository.dart my__accountant/lib/features/expense/data/expense_category_repository.dart my__accountant/test/shared/named_record_repository_test.dart
git commit -m "Add NamedRecord, IncomeSourceRepository, ExpenseCategoryRepository"
```

---

### Task 6: Expense models + ExpenseRepository

**Files:**
- Create: `my__accountant/lib/features/expense/data/expense_models.dart`
- Create: `my__accountant/lib/features/expense/data/expense_repository.dart`
- Test: `my__accountant/test/features/expense/data/expense_repository_test.dart`

**Interfaces:**
- Consumes: `ApiClient`, `Page` (Task 1), `Wallet`/`Wallet.fromWire` (Task 4 — expenses use the same wallet enum as income, defined in `income_models.dart`)
- Produces:
  - `class Expense { final String id, userId, occurredAt, amount, createdAt, updatedAt; final String? categoryId, categoryName, description, payee; final Wallet wallet; factory Expense.fromJson(Map<String, dynamic> json); }`
  - `class ExpenseInput { final String? categoryId, payee, description; final String occurredAt, amount; final Wallet wallet; const ExpenseInput({required this.categoryId, required this.occurredAt, required this.amount, required this.payee, required this.description, required this.wallet}); Map<String, dynamic> toJson(); }`
  - `class ExpenseRepository { ExpenseRepository(ApiClient client); Future<Page<Expense>> listExpenses({int page, int limit, String? categoryId, Wallet? wallet, String? search, String? from, String? to}); Future<Expense> getExpense(String id); Future<Expense> createExpense(ExpenseInput input); Future<Expense> updateExpense(String id, ExpenseInput input); Future<void> deleteExpense(String id); }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/expense/data/expense_repository_test.dart
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/features/income/data/income_models.dart' show Wallet;
import 'package:my__accountant/features/expense/data/expense_models.dart';
import 'package:my__accountant/features/expense/data/expense_repository.dart';

import '../../../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

Map<String, dynamic> _expenseJson({String id = 'e1'}) => {
      'id': id,
      'user_id': 'u1',
      'category_id': 'c1',
      'category_name': 'Groceries',
      'occurred_at': '2026-08-09T14:05:00Z',
      'amount': '2500.00',
      'description': 'Weekly shop',
      'payee': 'Supermarket',
      'wallet': 'mpesa',
      'created_at': '2026-08-09T14:05:00Z',
      'updated_at': '2026-08-09T14:05:00Z',
    };

void main() {
  late Dio dio;
  late ExpenseRepository repository;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    repository = ExpenseRepository(ApiClient(dio));
  });

  test('listExpenses sends filters including search as query params', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/expenses');
      expect(options.uri.queryParameters['search'], 'super');
      expect(options.uri.queryParameters['wallet'], 'mpesa');
      return _jsonBody({
        'success': true,
        'data': [_expenseJson()],
        'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
      }, 200);
    });

    final page = await repository.listExpenses(wallet: Wallet.mpesa, search: 'super');
    expect(page.data.single.payee, 'Supermarket');
  });

  test('getExpense fetches by id', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/expenses/e1');
      return _jsonBody({'success': true, 'data': _expenseJson()}, 200);
    });

    final expense = await repository.getExpense('e1');
    expect(expense.categoryName, 'Groceries');
  });

  test('createExpense posts the full input body', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/expenses');
      final body = options.data as Map<String, dynamic>;
      expect(body['occurredAt'], '2026-08-09T14:05:00Z');
      expect(body['wallet'], 'mpesa');
      return _jsonBody({'success': true, 'data': _expenseJson()}, 200);
    });

    await repository.createExpense(const ExpenseInput(
      categoryId: 'c1',
      occurredAt: '2026-08-09T14:05:00Z',
      amount: '2500.00',
      payee: 'Supermarket',
      description: 'Weekly shop',
      wallet: Wallet.mpesa,
    ));
  });

  test('updateExpense patches by id', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.method, 'PATCH');
      expect(options.uri.path, '/api/expenses/e1');
      return _jsonBody({'success': true, 'data': _expenseJson()}, 200);
    });

    await repository.updateExpense(
      'e1',
      const ExpenseInput(
        categoryId: null,
        occurredAt: '2026-08-09T14:05:00Z',
        amount: '1',
        payee: null,
        description: null,
        wallet: Wallet.cash,
      ),
    );
  });

  test('deleteExpense sends DELETE', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.method, 'DELETE');
      expect(options.uri.path, '/api/expenses/e1');
      return ResponseBody.fromString('', 204);
    });

    await repository.deleteExpense('e1');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/expense/data/expense_repository_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `expense_models.dart`, `expense_repository.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/expense/data/expense_models.dart
import '../../income/data/income_models.dart' show Wallet;

/// Expenses carry a full timestamp, not just a date — that is what makes
/// the hourly spending report (a later plan) real.
class Expense {
  const Expense({
    required this.id,
    required this.userId,
    required this.categoryId,
    required this.categoryName,
    required this.occurredAt,
    required this.amount,
    required this.description,
    required this.payee,
    required this.wallet,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String userId;
  final String? categoryId;
  final String? categoryName;
  final String occurredAt;
  final String amount;
  final String? description;
  final String? payee;
  final Wallet wallet;
  final String createdAt;
  final String updatedAt;

  factory Expense.fromJson(Map<String, dynamic> json) => Expense(
        id: json['id'] as String,
        userId: json['user_id'] as String,
        categoryId: json['category_id'] as String?,
        categoryName: json['category_name'] as String?,
        occurredAt: json['occurred_at'] as String,
        amount: json['amount'] as String,
        description: json['description'] as String?,
        payee: json['payee'] as String?,
        wallet: Wallet.fromWire(json['wallet'] as String),
        createdAt: json['created_at'] as String,
        updatedAt: json['updated_at'] as String,
      );
}

class ExpenseInput {
  const ExpenseInput({
    required this.categoryId,
    required this.occurredAt,
    required this.amount,
    required this.payee,
    required this.description,
    required this.wallet,
  });

  final String? categoryId;
  final String occurredAt;
  final String amount;
  final String? payee;
  final String? description;
  final Wallet wallet;

  Map<String, dynamic> toJson() => {
        'categoryId': categoryId,
        'occurredAt': occurredAt,
        'amount': amount,
        'payee': payee,
        'description': description,
        'wallet': wallet.value,
      };
}
```

```dart
// my__accountant/lib/features/expense/data/expense_repository.dart
import '../../../core/network/api_client.dart';
import '../../../core/network/page.dart';
import '../../income/data/income_models.dart' show Wallet;
import 'expense_models.dart';

class ExpenseRepository {
  ExpenseRepository(this._client);

  final ApiClient _client;

  Future<Page<Expense>> listExpenses({
    int page = 1,
    int limit = 20,
    String? categoryId,
    Wallet? wallet,
    String? search,
    String? from,
    String? to,
  }) {
    return _client.request(
      '/api/expenses',
      query: {
        'page': page,
        'limit': limit,
        if (categoryId != null) 'categoryId': categoryId,
        if (wallet != null) 'wallet': wallet.value,
        if (search != null) 'search': search,
        if (from != null) 'from': from,
        if (to != null) 'to': to,
      },
      parse: (json) => Page.fromJson<Expense>(json as Map<String, dynamic>, Expense.fromJson),
    );
  }

  Future<Expense> getExpense(String id) {
    return _client.request(
      '/api/expenses/$id',
      parse: (json) => Expense.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<Expense> createExpense(ExpenseInput input) {
    return _client.request(
      '/api/expenses',
      method: 'POST',
      body: input.toJson(),
      parse: (json) => Expense.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<Expense> updateExpense(String id, ExpenseInput input) {
    return _client.request(
      '/api/expenses/$id',
      method: 'PATCH',
      body: input.toJson(),
      parse: (json) => Expense.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> deleteExpense(String id) {
    return _client.request<void>('/api/expenses/$id', method: 'DELETE', parse: (_) {});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/features/expense/data/expense_repository_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/features/expense/data/expense_models.dart my__accountant/lib/features/expense/data/expense_repository.dart my__accountant/test/features/expense/data/expense_repository_test.dart
git commit -m "Add expense models and ExpenseRepository"
```

---

### Task 7: Data providers

**Files:**
- Create: `my__accountant/lib/features/income/data/income_providers.dart`
- Create: `my__accountant/lib/features/expense/data/expense_providers.dart`

**Interfaces:**
- Consumes: `apiClientProvider` (plan 1), `IncomeRepository`/`IncomeSourceRepository` (Tasks 4-5), `ExpenseRepository`/`ExpenseCategoryRepository` (Tasks 5-6)
- Produces:
  - `final incomeRepositoryProvider = Provider<IncomeRepository>(...)`
  - `final incomeSourceRepositoryProvider = Provider<IncomeSourceRepository>(...)`
  - `final expenseRepositoryProvider = Provider<ExpenseRepository>(...)`
  - `final expenseCategoryRepositoryProvider = Provider<ExpenseCategoryRepository>(...)`

No test — pure wiring, exercised indirectly by every later task's provider overrides (same as plan 1's Task 13).

- [ ] **Step 1: Implement**

```dart
// my__accountant/lib/features/income/data/income_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/providers.dart';
import 'income_repository.dart';
import 'income_source_repository.dart';

final incomeRepositoryProvider = Provider<IncomeRepository>((ref) {
  return IncomeRepository(ref.watch(apiClientProvider));
});

final incomeSourceRepositoryProvider = Provider<IncomeSourceRepository>((ref) {
  return IncomeSourceRepository(ref.watch(apiClientProvider));
});
```

```dart
// my__accountant/lib/features/expense/data/expense_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/providers.dart';
import 'expense_category_repository.dart';
import 'expense_repository.dart';

final expenseRepositoryProvider = Provider<ExpenseRepository>((ref) {
  return ExpenseRepository(ref.watch(apiClientProvider));
});

final expenseCategoryRepositoryProvider = Provider<ExpenseCategoryRepository>((ref) {
  return ExpenseCategoryRepository(ref.watch(apiClientProvider));
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "my__accountant" && flutter analyze lib/features/income/data/income_providers.dart lib/features/expense/data/expense_providers.dart`
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
cd .. && git add my__accountant/lib/features/income/data/income_providers.dart my__accountant/lib/features/expense/data/expense_providers.dart
git commit -m "Add income and expense data providers"
```

---

### Task 8: PagedListState + PagedListNotifier generic base

**Files:**
- Create: `my__accountant/lib/shared/paged_list.dart`
- Test: `my__accountant/test/shared/paged_list_test.dart`

**Interfaces:**
- Consumes: `Page`/`PaginationMeta` (Task 1), `ApiException` (plan 1)
- Produces:
  - `class PagedListState<T> { final List<T> items; final int total, page, totalPages; final String? error; final bool loading, refreshing, loadingMore; static PagedListState<T> initial<T>(); bool get hasMore; PagedListState<T> copyWith({List<T>? items, int? total, int? page, int? totalPages, String? error, bool clearError = false, bool? loading, bool? refreshing, bool? loadingMore}); }`
  - `abstract class PagedListNotifier<T> extends Notifier<PagedListState<T>> { Future<Page<T>> fetchPage(int page); void loadMore(); void refresh(); void reload(); }` — `build()` is implemented by the base class (kicks off page 1, fire-and-forget, same pattern as plan 1's `AuthNotifier.build()`); subclasses implement only `fetchPage`.

Note on `copyWith`'s `error`/`clearError`: plan 1's final review flagged `AuthState.copyWith`'s inability to distinguish "clear this field" from "leave it alone" as a landmine (a bare `?? this.field` means passing `null` is indistinguishable from omitting the argument). This class avoids that: `error` uses an explicit `clearError` flag rather than relying on `null` meaning "clear."

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/shared/paged_list_test.dart
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_exception.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/shared/paged_list.dart';

class _TestNotifier extends PagedListNotifier<int> {
  _TestNotifier(this._fetch);
  final Future<Page<int>> Function(int page) _fetch;

  @override
  Future<Page<int>> fetchPage(int page) => _fetch(page);
}

Page<int> _page(List<int> items, {required int page, required int totalPages, required int total}) {
  return Page<int>(
    data: items,
    pagination: PaginationMeta(page: page, limit: 2, total: total, totalPages: totalPages),
  );
}

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  test('loads page 1 on construction', () async {
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) async => _page([1, 2], page: 1, totalPages: 2, total: 4)),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();

    final state = container.read(provider);
    expect(state.items, [1, 2]);
    expect(state.loading, isFalse);
    expect(state.hasMore, isTrue);
  });

  test('loadMore appends the next page', () async {
    var callCount = 0;
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) async {
        callCount++;
        return page == 1
            ? _page([1, 2], page: 1, totalPages: 2, total: 4)
            : _page([3, 4], page: 2, totalPages: 2, total: 4);
      }),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();
    container.read(provider.notifier).loadMore();
    await _settle();

    final state = container.read(provider);
    expect(state.items, [1, 2, 3, 4]);
    expect(state.hasMore, isFalse);
    expect(callCount, 2);
  });

  test('refresh replaces items starting from page 1', () async {
    var version = 1;
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier(
          (page) async => _page(version == 1 ? [1, 2] : [9, 9], page: 1, totalPages: 1, total: 2)),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();
    version = 2;
    container.read(provider.notifier).refresh();
    await _settle();

    expect(container.read(provider).items, [9, 9]);
  });

  test('a failed load sets an error and leaves items untouched', () async {
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) async => throw ApiException(500, 'Server error')),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();

    final state = container.read(provider);
    expect(state.error, 'Server error');
    expect(state.items, isEmpty);
    expect(state.loading, isFalse);
  });

  test('a later successful load clears a previous error', () async {
    var shouldFail = true;
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) async {
        if (shouldFail) throw ApiException(500, 'Server error');
        return _page([1], page: 1, totalPages: 1, total: 1);
      }),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();
    expect(container.read(provider).error, isNotNull);

    shouldFail = false;
    container.read(provider.notifier).reload();
    await _settle();

    expect(container.read(provider).error, isNull);
    expect(container.read(provider).items, [1]);
  });

  test('loadMore does nothing once hasMore is false', () async {
    var callCount = 0;
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) async {
        callCount++;
        return _page([1], page: 1, totalPages: 1, total: 1);
      }),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();
    container.read(provider.notifier).loadMore();
    await _settle();

    expect(callCount, 1);
  });

  test('a second load call while one is already in flight is ignored', () async {
    var callCount = 0;
    final completer = Completer<Page<int>>();
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) {
        callCount++;
        return completer.future;
      }),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider); // kicks off the initial load; it's now in flight
    container.read(provider.notifier).reload(); // must be ignored while in flight

    completer.complete(_page([1], page: 1, totalPages: 1, total: 1));
    await _settle();

    expect(callCount, 1);
    expect(container.read(provider).items, [1]);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/shared/paged_list_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `paged_list.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/shared/paged_list.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_exception.dart';
import '../core/network/page.dart';

/// A list that grows a page at a time — mirrors `usePagedList` in the RN
/// app. Reloading resets to page one rather than re-fetching everything
/// already loaded: the user has just come back from recording a
/// transaction, and what they want is the top of the list, not the same
/// screens of history they had scrolled through before.
class PagedListState<T> {
  const PagedListState({
    required this.items,
    required this.total,
    required this.page,
    required this.totalPages,
    required this.error,
    required this.loading,
    required this.refreshing,
    required this.loadingMore,
  });

  final List<T> items;
  final int total;
  final int page;
  final int totalPages;
  final String? error;
  final bool loading;
  final bool refreshing;
  final bool loadingMore;

  static PagedListState<T> initial<T>() => PagedListState<T>(
        items: const [],
        total: 0,
        page: 1,
        totalPages: 1,
        error: null,
        loading: true,
        refreshing: false,
        loadingMore: false,
      );

  bool get hasMore => page < totalPages;

  /// `clearError: true` explicitly wipes the error — passing `error: null`
  /// (or omitting it) always means "leave the current error alone."
  PagedListState<T> copyWith({
    List<T>? items,
    int? total,
    int? page,
    int? totalPages,
    String? error,
    bool clearError = false,
    bool? loading,
    bool? refreshing,
    bool? loadingMore,
  }) {
    return PagedListState<T>(
      items: items ?? this.items,
      total: total ?? this.total,
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
      error: clearError ? null : (error ?? this.error),
      loading: loading ?? this.loading,
      refreshing: refreshing ?? this.refreshing,
      loadingMore: loadingMore ?? this.loadingMore,
    );
  }
}

enum _LoadMode { initial, refresh, more }

abstract class PagedListNotifier<T> extends Notifier<PagedListState<T>> {
  bool _inFlight = false;

  @override
  PagedListState<T> build() {
    Future(() => _load(1, _LoadMode.initial));
    return PagedListState.initial<T>();
  }

  /// Fetches one page. Implemented per feature, using whatever filter
  /// state the subclass holds internally (see the Global Constraints note
  /// on where filter state lives).
  Future<Page<T>> fetchPage(int page);

  Future<void> _load(int target, _LoadMode mode) async {
    // Guards against a scroll listener or a rapid double-tap firing loadMore
    // repeatedly while a page is already in flight, which would skip pages
    // or duplicate one.
    if (_inFlight) return;
    _inFlight = true;

    state = state.copyWith(
      loading: mode == _LoadMode.initial ? true : null,
      refreshing: mode == _LoadMode.refresh,
      loadingMore: mode == _LoadMode.more,
    );

    try {
      final result = await fetchPage(target);
      state = state.copyWith(
        items: target == 1 ? result.data : [...state.items, ...result.data],
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
        page: target,
        clearError: true,
        loading: false,
        refreshing: false,
        loadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Could not load this list.',
        loading: false,
        refreshing: false,
        loadingMore: false,
      );
    } finally {
      _inFlight = false;
    }
  }

  void loadMore() {
    if (state.page < state.totalPages) _load(state.page + 1, _LoadMode.more);
  }

  void refresh() => _load(1, _LoadMode.refresh);

  void reload() => _load(1, _LoadMode.initial);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/shared/paged_list_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/shared/paged_list.dart my__accountant/test/shared/paged_list_test.dart
git commit -m "Add generic PagedListNotifier"
```

---

### Task 9: IncomeListNotifier + ExpenseListNotifier

**Files:**
- Create: `my__accountant/lib/features/income/state/income_list_notifier.dart`
- Create: `my__accountant/lib/features/expense/state/expense_list_notifier.dart`
- Test: `my__accountant/test/features/income/state/income_list_notifier_test.dart`
- Test: `my__accountant/test/features/expense/state/expense_list_notifier_test.dart`

**Interfaces:**
- Consumes: `PagedListNotifier<T>`/`PagedListState<T>` (Task 8), `incomeRepositoryProvider`/`expenseRepositoryProvider` (Task 7), `Income`/`Expense`/`Wallet` (Tasks 4, 6)
- Produces:
  - `class IncomeListNotifier extends PagedListNotifier<Income> { void setWalletFilter(Wallet? wallet); }` — `fetchPage` delegates to `IncomeRepository.listIncomes(page:, wallet:)`
  - `final incomeListProvider = NotifierProvider<IncomeListNotifier, PagedListState<Income>>(IncomeListNotifier.new);`
  - `class ExpenseListNotifier extends PagedListNotifier<Expense> { void setWalletFilter(Wallet? wallet); void setSearch(String? search); }` — `fetchPage` delegates to `ExpenseRepository.listExpenses(page:, wallet:, search:)`
  - `final expenseListProvider = NotifierProvider<ExpenseListNotifier, PagedListState<Expense>>(ExpenseListNotifier.new);`

Filter state (`_wallet`, `_search`) is private to each notifier per the Global Constraints note — the list screens (Tasks 11, 14) hold their own local copy for rendering the selected chip/search box, and call `setWalletFilter`/`setSearch` on change.

- [ ] **Step 1: Write the failing tests**

```dart
// my__accountant/test/features/income/state/income_list_notifier_test.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/income/data/income_models.dart';
import 'package:my__accountant/features/income/data/income_providers.dart';
import 'package:my__accountant/features/income/data/income_repository.dart';
import 'package:my__accountant/features/income/state/income_list_notifier.dart';

class MockIncomeRepository extends Mock implements IncomeRepository {}

Income _income({String id = 'i1'}) => Income(
      id: id,
      userId: 'u1',
      sourceId: null,
      sourceName: null,
      date: '2026-08-01',
      amount: '100',
      notes: null,
      wallet: Wallet.cash,
      createdAt: '2026-08-01',
      updatedAt: '2026-08-01',
    );

Page<Income> _page(List<Income> items) => Page(
      data: items,
      pagination: PaginationMeta(page: 1, limit: 20, total: items.length, totalPages: 1),
    );

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  late MockIncomeRepository repository;
  late ProviderContainer container;

  setUp(() {
    repository = MockIncomeRepository();
    container = ProviderContainer(overrides: [incomeRepositoryProvider.overrideWithValue(repository)]);
    addTearDown(container.dispose);
  });

  test('fetches page 1 with no wallet filter by default', () async {
    when(() => repository.listIncomes(page: 1, wallet: null)).thenAnswer((_) async => _page([_income()]));

    container.read(incomeListProvider);
    await _settle();

    expect(container.read(incomeListProvider).items, hasLength(1));
    verify(() => repository.listIncomes(page: 1, wallet: null)).called(1);
  });

  test('setWalletFilter reloads with the given wallet', () async {
    when(() => repository.listIncomes(page: 1, wallet: null)).thenAnswer((_) async => _page([]));
    when(() => repository.listIncomes(page: 1, wallet: Wallet.mpesa))
        .thenAnswer((_) async => _page([_income(id: 'i2')]));

    container.read(incomeListProvider);
    await _settle();
    container.read(incomeListProvider.notifier).setWalletFilter(Wallet.mpesa);
    await _settle();

    expect(container.read(incomeListProvider).items.single.id, 'i2');
    verify(() => repository.listIncomes(page: 1, wallet: Wallet.mpesa)).called(1);
  });
}
```

```dart
// my__accountant/test/features/expense/state/expense_list_notifier_test.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/expense/data/expense_models.dart';
import 'package:my__accountant/features/expense/data/expense_providers.dart';
import 'package:my__accountant/features/expense/data/expense_repository.dart';
import 'package:my__accountant/features/expense/state/expense_list_notifier.dart';
import 'package:my__accountant/features/income/data/income_models.dart' show Wallet;

class MockExpenseRepository extends Mock implements ExpenseRepository {}

Expense _expense({String id = 'e1'}) => Expense(
      id: id,
      userId: 'u1',
      categoryId: null,
      categoryName: null,
      occurredAt: '2026-08-09T14:05:00Z',
      amount: '100',
      description: null,
      payee: null,
      wallet: Wallet.cash,
      createdAt: '2026-08-09T14:05:00Z',
      updatedAt: '2026-08-09T14:05:00Z',
    );

Page<Expense> _page(List<Expense> items) => Page(
      data: items,
      pagination: PaginationMeta(page: 1, limit: 20, total: items.length, totalPages: 1),
    );

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  late MockExpenseRepository repository;
  late ProviderContainer container;

  setUp(() {
    repository = MockExpenseRepository();
    container = ProviderContainer(overrides: [expenseRepositoryProvider.overrideWithValue(repository)]);
    addTearDown(container.dispose);
  });

  test('fetches page 1 with no filters by default', () async {
    when(() => repository.listExpenses(page: 1, wallet: null, search: null))
        .thenAnswer((_) async => _page([_expense()]));

    container.read(expenseListProvider);
    await _settle();

    expect(container.read(expenseListProvider).items, hasLength(1));
    verify(() => repository.listExpenses(page: 1, wallet: null, search: null)).called(1);
  });

  test('setSearch and setWalletFilter both reload with the combined filters', () async {
    when(() => repository.listExpenses(page: 1, wallet: null, search: null))
        .thenAnswer((_) async => _page([]));
    when(() => repository.listExpenses(page: 1, wallet: null, search: 'super'))
        .thenAnswer((_) async => _page([]));
    when(() => repository.listExpenses(page: 1, wallet: Wallet.mpesa, search: 'super'))
        .thenAnswer((_) async => _page([_expense(id: 'e2')]));

    container.read(expenseListProvider);
    await _settle();
    container.read(expenseListProvider.notifier).setSearch('super');
    await _settle();
    container.read(expenseListProvider.notifier).setWalletFilter(Wallet.mpesa);
    await _settle();

    expect(container.read(expenseListProvider).items.single.id, 'e2');
    verify(() => repository.listExpenses(page: 1, wallet: Wallet.mpesa, search: 'super')).called(1);
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `flutter test test/features/income/state/income_list_notifier_test.dart test/features/expense/state/expense_list_notifier_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `income_list_notifier.dart`, `expense_list_notifier.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/income/state/income_list_notifier.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/page.dart';
import '../../../shared/paged_list.dart';
import '../data/income_models.dart';
import '../data/income_providers.dart';

class IncomeListNotifier extends PagedListNotifier<Income> {
  Wallet? _wallet;

  void setWalletFilter(Wallet? wallet) {
    _wallet = wallet;
    reload();
  }

  @override
  Future<Page<Income>> fetchPage(int page) {
    return ref.read(incomeRepositoryProvider).listIncomes(page: page, wallet: _wallet);
  }
}

final incomeListProvider = NotifierProvider<IncomeListNotifier, PagedListState<Income>>(
  IncomeListNotifier.new,
);
```

```dart
// my__accountant/lib/features/expense/state/expense_list_notifier.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/page.dart';
import '../../../shared/paged_list.dart';
import '../../income/data/income_models.dart' show Wallet;
import '../data/expense_models.dart';
import '../data/expense_providers.dart';

class ExpenseListNotifier extends PagedListNotifier<Expense> {
  Wallet? _wallet;
  String? _search;

  void setWalletFilter(Wallet? wallet) {
    _wallet = wallet;
    reload();
  }

  void setSearch(String? search) {
    _search = search;
    reload();
  }

  @override
  Future<Page<Expense>> fetchPage(int page) {
    return ref
        .read(expenseRepositoryProvider)
        .listExpenses(page: page, wallet: _wallet, search: _search);
  }
}

final expenseListProvider = NotifierProvider<ExpenseListNotifier, PagedListState<Expense>>(
  ExpenseListNotifier.new,
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `flutter test test/features/income/state/income_list_notifier_test.dart test/features/expense/state/expense_list_notifier_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/features/income/state/income_list_notifier.dart my__accountant/lib/features/expense/state/expense_list_notifier.dart my__accountant/test/features/income/state/income_list_notifier_test.dart my__accountant/test/features/expense/state/expense_list_notifier_test.dart
git commit -m "Add IncomeListNotifier and ExpenseListNotifier"
```

---

### Task 10: Shared option-picker bottom sheet

**Files:**
- Create: `my__accountant/lib/shared/option_picker.dart`
- Test: `my__accountant/test/shared/option_picker_test.dart`

**Interfaces:**
- Consumes: `NamedRecord` (Task 5)
- Produces:
  - `class OptionPickerResult { const OptionPickerResult(String? id); final String? id; }`
  - `Future<OptionPickerResult?> showOptionPicker({required BuildContext context, required String title, required List<NamedRecord> options, required String? selectedId, required String noneLabel})` — the income source / expense category picker both forms (Tasks 12, 15) use. Returns `null` if dismissed without a choice (caller must not overwrite the current selection); a non-null result always carries a decision, where `.id == null` means the user explicitly picked "none."

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/shared/option_picker_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/shared/named_record.dart';
import 'package:my__accountant/shared/option_picker.dart';

void main() {
  Widget harness(Future<void> Function(BuildContext context) onPressed) {
    return MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: ElevatedButton(
            onPressed: () => onPressed(context),
            child: const Text('Open'),
          ),
        ),
      ),
    );
  }

  testWidgets('selecting "none" returns a result with a null id', (tester) async {
    OptionPickerResult? result;
    await tester.pumpWidget(harness((context) async {
      result = await showOptionPicker(
        context: context,
        title: 'Pick one',
        options: const [NamedRecord(id: 'a', name: 'Alpha')],
        selectedId: 'a',
        noneLabel: 'None',
      );
    }));

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('None'));
    await tester.pumpAndSettle();

    expect(result, isNotNull);
    expect(result!.id, isNull);
  });

  testWidgets('selecting an option returns its id', (tester) async {
    OptionPickerResult? result;
    await tester.pumpWidget(harness((context) async {
      result = await showOptionPicker(
        context: context,
        title: 'Pick one',
        options: const [NamedRecord(id: 'a', name: 'Alpha')],
        selectedId: null,
        noneLabel: 'None',
      );
    }));

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alpha'));
    await tester.pumpAndSettle();

    expect(result!.id, 'a');
  });

  testWidgets('dismissing without a choice does not signal a change', (tester) async {
    OptionPickerResult? result = const OptionPickerResult('unchanged');
    await tester.pumpWidget(harness((context) async {
      final picked = await showOptionPicker(
        context: context,
        title: 'Pick one',
        options: const [NamedRecord(id: 'a', name: 'Alpha')],
        selectedId: null,
        noneLabel: 'None',
      );
      if (picked != null) result = picked;
    }));

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    // Tap the scrim, outside the sheet, to dismiss without choosing.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    expect(result!.id, 'unchanged');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/shared/option_picker_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `option_picker.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/shared/option_picker.dart
import 'package:flutter/material.dart';

import 'named_record.dart';

/// `null` means the sheet was dismissed without a choice — the caller must
/// not overwrite the current selection. A non-null result always carries a
/// decision: `id == null` means the user explicitly picked the "none" row.
class OptionPickerResult {
  const OptionPickerResult(this.id);
  final String? id;
}

Future<OptionPickerResult?> showOptionPicker({
  required BuildContext context,
  required String title,
  required List<NamedRecord> options,
  required String? selectedId,
  required String noneLabel,
}) {
  return showModalBottomSheet<OptionPickerResult>(
    context: context,
    isScrollControlled: true,
    builder: (context) {
      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(title, style: Theme.of(context).textTheme.titleMedium),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  ListTile(
                    title: Text(noneLabel),
                    trailing: selectedId == null ? const Icon(Icons.check) : null,
                    onTap: () => Navigator.of(context).pop(const OptionPickerResult(null)),
                  ),
                  for (final option in options)
                    ListTile(
                      title: Text(option.name),
                      trailing: selectedId == option.id ? const Icon(Icons.check) : null,
                      onTap: () => Navigator.of(context).pop(OptionPickerResult(option.id)),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/shared/option_picker_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/shared/option_picker.dart my__accountant/test/shared/option_picker_test.dart
git commit -m "Add shared option picker bottom sheet"
```

---

### Task 11: Income list screen

**Files:**
- Create: `my__accountant/lib/features/income/screens/income_list_screen.dart`
- Modify: `my__accountant/lib/core/router/app_router.dart` (the `/income` route builder)
- Test: `my__accountant/test/features/income/screens/income_list_screen_test.dart`

**Interfaces:**
- Consumes: `incomeListProvider`/`IncomeListNotifier` (Task 9), `Income`/`Wallet`/`walletLabels` (Task 4), `currency`/`shortDate` (Task 3)
- Produces: `class IncomeListScreen extends ConsumerStatefulWidget { const IncomeListScreen({super.key}); }`

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/income/screens/income_list_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:my__accountant/features/income/data/income_models.dart';
import 'package:my__accountant/features/income/screens/income_list_screen.dart';
import 'package:my__accountant/features/income/state/income_list_notifier.dart';
import 'package:my__accountant/shared/paged_list.dart';

class _FixedIncomeListNotifier extends IncomeListNotifier {
  _FixedIncomeListNotifier(this._state);
  final PagedListState<Income> _state;
  Wallet? lastWalletFilter;

  @override
  PagedListState<Income> build() => _state;

  @override
  void setWalletFilter(Wallet? wallet) {
    lastWalletFilter = wallet;
  }
}

Income _income({String id = 'i1', String? sourceName = 'Salary'}) => Income(
      id: id,
      userId: 'u1',
      sourceId: null,
      sourceName: sourceName,
      date: '2026-08-01',
      amount: '50000.00',
      notes: null,
      wallet: Wallet.cash,
      createdAt: '2026-08-01',
      updatedAt: '2026-08-01',
    );

PagedListState<Income> _stateOf(List<Income> items, {bool loading = false}) => PagedListState<Income>(
      items: items,
      total: items.length,
      page: 1,
      totalPages: 1,
      error: null,
      loading: loading,
      refreshing: false,
      loadingMore: false,
    );

Widget _harness(_FixedIncomeListNotifier notifier) {
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (context, state) => const IncomeListScreen()),
    GoRoute(path: '/income/new', builder: (context, state) => const Scaffold(body: Text('new income'))),
    GoRoute(
      path: '/income/:id',
      builder: (context, state) => Scaffold(body: Text('income ${state.pathParameters['id']}')),
    ),
  ]);

  return ProviderScope(
    overrides: [incomeListProvider.overrideWith(() => notifier)],
    child: MaterialApp.router(routerConfig: router),
  );
}

void main() {
  testWidgets('renders income rows with source name and amount', (tester) async {
    final notifier = _FixedIncomeListNotifier(_stateOf([_income()]));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    expect(find.text('Salary'), findsOneWidget);
  });

  testWidgets('shows a spinner while loading', (tester) async {
    final notifier = _FixedIncomeListNotifier(PagedListState.initial<Income>());
    await tester.pumpWidget(_harness(notifier));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsWidgets);
  });

  testWidgets('shows the empty state when there are no items', (tester) async {
    final notifier = _FixedIncomeListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    expect(find.textContaining('No income yet'), findsOneWidget);
  });

  testWidgets('tapping the FAB navigates to /income/new', (tester) async {
    final notifier = _FixedIncomeListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();

    expect(find.text('new income'), findsOneWidget);
  });

  testWidgets('tapping a row navigates to its detail route', (tester) async {
    final notifier = _FixedIncomeListNotifier(_stateOf([_income(id: 'i9')]));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('income-row-i9')));
    await tester.pumpAndSettle();

    expect(find.text('income i9'), findsOneWidget);
  });

  testWidgets('selecting a wallet filter chip calls setWalletFilter', (tester) async {
    final notifier = _FixedIncomeListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.text(walletLabels[Wallet.mpesa]!));
    await tester.pumpAndSettle();

    expect(notifier.lastWalletFilter, Wallet.mpesa);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/income/screens/income_list_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `income_list_screen.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/income/screens/income_list_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/format.dart';
import '../data/income_models.dart';
import '../state/income_list_notifier.dart';

class IncomeListScreen extends ConsumerStatefulWidget {
  const IncomeListScreen({super.key});

  @override
  ConsumerState<IncomeListScreen> createState() => _IncomeListScreenState();
}

class _IncomeListScreenState extends ConsumerState<IncomeListScreen> {
  final _scrollController = ScrollController();
  Wallet? _walletFilter;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      ref.read(incomeListProvider.notifier).loadMore();
    }
  }

  void _setWallet(Wallet? wallet) {
    setState(() => _walletFilter = wallet);
    ref.read(incomeListProvider.notifier).setWalletFilter(wallet);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(incomeListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Income')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/income/new'),
        icon: const Icon(Icons.add),
        label: const Text('Income'),
      ),
      body: state.loading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null && state.items.isEmpty
              ? _ErrorState(
                  message: state.error!,
                  onRetry: () => ref.read(incomeListProvider.notifier).reload(),
                )
              : RefreshIndicator(
                  onRefresh: () async => ref.read(incomeListProvider.notifier).refresh(),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: _WalletFilterRow(value: _walletFilter, onChanged: _setWallet),
                      ),
                      Expanded(
                        child: state.items.isEmpty
                            ? const _EmptyState()
                            : ListView.separated(
                                controller: _scrollController,
                                padding: const EdgeInsets.only(bottom: 96),
                                itemCount: state.items.length + (state.loadingMore ? 1 : 0),
                                separatorBuilder: (_, __) => const Divider(height: 1),
                                itemBuilder: (context, index) {
                                  if (index >= state.items.length) {
                                    return const Padding(
                                      padding: EdgeInsets.symmetric(vertical: 24),
                                      child: Center(child: CircularProgressIndicator()),
                                    );
                                  }
                                  final income = state.items[index];
                                  return ListTile(
                                    key: Key('income-row-${income.id}'),
                                    title: Text(income.sourceName ?? 'Income'),
                                    subtitle: Text(shortDate(income.date)),
                                    trailing: Text(currency(income.amount)),
                                    onTap: () => context.push('/income/${income.id}'),
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _WalletFilterRow extends StatelessWidget {
  const _WalletFilterRow({required this.value, required this.onChanged});

  final Wallet? value;
  final ValueChanged<Wallet?> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: const Text('All'),
              selected: value == null,
              onSelected: (_) => onChanged(null),
            ),
          ),
          for (final wallet in Wallet.values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(walletLabels[wallet]!),
                selected: value == wallet,
                onSelected: (_) => onChanged(wallet),
              ),
            ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Text(
          'No income yet. Record what comes in with the button below.',
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Wire the route**

Modify `my__accountant/lib/core/router/app_router.dart`: add `import '../../features/income/screens/income_list_screen.dart';` and change

```dart
GoRoute(path: '/income', builder: (context, state) => const ComingSoonScreen('Income')),
```
to
```dart
GoRoute(path: '/income', builder: (context, state) => const IncomeListScreen()),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `flutter test test/features/income/screens/income_list_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
cd .. && git add my__accountant/lib/features/income/screens/income_list_screen.dart my__accountant/lib/core/router/app_router.dart my__accountant/test/features/income/screens/income_list_screen_test.dart
git commit -m "Add income list screen"
```

---

### Task 12: Income form widget

**Files:**
- Create: `my__accountant/lib/features/income/screens/income_form.dart`
- Test: `my__accountant/test/features/income/screens/income_form_test.dart`

**Interfaces:**
- Consumes: `incomeRepositoryProvider`/`incomeSourceRepositoryProvider` (Task 7), `incomeListProvider` (Task 9), `IncomeDetail`/`IncomeInput`/`Wallet`/`walletLabels` (Task 4), `NamedRecord` (Task 5), `showOptionPicker` (Task 10), `validateAmount`/`normalizeAmount` (Task 2), `currencyCode`/`currency`/`longDate`/`percent`/`today` (Task 3)
- Produces: `class IncomeForm extends ConsumerStatefulWidget { const IncomeForm({super.key, IncomeDetail? income}); }` — `income == null` means create mode; a non-null value means edit mode (pre-filled fields, distribution display, delete button).

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/income/screens/income_form_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/income/data/income_models.dart';
import 'package:my__accountant/features/income/data/income_providers.dart';
import 'package:my__accountant/features/income/data/income_repository.dart';
import 'package:my__accountant/features/income/data/income_source_repository.dart';
import 'package:my__accountant/features/income/screens/income_form.dart';
import 'package:my__accountant/shared/named_record.dart';

class MockIncomeRepository extends Mock implements IncomeRepository {}

class MockIncomeSourceRepository extends Mock implements IncomeSourceRepository {}

IncomeDetail _income({String? warning}) => IncomeDetail(
      id: 'i1',
      userId: 'u1',
      sourceId: 's1',
      sourceName: 'Salary',
      date: '2026-08-01',
      amount: '50000.00',
      notes: 'August pay',
      wallet: Wallet.account,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      distribution: const [
        IncomeSplit(
          id: 'd1',
          distributionCategoryId: 'dc1',
          categoryName: 'Essentials',
          amount: '30000.00',
          percentageApplied: '60',
        ),
      ],
      warning: warning,
    );

Widget _harness({
  required MockIncomeRepository repository,
  required MockIncomeSourceRepository sourceRepository,
  IncomeDetail? income,
}) {
  when(() => sourceRepository.list())
      .thenAnswer((_) async => const Page(data: [], pagination: PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0)));

  return ProviderScope(
    overrides: [
      incomeRepositoryProvider.overrideWithValue(repository),
      incomeSourceRepositoryProvider.overrideWithValue(sourceRepository),
    ],
    child: MaterialApp(home: Scaffold(body: IncomeForm(income: income))),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(const IncomeInput(sourceId: null, date: '2026-08-01', amount: '1', notes: null, wallet: Wallet.cash));
  });

  testWidgets('create mode pre-fills today and defaults to the account wallet', (tester) async {
    await tester.pumpWidget(_harness(
      repository: MockIncomeRepository(),
      sourceRepository: MockIncomeSourceRepository(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Record income'), findsOneWidget);
    expect(find.text('None'), findsOneWidget); // no source selected
  });

  testWidgets('edit mode pre-fills the existing record and shows the split', (tester) async {
    await tester.pumpWidget(_harness(
      repository: MockIncomeRepository(),
      sourceRepository: MockIncomeSourceRepository(),
      income: _income(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Save changes'), findsOneWidget);
    expect(find.text('50000.00'), findsOneWidget);
    expect(find.text('Salary'), findsOneWidget);
    expect(find.text('Essentials'), findsOneWidget);
    expect(find.text('Delete income'), findsOneWidget);
  });

  testWidgets('shows a validation error and makes no network call for an empty amount', (tester) async {
    final repository = MockIncomeRepository();
    await tester.pumpWidget(_harness(repository: repository, sourceRepository: MockIncomeSourceRepository()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('income-amount')), '');
    await tester.tap(find.text('Record income'));
    await tester.pumpAndSettle();

    expect(find.text('Enter an amount.'), findsOneWidget);
    verifyNever(() => repository.createIncome(any()));
  });

  testWidgets('submitting a valid form calls createIncome with the entered amount', (tester) async {
    final repository = MockIncomeRepository();
    when(() => repository.createIncome(any())).thenAnswer((_) async => _income());

    await tester.pumpWidget(_harness(repository: repository, sourceRepository: MockIncomeSourceRepository()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('income-amount')), '1500');
    await tester.tap(find.text('Record income'));
    await tester.pumpAndSettle();

    final captured = verify(() => repository.createIncome(captureAny())).captured.single as IncomeInput;
    expect(captured.amount, '1500');
  });

  testWidgets('a save that returns a warning shows it in a dialog', (tester) async {
    final repository = MockIncomeRepository();
    when(() => repository.createIncome(any()))
        .thenAnswer((_) async => _income(warning: 'Distribution percentages total 90%.'));

    await tester.pumpWidget(_harness(repository: repository, sourceRepository: MockIncomeSourceRepository()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('income-amount')), '1500');
    await tester.tap(find.text('Record income'));
    await tester.pumpAndSettle();

    expect(find.text('Distribution percentages total 90%.'), findsOneWidget);
  });

  testWidgets('confirming delete calls deleteIncome', (tester) async {
    final repository = MockIncomeRepository();
    when(() => repository.deleteIncome('i1')).thenAnswer((_) async {});

    await tester.pumpWidget(_harness(
      repository: repository,
      sourceRepository: MockIncomeSourceRepository(),
      income: _income(),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Delete income'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    verify(() => repository.deleteIncome('i1')).called(1);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/income/screens/income_form_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `income_form.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/income/screens/income_form.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/page.dart';
import '../../../shared/format.dart';
import '../../../shared/money_validation.dart';
import '../../../shared/named_record.dart';
import '../../../shared/option_picker.dart';
import '../data/income_models.dart';
import '../data/income_providers.dart';
import '../state/income_list_notifier.dart';

class IncomeForm extends ConsumerStatefulWidget {
  const IncomeForm({super.key, this.income});

  final IncomeDetail? income;

  @override
  ConsumerState<IncomeForm> createState() => _IncomeFormState();
}

class _IncomeFormState extends ConsumerState<IncomeForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _amountController;
  late final TextEditingController _notesController;
  late String _date;
  String? _sourceId;
  String? _sourceName;
  late Wallet _wallet;

  bool _submitting = false;
  bool _deleting = false;
  String? _formError;
  Map<String, String> _fieldErrors = {};

  late final Future<Page<NamedRecord>> _sourcesFuture;

  bool get _editing => widget.income != null;

  @override
  void initState() {
    super.initState();
    final income = widget.income;
    _amountController = TextEditingController(text: income?.amount ?? '');
    _notesController = TextEditingController(text: income?.notes ?? '');
    _date = income?.date.substring(0, 10) ?? today();
    _sourceId = income?.sourceId;
    _sourceName = income?.sourceName;
    _wallet = income?.wallet ?? Wallet.account;
    _sourcesFuture = ref.read(incomeSourceRepositoryProvider).list();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_date) ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _date =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _pickSource() async {
    final page = await _sourcesFuture;
    if (!mounted) return;
    final result = await showOptionPicker(
      context: context,
      title: 'Income source',
      options: page.data,
      selectedId: _sourceId,
      noneLabel: 'No source',
    );
    if (result == null || !mounted) return;
    setState(() {
      _sourceId = result.id;
      _sourceName = result.id == null ? null : page.data.firstWhere((s) => s.id == result.id).name;
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _formError = null;
      _fieldErrors = {};
    });

    try {
      final input = IncomeInput(
        sourceId: _sourceId,
        date: _date,
        amount: normalizeAmount(_amountController.text),
        notes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
        wallet: _wallet,
      );

      final repository = ref.read(incomeRepositoryProvider);
      final saved = _editing
          ? await repository.updateIncome(widget.income!.id, input)
          : await repository.createIncome(input);

      ref.invalidate(incomeListProvider);
      if (!mounted) return;

      if (saved.warning != null) {
        await showDialog<void>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Recorded, with a caveat'),
            content: Text(saved.warning!),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _formError = e.fieldErrors.isEmpty ? e.message : null;
        _fieldErrors = e.fieldErrors;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _formError = 'Could not save this income. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this income?'),
        content: const Text('Its split is removed with it, so your reports stay consistent.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _deleting = true);
    try {
      await ref.read(incomeRepositoryProvider).deleteIncome(widget.income!.id);
      ref.invalidate(incomeListProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _formError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _formError = 'Could not delete this income.');
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_formError != null) ...[
              Text(_formError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              const SizedBox(height: 12),
            ],
            TextFormField(
              key: const Key('income-amount'),
              controller: _amountController,
              decoration: InputDecoration(
                labelText: 'Amount ($currencyCode)',
                errorText: _fieldErrors['amount'],
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              validator: (v) => validateAmount(v ?? ''),
            ),
            const SizedBox(height: 12),
            InkWell(
              key: const Key('income-date'),
              onTap: _pickDate,
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'Date received'),
                child: Text(longDate(_date)),
              ),
            ),
            const SizedBox(height: 12),
            InkWell(
              key: const Key('income-source'),
              onTap: _pickSource,
              child: InputDecorator(
                decoration: InputDecoration(labelText: 'Source', errorText: _fieldErrors['sourceId']),
                child: Text(_sourceName ?? 'None'),
              ),
            ),
            const SizedBox(height: 12),
            Text('Received into', style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final wallet in Wallet.values)
                  ChoiceChip(
                    label: Text(walletLabels[wallet]!),
                    selected: _wallet == wallet,
                    onSelected: (_) => setState(() => _wallet = wallet),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('income-notes'),
              controller: _notesController,
              decoration: InputDecoration(labelText: 'Notes', errorText: _fieldErrors['notes']),
              maxLines: 3,
              maxLength: 1000,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting || _deleting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_editing ? 'Save changes' : 'Record income'),
            ),
            if (_editing) ...[
              const SizedBox(height: 24),
              Text('How this was split', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              if (widget.income!.distribution.isEmpty)
                const Text(
                  'This income was recorded before any categories existed, so none of it was split.',
                )
              else
                for (final split in widget.income!.distribution)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(split.categoryName),
                        Text('${currency(split.amount)} (${percent(split.percentageApplied)})'),
                      ],
                    ),
                  ),
              const SizedBox(height: 16),
              OutlinedButton(
                key: const Key('income-delete'),
                onPressed: _submitting || _deleting ? null : _confirmDelete,
                child: Text(_deleting ? 'Deleting…' : 'Delete income'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/features/income/screens/income_form_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/features/income/screens/income_form.dart my__accountant/test/features/income/screens/income_form_test.dart
git commit -m "Add income form"
```

---

### Task 13: Income detail + create screens

**Files:**
- Create: `my__accountant/lib/features/income/screens/income_detail_screen.dart`
- Create: `my__accountant/lib/features/income/screens/income_create_screen.dart`
- Modify: `my__accountant/lib/core/router/app_router.dart` (add two new top-level routes)
- Test: `my__accountant/test/features/income/screens/income_detail_screen_test.dart`
- Test: `my__accountant/test/features/income/screens/income_create_screen_test.dart`

**Interfaces:**
- Consumes: `incomeRepositoryProvider` (Task 7), `IncomeForm` (Task 12)
- Produces:
  - `class IncomeDetailScreen extends ConsumerStatefulWidget { const IncomeDetailScreen({super.key, required String id}); }`
  - `class IncomeCreateScreen extends StatelessWidget { const IncomeCreateScreen({super.key}); }`

- [ ] **Step 1: Write the failing tests**

```dart
// my__accountant/test/features/income/screens/income_detail_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/income/data/income_models.dart';
import 'package:my__accountant/features/income/data/income_providers.dart';
import 'package:my__accountant/features/income/data/income_repository.dart';
import 'package:my__accountant/features/income/data/income_source_repository.dart';
import 'package:my__accountant/features/income/screens/income_detail_screen.dart';

class MockIncomeRepository extends Mock implements IncomeRepository {}

class MockIncomeSourceRepository extends Mock implements IncomeSourceRepository {}

IncomeDetail _income() => IncomeDetail(
      id: 'i1',
      userId: 'u1',
      sourceId: null,
      sourceName: null,
      date: '2026-08-01',
      amount: '5000.00',
      notes: null,
      wallet: Wallet.cash,
      createdAt: '2026-08-01',
      updatedAt: '2026-08-01',
      distribution: const [],
    );

Widget _harness(MockIncomeRepository repository, MockIncomeSourceRepository sourceRepository) {
  when(() => sourceRepository.list()).thenAnswer(
    (_) async => const Page(data: [], pagination: PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0)),
  );
  return ProviderScope(
    overrides: [
      incomeRepositoryProvider.overrideWithValue(repository),
      incomeSourceRepositoryProvider.overrideWithValue(sourceRepository),
    ],
    child: const MaterialApp(home: IncomeDetailScreen(id: 'i1')),
  );
}

void main() {
  testWidgets('shows a spinner while loading then the pre-filled form', (tester) async {
    final repository = MockIncomeRepository();
    when(() => repository.getIncome('i1')).thenAnswer((_) async => _income());

    await tester.pumpWidget(_harness(repository, MockIncomeSourceRepository()));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pumpAndSettle();
    expect(find.text('5000.00'), findsOneWidget);
    expect(find.text('Save changes'), findsOneWidget);
  });

  testWidgets('shows an error state with a working retry button', (tester) async {
    final repository = MockIncomeRepository();
    var callCount = 0;
    when(() => repository.getIncome('i1')).thenAnswer((_) async {
      callCount++;
      if (callCount == 1) throw Exception('boom');
      return _income();
    });

    await tester.pumpWidget(_harness(repository, MockIncomeSourceRepository()));
    await tester.pumpAndSettle();

    expect(find.text('Could not load this income.'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.text('Save changes'), findsOneWidget);
  });
}
```

```dart
// my__accountant/test/features/income/screens/income_create_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/income/data/income_providers.dart';
import 'package:my__accountant/features/income/data/income_source_repository.dart';
import 'package:my__accountant/features/income/screens/income_create_screen.dart';

class MockIncomeSourceRepository extends Mock implements IncomeSourceRepository {}

void main() {
  testWidgets('renders the create-mode form under a "Record income" title', (tester) async {
    final sourceRepository = MockIncomeSourceRepository();
    when(() => sourceRepository.list()).thenAnswer(
      (_) async => const Page(data: [], pagination: PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0)),
    );

    await tester.pumpWidget(ProviderScope(
      overrides: [incomeSourceRepositoryProvider.overrideWithValue(sourceRepository)],
      child: const MaterialApp(home: IncomeCreateScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Record income'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `flutter test test/features/income/screens/income_detail_screen_test.dart test/features/income/screens/income_create_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `income_detail_screen.dart`, `income_create_screen.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/income/screens/income_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/income_models.dart';
import '../data/income_providers.dart';
import 'income_form.dart';

class IncomeDetailScreen extends ConsumerStatefulWidget {
  const IncomeDetailScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<IncomeDetailScreen> createState() => _IncomeDetailScreenState();
}

class _IncomeDetailScreenState extends ConsumerState<IncomeDetailScreen> {
  late Future<IncomeDetail> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(incomeRepositoryProvider).getIncome(widget.id);
  }

  void _retry() {
    setState(() => _future = ref.read(incomeRepositoryProvider).getIncome(widget.id));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Income')),
      body: FutureBuilder<IncomeDetail>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Could not load this income.', textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _retry, child: const Text('Retry')),
                  ],
                ),
              ),
            );
          }
          // Keyed on the record so opening a different income (a fresh
          // widget.id after re-navigating) rebuilds the form's fields
          // instead of reusing the mounted state from the previous one.
          return IncomeForm(key: ValueKey(snapshot.data!.id), income: snapshot.data);
        },
      ),
    );
  }
}
```

```dart
// my__accountant/lib/features/income/screens/income_create_screen.dart
import 'package:flutter/material.dart';

import 'income_form.dart';

class IncomeCreateScreen extends StatelessWidget {
  const IncomeCreateScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      appBar: AppBar(title: Text('Record income')),
      body: IncomeForm(),
    );
  }
}
```

- [ ] **Step 4: Wire the routes**

Modify `my__accountant/lib/core/router/app_router.dart`. Add the imports:
```dart
import '../../features/income/screens/income_create_screen.dart';
import '../../features/income/screens/income_detail_screen.dart';
```

Find the top-level `routes: [` list passed to `GoRouter(...)` (the same list containing the `/login` and `/register` `GoRoute`s and the `ShellRoute`). Add these two entries as **siblings of `/login`/`/register` and the `ShellRoute`** — NOT inside the `ShellRoute`'s own nested `routes:` list — with `/income/new` declared before `/income/:id` so the literal path isn't captured as the id parameter:

```dart
GoRoute(path: '/income/new', builder: (context, state) => const IncomeCreateScreen()),
GoRoute(
  path: '/income/:id',
  builder: (context, state) => IncomeDetailScreen(id: state.pathParameters['id']!),
),
```

These are full-screen pushes outside the tab shell (bottom nav hidden), matching the RN app's own routing for these screens. No `redirect` changes are needed: the existing unauthenticated-and-not-on-an-auth-route branch already sends a signed-out user hitting either of these to `/login`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `flutter test test/features/income/screens/income_detail_screen_test.dart test/features/income/screens/income_create_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
cd .. && git add my__accountant/lib/features/income/screens/income_detail_screen.dart my__accountant/lib/features/income/screens/income_create_screen.dart my__accountant/lib/core/router/app_router.dart my__accountant/test/features/income/screens/income_detail_screen_test.dart my__accountant/test/features/income/screens/income_create_screen_test.dart
git commit -m "Add income detail and create screens"
```

---

### Task 14: Expense list screen

**Files:**
- Create: `my__accountant/lib/features/expense/screens/expense_list_screen.dart`
- Modify: `my__accountant/lib/core/router/app_router.dart` (the `/expenses` route builder)
- Test: `my__accountant/test/features/expense/screens/expense_list_screen_test.dart`

**Interfaces:**
- Consumes: `expenseListProvider`/`ExpenseListNotifier` (Task 9), `Expense`/`Wallet`/`walletLabels` (Tasks 4, 6), `currency`/`dateTime` (Task 3)
- Produces: `class ExpenseListScreen extends ConsumerStatefulWidget { const ExpenseListScreen({super.key}); }`

Unlike the income list, this screen has a search field (search is API-only on expenses — they carry a payee/description worth searching, income does not) in addition to the wallet filter row.

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/expense/screens/expense_list_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:my__accountant/features/expense/data/expense_models.dart';
import 'package:my__accountant/features/expense/screens/expense_list_screen.dart';
import 'package:my__accountant/features/expense/state/expense_list_notifier.dart';
import 'package:my__accountant/features/income/data/income_models.dart' show Wallet, walletLabels;
import 'package:my__accountant/shared/paged_list.dart';

class _FixedExpenseListNotifier extends ExpenseListNotifier {
  _FixedExpenseListNotifier(this._state);
  final PagedListState<Expense> _state;
  Wallet? lastWalletFilter;
  String? lastSearch;

  @override
  PagedListState<Expense> build() => _state;

  @override
  void setWalletFilter(Wallet? wallet) {
    lastWalletFilter = wallet;
  }

  @override
  void setSearch(String? search) {
    lastSearch = search;
  }
}

Expense _expense({String id = 'e1', String? payee = 'Supermarket'}) => Expense(
      id: id,
      userId: 'u1',
      categoryId: null,
      categoryName: null,
      occurredAt: '2026-08-09T14:05:00Z',
      amount: '2500.00',
      description: null,
      payee: payee,
      wallet: Wallet.mpesa,
      createdAt: '2026-08-09T14:05:00Z',
      updatedAt: '2026-08-09T14:05:00Z',
    );

PagedListState<Expense> _stateOf(List<Expense> items, {bool loading = false}) => PagedListState<Expense>(
      items: items,
      total: items.length,
      page: 1,
      totalPages: 1,
      error: null,
      loading: loading,
      refreshing: false,
      loadingMore: false,
    );

Widget _harness(_FixedExpenseListNotifier notifier) {
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (context, state) => const ExpenseListScreen()),
    GoRoute(path: '/expense/new', builder: (context, state) => const Scaffold(body: Text('new expense'))),
    GoRoute(
      path: '/expense/:id',
      builder: (context, state) => Scaffold(body: Text('expense ${state.pathParameters['id']}')),
    ),
  ]);

  return ProviderScope(
    overrides: [expenseListProvider.overrideWith(() => notifier)],
    child: MaterialApp.router(routerConfig: router),
  );
}

void main() {
  testWidgets('renders expense rows with payee and amount', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf([_expense()]));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    expect(find.text('Supermarket'), findsOneWidget);
  });

  testWidgets('shows the empty state when there are no items and no search', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    expect(find.textContaining('No expenses yet'), findsOneWidget);
  });

  testWidgets('tapping the FAB navigates to /expense/new', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();

    expect(find.text('new expense'), findsOneWidget);
  });

  testWidgets('tapping a row navigates to its detail route', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf([_expense(id: 'e9')]));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('expense-row-e9')));
    await tester.pumpAndSettle();

    expect(find.text('expense e9'), findsOneWidget);
  });

  testWidgets('typing in the search field calls setSearch', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('expense-search')), 'super');
    await tester.pumpAndSettle();

    expect(notifier.lastSearch, 'super');
  });

  testWidgets('selecting a wallet filter chip calls setWalletFilter', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.text(walletLabels[Wallet.cash]!));
    await tester.pumpAndSettle();

    expect(notifier.lastWalletFilter, Wallet.cash);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/expense/screens/expense_list_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `expense_list_screen.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/expense/screens/expense_list_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/format.dart';
import '../../income/data/income_models.dart' show Wallet, walletLabels;
import '../data/expense_models.dart';
import '../state/expense_list_notifier.dart';

class ExpenseListScreen extends ConsumerStatefulWidget {
  const ExpenseListScreen({super.key});

  @override
  ConsumerState<ExpenseListScreen> createState() => _ExpenseListScreenState();
}

class _ExpenseListScreenState extends ConsumerState<ExpenseListScreen> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  Wallet? _walletFilter;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      ref.read(expenseListProvider.notifier).loadMore();
    }
  }

  void _setWallet(Wallet? wallet) {
    setState(() => _walletFilter = wallet);
    ref.read(expenseListProvider.notifier).setWalletFilter(wallet);
  }

  void _setSearch(String value) {
    final trimmed = value.trim();
    ref.read(expenseListProvider.notifier).setSearch(trimmed.isEmpty ? null : trimmed);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(expenseListProvider);
    final searching = _searchController.text.trim().isNotEmpty;

    return Scaffold(
      appBar: AppBar(title: const Text('Expenses')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/expense/new'),
        icon: const Icon(Icons.add),
        label: const Text('Expense'),
      ),
      body: state.loading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null && state.items.isEmpty
              ? _ErrorState(
                  message: state.error!,
                  onRetry: () => ref.read(expenseListProvider.notifier).reload(),
                )
              : RefreshIndicator(
                  onRefresh: () async => ref.read(expenseListProvider.notifier).refresh(),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: TextField(
                          key: const Key('expense-search'),
                          controller: _searchController,
                          decoration: const InputDecoration(
                            labelText: 'Search',
                            hintText: 'Payee or description',
                            prefixIcon: Icon(Icons.search),
                          ),
                          onChanged: (value) {
                            setState(() {});
                            _setSearch(value);
                          },
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: _WalletFilterRow(value: _walletFilter, onChanged: _setWallet),
                      ),
                      const SizedBox(height: 8),
                      Expanded(
                        child: state.items.isEmpty
                            ? _EmptyState(searching: searching)
                            : ListView.separated(
                                controller: _scrollController,
                                padding: const EdgeInsets.only(bottom: 96),
                                itemCount: state.items.length + (state.loadingMore ? 1 : 0),
                                separatorBuilder: (_, __) => const Divider(height: 1),
                                itemBuilder: (context, index) {
                                  if (index >= state.items.length) {
                                    return const Padding(
                                      padding: EdgeInsets.symmetric(vertical: 24),
                                      child: Center(child: CircularProgressIndicator()),
                                    );
                                  }
                                  final expense = state.items[index];
                                  return ListTile(
                                    key: Key('expense-row-${expense.id}'),
                                    title: Text(expense.payee ?? expense.categoryName ?? 'Expense'),
                                    subtitle: Text(dateTime(expense.occurredAt)),
                                    trailing: Text(currency(expense.amount)),
                                    onTap: () => context.push('/expense/${expense.id}'),
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _WalletFilterRow extends StatelessWidget {
  const _WalletFilterRow({required this.value, required this.onChanged});

  final Wallet? value;
  final ValueChanged<Wallet?> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: const Text('All'),
              selected: value == null,
              onSelected: (_) => onChanged(null),
            ),
          ),
          for (final wallet in Wallet.values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(walletLabels[wallet]!),
                selected: value == wallet,
                onSelected: (_) => onChanged(wallet),
              ),
            ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.searching});

  final bool searching;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          searching
              ? 'Nothing matched. Try a different payee or description.'
              : 'No expenses yet. Record what you spend with the button below.',
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Wire the route**

Modify `my__accountant/lib/core/router/app_router.dart`: add `import '../../features/expense/screens/expense_list_screen.dart';` and change

```dart
GoRoute(path: '/expenses', builder: (context, state) => const ComingSoonScreen('Expenses')),
```
to
```dart
GoRoute(path: '/expenses', builder: (context, state) => const ExpenseListScreen()),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `flutter test test/features/expense/screens/expense_list_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
cd .. && git add my__accountant/lib/features/expense/screens/expense_list_screen.dart my__accountant/lib/core/router/app_router.dart my__accountant/test/features/expense/screens/expense_list_screen_test.dart
git commit -m "Add expense list screen"
```

---

### Task 15: Expense form widget

**Files:**
- Create: `my__accountant/lib/features/expense/screens/expense_form.dart`
- Test: `my__accountant/test/features/expense/screens/expense_form_test.dart`

**Interfaces:**
- Consumes: `expenseRepositoryProvider`/`expenseCategoryRepositoryProvider` (Task 7), `expenseListProvider` (Task 9), `Expense`/`ExpenseInput` (Task 6), `Wallet`/`walletLabels` (Task 4), `NamedRecord` (Task 5), `showOptionPicker` (Task 10), `validateAmount`/`normalizeAmount` (Task 2), `currencyCode`/`dateTime` (Task 3)
- Produces: `class ExpenseForm extends ConsumerStatefulWidget { const ExpenseForm({super.key, Expense? expense}); }` — `expense == null` means create mode.

Differs from `IncomeForm` (Task 12): a combined date+time picker instead of a date-only one (expenses carry a full timestamp — the hourly spending report, a later plan, is built from it), a payee field, a category picker instead of a source picker, a description field instead of notes, and no distribution-split display or warning dialog (expenses aren't split).

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/features/expense/screens/expense_form_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/expense/data/expense_category_repository.dart';
import 'package:my__accountant/features/expense/data/expense_models.dart';
import 'package:my__accountant/features/expense/data/expense_providers.dart';
import 'package:my__accountant/features/expense/data/expense_repository.dart';
import 'package:my__accountant/features/expense/screens/expense_form.dart';
import 'package:my__accountant/features/income/data/income_models.dart' show Wallet;

class MockExpenseRepository extends Mock implements ExpenseRepository {}

class MockExpenseCategoryRepository extends Mock implements ExpenseCategoryRepository {}

Expense _expense() => Expense(
      id: 'e1',
      userId: 'u1',
      categoryId: 'c1',
      categoryName: 'Groceries',
      occurredAt: '2026-08-09T14:05:00Z',
      amount: '2500.00',
      description: 'Weekly shop',
      payee: 'Supermarket',
      wallet: Wallet.mpesa,
      createdAt: '2026-08-09T14:05:00Z',
      updatedAt: '2026-08-09T14:05:00Z',
    );

Widget _harness({
  required MockExpenseRepository repository,
  required MockExpenseCategoryRepository categoryRepository,
  Expense? expense,
}) {
  when(() => categoryRepository.list()).thenAnswer(
    (_) async => const Page(data: [], pagination: PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0)),
  );

  return ProviderScope(
    overrides: [
      expenseRepositoryProvider.overrideWithValue(repository),
      expenseCategoryRepositoryProvider.overrideWithValue(categoryRepository),
    ],
    child: MaterialApp(home: Scaffold(body: ExpenseForm(expense: expense))),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(const ExpenseInput(
      categoryId: null,
      occurredAt: '2026-08-09T14:05:00Z',
      amount: '1',
      payee: null,
      description: null,
      wallet: Wallet.cash,
    ));
  });

  testWidgets('create mode shows the "Record expense" submit button and no delete button', (tester) async {
    await tester.pumpWidget(_harness(
      repository: MockExpenseRepository(),
      categoryRepository: MockExpenseCategoryRepository(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Record expense'), findsOneWidget);
    expect(find.text('Delete expense'), findsNothing);
  });

  testWidgets('edit mode pre-fills the existing record and shows delete', (tester) async {
    await tester.pumpWidget(_harness(
      repository: MockExpenseRepository(),
      categoryRepository: MockExpenseCategoryRepository(),
      expense: _expense(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Save changes'), findsOneWidget);
    expect(find.text('2500.00'), findsOneWidget);
    expect(find.text('Supermarket'), findsOneWidget);
    expect(find.text('Groceries'), findsOneWidget);
    expect(find.text('Delete expense'), findsOneWidget);
  });

  testWidgets('shows a validation error and makes no network call for an empty amount', (tester) async {
    final repository = MockExpenseRepository();
    await tester.pumpWidget(_harness(repository: repository, categoryRepository: MockExpenseCategoryRepository()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Record expense'));
    await tester.pumpAndSettle();

    expect(find.text('Enter an amount.'), findsOneWidget);
    verifyNever(() => repository.createExpense(any()));
  });

  testWidgets('submitting a valid form calls createExpense with the entered amount and payee', (tester) async {
    final repository = MockExpenseRepository();
    when(() => repository.createExpense(any())).thenAnswer((_) async => _expense());

    await tester.pumpWidget(_harness(repository: repository, categoryRepository: MockExpenseCategoryRepository()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('expense-amount')), '750');
    await tester.enterText(find.byKey(const Key('expense-payee')), 'Kiosk');
    await tester.tap(find.text('Record expense'));
    await tester.pumpAndSettle();

    final captured = verify(() => repository.createExpense(captureAny())).captured.single as ExpenseInput;
    expect(captured.amount, '750');
    expect(captured.payee, 'Kiosk');
  });

  testWidgets('confirming delete calls deleteExpense', (tester) async {
    final repository = MockExpenseRepository();
    when(() => repository.deleteExpense('e1')).thenAnswer((_) async {});

    await tester.pumpWidget(_harness(
      repository: repository,
      categoryRepository: MockExpenseCategoryRepository(),
      expense: _expense(),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Delete expense'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    verify(() => repository.deleteExpense('e1')).called(1);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/features/expense/screens/expense_form_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `expense_form.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/expense/screens/expense_form.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/page.dart';
import '../../../shared/format.dart';
import '../../../shared/money_validation.dart';
import '../../../shared/named_record.dart';
import '../../../shared/option_picker.dart';
import '../../income/data/income_models.dart' show Wallet, walletLabels;
import '../data/expense_models.dart';
import '../data/expense_providers.dart';
import '../state/expense_list_notifier.dart';

class ExpenseForm extends ConsumerStatefulWidget {
  const ExpenseForm({super.key, this.expense});

  final Expense? expense;

  @override
  ConsumerState<ExpenseForm> createState() => _ExpenseFormState();
}

class _ExpenseFormState extends ConsumerState<ExpenseForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _amountController;
  late final TextEditingController _payeeController;
  late final TextEditingController _descriptionController;
  late String _occurredAt;
  String? _categoryId;
  String? _categoryName;
  late Wallet _wallet;

  bool _submitting = false;
  bool _deleting = false;
  String? _formError;
  Map<String, String> _fieldErrors = {};

  late final Future<Page<NamedRecord>> _categoriesFuture;

  bool get _editing => widget.expense != null;

  @override
  void initState() {
    super.initState();
    final expense = widget.expense;
    _amountController = TextEditingController(text: expense?.amount ?? '');
    _payeeController = TextEditingController(text: expense?.payee ?? '');
    _descriptionController = TextEditingController(text: expense?.description ?? '');
    _occurredAt = expense?.occurredAt ?? DateTime.now().toUtc().toIso8601String();
    _categoryId = expense?.categoryId;
    _categoryName = expense?.categoryName;
    _wallet = expense?.wallet ?? Wallet.account;
    _categoriesFuture = ref.read(expenseCategoryRepositoryProvider).list();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _payeeController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final current = DateTime.tryParse(_occurredAt)?.toLocal() ?? DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(current));
    if (time == null || !mounted) return;
    final combined = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    setState(() => _occurredAt = combined.toUtc().toIso8601String());
  }

  Future<void> _pickCategory() async {
    final page = await _categoriesFuture;
    if (!mounted) return;
    final result = await showOptionPicker(
      context: context,
      title: 'Expense category',
      options: page.data,
      selectedId: _categoryId,
      noneLabel: 'Uncategorised',
    );
    if (result == null || !mounted) return;
    setState(() {
      _categoryId = result.id;
      _categoryName = result.id == null ? null : page.data.firstWhere((c) => c.id == result.id).name;
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _formError = null;
      _fieldErrors = {};
    });

    try {
      final input = ExpenseInput(
        categoryId: _categoryId,
        occurredAt: _occurredAt,
        amount: normalizeAmount(_amountController.text),
        payee: _payeeController.text.trim().isEmpty ? null : _payeeController.text.trim(),
        description:
            _descriptionController.text.trim().isEmpty ? null : _descriptionController.text.trim(),
        wallet: _wallet,
      );

      final repository = ref.read(expenseRepositoryProvider);
      if (_editing) {
        await repository.updateExpense(widget.expense!.id, input);
      } else {
        await repository.createExpense(input);
      }

      ref.invalidate(expenseListProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _formError = e.fieldErrors.isEmpty ? e.message : null;
        _fieldErrors = e.fieldErrors;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _formError = 'Could not save this expense. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this expense?'),
        content: const Text('It is removed from every report it appears in.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _deleting = true);
    try {
      await ref.read(expenseRepositoryProvider).deleteExpense(widget.expense!.id);
      ref.invalidate(expenseListProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _formError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _formError = 'Could not delete this expense.');
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_formError != null) ...[
              Text(_formError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              const SizedBox(height: 12),
            ],
            TextFormField(
              key: const Key('expense-amount'),
              controller: _amountController,
              decoration: InputDecoration(
                labelText: 'Amount ($currencyCode)',
                errorText: _fieldErrors['amount'],
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              validator: (v) => validateAmount(v ?? ''),
            ),
            const SizedBox(height: 12),
            InkWell(
              key: const Key('expense-datetime'),
              onTap: _pickDateTime,
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'When'),
                child: Text(dateTime(_occurredAt)),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('expense-payee'),
              controller: _payeeController,
              decoration: InputDecoration(labelText: 'Paid to', errorText: _fieldErrors['payee']),
              maxLength: 255,
            ),
            const SizedBox(height: 12),
            InkWell(
              key: const Key('expense-category'),
              onTap: _pickCategory,
              child: InputDecorator(
                decoration:
                    InputDecoration(labelText: 'Category', errorText: _fieldErrors['categoryId']),
                child: Text(_categoryName ?? 'Uncategorised'),
              ),
            ),
            const SizedBox(height: 12),
            Text('Paid from', style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final wallet in Wallet.values)
                  ChoiceChip(
                    label: Text(walletLabels[wallet]!),
                    selected: _wallet == wallet,
                    onSelected: (_) => setState(() => _wallet = wallet),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('expense-description'),
              controller: _descriptionController,
              decoration:
                  InputDecoration(labelText: 'Description', errorText: _fieldErrors['description']),
              maxLines: 3,
              maxLength: 1000,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting || _deleting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_editing ? 'Save changes' : 'Record expense'),
            ),
            if (_editing) ...[
              const SizedBox(height: 16),
              OutlinedButton(
                key: const Key('expense-delete'),
                onPressed: _submitting || _deleting ? null : _confirmDelete,
                child: Text(_deleting ? 'Deleting…' : 'Delete expense'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/features/expense/screens/expense_form_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/features/expense/screens/expense_form.dart my__accountant/test/features/expense/screens/expense_form_test.dart
git commit -m "Add expense form"
```

---

### Task 16: Expense detail + create screens

**Files:**
- Create: `my__accountant/lib/features/expense/screens/expense_detail_screen.dart`
- Create: `my__accountant/lib/features/expense/screens/expense_create_screen.dart`
- Modify: `my__accountant/lib/core/router/app_router.dart` (add two new top-level routes)
- Test: `my__accountant/test/features/expense/screens/expense_detail_screen_test.dart`
- Test: `my__accountant/test/features/expense/screens/expense_create_screen_test.dart`

**Interfaces:**
- Consumes: `expenseRepositoryProvider` (Task 7), `ExpenseForm` (Task 15)
- Produces:
  - `class ExpenseDetailScreen extends ConsumerStatefulWidget { const ExpenseDetailScreen({super.key, required String id}); }`
  - `class ExpenseCreateScreen extends StatelessWidget { const ExpenseCreateScreen({super.key}); }`

- [ ] **Step 1: Write the failing tests**

```dart
// my__accountant/test/features/expense/screens/expense_detail_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/expense/data/expense_category_repository.dart';
import 'package:my__accountant/features/expense/data/expense_models.dart';
import 'package:my__accountant/features/expense/data/expense_providers.dart';
import 'package:my__accountant/features/expense/data/expense_repository.dart';
import 'package:my__accountant/features/expense/screens/expense_detail_screen.dart';
import 'package:my__accountant/features/income/data/income_models.dart' show Wallet;

class MockExpenseRepository extends Mock implements ExpenseRepository {}

class MockExpenseCategoryRepository extends Mock implements ExpenseCategoryRepository {}

Expense _expense() => Expense(
      id: 'e1',
      userId: 'u1',
      categoryId: null,
      categoryName: null,
      occurredAt: '2026-08-09T14:05:00Z',
      amount: '1200.00',
      description: null,
      payee: null,
      wallet: Wallet.cash,
      createdAt: '2026-08-09T14:05:00Z',
      updatedAt: '2026-08-09T14:05:00Z',
    );

Widget _harness(MockExpenseRepository repository, MockExpenseCategoryRepository categoryRepository) {
  when(() => categoryRepository.list()).thenAnswer(
    (_) async => const Page(data: [], pagination: PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0)),
  );
  return ProviderScope(
    overrides: [
      expenseRepositoryProvider.overrideWithValue(repository),
      expenseCategoryRepositoryProvider.overrideWithValue(categoryRepository),
    ],
    child: const MaterialApp(home: ExpenseDetailScreen(id: 'e1')),
  );
}

void main() {
  testWidgets('shows a spinner while loading then the pre-filled form', (tester) async {
    final repository = MockExpenseRepository();
    when(() => repository.getExpense('e1')).thenAnswer((_) async => _expense());

    await tester.pumpWidget(_harness(repository, MockExpenseCategoryRepository()));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pumpAndSettle();
    expect(find.text('1200.00'), findsOneWidget);
    expect(find.text('Save changes'), findsOneWidget);
  });

  testWidgets('shows an error state with a working retry button', (tester) async {
    final repository = MockExpenseRepository();
    var callCount = 0;
    when(() => repository.getExpense('e1')).thenAnswer((_) async {
      callCount++;
      if (callCount == 1) throw Exception('boom');
      return _expense();
    });

    await tester.pumpWidget(_harness(repository, MockExpenseCategoryRepository()));
    await tester.pumpAndSettle();

    expect(find.text('Could not load this expense.'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.text('Save changes'), findsOneWidget);
  });
}
```

```dart
// my__accountant/test/features/expense/screens/expense_create_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/expense/data/expense_category_repository.dart';
import 'package:my__accountant/features/expense/data/expense_providers.dart';
import 'package:my__accountant/features/expense/screens/expense_create_screen.dart';

class MockExpenseCategoryRepository extends Mock implements ExpenseCategoryRepository {}

void main() {
  testWidgets('renders the create-mode form under a "Record expense" title', (tester) async {
    final categoryRepository = MockExpenseCategoryRepository();
    when(() => categoryRepository.list()).thenAnswer(
      (_) async => const Page(data: [], pagination: PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0)),
    );

    await tester.pumpWidget(ProviderScope(
      overrides: [expenseCategoryRepositoryProvider.overrideWithValue(categoryRepository)],
      child: const MaterialApp(home: ExpenseCreateScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Record expense'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `flutter test test/features/expense/screens/expense_detail_screen_test.dart test/features/expense/screens/expense_create_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `expense_detail_screen.dart`, `expense_create_screen.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/expense/screens/expense_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/expense_models.dart';
import '../data/expense_providers.dart';
import 'expense_form.dart';

class ExpenseDetailScreen extends ConsumerStatefulWidget {
  const ExpenseDetailScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<ExpenseDetailScreen> createState() => _ExpenseDetailScreenState();
}

class _ExpenseDetailScreenState extends ConsumerState<ExpenseDetailScreen> {
  late Future<Expense> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(expenseRepositoryProvider).getExpense(widget.id);
  }

  void _retry() {
    setState(() => _future = ref.read(expenseRepositoryProvider).getExpense(widget.id));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Expense')),
      body: FutureBuilder<Expense>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Could not load this expense.', textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _retry, child: const Text('Retry')),
                  ],
                ),
              ),
            );
          }
          // Keyed on the record so opening a different expense rebuilds the fields.
          return ExpenseForm(key: ValueKey(snapshot.data!.id), expense: snapshot.data);
        },
      ),
    );
  }
}
```

```dart
// my__accountant/lib/features/expense/screens/expense_create_screen.dart
import 'package:flutter/material.dart';

import 'expense_form.dart';

class ExpenseCreateScreen extends StatelessWidget {
  const ExpenseCreateScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      appBar: AppBar(title: Text('Record expense')),
      body: ExpenseForm(),
    );
  }
}
```

- [ ] **Step 4: Wire the routes**

Modify `my__accountant/lib/core/router/app_router.dart`. Add the imports:
```dart
import '../../features/expense/screens/expense_create_screen.dart';
import '../../features/expense/screens/expense_detail_screen.dart';
```

Add these two entries to the same top-level `routes:` list as Task 13's income routes — siblings of `/login`/`/register`/`ShellRoute`, not nested inside it — with `/expense/new` before `/expense/:id`:

```dart
GoRoute(path: '/expense/new', builder: (context, state) => const ExpenseCreateScreen()),
GoRoute(
  path: '/expense/:id',
  builder: (context, state) => ExpenseDetailScreen(id: state.pathParameters['id']!),
),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `flutter test test/features/expense/screens/expense_detail_screen_test.dart test/features/expense/screens/expense_create_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
cd .. && git add my__accountant/lib/features/expense/screens/expense_detail_screen.dart my__accountant/lib/features/expense/screens/expense_create_screen.dart my__accountant/lib/core/router/app_router.dart my__accountant/test/features/expense/screens/expense_detail_screen_test.dart my__accountant/test/features/expense/screens/expense_create_screen_test.dart
git commit -m "Add expense detail and create screens"
```

---

### Task 17: Generic NamedRecordListScreen

**Files:**
- Create: `my__accountant/lib/shared/named_record_list_screen.dart`
- Test: `my__accountant/test/shared/named_record_list_screen_test.dart`

**Interfaces:**
- Consumes: `NamedRecord` (Task 5), `ApiException` (plan 1), `validateLabel` (Task 2)
- Produces: `class NamedRecordListScreen extends StatefulWidget { const NamedRecordListScreen({super.key, required String title, required String noun, required String emptyBody, required String deleteNote, required Future<List<NamedRecord>> Function() list, required Future<NamedRecord> Function(String name) create, required Future<NamedRecord> Function(String id, String name) rename, required Future<void> Function(String id) remove}); }` — income sources and expense categories are the same shape of list (a user-owned set of names with create/rename/remove), so this one screen serves both, parameterized by callbacks — mirroring the RN app's own `NameListScreen`.

- [ ] **Step 1: Write the failing test**

```dart
// my__accountant/test/shared/named_record_list_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/shared/named_record.dart';
import 'package:my__accountant/shared/named_record_list_screen.dart';

Widget _harness({
  required Future<List<NamedRecord>> Function() list,
  Future<NamedRecord> Function(String name)? create,
  Future<NamedRecord> Function(String id, String name)? rename,
  Future<void> Function(String id)? remove,
}) {
  return MaterialApp(
    home: NamedRecordListScreen(
      title: 'Income sources',
      noun: 'source',
      emptyBody: 'No sources yet.',
      deleteNote: 'Existing records keep this name.',
      list: list,
      create: create ?? (name) async => NamedRecord(id: 'new', name: name),
      rename: rename ?? (id, name) async => NamedRecord(id: id, name: name),
      remove: remove ?? (id) async {},
    ),
  );
}

void main() {
  testWidgets('shows the empty state when the list is empty', (tester) async {
    await tester.pumpWidget(_harness(list: () async => []));
    await tester.pumpAndSettle();

    expect(find.text('No sources yet.'), findsOneWidget);
  });

  testWidgets('renders each item by name', (tester) async {
    await tester.pumpWidget(_harness(
      list: () async => const [NamedRecord(id: 's1', name: 'Salary')],
    ));
    await tester.pumpAndSettle();

    expect(find.text('Salary'), findsOneWidget);
  });

  testWidgets('adding a new item calls create and reloads the list', (tester) async {
    var reloaded = false;
    Future<List<NamedRecord>> list() async =>
        reloaded ? const [NamedRecord(id: 's1', name: 'Freelance')] : const <NamedRecord>[];

    String? createdName;
    await tester.pumpWidget(_harness(
      list: list,
      create: (name) async {
        createdName = name;
        reloaded = true;
        return const NamedRecord(id: 's1', name: 'Freelance');
      },
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('named-record-name')), 'Freelance');
    await tester.tap(find.text('Add source'));
    await tester.pumpAndSettle();

    expect(createdName, 'Freelance');
    expect(find.text('Freelance'), findsOneWidget);
  });

  testWidgets('renaming an item calls rename with its id', (tester) async {
    String? renamedId;
    String? renamedTo;
    await tester.pumpWidget(_harness(
      list: () async => const [NamedRecord(id: 's1', name: 'Salary')],
      rename: (id, name) async {
        renamedId = id;
        renamedTo = name;
        return NamedRecord(id: id, name: name);
      },
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.edit_outlined));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('named-record-name')), 'Salary (new job)');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(renamedId, 's1');
    expect(renamedTo, 'Salary (new job)');
  });

  testWidgets('removing an item after confirmation calls remove with its id', (tester) async {
    String? removedId;
    await tester.pumpWidget(_harness(
      list: () async => const [NamedRecord(id: 's1', name: 'Salary')],
      remove: (id) async => removedId = id,
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();

    expect(removedId, 's1');
  });

  testWidgets('shows a validation error and does not call create for an empty name', (tester) async {
    var createCalled = false;
    await tester.pumpWidget(_harness(
      list: () async => const [],
      create: (name) async {
        createCalled = true;
        return NamedRecord(id: 'x', name: name);
      },
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add source'));
    await tester.pumpAndSettle();

    expect(find.text('Enter a name.'), findsOneWidget);
    expect(createCalled, isFalse);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/shared/named_record_list_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `named_record_list_screen.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/shared/named_record_list_screen.dart
import 'package:flutter/material.dart';

import '../core/network/api_exception.dart';
import 'money_validation.dart';
import 'named_record.dart';

/// Income sources and expense categories are the same shape of screen —
/// both are a user-owned list of names with create, rename and delete.
/// Writing this once means the two cannot drift into behaving differently.
/// Mirrors `NameListScreen` in `components/forms/name-list.tsx`.
class NamedRecordListScreen extends StatefulWidget {
  const NamedRecordListScreen({
    super.key,
    required this.title,
    required this.noun,
    required this.emptyBody,
    required this.deleteNote,
    required this.list,
    required this.create,
    required this.rename,
    required this.remove,
  });

  final String title;

  /// Lower-case singular, used in messages: "source", "category".
  final String noun;
  final String emptyBody;

  /// What happens to existing records when one is removed.
  final String deleteNote;

  final Future<List<NamedRecord>> Function() list;
  final Future<NamedRecord> Function(String name) create;
  final Future<NamedRecord> Function(String id, String name) rename;
  final Future<void> Function(String id) remove;

  @override
  State<NamedRecordListScreen> createState() => _NamedRecordListScreenState();
}

class _NamedRecordListScreenState extends State<NamedRecordListScreen> {
  late Future<List<NamedRecord>> _future;
  NamedRecord? _editing;
  bool _adding = false;

  @override
  void initState() {
    super.initState();
    _future = widget.list();
  }

  void _reload() {
    setState(() {
      _future = widget.list();
      _editing = null;
      _adding = false;
    });
  }

  Future<void> _confirmRemove(NamedRecord item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Remove ${item.name}?'),
        content: Text(widget.deleteNote),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await widget.remove(item.id);
      if (!mounted) return;
      _reload();
    } catch (cause) {
      if (!mounted) return;
      final message = cause is ApiException ? cause.message : 'Try again in a moment.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not remove this ${widget.noun}: $message')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      floatingActionButton: FloatingActionButton(
        onPressed: () => setState(() {
          _adding = true;
          _editing = null;
        }),
        child: const Icon(Icons.add),
      ),
      body: FutureBuilder<List<NamedRecord>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Could not load this list.', textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _reload, child: const Text('Retry')),
                  ],
                ),
              ),
            );
          }

          final items = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text(widget.emptyBody, textAlign: TextAlign.center),
                )
              else
                for (final item in items)
                  ListTile(
                    key: Key('named-record-${item.id}'),
                    title: Text(item.name),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit_outlined),
                          tooltip: 'Rename ${item.name}',
                          onPressed: () => setState(() {
                            _editing = item;
                            _adding = false;
                          }),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline),
                          tooltip: 'Remove ${item.name}',
                          onPressed: () => _confirmRemove(item),
                        ),
                      ],
                    ),
                  ),
              if (_adding || _editing != null)
                _NameEditor(
                  noun: widget.noun,
                  record: _editing,
                  save: (name) =>
                      _editing != null ? widget.rename(_editing!.id, name) : widget.create(name),
                  onDone: _reload,
                  onCancel: () => setState(() {
                    _adding = false;
                    _editing = null;
                  }),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _NameEditor extends StatefulWidget {
  const _NameEditor({
    required this.noun,
    required this.record,
    required this.save,
    required this.onDone,
    required this.onCancel,
  });

  final String noun;
  final NamedRecord? record;
  final Future<NamedRecord> Function(String name) save;
  final VoidCallback onDone;
  final VoidCallback onCancel;

  @override
  State<_NameEditor> createState() => _NameEditorState();
}

class _NameEditorState extends State<_NameEditor> {
  late final TextEditingController _controller;
  String? _error;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.record?.name ?? '');
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final invalid = validateLabel(_controller.text, 'name');
    setState(() => _error = invalid);
    if (invalid != null) return;

    setState(() => _submitting = true);
    try {
      await widget.save(_controller.text.trim());
      widget.onDone();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors['name'] ?? e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not save this ${widget.noun}. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.record != null ? 'Rename ${widget.record!.name}' : 'New ${widget.noun}'),
          const SizedBox(height: 8),
          TextField(
            key: const Key('named-record-name'),
            controller: _controller,
            decoration: InputDecoration(labelText: 'Name', errorText: _error),
            autofocus: widget.record == null,
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(widget.record != null ? 'Save' : 'Add ${widget.noun}'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _submitting ? null : widget.onCancel,
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/shared/named_record_list_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd .. && git add my__accountant/lib/shared/named_record_list_screen.dart my__accountant/test/shared/named_record_list_screen_test.dart
git commit -m "Add generic NamedRecordListScreen"
```

---

### Task 18: Wire income sources and expense categories settings screens

**Files:**
- Create: `my__accountant/lib/features/income/screens/income_sources_screen.dart`
- Create: `my__accountant/lib/features/expense/screens/expense_categories_screen.dart`
- Modify: `my__accountant/lib/core/router/app_router.dart` (add two children to the `/settings` route)
- Test: `my__accountant/test/features/income/screens/income_sources_screen_test.dart`
- Test: `my__accountant/test/features/expense/screens/expense_categories_screen_test.dart`

**Interfaces:**
- Consumes: `NamedRecordListScreen` (Task 17), `incomeSourceRepositoryProvider`/`expenseCategoryRepositoryProvider` (Task 7)
- Produces:
  - `class IncomeSourcesScreen extends ConsumerWidget { const IncomeSourcesScreen({super.key}); }`
  - `class ExpenseCategoriesScreen extends ConsumerWidget { const ExpenseCategoriesScreen({super.key}); }`

- [ ] **Step 1: Write the failing tests**

```dart
// my__accountant/test/features/income/screens/income_sources_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/income/data/income_providers.dart';
import 'package:my__accountant/features/income/data/income_source_repository.dart';
import 'package:my__accountant/features/income/screens/income_sources_screen.dart';
import 'package:my__accountant/shared/named_record.dart';

class MockIncomeSourceRepository extends Mock implements IncomeSourceRepository {}

void main() {
  testWidgets('renders the "Income sources" title and lists sources', (tester) async {
    final repository = MockIncomeSourceRepository();
    when(() => repository.list()).thenAnswer((_) async => const Page(
          data: [NamedRecord(id: 's1', name: 'Salary')],
          pagination: PaginationMeta(page: 1, limit: 100, total: 1, totalPages: 1),
        ));

    await tester.pumpWidget(ProviderScope(
      overrides: [incomeSourceRepositoryProvider.overrideWithValue(repository)],
      child: const MaterialApp(home: IncomeSourcesScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Income sources'), findsOneWidget);
    expect(find.text('Salary'), findsOneWidget);
  });

  testWidgets('adding a source calls repository.create', (tester) async {
    final repository = MockIncomeSourceRepository();
    when(() => repository.list()).thenAnswer(
      (_) async => const Page(data: [], pagination: PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0)),
    );
    when(() => repository.create('Freelance'))
        .thenAnswer((_) async => const NamedRecord(id: 's2', name: 'Freelance'));

    await tester.pumpWidget(ProviderScope(
      overrides: [incomeSourceRepositoryProvider.overrideWithValue(repository)],
      child: const MaterialApp(home: IncomeSourcesScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('named-record-name')), 'Freelance');
    await tester.tap(find.text('Add source'));
    await tester.pumpAndSettle();

    verify(() => repository.create('Freelance')).called(1);
  });
}
```

```dart
// my__accountant/test/features/expense/screens/expense_categories_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/expense/data/expense_category_repository.dart';
import 'package:my__accountant/features/expense/data/expense_providers.dart';
import 'package:my__accountant/features/expense/screens/expense_categories_screen.dart';
import 'package:my__accountant/shared/named_record.dart';

class MockExpenseCategoryRepository extends Mock implements ExpenseCategoryRepository {}

void main() {
  testWidgets('renders the "Expense categories" title and lists categories', (tester) async {
    final repository = MockExpenseCategoryRepository();
    when(() => repository.list()).thenAnswer((_) async => const Page(
          data: [NamedRecord(id: 'c1', name: 'Groceries')],
          pagination: PaginationMeta(page: 1, limit: 100, total: 1, totalPages: 1),
        ));

    await tester.pumpWidget(ProviderScope(
      overrides: [expenseCategoryRepositoryProvider.overrideWithValue(repository)],
      child: const MaterialApp(home: ExpenseCategoriesScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Expense categories'), findsOneWidget);
    expect(find.text('Groceries'), findsOneWidget);
  });

  testWidgets('adding a category calls repository.create', (tester) async {
    final repository = MockExpenseCategoryRepository();
    when(() => repository.list()).thenAnswer(
      (_) async => const Page(data: [], pagination: PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0)),
    );
    when(() => repository.create('Transport'))
        .thenAnswer((_) async => const NamedRecord(id: 'c2', name: 'Transport'));

    await tester.pumpWidget(ProviderScope(
      overrides: [expenseCategoryRepositoryProvider.overrideWithValue(repository)],
      child: const MaterialApp(home: ExpenseCategoriesScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('named-record-name')), 'Transport');
    await tester.tap(find.text('Add category'));
    await tester.pumpAndSettle();

    verify(() => repository.create('Transport')).called(1);
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `flutter test test/features/income/screens/income_sources_screen_test.dart test/features/expense/screens/expense_categories_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: FAIL — missing `income_sources_screen.dart`, `expense_categories_screen.dart`

- [ ] **Step 3: Implement**

```dart
// my__accountant/lib/features/income/screens/income_sources_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/named_record_list_screen.dart';
import '../data/income_providers.dart';

class IncomeSourcesScreen extends ConsumerWidget {
  const IncomeSourcesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repository = ref.watch(incomeSourceRepositoryProvider);
    return NamedRecordListScreen(
      title: 'Income sources',
      noun: 'source',
      emptyBody:
          'Name the places your income comes from and you can filter and report on each one.',
      deleteNote:
          'Income already recorded keeps its source name in your reports. Only the list changes.',
      list: () async => (await repository.list()).data,
      create: repository.create,
      rename: repository.rename,
      remove: repository.remove,
    );
  }
}
```

```dart
// my__accountant/lib/features/expense/screens/expense_categories_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/named_record_list_screen.dart';
import '../data/expense_providers.dart';

class ExpenseCategoriesScreen extends ConsumerWidget {
  const ExpenseCategoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repository = ref.watch(expenseCategoryRepositoryProvider);
    return NamedRecordListScreen(
      title: 'Expense categories',
      noun: 'category',
      emptyBody: 'Group what you spend and the reports can tell you where it actually goes.',
      deleteNote:
          'Expenses already recorded keep their category in your reports. Only the list changes.',
      list: () async => (await repository.list()).data,
      create: repository.create,
      rename: repository.rename,
      remove: repository.remove,
    );
  }
}
```

- [ ] **Step 4: Wire the routes**

Modify `my__accountant/lib/core/router/app_router.dart`. Add the imports:
```dart
import '../../features/expense/screens/expense_categories_screen.dart';
import '../../features/income/screens/income_sources_screen.dart';
```

Find the `/settings` `GoRoute`'s nested `routes:` list (the one that already contains the `profile` child route from plan 1). Add two more children alongside it:

```dart
GoRoute(
  path: '/settings',
  builder: (context, state) => const ComingSoonScreen('Settings'),
  routes: [
    GoRoute(path: 'profile', builder: (context, state) => const ProfileScreen()),
    GoRoute(path: 'sources', builder: (context, state) => const IncomeSourcesScreen()),
    GoRoute(path: 'categories', builder: (context, state) => const ExpenseCategoriesScreen()),
  ],
),
```

(Only the `routes:` list changes — leave the `/settings` route's own `builder:` and everything else in the file untouched.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `flutter test test/features/income/screens/income_sources_screen_test.dart test/features/expense/screens/expense_categories_screen_test.dart --dart-define=API_BASE_URL=https://example.test`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
cd .. && git add my__accountant/lib/features/income/screens/income_sources_screen.dart my__accountant/lib/features/expense/screens/expense_categories_screen.dart my__accountant/lib/core/router/app_router.dart my__accountant/test/features/income/screens/income_sources_screen_test.dart my__accountant/test/features/expense/screens/expense_categories_screen_test.dart
git commit -m "Wire income sources and expense categories settings screens"
```

---

### Task 19: Final integration pass

**Files:** none created; verification only.

- [ ] **Step 1: Run the full test suite**

Run: `cd "my__accountant" && flutter test --dart-define=API_BASE_URL=https://example.test`
Expected: all tests across every file added in Tasks 1-18 pass, plus everything from plan 1 (0 failures).

- [ ] **Step 2: Run the analyzer**

Run: `flutter analyze`
Expected: this task's diff (none — verification only) introduces zero new issues. Per the Global Constraints note, some pre-existing cosmetic info/warning-level lints from earlier tasks are expected and not a regression.

- [ ] **Step 3: Manual smoke test against the real backend**

With the backend running and reachable at the `API_BASE_URL` used for `flutter run` (see plan 1's Global Constraints for the local dev value), and signed in as an existing user (or freshly registered per plan 1's own smoke test):

```bash
flutter run --dart-define=API_BASE_URL=http://10.34.125.26:3000
```

Walk through, on a real device or emulator:
1. Open the Income tab → see the list load (or the empty state on a fresh account).
2. Add an income source from Settings → Income sources, then record a new income using it, selecting a wallet and adding notes → confirm it appears at the top of the Income list.
3. Open that income's detail screen, change the amount, save → confirm the change persists (navigate away and back) and the distribution split reflects the new amount.
4. Delete that income → confirm it's gone from the list.
5. Repeat steps 2-4 for Expenses, including the search field and an expense category from Settings → Expense categories.
6. Filter the income and expense lists by wallet → confirm the list narrows correctly.
7. Scroll a list with more than 20 records (if the account has enough transactions, or record enough to trigger it) → confirm infinite scroll loads the next page.
8. Pull to refresh on both lists → confirm it reloads without visual glitches.

Note any failures as follow-up items rather than fixing them ad hoc here — if something fails, it means an earlier task's code doesn't match the real backend's exact response shape, which should be fixed by revisiting that specific task, not patched inline in this verification task.

- [ ] **Step 4: Commit** (only if Step 3 required no code changes; otherwise this task ends without a commit and the fix belongs to the task it corrects)

```bash
git log --oneline -1
```
(No commit needed for this task if nothing changed.)

