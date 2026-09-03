
/// A page of results plus its pagination metadata — mirrors `Page<T>` and
/// `PaginationMeta` in `lib/api.ts`. Listing endpoints ship these two
/// together at the top level of the response envelope (see
/// `unwrapEnvelope`'s pagination branch).
class PaginationMeta {
  const PaginationMeta({
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  final int page;
  final int limit;
  final int total;
  final int totalPages;

  factory PaginationMeta.fromJson(Map<String, dynamic> json) => PaginationMeta(
        page: json['page'] as int,
        limit: json['limit'] as int,
        total: json['total'] as int,
        totalPages: json['totalPages'] as int,
      );
}

class Page<T> {
  const Page({required this.data, required this.pagination});

  final List<T> data;
  final PaginationMeta pagination;

  static Page<T> fromJson<T>(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic> json) itemFromJson,
  ) {
    return Page<T>(
      data: (json['data'] as List<dynamic>)
          .map((e) => itemFromJson(e as Map<String, dynamic>))
          .toList(),
      pagination: PaginationMeta.fromJson(json['pagination'] as Map<String, dynamic>),
    );
  }
}
