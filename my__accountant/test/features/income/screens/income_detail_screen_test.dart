import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart' as page_models;
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
    (_) async => const page_models.Page(
      data: [],
      pagination: page_models.PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0),
    ),
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
    // A plain `async => value` mock resolves on the very first microtask
    // flush, which `pumpWidget` itself performs before drawing a frame — so
    // the loading state would never actually be observable. A Completer we
    // hold open lets the test see the spinner before choosing to resolve it.
    final completer = Completer<IncomeDetail>();
    when(() => repository.getIncome('i1')).thenAnswer((_) => completer.future);

    await tester.pumpWidget(_harness(repository, MockIncomeSourceRepository()));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    completer.complete(_income());
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
