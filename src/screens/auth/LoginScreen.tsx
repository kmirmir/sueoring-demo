import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { colors, fonts, spacing, typography } from '@/constants';

interface LoginScreenProps {
  onLogin: (phoneNumber: string) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');

  const validatePhoneNumber = (phone: string): boolean => {
    // 한국 전화번호 형식: 010-XXXX-XXXX or 01X-XXX-XXXX or 01X-XXXX-XXXX
    const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
    return phoneRegex.test(phone.replace(/-/g, ''));
  };

  const formatPhoneNumber = (text: string): string => {
    // 숫자만 추출
    const numbers = text.replace(/[^\d]/g, '');

    // 자동 하이픈 추가
    if (numbers.length <= 3) {
      return numbers;
    } else if (numbers.length <= 7) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    } else if (numbers.length <= 11) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
    }
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneNumberChange = (text: string) => {
    const formatted = formatPhoneNumber(text);
    setPhoneNumber(formatted);
    if (error) setError('');
  };

  const handleLogin = () => {
    if (!phoneNumber) {
      setError('전화번호를 입력해주세요');
      return;
    }

    if (!validatePhoneNumber(phoneNumber)) {
      setError('올바른 전화번호 형식이 아닙니다');
      return;
    }

    onLogin(phoneNumber);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>수어링</Text>
          <Text style={styles.tagline}>AI 수화 영상통화 서비스</Text>
        </View>

        {/* Welcome Message */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>환영합니다!</Text>
          <Text style={styles.welcomeDescription}>
            전화번호로 간편하게 시작하세요{'\n'}
            청각장애인과 청인 모두 사용 가능합니다
          </Text>
        </View>

        {/* Input Section */}
        <View style={styles.inputSection}>
          <Input
            label="전화번호"
            placeholder="010-1234-5678"
            value={phoneNumber}
            onChangeText={handlePhoneNumberChange}
            keyboardType="phone-pad"
            maxLength={13}
            error={error}
            helperText="인증번호가 발송됩니다"
            leftIcon={<Text style={styles.phoneIcon}>📱</Text>}
          />

          <Button title="인증번호 받기" onPress={handleLogin} fullWidth size="large" />
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>🔒</Text>
            <Text style={styles.infoText}>안전한 SMS 인증</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>⚡</Text>
            <Text style={styles.infoText}>즉시 사용 가능</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>🆓</Text>
            <Text style={styles.infoText}>무료 서비스</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            가입하면 <Text style={styles.linkText}>이용약관</Text> 및{'\n'}
            <Text style={styles.linkText}>개인정보처리방침</Text>에 동의하게 됩니다
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
  },
  logo: {
    fontSize: fonts.sizes['5xl'],
    fontWeight: fonts.weights.bold,
    color: colors.primary.main,
    marginBottom: spacing.sm,
  },
  tagline: {
    fontSize: fonts.sizes.base,
    color: colors.text.secondary,
  },
  welcomeSection: {
    marginBottom: spacing['2xl'],
  },
  welcomeTitle: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  welcomeDescription: {
    ...typography.body1,
    color: colors.text.secondary,
    lineHeight: fonts.lineHeights.relaxed * fonts.sizes.base,
  },
  inputSection: {
    marginBottom: spacing.xl,
  },
  phoneIcon: {
    fontSize: fonts.sizes.lg,
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing['2xl'],
  },
  infoCard: {
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  infoText: {
    fontSize: fonts.sizes.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    ...typography.caption,
    color: colors.text.disabled,
    textAlign: 'center',
    lineHeight: fonts.lineHeights.relaxed * fonts.sizes.xs,
  },
  linkText: {
    color: colors.primary.main,
    textDecorationLine: 'underline',
  },
});
