import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing } from '@/constants';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

type UserType = 'deaf' | 'hearing' | null;

interface ChatLobbyScreenProps {
  userType: UserType;
  onRoomReady: (roomCode: string, role: 'creator' | 'joiner', selectedType: 'deaf' | 'hearing') => void;
  onBack: () => void;
}

export default function ChatLobbyScreen({ userType, onRoomReady, onBack }: ChatLobbyScreenProps) {
  const socketRef = useRef<Socket | null>(null);
  const [selectedRole, setSelectedRole] = useState<'deaf' | 'hearing'>(userType || 'deaf');
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);

  const typeName = selectedRole === 'deaf' ? '청각장애인' : '청인';

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // 방 생성 완료 → 즉시 ChatRoomScreen으로 이동 (로비 소켓은 방에 참가하지 않음)
    socket.on('chat-room-created', ({ roomCode }: { roomCode: string }) => {
      setLoading(false);
      onRoomReady(roomCode, 'creator', selectedRoleRef.current);
    });

    socket.on('chat-room-error', ({ message }: { message: string }) => {
      setError(message);
      setLoading(false);
    });

    // 방 코드 유효성 검증 성공 → ChatRoomScreen으로 이동
    socket.on('room-code-valid', ({ roomCode }: { roomCode: string }) => {
      setLoading(false);
      onRoomReady(roomCode, 'joiner', selectedRoleRef.current);
    });

    return () => { socket.disconnect(); };
  }, []);

  const selectedRoleRef = useRef<'deaf' | 'hearing'>(selectedRole);
  useEffect(() => { selectedRoleRef.current = selectedRole; }, [selectedRole]);

  const handleCreate = () => {
    if (!connected) { setError('서버에 연결 중입니다. 잠시 후 다시 시도해주세요.'); return; }
    setError('');
    setLoading(true);
    socketRef.current?.emit('create-chat-room', { userType: selectedRole, userName: typeName });
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError('6자리 방 코드를 입력해주세요'); return; }
    if (!connected) { setError('서버에 연결 중입니다.'); return; }
    setError('');
    setLoading(true);
    // 방 코드 검증만 (실제 참가는 ChatRoomScreen에서)
    socketRef.current?.emit('check-room-code', { roomCode: code });
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← 돌아가기</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>1:1 대화방</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.desc}>
          청각장애인과 청인이 실시간으로{'\n'}수어와 음성으로 소통하는 공간입니다
        </Text>

        {/* 역할 선택 */}
        <View style={styles.roleSection}>
          <Text style={styles.roleSectionTitle}>내 역할 선택</Text>
          <View style={styles.roleCards}>
            <TouchableOpacity
              style={[styles.roleCard, selectedRole === 'deaf' && styles.roleCardActive]}
              onPress={() => { setSelectedRole('deaf'); setError(''); }}
            >
              <Text style={styles.roleCardEmoji}>🤟</Text>
              <Text style={[styles.roleCardName, selectedRole === 'deaf' && styles.roleCardNameActive]}>
                청각장애인
              </Text>
              <Text style={[styles.roleCardDesc, selectedRole === 'deaf' && styles.roleCardDescActive]}>
                수어로 대화합니다
              </Text>
              {selectedRole === 'deaf' && <View style={styles.roleCardCheck}><Text style={styles.roleCardCheckText}>✓</Text></View>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleCard, selectedRole === 'hearing' && styles.roleCardHearingActive]}
              onPress={() => { setSelectedRole('hearing'); setError(''); }}
            >
              <Text style={styles.roleCardEmoji}>🗣️</Text>
              <Text style={[styles.roleCardName, selectedRole === 'hearing' && styles.roleCardNameHearingActive]}>
                청인
              </Text>
              <Text style={[styles.roleCardDesc, selectedRole === 'hearing' && styles.roleCardDescActive]}>
                음성으로 대화합니다
              </Text>
              {selectedRole === 'hearing' && <View style={styles.roleCardCheckHearing}><Text style={styles.roleCardCheckText}>✓</Text></View>}
            </TouchableOpacity>
          </View>
        </View>

        {/* 탭 */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'create' && styles.tabActive]}
            onPress={() => { setTab('create'); setError(''); }}
          >
            <Text style={[styles.tabText, tab === 'create' && styles.tabTextActive]}>방 만들기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'join' && styles.tabActive]}
            onPress={() => { setTab('join'); setError(''); }}
          >
            <Text style={[styles.tabText, tab === 'join' && styles.tabTextActive]}>방 입장</Text>
          </TouchableOpacity>
        </View>

        {/* 방 만들기 */}
        {tab === 'create' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>새 대화방을 만듭니다</Text>
            <Text style={styles.panelDesc}>
              방을 만들면 6자리 코드가 생성됩니다.{'\n'}대화방에서 코드를 상대방에게 공유하세요.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleCreate}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>방 만들기</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* 방 입장 */}
        {tab === 'join' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>방 코드로 입장</Text>
            <Text style={styles.panelDesc}>상대방에게 받은 6자리 코드를 입력하세요</Text>
            <TextInput
              style={styles.codeInput}
              value={joinCode}
              onChangeText={t => { setJoinCode(t.toUpperCase()); setError(''); }}
              placeholder="예: ABC123"
              placeholderTextColor={colors.text.disabled}
              maxLength={6}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.primaryBtn, (loading || joinCode.length !== 6) && styles.btnDisabled]}
              onPress={handleJoin}
              disabled={loading || joinCode.length !== 6}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>입장하기</Text>}
            </TouchableOpacity>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!connected && (
          <View style={styles.serverStatus}>
            <ActivityIndicator size="small" color={colors.warning.main} />
            <Text style={styles.serverStatusText}>서버 연결 중... (서버가 실행 중인지 확인하세요)</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.default },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 50, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: colors.primary.main,
  },
  backBtn: { marginRight: spacing.md },
  backText: { color: colors.primary.contrast, fontSize: fonts.sizes.base },
  headerTitle: { flex: 1, fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold, color: '#fff' },
  content: { padding: spacing.lg, flexGrow: 1 },
  roleSection: { marginBottom: spacing.xl },
  roleSectionTitle: {
    fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold,
    color: colors.text.secondary, marginBottom: spacing.md,
  },
  roleCards: { flexDirection: 'row', gap: spacing.md },
  roleCard: {
    flex: 1, alignItems: 'center', padding: spacing.lg,
    backgroundColor: colors.background.paper, borderRadius: 16,
    borderWidth: 2, borderColor: colors.border.default, position: 'relative' as any,
  },
  roleCardActive: { borderColor: colors.primary.main, backgroundColor: colors.primary.main + '12' },
  roleCardHearingActive: { borderColor: '#7C3AED', backgroundColor: '#7C3AED12' },
  roleCardEmoji: { fontSize: 40, marginBottom: spacing.sm },
  roleCardName: {
    fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold,
    color: colors.text.primary, marginBottom: 4,
  },
  roleCardNameActive: { color: colors.primary.main },
  roleCardNameHearingActive: { color: '#7C3AED' },
  roleCardDesc: { fontSize: fonts.sizes.sm, color: colors.text.secondary, textAlign: 'center' },
  roleCardDescActive: { color: colors.text.primary },
  roleCardCheck: {
    position: 'absolute' as any, top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary.main, alignItems: 'center', justifyContent: 'center',
  },
  roleCardCheckHearing: {
    position: 'absolute' as any, top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },
  roleCardCheckText: { color: '#fff', fontSize: 12, fontWeight: fonts.weights.bold },
  desc: {
    fontSize: fonts.sizes.base, color: colors.text.secondary,
    textAlign: 'center', lineHeight: 24, marginBottom: spacing.xl,
  },
  tabs: {
    flexDirection: 'row', backgroundColor: colors.background.paper,
    borderRadius: 10, padding: 4, marginBottom: spacing.lg,
  },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary.main },
  tabText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.medium, color: colors.text.secondary },
  tabTextActive: { color: '#fff' },
  panel: {
    backgroundColor: colors.background.paper, borderRadius: 16,
    padding: spacing.xl, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border.default,
  },
  panelTitle: { fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold, color: colors.text.primary, marginBottom: spacing.sm },
  panelDesc: { fontSize: fonts.sizes.base, color: colors.text.secondary, lineHeight: 22, marginBottom: spacing.xl },
  primaryBtn: {
    backgroundColor: colors.primary.main, borderRadius: 12,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  secondaryBtn: {
    borderWidth: 1, borderColor: colors.primary.main, borderRadius: 12,
    paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md,
  },
  secondaryBtnText: { color: colors.primary.main, fontSize: fonts.sizes.base, fontWeight: fonts.weights.medium },
  btnDisabled: { opacity: 0.5 },
  codeDisplay: {
    backgroundColor: colors.primary.main, borderRadius: 12,
    paddingVertical: spacing.lg, alignItems: 'center', marginBottom: spacing.md,
  },
  codeText: { fontSize: 40, fontWeight: fonts.weights.bold, color: '#fff', letterSpacing: 8 },
  waitingText: { fontSize: fonts.sizes.base, color: colors.text.secondary, textAlign: 'center' },
  codeInput: {
    borderWidth: 2, borderColor: colors.primary.main, borderRadius: 12,
    paddingVertical: spacing.md, textAlign: 'center',
    fontSize: 28, fontWeight: fonts.weights.bold, color: colors.text.primary,
    letterSpacing: 8, marginBottom: spacing.lg,
  },
  error: { color: colors.error.main, textAlign: 'center', marginBottom: spacing.md },
  serverStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  serverStatusText: { fontSize: fonts.sizes.sm, color: colors.warning.main },
});
