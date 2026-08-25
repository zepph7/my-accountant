/// A user-owned name with an id — income sources and expense categories are
/// both this shape. Mirrors `NamedRecord` in `components/forms/name-list.tsx`.
class NamedRecord {
  const NamedRecord({required this.id, required this.name});

  final String id;
  final String name;

  factory NamedRecord.fromJson(Map<String, dynamic> json) =>
      NamedRecord(id: json['id'] as String, name: json['name'] as String);
}
