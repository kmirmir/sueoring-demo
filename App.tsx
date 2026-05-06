/**
 * 수어링 (SueoRing) - MVP Demo
 * AI 기반 수화 영상통화 서비스
 */

import React, { useState } from 'react';
import { Alert } from 'react-native';
import HomeScreen from './src/screens/home/HomeScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import OTPScreen from './src/screens/auth/OTPScreen';
import UserTypeScreen from './src/screens/auth/UserTypeScreen';

type Screen = 'home' | 'login' | 'otp' | 'userType' | 'mainApp';
type UserType = 'deaf' | 'hearing' | null;

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleLogin = (phone: string) => {
    setPhoneNumber(phone);
    setCurrentScreen('otp');
    Alert.alert('인증번호 발송', `${phone}으로 인증번호가 발송되었습니다\n\n[데모 모드]`);
  };

  const handleVerify = (otp: string) => {
    console.log('OTP verified:', otp);
    setCurrentScreen('userType');
    Alert.alert('인증 성공', '본인 인증이 완료되었습니다');
  };

  const handleResendOTP = () => {
    Alert.alert('재전송', '인증번호가 재전송되었습니다 [데모 모드]');
  };

  const handleUserTypeSelect = (type: UserType) => {
    const typeText = type === 'deaf' ? '청각장애인' : '청인';
    Alert.alert(
      '가입 완료!',
      `${typeText}으로 등록되었습니다\n\n전화번호: ${phoneNumber}\n\n홈 화면으로 이동합니다`,
      [{ text: '확인', onPress: () => setCurrentScreen('home') }]
    );
  };

  switch (currentScreen) {
    case 'login':
      return <LoginScreen onLogin={handleLogin} />;

    case 'otp':
      return (
        <OTPScreen
          phoneNumber={phoneNumber}
          onVerify={handleVerify}
          onResend={handleResendOTP}
          onBack={() => setCurrentScreen('login')}
        />
      );

    case 'userType':
      return <UserTypeScreen onComplete={handleUserTypeSelect} />;

    case 'home':
    case 'mainApp':
      return <HomeScreen />;

    default:
      return <LoginScreen onLogin={handleLogin} />;
  }
}
