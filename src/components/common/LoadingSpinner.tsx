import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, fonts, spacing } from '@/constants';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  text?: string;
  fullScreen?: boolean;
  style?: ViewStyle;
}

export default function LoadingSpinner({
  size = 'large',
  color = colors.primary.main,
  text,
  fullScreen = false,
  style,
}: LoadingSpinnerProps) {
  const containerStyle = fullScreen ? styles.container_fullScreen : styles.container;

  return (
    <View style={[containerStyle, style]}>
      <ActivityIndicator size={size} color={color} />
      {text && <Text style={styles.text}>{text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  container_fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.default,
  },
  text: {
    marginTop: spacing.md,
    fontSize: fonts.sizes.base,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
