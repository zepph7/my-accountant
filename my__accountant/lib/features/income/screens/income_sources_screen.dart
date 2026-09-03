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
