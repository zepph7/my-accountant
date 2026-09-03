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
    setState(() {
      _future = ref.read(incomeRepositoryProvider).getIncome(widget.id);
    });
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
