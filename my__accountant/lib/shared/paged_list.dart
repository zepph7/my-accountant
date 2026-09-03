import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_exception.dart';
import '../core/network/page.dart';

/// A list that grows a page at a time — mirrors `usePagedList` in the RN
/// app. Reloading resets to page one rather than re-fetching everything
/// already loaded: the user has just come back from recording a
/// transaction, and what they want is the top of the list, not the same
/// screens of history they had scrolled through before.
class PagedListState<T> {
  const PagedListState({
    required this.items,
    required this.total,
    required this.page,
    required this.totalPages,
    required this.error,
    required this.loading,
    required this.refreshing,
    required this.loadingMore,
  });

  final List<T> items;
  final int total;
  final int page;
  final int totalPages;
  final String? error;
  final bool loading;
  final bool refreshing;
  final bool loadingMore;

  static PagedListState<T> initial<T>() => PagedListState<T>(
        items: const [],
        total: 0,
        page: 1,
        totalPages: 1,
        error: null,
        loading: true,
        refreshing: false,
        loadingMore: false,
      );

  bool get hasMore => page < totalPages;

  /// `clearError: true` explicitly wipes the error — passing `error: null`
  /// (or omitting it) always means "leave the current error alone."
  PagedListState<T> copyWith({
    List<T>? items,
    int? total,
    int? page,
    int? totalPages,
    String? error,
    bool clearError = false,
    bool? loading,
    bool? refreshing,
    bool? loadingMore,
  }) {
    return PagedListState<T>(
      items: items ?? this.items,
      total: total ?? this.total,
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
      error: clearError ? null : (error ?? this.error),
      loading: loading ?? this.loading,
      refreshing: refreshing ?? this.refreshing,
      loadingMore: loadingMore ?? this.loadingMore,
    );
  }
}

enum _LoadMode { initial, refresh, more }

abstract class PagedListNotifier<T> extends Notifier<PagedListState<T>> {
  bool _inFlight = false;

  @override
  PagedListState<T> build() {
    // build() must return synchronously (a Riverpod requirement), so the
    // actual fetch is deferred to the next event-loop turn via Future(...)
    // (which runs via Timer.run - a macrotask, not a microtask). If the
    // in-flight flag weren't reserved until that deferred call actually
    // ran, a reload()/refresh()/loadMore() invoked on the very next
    // synchronous line - before the deferred call has had a chance to run -
    // would see _inFlight == false, race ahead and fire its own fetch
    // first, and the deferred initial call would then fire a *second*,
    // genuinely duplicate fetch once its turn finally came around (since by
    // then the first call would already have cleared the flag). Reserving
    // the slot here, synchronously, closes that window.
    _inFlight = true;
    Future(() => _load(1, _LoadMode.initial, reserved: true));
    return PagedListState.initial<T>();
  }

  /// Fetches one page. Implemented per feature, using whatever filter
  /// state the subclass holds internally (see the Global Constraints note
  /// on where filter state lives).
  Future<Page<T>> fetchPage(int page);

  Future<void> _load(int target, _LoadMode mode, {bool reserved = false}) async {
    // Guards against a scroll listener or a rapid double-tap firing loadMore
    // repeatedly while a page is already in flight, which would skip pages
    // or duplicate one. `reserved` is true only for the deferred initial
    // call scheduled by build(), which has already claimed the slot there.
    if (!reserved) {
      if (_inFlight) return;
      _inFlight = true;
    }

    state = state.copyWith(
      loading: mode == _LoadMode.initial ? true : null,
      refreshing: mode == _LoadMode.refresh,
      loadingMore: mode == _LoadMode.more,
    );

    try {
      final result = await fetchPage(target);
      state = state.copyWith(
        items: target == 1 ? result.data : [...state.items, ...result.data],
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
        page: target,
        clearError: true,
        loading: false,
        refreshing: false,
        loadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Could not load this list.',
        loading: false,
        refreshing: false,
        loadingMore: false,
      );
    } finally {
      _inFlight = false;
    }
  }

  void loadMore() {
    if (state.page < state.totalPages) _load(state.page + 1, _LoadMode.more);
  }

  void refresh() => _load(1, _LoadMode.refresh);

  void reload() => _load(1, _LoadMode.initial);
}
