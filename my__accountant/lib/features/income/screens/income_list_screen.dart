import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/format.dart';
import '../data/income_models.dart';
import '../state/income_list_notifier.dart';

class IncomeListScreen extends ConsumerStatefulWidget {
  const IncomeListScreen({super.key});

  @override
  ConsumerState<IncomeListScreen> createState() => _IncomeListScreenState();
}

class _IncomeListScreenState extends ConsumerState<IncomeListScreen> {
  final _scrollController = ScrollController();
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
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      ref.read(incomeListProvider.notifier).loadMore();
    }
  }

  void _setWallet(Wallet? wallet) {
    setState(() => _walletFilter = wallet);
    ref.read(incomeListProvider.notifier).setWalletFilter(wallet);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(incomeListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Income')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/income/new'),
        icon: const Icon(Icons.add),
        label: const Text('Income'),
      ),
      body: state.loading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null && state.items.isEmpty
              ? _ErrorState(
                  message: state.error!,
                  onRetry: () => ref.read(incomeListProvider.notifier).reload(),
                )
              : RefreshIndicator(
                  onRefresh: () async => ref.read(incomeListProvider.notifier).refresh(),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: _WalletFilterRow(value: _walletFilter, onChanged: _setWallet),
                      ),
                      Expanded(
                        child: state.items.isEmpty
                            ? const _EmptyState()
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
                                  final income = state.items[index];
                                  return ListTile(
                                    key: Key('income-row-${income.id}'),
                                    title: Text(income.sourceName ?? 'Income'),
                                    subtitle: Text(shortDate(income.date)),
                                    trailing: Text(currency(income.amount)),
                                    onTap: () => context.push('/income/${income.id}'),
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
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Text(
          'No income yet. Record what comes in with the button below.',
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
