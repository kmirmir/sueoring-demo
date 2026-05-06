import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { colors, fonts, spacing, layout } from '@/constants';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  secureTextEntry?: boolean;
}

export default function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  containerStyle,
  secureTextEntry,
  ...textInputProps
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry);

  const toggleSecureEntry = () => {
    setIsSecure(!isSecure);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputContainer_focused,
          error && styles.inputContainer_error,
        ]}
      >
        {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}

        <TextInput
          style={[styles.input, leftIcon ? styles.input_withLeftIcon : undefined]}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholderTextColor={colors.text.disabled}
          secureTextEntry={isSecure}
          {...textInputProps}
        />

        {secureTextEntry && (
          <TouchableOpacity onPress={toggleSecureEntry} style={styles.iconRight}>
            <Text style={styles.secureToggleText}>{isSecure ? '👁️' : '👁️‍🗨️'}</Text>
          </TouchableOpacity>
        )}

        {rightIcon && !secureTextEntry && <View style={styles.iconRight}>{rightIcon}</View>}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
      {helperText && !error && <Text style={styles.helperText}>{helperText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.medium,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    minHeight: layout.inputHeight,
  },
  inputContainer_focused: {
    borderColor: colors.primary.main,
    borderWidth: 2,
  },
  inputContainer_error: {
    borderColor: colors.error.main,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fonts.sizes.base,
    color: colors.text.primary,
    minHeight: layout.inputHeight,
  },
  input_withLeftIcon: {
    paddingLeft: 0,
  },
  iconLeft: {
    paddingLeft: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRight: {
    paddingRight: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secureToggleText: {
    fontSize: fonts.sizes.lg,
  },
  errorText: {
    fontSize: fonts.sizes.sm,
    color: colors.error.main,
    marginTop: spacing.xs,
  },
  helperText: {
    fontSize: fonts.sizes.sm,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});
