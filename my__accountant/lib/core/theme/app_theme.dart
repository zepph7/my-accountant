import 'package:flutter/material.dart';

import 'palette.dart';

@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors(this.colors);

  final ThemeColors colors;

  @override
  AppColors copyWith({ThemeColors? colors}) => AppColors(colors ?? this.colors);

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return t < 0.5 ? this : other;
  }
}

ThemeData buildAppTheme(Brightness brightness) {
  final colors = brightness == Brightness.dark ? darkColors : lightColors;
  return ThemeData(
    brightness: brightness,
    scaffoldBackgroundColor: colors.background,
    colorScheme: ColorScheme(
      brightness: brightness,
      primary: colors.primary,
      onPrimary: colors.onBrandFill,
      secondary: colors.secondary,
      onSecondary: colors.onBrandFill,
      error: colors.error,
      onError: colors.onBrandFill,
      surface: colors.surface,
      onSurface: colors.ink,
    ),
    extensions: [AppColors(colors)],
  );
}
