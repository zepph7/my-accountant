import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart' as page_models;
import 'package:my__accountant/features/expense/data/expense_category_repository.dart';
import 'package:my__accountant/features/expense/data/expense_providers.dart';
import 'package:my__accountant/features/expense/screens/expense_create_screen.dart';

class MockExpenseCategoryRepository extends Mock implements ExpenseCategoryRepository {}

void main() {
  testWidgets('renders the create-mode form under a "Record expense" title', (tester) async {
    final categoryRepository = MockExpenseCategoryRepository();
    when(() => categoryRepository.list()).thenAnswer(
      (_) async => const page_models.Page(
        data: [],
        pagination: page_models.PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0),
      ),
    );

    await tester.pumpWidget(ProviderScope(
      overrides: [expenseCategoryRepositoryProvider.overrideWithValue(categoryRepository)],
      child: const MaterialApp(home: ExpenseCreateScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Record expense'), findsOneWidget);
  });
}
