import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/page.dart';

class _Item {
  const _Item(this.id);
  final String id;
  factory _Item.fromJson(Map<String, dynamic> json) => _Item(json['id'] as String);
}

void main() {
  group('PaginationMeta', () {
    test('parses from json', () {
      final meta = PaginationMeta.fromJson({'page': 2, 'limit': 20, 'total': 45, 'totalPages': 3});
      expect(meta.page, 2);
      expect(meta.limit, 20);
      expect(meta.total, 45);
      expect(meta.totalPages, 3);
    });
  });

  group('Page.fromJson', () {
    test('parses the data list with the given item parser and the pagination block', () {
      final page = Page.fromJson<_Item>(
        {
          'data': [
            {'id': 'a'},
            {'id': 'b'},
          ],
          'pagination': {'page': 1, 'limit': 20, 'total': 2, 'totalPages': 1},
        },
        _Item.fromJson,
      );
      expect(page.data.map((e) => e.id), ['a', 'b']);
      expect(page.pagination.total, 2);
    });

    test('handles an empty data list', () {
      final page = Page.fromJson<_Item>(
        {
          'data': <dynamic>[],
          'pagination': {'page': 1, 'limit': 20, 'total': 0, 'totalPages': 0},
        },
        _Item.fromJson,
      );
      expect(page.data, isEmpty);
      expect(page.pagination.totalPages, 0);
    });
  });
}
