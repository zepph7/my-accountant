import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart' as page_models;
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

    await tester.ensureVisible(find.text('Delete expense'));
    await tester.tap(find.text('Delete expense'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    verify(() => repository.deleteExpense('e1')).called(1);
  });
}
