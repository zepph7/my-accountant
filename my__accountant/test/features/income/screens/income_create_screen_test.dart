import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart' as page_models;
import 'package:my__accountant/features/income/data/income_providers.dart';
import 'package:my__accountant/features/income/data/income_source_repository.dart';
import 'package:my__accountant/features/income/screens/income_create_screen.dart';

class MockIncomeSourceRepository extends Mock implements IncomeSourceRepository {}

void main() {
  testWidgets('renders the create-mode form under a "Record income" title', (tester) async {
    final sourceRepository = MockIncomeSourceRepository();
    when(() => sourceRepository.list()).thenAnswer(
      (_) async => const page_models.Page(
        data: [],
        pagination: page_models.PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0),
      ),
    );

    await tester.pumpWidget(ProviderScope(
      overrides: [incomeSourceRepositoryProvider.overrideWithValue(sourceRepository)],
      child: const MaterialApp(home: IncomeCreateScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Record income'), findsOneWidget);
  });
}
