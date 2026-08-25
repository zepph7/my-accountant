import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_exception.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/shared/paged_list.dart';

class _TestNotifier extends PagedListNotifier<int> {
  _TestNotifier(this._fetch);
  final Future<Page<int>> Function(int page) _fetch;

  @override
  Future<Page<int>> fetchPage(int page) => _fetch(page);
}

Page<int> _page(List<int> items, {required int page, required int totalPages, required int total}) {
  return Page<int>(
    data: items,
    pagination: PaginationMeta(page: page, limit: 2, total: total, totalPages: totalPages),
  );
}

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  test('loads page 1 on construction', () async {
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) async => _page([1, 2], page: 1, totalPages: 2, total: 4)),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();

    final state = container.read(provider);
    expect(state.items, [1, 2]);
    expect(state.loading, isFalse);
    expect(state.hasMore, isTrue);
  });

  test('loadMore appends the next page', () async {
    var callCount = 0;
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) async {
        callCount++;
        return page == 1
            ? _page([1, 2], page: 1, totalPages: 2, total: 4)
            : _page([3, 4], page: 2, totalPages: 2, total: 4);
      }),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();
    container.read(provider.notifier).loadMore();
    await _settle();

    final state = container.read(provider);
    expect(state.items, [1, 2, 3, 4]);
    expect(state.hasMore, isFalse);
    expect(callCount, 2);
  });

  test('refresh replaces items starting from page 1', () async {
    var version = 1;
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier(
          (page) async => _page(version == 1 ? [1, 2] : [9, 9], page: 1, totalPages: 1, total: 2)),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();
    version = 2;
    container.read(provider.notifier).refresh();
    await _settle();

    expect(container.read(provider).items, [9, 9]);
  });

  test('a failed load sets an error and leaves items untouched', () async {
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) async => throw ApiException(500, 'Server error')),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();

    final state = container.read(provider);
    expect(state.error, 'Server error');
    expect(state.items, isEmpty);
    expect(state.loading, isFalse);
  });

  test('a later successful load clears a previous error', () async {
    var shouldFail = true;
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) async {
        if (shouldFail) throw ApiException(500, 'Server error');
        return _page([1], page: 1, totalPages: 1, total: 1);
      }),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();
    expect(container.read(provider).error, isNotNull);

    shouldFail = false;
    container.read(provider.notifier).reload();
    await _settle();

    expect(container.read(provider).error, isNull);
    expect(container.read(provider).items, [1]);
  });

  test('loadMore does nothing once hasMore is false', () async {
    var callCount = 0;
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) async {
        callCount++;
        return _page([1], page: 1, totalPages: 1, total: 1);
      }),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider);
    await _settle();
    container.read(provider.notifier).loadMore();
    await _settle();

    expect(callCount, 1);
  });

  test('a second load call while one is already in flight is ignored', () async {
    var callCount = 0;
    final completer = Completer<Page<int>>();
    final provider = NotifierProvider<_TestNotifier, PagedListState<int>>(
      () => _TestNotifier((page) {
        callCount++;
        return completer.future;
      }),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(provider); // kicks off the initial load; it's now in flight
    container.read(provider.notifier).reload(); // must be ignored while in flight

    completer.complete(_page([1], page: 1, totalPages: 1, total: 1));
    await _settle();

    expect(callCount, 1);
    expect(container.read(provider).items, [1]);
  });
}
