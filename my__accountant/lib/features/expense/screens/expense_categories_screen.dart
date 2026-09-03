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
