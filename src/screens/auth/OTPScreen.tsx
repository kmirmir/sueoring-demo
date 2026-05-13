import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Button from '@/components/common/Button';
import { colors, fonts, spacing, typography } from '@/constants';

interface OTPScreenProps {
  phoneNumber: string;
  onVerify: (otp: string) => void;
  onResend: () => void;
  onBack: () => void;
}

export default function OTPScreen({ phoneNumber, onVerify, onResend, onBack }: OTPScreenProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(180); // 3분
  const [canResend, setCanResend] = useState(false);

  const inputRefs = useRef<Array<TextInput | null>>([]);

  // 타이머
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCanResend(true);
      return undefined;
    }
  }, [timer]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOTPChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return; // 숫자만 허용

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (error) setError('');

    // 자동으로 다음 input으로 이동
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // 모든 칸이 채워지면 자동 제출
    if (newOtp.every((digit) => digit !== '')) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    // Backspace 처리
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = (otpCode?: string) => {
    const code = otpCode || otp.join('');

    if (code.length !== 6) {
      setError('인증번호 6자리를 모두 입력해주세요');
      return;
    }

    onVerify(code);
  };

  const handleResend = () => {
    if (!canResend) return;

    setOtp(['', '', '', '', '', '']);
    setTimer(180);
    setCanResend(false);
    setError('');
    onResend();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />

      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>← 뒤로</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>인증번호 입력</Text>
          <Text style={styles.description}>
            {phoneNumber}로{'\n'}발송된 인증번호 6자리를 입력해주세요
          </Text>
        </View>

        {/* OTP Input */}
        <View style={styles.otpContainer}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              style={[styles.otpInput, error && styles.otpInput_error]}
              value={digit}
              onChangeText={(value) => handleOTPChange(value, index)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Timer */}
        <View style={styles.timerContainer}>
          <Text style={[styles.timerText, timer <= 30 && styles.timerText_warning]}>
            남은 시간: {formatTime(timer)}
          </Text>
        </View>

        {/* Resend Button */}
        <TouchableOpacity
          style={styles.resendButton}
          onPress={handleResend}
          disabled={!canResend}
        >
          <Text style={[styles.resendText, !canResend && styles.resendText_disabled]}>
            인증번호 재전송
          </Text>
        </TouchableOpacity>

        {/* Verify Button */}
        <Button
          title="인증 완료"
          onPress={() => handleVerify()}
          fullWidth
          size="large"
          disabled={otp.some((digit) => !digit)}
        />

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            📱 인증번호가 오지 않았나요?{'\n'}스팸함을 확인하거나 재전송 버튼을 눌러주세요
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  backButton: {
    padding: spacing.md,
  },
  backButtonText: {
    fontSize: fonts.sizes.base,
    color: colors.primary.main,
    fontWeight: fonts.weights.medium,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing['2xl'],
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  description: {
    ...typography.body1,
    color: colors.text.secondary,
    lineHeight: fonts.lineHeights.relaxed * fonts.sizes.base,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: colors.border.default,
    borderRadius: 8,
    fontSize: fonts.sizes['2xl'],
    fontWeight: fonts.weights.bold,
    color: colors.text.primary,
    textAlign: 'center',
    backgroundColor: colors.background.elevated,
  },
  otpInput_error: {
    borderColor: colors.error.main,
  },
  errorText: {
    fontSize: fonts.sizes.sm,
    color: colors.error.main,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  timerContainer: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  timerText: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.medium,
    color: colors.text.secondary,
  },
  timerText_warning: {
    color: colors.warning.main,
  },
  resendButton: {
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  resendText: {
    fontSize: fonts.sizes.base,
    color: colors.primary.main,
    textDecorationLine: 'underline',
  },
  resendText_disabled: {
    color: colors.text.disabled,
  },
  infoContainer: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.info.background,
    borderRadius: 8,
  },
  infoText: {
    fontSize: fonts.sizes.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: fonts.lineHeights.relaxed * fonts.sizes.sm,
  },
});
