import 'package:flutter/material.dart' hide Page;
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
