class AuthenticatedUser {
  const AuthenticatedUser({
    required this.id,
    required this.email,
    required this.phone,
    required this.firstName,
    required this.lastName,
    required this.avatarUrl,
    required this.role,
    required this.timezone,
    required this.isVerified,
    required this.createdAt,
  });

  final String id;
  final String email;
  final String? phone;
  final String firstName;
  final String lastName;
  final String? avatarUrl;
  final String role;
  final String timezone;
  final bool isVerified;
  final String createdAt;

  factory AuthenticatedUser.fromJson(Map<String, dynamic> json) => AuthenticatedUser(
        id: json['id'] as String,
        email: json['email'] as String,
        phone: json['phone'] as String?,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
        avatarUrl: json['avatarUrl'] as String?,
        role: json['role'] as String,
        timezone: json['timezone'] as String,
        isVerified: json['isVerified'] as bool,
        createdAt: json['createdAt'] as String,
      );
}

class AuthResult {
  const AuthResult({required this.accessToken, required this.refreshToken, required this.user});

  final String accessToken;
  final String refreshToken;
  final AuthenticatedUser user;

  factory AuthResult.fromJson(Map<String, dynamic> json) => AuthResult(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        user: AuthenticatedUser.fromJson(json['user'] as Map<String, dynamic>),
      );
}
