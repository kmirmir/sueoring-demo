import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors, fonts, spacing, layout } from '@/constants';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
}: ButtonProps) {
  const buttonStyles = [
    styles.button,
    styles[`button_${variant}`],
    styles[`button_${size}`],
    disabled && styles.button_disabled,
    fullWidth && styles.button_fullWidth,
    style,
  ];

  const textStyles = [
    styles.text,
    styles[`text_${variant}`],
    styles[`text_${size}`],
    disabled && styles.text_disabled,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.primary.contrast : colors.primary.main}
        />
      ) : (
        <Text style={textStyles}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minTouchTarget,
  },

  // Variants
  button_primary: {
    backgroundColor: colors.primary.main,
  },
  button_secondary: {
    backgroundColor: colors.secondary.main,
  },
  button_outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary.main,
  },
  button_text: {
    backgroundColor: 'transparent',
  },

  // Sizes
  button_small: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: layout.buttonHeights.sm,
  },
  button_medium: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: layout.buttonHeights.md,
  },
  button_large: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: layout.buttonHeights.lg,
  },

  // States
  button_disabled: {
    opacity: 0.5,
  },
  button_fullWidth: {
    width: '100%',
  },

  // Text
  text: {
    fontWeight: fonts.weights.semibold,
    textAlign: 'center',
  },

  // Text Variants
  text_primary: {
    color: colors.primary.contrast,
  },
  text_secondary: {
    color: colors.secondary.contrast,
  },
  text_outline: {
    color: colors.primary.main,
  },
  text_text: {
    color: colors.primary.main,
  },

  // Text Sizes
  text_small: {
    fontSize: fonts.sizes.sm,
  },
  text_medium: {
    fontSize: fonts.sizes.base,
  },
  text_large: {
    fontSize: fonts.sizes.lg,
  },

  text_disabled: {
    opacity: 1, // Handled by button opacity
  },
});
