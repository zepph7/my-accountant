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
    setState(() {
      _future = ref.read(expenseRepositoryProvider).getExpense(widget.id);
    });
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
