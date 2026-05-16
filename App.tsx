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
import IncomingCallScreen from './src/screens/call/IncomingCallScreen';
import OutgoingCallScreen from './src/screens/call/OutgoingCallScreen';
import CallScreen from './src/screens/call/CallScreen';
import SignLanguageDemoScreen from './src/screens/demo/SignLanguageDemoScreen';
import RealSignLanguageScreen from './src/screens/demo/RealSignLanguageScreen';
import BiDirectionalCallScreen from './src/screens/demo/BiDirectionalCallScreen';
import GestureLearningScreen from './src/screens/learning/GestureLearningScreen';
import SignDictionaryScreen from './src/screens/dictionary/SignDictionaryScreen';

type Screen = 'home' | 'login' | 'otp' | 'userType' | 'mainApp' | 'incomingCall' | 'outgoingCall' | 'activeCall' | 'signLanguageDemo' | 'realSignLanguage' | 'biDirectionalCall' | 'gestureLearning' | 'signDictionary';
type UserType = 'deaf' | 'hearing' | null;

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userType, setUserType] = useState<UserType>('deaf'); // 기본값 설정

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
    console.log('handleUserTypeSelect called with type:', type);
    setUserType(type);
    const typeText = type === 'deaf' ? '청각장애인' : '청인';
    console.log('Navigating to home screen');

    // 웹에서 Alert가 제대로 작동하지 않으므로 바로 홈 화면으로 이동
    setCurrentScreen('home');

    // 선택적으로 브라우저 alert 사용
    setTimeout(() => {
      window.alert(`가입 완료!\n\n${typeText}으로 등록되었습니다\n전화번호: ${phoneNumber}`);
    }, 100);
  };

  const handleAcceptCall = () => {
    setCurrentScreen('activeCall');
    Alert.alert('통화 연결', '통화가 연결되었습니다');
  };

  const handleRejectCall = () => {
    setCurrentScreen('home');
    Alert.alert('통화 거절', '통화를 거절했습니다');
  };

  const handleCancelCall = () => {
    setCurrentScreen('home');
    Alert.alert('통화 취소', '발신을 취소했습니다');
  };

  const handleEndCall = () => {
    setCurrentScreen('home');
    Alert.alert('통화 종료', '통화가 종료되었습니다');
  };

  const handleSignLanguageDemo = () => {
    setCurrentScreen('signLanguageDemo');
  };

  const handleRealSignLanguage = () => {
    setCurrentScreen('realSignLanguage');
  };

  const handleBiDirectionalCall = () => {
    setCurrentScreen('biDirectionalCall');
  };

  const handleGestureLearning = () => {
    setCurrentScreen('gestureLearning');
  };

  const handleSignDictionary = () => {
    setCurrentScreen('signDictionary');
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

    case 'incomingCall':
      return (
        <IncomingCallScreen
          callerName="김철수"
          callerPhone="010-1234-5678"
          callerType="hearing"
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      );

    case 'outgoingCall':
      return (
        <OutgoingCallScreen
          callerName="이영희"
          callerPhone="010-9876-5432"
          callerType="deaf"
          onCancel={handleCancelCall}
        />
      );

    case 'activeCall':
      return (
        <CallScreen
          callerName="김철수"
          callerType="hearing"
          myType={userType || 'deaf'}
          onEndCall={handleEndCall}
        />
      );

    case 'signLanguageDemo':
      return <SignLanguageDemoScreen onBack={() => setCurrentScreen('home')} />;

    case 'realSignLanguage':
      return <RealSignLanguageScreen onBack={() => setCurrentScreen('home')} />;

    case 'biDirectionalCall':
      return <BiDirectionalCallScreen onBack={() => setCurrentScreen('home')} />;

    case 'gestureLearning':
      return <GestureLearningScreen onBack={() => setCurrentScreen('home')} />;

    case 'signDictionary':
      return <SignDictionaryScreen onBack={() => setCurrentScreen('home')} />;

    case 'home':
    case 'mainApp':
      return (
        <HomeScreen
          onSignLanguageDemo={handleSignLanguageDemo}
          onRealSignLanguage={handleRealSignLanguage}
          onBiDirectionalCall={handleBiDirectionalCall}
          onGestureLearning={handleGestureLearning}
          onSignDictionary={handleSignDictionary}
        />
      );

    default:
      return <LoginScreen onLogin={handleLogin} />;
  }
}
