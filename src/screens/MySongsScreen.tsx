import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, SectionList, TouchableOpacity,
  ActivityIndicator, Animated, Dimensions, RefreshControl,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';

const { width } = Dimensions.get('window');

// ─── Types ──────────────────────────────────────────────────────────────────
interface Recording {
  id: string;
  project_name: string;
  file_url: string;
  duration_ms: number;
  bpm: number;
  key: string;
  auto_tune_pct: number;
  instruments: string[];
  created_at: string;
  user_id: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Extract storage path from a signed or public Supabase URL */
function extractStoragePath(url: string): string {
  try {
    // Handles: /storage/v1/object/sign/recordings/PATH?token=...
    //          /storage/v1/object/public/recordings/PATH
    const match = url.match(/\/recordings\/(.+?)(?:\?|$)/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function formatDuration(ms: number): string {
  if (!ms) return '0:00';
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInstrumentEmoji(name: string): string {
  const map: Record<string, string> = {
    piano: '🎹', guitar: '🎸', tabla: '🥁', drums: '🥁',
    bass: '🎵', strings: '🎻', flute: '🪗', keys: '🎹',
  };
  return map[name.toLowerCase()] ?? '🎵';
}

// ─── Custom Dialog ────────────────────────────────────────────────────────────
interface DialogProps {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}

const MaestroDialog: React.FC<DialogProps> = ({
  visible, title, message, onConfirm, onCancel,
  confirmLabel = 'Confirm', danger = false,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 80 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.85, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, dlg.backdrop, { opacity }]}>
      <Animated.View style={[dlg.card, { transform: [{ scale }] }]}>
        {/* Gold top accent */}
        <LinearGradient
          colors={['#D4AF37', '#B8962E']}
          style={dlg.topBar}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        />
        <Text style={dlg.title}>{title}</Text>
        <Text style={dlg.message}>{message}</Text>
        <View style={dlg.btnRow}>
          <TouchableOpacity style={dlg.cancelBtn} onPress={onCancel} activeOpacity={0.75}>
            <Text style={dlg.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[dlg.confirmBtn, danger && dlg.dangerBtn]}
            onPress={onConfirm}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={danger ? ['#FF3B5C', '#C0192E'] : ['#D4AF37', '#B8962E']}
              style={dlg.confirmGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Text style={dlg.confirmText}>{confirmLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const dlg = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', zIndex: 999,
  },
  card: {
    width: width * 0.82,
    backgroundColor: '#13131E',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  topBar: { height: 3, width: '100%' },
  title: {
    color: '#F0E6C8', fontSize: 17, fontWeight: '700',
    paddingHorizontal: 22, paddingTop: 20, paddingBottom: 8,
    letterSpacing: 0.3,
  },
  message: {
    color: 'rgba(240,230,200,0.6)', fontSize: 13.5, lineHeight: 20,
    paddingHorizontal: 22, paddingBottom: 24,
  },
  btnRow: {
    flexDirection: 'row',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  cancelBtn: {
    flex: 1, paddingVertical: 16, alignItems: 'center',
    borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.06)',
  },
  cancelText: { color: 'rgba(240,230,200,0.45)', fontSize: 14, fontWeight: '600' },
  confirmBtn: { flex: 1, overflow: 'hidden' },
  dangerBtn: {},
  confirmGrad: { paddingVertical: 16, alignItems: 'center' },
  confirmText: { color: '#0B0B12', fontSize: 14, fontWeight: '700' },
});

// ─── Song Card ────────────────────────────────────────────────────────────────
interface SongCardProps {
  item: Recording;
  onDelete: (item: Recording) => void;
  onPlay: (item: Recording) => void;
  isPlaying: boolean;
  isDeleting: boolean;
  playProgress: number; // 0–1
}

const SongCard: React.FC<SongCardProps> = ({
  item, onDelete, onPlay, isPlaying, isDeleting, playProgress,
}) => {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      glowAnim.stopAnimation();
      glowAnim.setValue(0);
    }
  }, [isPlaying]);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] });

  return (
    <Animated.View style={[
      card.wrap,
      isPlaying && { borderColor: 'rgba(0,217,192,0.4)' },
    ]}>
      {isPlaying && (
        <Animated.View style={[card.glow, { opacity: glowOpacity }]} />
      )}

      {/* Waveform accent */}
      <View style={card.waveRow}>
        {Array.from({ length: 28 }).map((_, i) => (
          <View
            key={i}
            style={[
              card.wavebar,
              {
                height: 4 + Math.abs(Math.sin(i * 0.7)) * 18,
                backgroundColor: isPlaying && (i / 28) < playProgress
                  ? '#00D9C0'
                  : 'rgba(212,175,55,0.25)',
              },
            ]}
          />
        ))}
      </View>

      <View style={card.body}>
        {/* Left: meta */}
        <View style={{ flex: 1 }}>
          <Text style={card.name} numberOfLines={1}>{item.project_name}</Text>
          <Text style={card.date}>{formatDate(item.created_at)}</Text>
          <View style={card.pills}>
            {item.duration_ms > 0 && (
              <View style={card.pill}>
                <Text style={card.pillTxt}>⏱ {formatDuration(item.duration_ms)}</Text>
              </View>
            )}
            {item.bpm > 0 && (
              <View style={card.pill}>
                <Text style={card.pillTxt}>♩ {item.bpm} BPM</Text>
              </View>
            )}
            {item.key !== 'C' && (
              <View style={card.pill}>
                <Text style={card.pillTxt}>🎵 {item.key}</Text>
              </View>
            )}
            {item.auto_tune_pct > 0 && (
              <View style={[card.pill, { borderColor: 'rgba(0,217,192,0.35)' }]}>
                <Text style={[card.pillTxt, { color: '#00D9C0' }]}>✦ {item.auto_tune_pct}%</Text>
              </View>
            )}
          </View>
          {item.instruments?.length > 0 && (
            <Text style={card.instruments}>
              {item.instruments.map(getInstrumentEmoji).join(' ')}
            </Text>
          )}
        </View>

        {/* Right: actions */}
        <View style={card.actions}>
          <TouchableOpacity
            style={[card.playBtn, isPlaying && card.playBtnActive]}
            onPress={() => onPlay(item)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={isPlaying ? ['#00D9C0', '#00A896'] : ['#D4AF37', '#B8962E']}
              style={card.playGrad}
            >
              <Text style={card.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={card.deleteBtn}
            onPress={() => onDelete(item)}
            disabled={isDeleting}
            activeOpacity={0.7}
          >
            {isDeleting
              ? <ActivityIndicator size="small" color="#FF3B5C" />
              : <Text style={card.deleteIcon}>🗑</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

const card = StyleSheet.create({
  wrap: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: '#111120',
    borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
    overflow: 'hidden',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,217,192,0.06)',
  },
  waveRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 14, gap: 2, height: 36,
  },
  wavebar: { flex: 1, borderRadius: 2 },
  body: { flexDirection: 'row', padding: 16, paddingTop: 12 },
  name: { color: '#F0E6C8', fontSize: 15, fontWeight: '700', marginBottom: 3 },
  date: { color: 'rgba(240,230,200,0.4)', fontSize: 11, marginBottom: 8 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  pill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  pillTxt: { color: 'rgba(212,175,55,0.8)', fontSize: 10, fontWeight: '600' },
  instruments: { fontSize: 14, marginTop: 2 },
  actions: { gap: 10, justifyContent: 'center' },
  playBtn: { borderRadius: 28, overflow: 'hidden' },
  playBtnActive: {},
  playGrad: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  playIcon: { fontSize: 16 },
  deleteBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  deleteIcon: { fontSize: 18 },
});

// ─── Empty State ──────────────────────────────────────────────────────────────
const EmptyState = () => (
  <View style={empty.wrap}>
    <Text style={empty.emoji}>🎙️</Text>
    <Text style={empty.title}>No Songs Yet</Text>
    <Text style={empty.sub}>Head to Studio and record your first take</Text>
  </View>
);
const empty = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emoji: { fontSize: 52, marginBottom: 16 },
  title: { color: '#F0E6C8', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  sub: { color: 'rgba(240,230,200,0.4)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function MySongsScreen() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Guard set — prevents any ID from being deleted twice
  const deletingIds = useRef<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Dialog state
  const [dialog, setDialog] = useState<{
    visible: boolean; item: Recording | null;
  }>({ visible: false, item: null });

  // Audio
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);

  // ── Fetch ──
  const fetchRecordings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecordings(data ?? []);
    } catch (err) {
      console.error('[MySongs] Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchRecordings(); }, []);

  // ── Delete ──
  const promptDelete = (item: Recording) => {
    if (deletingIds.current.has(item.id)) return; // already in progress
    setDialog({ visible: true, item });
  };

  const confirmDelete = async () => {
    const item = dialog.item;
    setDialog({ visible: false, item: null });
    if (!item) return;

    // Guard: prevent double calls
    if (deletingIds.current.has(item.id)) {
      console.warn('[MySongs] Delete already in progress for', item.id);
      return;
    }
    deletingIds.current.add(item.id);
    setDeletingId(item.id);

    // Stop playback if playing this
    if (playingId === item.id) await stopPlayback();

    try {
      // STEP 1: Delete DB record first
      const { error: dbErr } = await supabase
        .from('recordings')
        .delete()
        .eq('id', item.id);

      if (dbErr) throw new Error(`DB delete failed: ${dbErr.message}`);
      console.log('[MySongs] DB record deleted:', item.id);

      // STEP 2: Remove from local state immediately
      setRecordings(prev => prev.filter(r => r.id !== item.id));

      // STEP 3: Delete from storage (best-effort — don't fail if already gone)
      if (item.file_url) {
        const storagePath = extractStoragePath(item.file_url);
        if (storagePath) {
          const { error: storErr } = await supabase.storage
            .from('recordings')
            .remove([storagePath]);

          if (storErr) {
            console.warn('[MySongs] Storage delete warning (non-fatal):', storErr.message);
          } else {
            console.log('[MySongs] Storage deleted:', storagePath);
          }
        }
      }
    } catch (err: any) {
      console.error('[MySongs] Delete error:', err.message);
      // Re-fetch to restore correct state
      fetchRecordings();
    } finally {
      deletingIds.current.delete(item.id);
      setDeletingId(null);
    }
  };

  // ── Playback ──
  const stopPlayback = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {}
    setPlayingId(null);
    setPlayProgress(0);
  };

  const togglePlay = async (item: Recording) => {
    if (playingId === item.id) {
      await stopPlayback();
      return;
    }
    await stopPlayback();

    if (!item.file_url) return;

    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: item.file_url },
        { shouldPlay: true },
        (status: any) => {
          if (status.isLoaded) {
            if (status.didJustFinish) {
              setPlayingId(null);
              setPlayProgress(0);
              soundRef.current = null;
            } else if (status.durationMillis && status.positionMillis) {
              setPlayProgress(status.positionMillis / status.durationMillis);
            }
          }
        }
      );
      soundRef.current = sound;
      setPlayingId(item.id);
    } catch (err) {
      console.error('[MySongs] Playback error:', err);
    }
  };

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  // ── Render ──
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#D4AF37" size="large" />
      </View>
    );
  }

  // ── Group by Project ──
  const groupedData = Object.values(
    recordings.reduce((acc, rec) => {
      const proj = rec.project_name || 'Untitled Recordings';
      if (!acc[proj]) acc[proj] = { title: proj, data: [] };
      acc[proj].data.push(rec);
      return acc;
    }, {} as Record<string, { title: string; data: Recording[] }>)
  );

  return (
    <View style={s.root}>
      {/* Header */}
      <LinearGradient
        colors={['#0B0B12', '#111120']}
        style={s.header}
      >
        <Text style={s.headerTitle}>My Songs</Text>
        <Text style={s.headerSub}>
          {recordings.length} {recordings.length === 1 ? 'recording' : 'recordings'} in {groupedData.length} projects
        </Text>
      </LinearGradient>

      <SectionList
        sections={groupedData}
        keyExtractor={item => item.id}
        renderSectionHeader={({ section: { title } }) => (
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <SongCard
            item={item}
            onDelete={promptDelete}
            onPlay={togglePlay}
            isPlaying={playingId === item.id}
            isDeleting={deletingId === item.id}
            playProgress={playingId === item.id ? playProgress : 0}
          />
        )}
        ListEmptyComponent={<EmptyState />}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchRecordings(); }}
            tintColor="#D4AF37"
          />
        }
      />

      {/* Custom Delete Dialog */}
      <MaestroDialog
        visible={dialog.visible}
        title="Delete Recording"
        message={`"${dialog.item?.project_name ?? 'This song'}" will be permanently removed from your library and cloud storage.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDialog({ visible: false, item: null })}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B12' },
  center: { flex: 1, backgroundColor: '#0B0B12', alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 58, paddingBottom: 18, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(212,175,55,0.12)',
  },
  headerTitle: { color: '#D4AF37', fontSize: 28, fontWeight: '800', letterSpacing: 0.5 },
  headerSub: { color: 'rgba(212,175,55,0.45)', fontSize: 12, marginTop: 3 },
  sectionHeader: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10,
    backgroundColor: '#0B0B12',
  },
  sectionTitle: {
    color: '#D4AF37', fontSize: 16, fontWeight: '700', letterSpacing: 0.5,
  },
});
