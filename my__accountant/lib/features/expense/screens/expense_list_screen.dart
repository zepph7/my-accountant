import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/format.dart';
import '../../income/data/income_models.dart' show Wallet, walletLabels;
import '../state/expense_list_notifier.dart';

class ExpenseListScreen extends ConsumerStatefulWidget {
  const ExpenseListScreen({super.key});

  @override
  ConsumerState<ExpenseListScreen> createState() => _ExpenseListScreenState();
}

class _ExpenseListScreenState extends ConsumerState<ExpenseListScreen> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  Wallet? _walletFilter;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      ref.read(expenseListProvider.notifier).loadMore();
    }
  }

  void _setWallet(Wallet? wallet) {
    setState(() => _walletFilter = wallet);
    ref.read(expenseListProvider.notifier).setWalletFilter(wallet);
  }

  void _setSearch(String value) {
    final trimmed = value.trim();
    ref.read(expenseListProvider.notifier).setSearch(trimmed.isEmpty ? null : trimmed);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(expenseListProvider);
    final searching = _searchController.text.trim().isNotEmpty;

    return Scaffold(
      appBar: AppBar(title: const Text('Expenses')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/expense/new'),
        icon: const Icon(Icons.add),
        label: const Text('Expense'),
      ),
      body: state.loading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null && state.items.isEmpty
              ? _ErrorState(
                  message: state.error!,
                  onRetry: () => ref.read(expenseListProvider.notifier).reload(),
                )
              : RefreshIndicator(
                  onRefresh: () async => ref.read(expenseListProvider.notifier).refresh(),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: TextField(
                          key: const Key('expense-search'),
                          controller: _searchController,
                          decoration: const InputDecoration(
                            labelText: 'Search',
                            hintText: 'Payee or description',
                            prefixIcon: Icon(Icons.search),
                          ),
                          onChanged: (value) {
                            setState(() {});
                            _setSearch(value);
                          },
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: _WalletFilterRow(value: _walletFilter, onChanged: _setWallet),
                      ),
                      const SizedBox(height: 8),
                      Expanded(
                        child: state.items.isEmpty
                            ? _EmptyState(searching: searching)
                            : ListView.separated(
                                controller: _scrollController,
                                padding: const EdgeInsets.only(bottom: 96),
                                itemCount: state.items.length + (state.loadingMore ? 1 : 0),
                                separatorBuilder: (_, _) => const Divider(height: 1),
                                itemBuilder: (context, index) {
                                  if (index >= state.items.length) {
                                    return const Padding(
                                      padding: EdgeInsets.symmetric(vertical: 24),
                                      child: Center(child: CircularProgressIndicator()),
                                    );
                                  }
                                  final expense = state.items[index];
                                  return ListTile(
                                    key: Key('expense-row-${expense.id}'),
                                    title: Text(expense.payee ?? expense.categoryName ?? 'Expense'),
                                    subtitle: Text(dateTime(expense.occurredAt)),
                                    trailing: Text(currency(expense.amount)),
                                    onTap: () => context.push('/expense/${expense.id}'),
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _WalletFilterRow extends StatelessWidget {
  const _WalletFilterRow({required this.value, required this.onChanged});

  final Wallet? value;
  final ValueChanged<Wallet?> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: const Text('All'),
              selected: value == null,
              onSelected: (_) => onChanged(null),
            ),
          ),
          for (final wallet in Wallet.values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(walletLabels[wallet]!),
                selected: value == wallet,
                onSelected: (_) => onChanged(wallet),
              ),
            ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.searching});

  final bool searching;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          searching
              ? 'Nothing matched. Try a different payee or description.'
              : 'No expenses yet. Record what you spend with the button below.',
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
