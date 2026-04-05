import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, ActivityIndicator, Dimensions, Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../services/supabase';

const { width } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────
interface Arrangement {
  id: string;          // e.g. "A","B","C","D","E","F"
  label: string;       // "Output A"
  audioUrl?: string;   // from backend (optional until FluidSynth live)
  metadata: {
    tempo: number;
    feel: string;      // internal tag — NOT shown to user
    instruments: string[];
    chords: string[];
  };
}

interface RouteParams {
  recordingId: string;
  recordingUrl: string;
  analysisResult: {
    key: string;
    bpm: number;
    arrangements: Arrangement[];
  };
  projectName: string;
}

// ─── Custom Dialog (reused) ───────────────────────────────────────────────────
interface DialogProps {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  loading?: boolean;
}

const MaestroDialog: React.FC<DialogProps> = ({
  visible, title, message, onConfirm, onCancel, confirmLabel = 'Confirm', loading = false,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;
  // Drums bounce animation
  const drumBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 80 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.88, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(drumBounce, { toValue: -8, duration: 200, useNativeDriver: true }),
          Animated.timing(drumBounce, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(drumBounce, { toValue: -5, duration: 160, useNativeDriver: true }),
          Animated.timing(drumBounce, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.delay(300),
        ])
      ).start();
    } else {
      drumBounce.setValue(0);
    }
  }, [loading]);

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, dlg.backdrop, { opacity }]}>
      <Animated.View style={[dlg.card, { transform: [{ scale }] }]}>
        <LinearGradient colors={['#D4AF37', '#B8962E']} style={dlg.topBar} />

        {loading ? (
          <View style={dlg.savingBody}>
            <Animated.Text
              style={[dlg.drumsEmoji, { transform: [{ translateY: drumBounce }] }]}
            >
              🥁
            </Animated.Text>
            <Text style={dlg.savingTitle}>Saving to My Songs</Text>
            <Text style={dlg.savingMsg}>Your track is being added to your library...</Text>
            <ActivityIndicator color="#D4AF37" style={{ marginTop: 16 }} />
          </View>
        ) : (
          <>
            <Text style={dlg.title}>{title}</Text>
            <Text style={dlg.message}>{message}</Text>
            <View style={dlg.btnRow}>
              <TouchableOpacity style={dlg.cancelBtn} onPress={onCancel}>
                <Text style={dlg.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={dlg.confirmBtn} onPress={onConfirm}>
                <LinearGradient
                  colors={['#D4AF37', '#B8962E']}
                  style={dlg.confirmGrad}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  <Text style={dlg.confirmText}>{confirmLabel}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </>
        )}
      </Animated.View>
    </Animated.View>
  );
};

const dlg = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center', alignItems: 'center', zIndex: 999,
  },
  card: {
    width: width * 0.84,
    backgroundColor: '#13131E',
    borderRadius: 22, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)',
  },
  topBar: { height: 3 },
  savingBody: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  drumsEmoji: { fontSize: 52, marginBottom: 14 },
  savingTitle: { color: '#F0E6C8', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  savingMsg: { color: 'rgba(240,230,200,0.5)', fontSize: 13, textAlign: 'center' },
  title: {
    color: '#F0E6C8', fontSize: 17, fontWeight: '700',
    paddingHorizontal: 22, paddingTop: 20, paddingBottom: 8,
  },
  message: {
    color: 'rgba(240,230,200,0.55)', fontSize: 13.5, lineHeight: 20,
    paddingHorizontal: 22, paddingBottom: 24,
  },
  btnRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  cancelBtn: { flex: 1, paddingVertical: 16, alignItems: 'center', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.06)' },
  cancelText: { color: 'rgba(240,230,200,0.4)', fontSize: 14, fontWeight: '600' },
  confirmBtn: { flex: 1, overflow: 'hidden' },
  confirmGrad: { paddingVertical: 16, alignItems: 'center' },
  confirmText: { color: '#0B0B12', fontSize: 14, fontWeight: '700' },
});

// ─── Waveform Visual ──────────────────────────────────────────────────────────
const MiniWaveform: React.FC<{ active: boolean; progress: number; color: string }> = ({
  active, progress, color,
}) => {
  const heights = [8, 14, 20, 16, 10, 18, 24, 20, 12, 16, 22, 18, 10, 14, 20, 16, 8, 12, 18, 14];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 30 }}>
      {heights.map((h, i) => {
        const filled = active && (i / heights.length) < progress;
        return (
          <Animated.View
            key={i}
            style={{
              width: (width * 0.72) / heights.length - 2,
              height: active ? h : 4,
              borderRadius: 2,
              backgroundColor: filled ? color : 'rgba(255,255,255,0.12)',
            }}
          />
        );
      })}
    </View>
  );
};

// ─── Arrangement Card ─────────────────────────────────────────────────────────
interface ArrangementCardProps {
  arrangement: Arrangement;
  isPlaying: boolean;
  progress: number;
  isSelected: boolean;
  onPlay: () => void;
  onSelect: () => void;
  index: number;
}

const ACCENT_COLORS = [
  '#D4AF37', '#00D9C0', '#A78BFA', '#FF3B5C',
  '#60A5FA', '#34D399',
];

const ArrangementCard: React.FC<ArrangementCardProps> = ({
  arrangement, isPlaying, progress, isSelected, onPlay, onSelect, index,
}) => {
  const accent = ACCENT_COLORS[index % ACCENT_COLORS.length];
  const selectScale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSelected) {
      Animated.spring(selectScale, { toValue: 1.02, useNativeDriver: true, tension: 120 }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      Animated.spring(selectScale, { toValue: 1, useNativeDriver: true, tension: 120 }).start();
      glow.stopAnimation();
      glow.setValue(0);
    }
  }, [isSelected]);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.15] });

  return (
    <Animated.View style={[rc.wrap, isSelected && { borderColor: accent + '55' }, { transform: [{ scale: selectScale }] }]}>
      {/* Glow overlay when selected */}
      {isSelected && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: accent, opacity: glowOpacity, borderRadius: 18 }]} />
      )}

      {/* Left accent bar */}
      <View style={[rc.accentBar, { backgroundColor: accent }]} />

      <View style={rc.inner}>
        {/* Header row */}
        <View style={rc.headerRow}>
          <View>
            <Text style={[rc.label, isSelected && { color: accent }]}>
              {arrangement.label}
            </Text>
            {isSelected && (
              <Text style={[rc.selectedTag, { color: accent }]}>✦ Selected</Text>
            )}
          </View>

          {/* Play button */}
          <TouchableOpacity onPress={onPlay} activeOpacity={0.75} style={rc.playBtn}>
            <LinearGradient
              colors={isPlaying ? [accent, accent + 'AA'] : ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)']}
              style={rc.playGrad}
            >
              <Text style={[rc.playIcon, { color: isPlaying ? '#0B0B12' : accent }]}>
                {isPlaying ? '⏸' : '▶'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Waveform */}
        <View style={{ marginVertical: 10 }}>
          <MiniWaveform active={isPlaying} progress={progress} color={accent} />
        </View>

        {/* Instrument chips */}
        <View style={rc.chips}>
          {(arrangement.metadata?.instruments || []).slice(0, 4).map((inst, i) => (
            <View key={i} style={[rc.chip, { borderColor: accent + '33', backgroundColor: accent + '11' }]}>
              <Text style={[rc.chipTxt, { color: accent }]}>{inst}</Text>
            </View>
          ))}
          <View style={rc.chip}>
            <Text style={rc.chipTxt}>♩ {arrangement.metadata?.tempo ?? 90}</Text>
          </View>
        </View>

        {/* Select button */}
        <TouchableOpacity
          style={[rc.selectBtn, isSelected && { borderColor: accent, backgroundColor: accent + '18' }]}
          onPress={onSelect}
          activeOpacity={0.8}
        >
          <Text style={[rc.selectTxt, isSelected && { color: accent }]}>
            {isSelected ? '✓ This Version' : 'Use This Version'}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const rc = StyleSheet.create({
  wrap: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: '#111120',
    borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row', overflow: 'hidden',
  },
  accentBar: { width: 3 },
  inner: { flex: 1, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  label: { color: '#F0E6C8', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  selectedTag: { fontSize: 10, fontWeight: '700', marginTop: 2, letterSpacing: 1 },
  playBtn: { borderRadius: 22, overflow: 'hidden' },
  playGrad: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  playIcon: { fontSize: 15, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: {
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipTxt: { fontSize: 10, fontWeight: '600', color: 'rgba(240,230,200,0.55)' },
  selectBtn: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10, paddingVertical: 9, alignItems: 'center',
  },
  selectTxt: { color: 'rgba(240,230,200,0.5)', fontSize: 12, fontWeight: '700' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export function BandResultsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params as RouteParams;

  const { recordingId, recordingUrl, analysisResult, projectName } = params || {};
  const arrangements: Arrangement[] = analysisResult?.arrangements ?? generateFallbackArrangements();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  const [dialog, setDialog] = useState<{ visible: boolean; loading: boolean }>({
    visible: false, loading: false,
  });

  // ── Playback ──
  const stopPlayback = useCallback(async () => {
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
    } catch {}
    setPlayingId(null);
    setPlayProgress(0);
  }, []);

  const togglePlay = useCallback(async (arr: Arrangement) => {
    if (playingId === arr.id) { await stopPlayback(); return; }
    await stopPlayback();

    let url = arr.audioUrl ?? recordingUrl; // fallback to raw vocal
    
    // Fallback: If arrangement comes from backend with audio_base64 but no audioUrl
    // (since our previous backend returned audio_base64 in the response)
    const backendArr = (analysisResult as any)?.arrangements?.find((a: any) => a.id === arr.id);
    if (!url && backendArr?.audio_base64) {
      url = `data:audio/wav;base64,${backendArr.audio_base64}`;
    }

    if (!url) return;

    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        (status: any) => {
          if (status.isLoaded) {
            if (status.didJustFinish) {
              setPlayingId(null); setPlayProgress(0); soundRef.current = null;
            } else if (status.durationMillis && status.positionMillis) {
              setPlayProgress(status.positionMillis / status.durationMillis);
            }
          }
        }
      );
      soundRef.current = sound;
      setPlayingId(arr.id);
    } catch (err) {
      console.error('[Arrangements] Play error:', err);
    }
  }, [playingId, recordingUrl, stopPlayback]);

  useEffect(() => () => { soundRef.current?.unloadAsync(); }, []);

  // ── Save ──
  const handleSave = () => {
    if (!selectedId) return;
    setDialog({ visible: true, loading: false });
  };

  const confirmSave = async () => {
    const selected = arrangements.find(a => a.id === selectedId);
    if (!selected) return;

    setDialog({ visible: true, loading: true });

    try {
      const { error } = await supabase.from('recordings').upsert({
        id: recordingId || 'demo-id-' + Date.now(),
        project_name: projectName || 'My Song',
        file_url: recordingUrl || 'demo-url',
        bpm: selected.metadata?.tempo ?? analysisResult?.bpm ?? 90,
        key: analysisResult?.key ?? 'C',
        instruments: selected.metadata?.instruments ?? [],
        user_id: 'anonymous', // Change if auth is implemented
      });

      if (error) throw error;

      // Brief pause so drums animation plays
      await new Promise(r => setTimeout(r, 1800));

      setDialog({ visible: false, loading: false });
      navigation.navigate('My Songs');
    } catch (err: any) {
      console.error('[Arrangements] Save error:', err.message);
      setDialog({ visible: false, loading: false });
    }
  };

  return (
    <View style={s.root}>
      {/* Header */}
      <LinearGradient colors={['#0B0B12', '#0F0F1A']} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Choose Your Version</Text>
          <Text style={s.headerSub}>
            {analysisResult?.key && `Key of ${analysisResult.key}`}
            {analysisResult?.bpm && `  ·  ${analysisResult.bpm} BPM`}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: 120 }}>
        {arrangements.map((arr, i) => (
          <ArrangementCard
            key={arr.id}
            arrangement={arr}
            index={i}
            isPlaying={playingId === arr.id}
            progress={playingId === arr.id ? playProgress : 0}
            isSelected={selectedId === arr.id}
            onPlay={() => togglePlay(arr)}
            onSelect={() => setSelectedId(selectedId === arr.id ? null : arr.id)}
          />
        ))}
      </ScrollView>

      {/* Save CTA */}
      {selectedId && (
        <Animated.View style={s.saveBar}>
          <LinearGradient
            colors={['rgba(11,11,18,0)', '#0B0B12', '#0B0B12']}
            style={StyleSheet.absoluteFillObject}
          />
          <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <LinearGradient
              colors={['#D4AF37', '#B8962E']}
              style={s.saveBtnGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Text style={s.saveBtnTxt}>Save to My Songs</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Dialog */}
      <MaestroDialog
        visible={dialog.visible}
        loading={dialog.loading}
        title="Save This Version?"
        message={`The selected output will be saved to your library.`}
        confirmLabel="Save"
        onConfirm={confirmSave}
        onCancel={() => setDialog({ visible: false, loading: false })}
      />
    </View>
  );
}

// ─── Fallback if backend doesn't return arrangements ─────────────────────────
function generateFallbackArrangements(): Arrangement[] {
  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  const instrumentSets = [
    ['Piano', 'Bass', 'Drums'],
    ['Guitar', 'Bass', 'Drums'],
    ['Piano', 'Guitar', 'Strings', 'Drums'],
    ['Synth', 'Bass', 'Drums'],
    ['Piano', 'Strings'],
    ['Guitar', 'Piano', 'Bass', 'Percussion'],
  ];
  const tempos = [78, 96, 84, 108, 72, 90];

  return labels.map((l, i) => ({
    id: l,
    label: `Output ${l}`,
    metadata: {
      tempo: tempos[i],
      feel: 'varied',
      instruments: instrumentSets[i],
      chords: ['C', 'Am', 'F', 'G'],
    },
  }));
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B12' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 58 : 40,
    paddingBottom: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(212,175,55,0.1)',
  },
  backBtn: { padding: 4 },
  backArrow: { color: '#D4AF37', fontSize: 24, fontWeight: '300' },
  headerTitle: { color: '#F0E6C8', fontSize: 20, fontWeight: '800' },
  headerSub: { color: 'rgba(212,175,55,0.5)', fontSize: 12, marginTop: 2 },
  saveBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 20, paddingHorizontal: 20,
  },
  saveBtn: { borderRadius: 16, overflow: 'hidden' },
  saveBtnGrad: { paddingVertical: 17, alignItems: 'center' },
  saveBtnTxt: { color: '#0B0B12', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});
