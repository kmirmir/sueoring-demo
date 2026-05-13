/**
 * WebRTCCallScreen - 실제 P2P 영상통화 화면
 * WebRTC + Socket.IO를 사용한 실시간 영상통화
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing } from '@/constants';
import { webRTCService } from '@/services/WebRTCService';

interface WebRTCCallScreenProps {
  callerName: string;
  callerType: 'deaf' | 'hearing';
  myType: 'deaf' | 'hearing';
  onEndCall: () => void;
}

export default function WebRTCCallScreen({
  callerName,
  callerType,
  myType,
  onEndCall,
}: WebRTCCallScreenProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [connectionState, setConnectionState] = useState<string>('connecting');
  const [isConnected, setIsConnected] = useState(false);

  // 통화 시간 타이머
  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // WebRTC 초기화
  useEffect(() => {
    if (Platform.OS !== 'web') {
      alert('WebRTC는 웹 브라우저에서만 지원됩니다.');
      return;
    }

    setupWebRTC();

    return () => {
      // Cleanup
      if (webRTCService.getLocalStream()) {
        webRTCService.getLocalStream()?.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const setupWebRTC = async () => {
    try {
      // 로컬 스트림 이벤트
      webRTCService.setOnLocalStream((stream) => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play();
        }
      });

      // 원격 스트림 이벤트
      webRTCService.setOnRemoteStream((stream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play();
          setIsConnected(true);
          setConnectionState('connected');
        }
      });

      // 수어 제스처 수신
      webRTCService.setOnGestureReceived((gesture, _timestamp) => {
        setCurrentSubtitle(gesture);
        setTimeout(() => setCurrentSubtitle(''), 3000);
      });

      // 통화 종료
      webRTCService.setOnCallEnded((reason) => {
        console.log('Call ended:', reason);
        onEndCall();
      });

      // 에러 처리
      webRTCService.setOnError((error) => {
        console.error('WebRTC Error:', error);
        alert(`통화 오류: ${error.message}`);
      });

      // 이미 로컬 스트림이 있으면 비디오 연결
      const localStream = webRTCService.getLocalStream();
      if (localStream && localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play();
      }

      // 이미 원격 스트림이 있으면 비디오 연결
      const remoteStream = webRTCService.getRemoteStream();
      if (remoteStream && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play();
        setIsConnected(true);
        setConnectionState('connected');
      }

    } catch (error) {
      console.error('Setup error:', error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleMute = () => {
    const localStream = webRTCService.getLocalStream();
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    const localStream = webRTCService.getLocalStream();
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const handleEndCall = () => {
    webRTCService.endCall();
    onEndCall();
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header - 통화 정보 */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.callDuration}>{formatDuration(callDuration)}</Text>
        </View>
        <View style={styles.userTypeBadge}>
          <Text style={styles.userTypeText}>
            {callerType === 'deaf' ? '🤟 수화' : '🗣️ 음성'}
          </Text>
        </View>
      </View>

      {/* Main Video Area - 상대방 영상 */}
      <View style={styles.remoteVideoContainer}>
        {Platform.OS === 'web' && (
          <video
            ref={remoteVideoRef as any}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: '#000'
            }}
            autoPlay
            playsInline
          />
        )}

        {!isConnected && (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderEmoji}>📹</Text>
            <Text style={styles.placeholderText}>상대방 영상 연결 중...</Text>
            <Text style={styles.connectionState}>{connectionState}</Text>
          </View>
        )}

        {/* 자막 오버레이 */}
        {currentSubtitle && (
          <View style={styles.subtitleOverlay}>
            <Text style={styles.subtitleText}>{currentSubtitle}</Text>
          </View>
        )}

        {/* PIP - 내 영상 */}
        <View style={styles.localVideoContainer}>
          {Platform.OS === 'web' && (
            <video
              ref={localVideoRef as any}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: 12,
                transform: 'scaleX(-1)' // 거울 효과
              }}
              autoPlay
              playsInline
              muted
            />
          )}
          {isVideoOff && (
            <View style={styles.videoOffOverlay}>
              <Text style={styles.videoOffIcon}>📷</Text>
            </View>
          )}
        </View>
      </View>

      {/* Control Buttons */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          onPress={toggleMute}
        >
          <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎤'}</Text>
          <Text style={styles.controlLabel}>
            {isMuted ? '음소거됨' : '마이크'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.endCallButton]}
          onPress={handleEndCall}
        >
          <Text style={styles.controlIcon}>📞</Text>
          <Text style={styles.controlLabel}>통화 종료</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, isVideoOff && styles.controlButtonActive]}
          onPress={toggleVideo}
        >
          <Text style={styles.controlIcon}>{isVideoOff ? '📷' : '🎥'}</Text>
          <Text style={styles.controlLabel}>
            {isVideoOff ? '비디오 꺼짐' : '비디오'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Info Panel */}
      <View style={styles.infoPanel}>
        <Text style={styles.infoText}>
          💡 {myType === 'deaf' ? '수어로 대화하면 자동으로 자막이 표시됩니다' : '음성이 자동으로 자막으로 변환됩니다'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[900],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.gray[800],
  },
  headerInfo: {
    flex: 1,
  },
  callerName: {
    fontSize: fonts.sizes['2xl'],
    fontWeight: fonts.weights.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  callDuration: {
    fontSize: fonts.sizes.base,
    color: colors.text.secondary,
  },
  userTypeBadge: {
    backgroundColor: colors.primary.main,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  userTypeText: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.semibold,
    color: colors.primary.contrast,
  },
  remoteVideoContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
  },
  placeholderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.gray[800],
  },
  placeholderEmoji: {
    fontSize: 80,
    marginBottom: spacing.md,
  },
  placeholderText: {
    fontSize: fonts.sizes.lg,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  connectionState: {
    fontSize: fonts.sizes.sm,
    color: colors.text.secondary,
  },
  subtitleOverlay: {
    position: 'absolute',
    bottom: spacing['2xl'],
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: spacing.lg,
    borderRadius: 12,
  },
  subtitleText: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.semibold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  localVideoContainer: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.primary.main,
    backgroundColor: '#000',
  },
  videoOffOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.gray[700],
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoOffIcon: {
    fontSize: 40,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.gray[800],
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.gray[700],
  },
  controlButtonActive: {
    backgroundColor: colors.error.main,
  },
  endCallButton: {
    backgroundColor: colors.error.main,
    transform: [{ rotate: '135deg' }],
  },
  controlIcon: {
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  controlLabel: {
    fontSize: fonts.sizes.xs,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  infoPanel: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.gray[800],
  },
  infoText: {
    fontSize: fonts.sizes.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
