import 'package:flutter/material.dart';

/// Direct port of `constants/palette.js` from the RN app — the single
/// source of truth for color there, reproduced here so both apps show the
/// same brand.

class Brand {
  static const primary = Color(0xFF1E88E5);
  static const primaryDark = Color(0xFF1565C0);
  static const primaryLight = Color(0xFF64B5F6);
  static const secondary = Color(0xFF475569);
}

class ThemeColors {
  const ThemeColors({
    required this.primary,
    required this.primaryDark,
    required this.primaryLight,
    required this.secondary,
    required this.background,
    required this.surface,
    required this.border,
    required this.inputFill,
    required this.ink,
    required this.muted,
    required this.success,
    required this.warning,
    required this.error,
    required this.brandFill,
    required this.onBrandFill,
    required this.brandWash,
  });

  final Color primary;
  final Color primaryDark;
  final Color primaryLight;
  final Color secondary;
  final Color background;
  final Color surface;
  final Color border;
  final Color inputFill;
  final Color ink;
  final Color muted;
  final Color success;
  final Color warning;
  final Color error;
  final Color brandFill;
  final Color onBrandFill;
  final Color brandWash;
}

const lightColors = ThemeColors(
  primary: Brand.primary,
  primaryDark: Brand.primaryDark,
  primaryLight: Brand.primaryLight,
  secondary: Brand.secondary,
  background: Color(0xFFF8FAFC),
  surface: Color(0xFFFFFFFF),
  border: Color(0xFFE2E8F0),
  inputFill: Color(0xFFE2E8F0),
  ink: Color(0xFF0F172A),
  muted: Color(0xFF64748B),
  success: Color(0xFF22C55E),
  warning: Color(0xFFF59E0B),
  error: Color(0xFFEF4444),
  brandFill: Brand.primary,
  onBrandFill: Color(0xFFFFFFFF),
  brandWash: Color(0xFFEFF6FE),
);

const darkColors = ThemeColors(
  primary: Brand.primaryLight,
  primaryDark: Brand.primary,
  primaryLight: Color(0xFF90CAF9),
  secondary: Color(0xFF94A3B8),
  background: Color(0xFF0B1220),
  surface: Color(0xFF141E33),
  border: Color(0xFF25324B),
  inputFill: Color(0xFF25324B),
  ink: Color(0xFFF1F5F9),
  muted: Color(0xFF94A3B8),
  success: Color(0xFF4ADE80),
  warning: Color(0xFFFBBF24),
  error: Color(0xFFF87171),
  brandFill: Brand.primary,
  onBrandFill: Color(0xFFFFFFFF),
  brandWash: Color(0xFF17263D),
);

class Allocation {
  const Allocation({
    required this.name,
    required this.percentage,
    required this.light,
    required this.dark,
  });

  final String name;
  final int percentage;
  final Color light;
  final Color dark;

  Color colorFor(Brightness brightness) => brightness == Brightness.dark ? dark : light;
}

const allocations = <Allocation>[
  Allocation(name: 'Essentials', percentage: 60, light: Brand.primary, dark: Brand.primaryLight),
  Allocation(name: 'Savings', percentage: 20, light: Brand.primaryDark, dark: Brand.primary),
  Allocation(
    name: 'Investments',
    percentage: 10,
    light: Brand.primaryLight,
    dark: Color(0xFF90CAF9),
  ),
  Allocation(name: 'Emergency', percentage: 10, light: Color(0xFFF59E0B), dark: Color(0xFFFBBF24)),
];
