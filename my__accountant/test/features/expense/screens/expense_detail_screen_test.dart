import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart' as page_models;
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
    (_) async => const page_models.Page(
      data: [],
      pagination: page_models.PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0),
    ),
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
    // A plain `async => value` mock resolves on the very first microtask
    // flush, which `pumpWidget` itself performs before drawing a frame — so
    // the loading state would never actually be observable. A Completer we
    // hold open lets the test see the spinner before choosing to resolve it.
    final completer = Completer<Expense>();
    when(() => repository.getExpense('e1')).thenAnswer((_) => completer.future);

    await tester.pumpWidget(_harness(repository, MockExpenseCategoryRepository()));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    completer.complete(_expense());
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
