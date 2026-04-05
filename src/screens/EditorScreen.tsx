// src/screens/EditorScreen.tsx
// ─────────────────────────────────────────────────────────────────────
// Maestro — Studio Editor (DAW-style)
// Waveform view, trim, EQ, reverb, compression, autotune adjust
// ─────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Dimensions, ActivityIndicator, Alert,
} from 'react-native';
import RNSlider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';

const { width } = Dimensions.get('window');
const BACKEND_URL = 'https://maestro-production-7042.up.railway.app';

interface RouteParams {
  audioUri: string;        // local URI or data: URI
  projectName?: string;
  recordingId?: string;
}

// ─── Waveform Component ──────────────────────────────────────────────────────
const Waveform: React.FC<{
  progress: number;
  trimStart: number;
  trimEnd: number;
  onTrimStartChange: (v: number) => void;
  onTrimEndChange: (v: number) => void;
}> = ({ progress, trimStart, trimEnd, onTrimStartChange, onTrimEndChange }) => {
  // Generate waveform bars (in real app, extract from audio amplitude data)
  const bars = useRef(
    Array.from({ length: 60 }, () => Math.random() * 0.7 + 0.3)
  ).current;

  return (
    <View style={wf.container}>
      <View style={wf.barsRow}>
        {bars.map((h, i) => {
          const pos = i / bars.length;
          const inTrim = pos >= trimStart && pos <= trimEnd;
          const played = pos <= progress;
          return (
            <View
              key={i}
              style={[
                wf.bar,
                {
                  height: h * 60,
                  backgroundColor: !inTrim
                    ? 'rgba(255,255,255,0.06)'
                    : played
                      ? '#D4AF37'
                      : 'rgba(212,175,55,0.3)',
                },
              ]}
            />
          );
        })}
      </View>
      {/* Trim handles */}
      <View style={wf.trimRow}>
        <RNSlider
          style={{ flex: 1, marginRight: 8 }}
          minimumValue={0} maximumValue={1}
          value={trimStart}
          onValueChange={onTrimStartChange}
          minimumTrackTintColor="#D4AF3780"
          maximumTrackTintColor="rgba(255,255,255,0.1)"
          thumbTintColor="#D4AF37"
        />
        <RNSlider
          style={{ flex: 1, marginLeft: 8 }}
          minimumValue={0} maximumValue={1}
          value={trimEnd}
          onValueChange={onTrimEndChange}
          minimumTrackTintColor="rgba(255,255,255,0.1)"
          maximumTrackTintColor="#D4AF3780"
          thumbTintColor="#D4AF37"
        />
      </View>
    </View>
  );
};

const wf = StyleSheet.create({
  container: { marginHorizontal: 20, marginVertical: 16 },
  barsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 80, backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12, paddingHorizontal: 4, overflow: 'hidden',
  },
  bar: { width: (width - 50) / 60 - 1, borderRadius: 1 },
  trimRow: { flexDirection: 'row', marginTop: 8 },
});


// ─── Effect Knob ─────────────────────────────────────────────────────────────
const EffectSlider: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  icon?: string;
}> = ({ label, value, onChange, unit = '%', min = 0, max = 100, icon }) => (
  <View style={fx.row}>
    <Text style={fx.label}>{icon} {label}</Text>
    <RNSlider
      style={fx.slider}
      minimumValue={min} maximumValue={max}
      value={value} onValueChange={onChange}
      minimumTrackTintColor="#D4AF37"
      maximumTrackTintColor="rgba(255,255,255,0.1)"
      thumbTintColor="#D4AF37"
    />
    <Text style={fx.value}>{Math.round(value)}{unit}</Text>
  </View>
);

const fx = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  label: { color: 'rgba(240,230,200,0.6)', fontSize: 13, width: 100, fontWeight: '600' },
  slider: { flex: 1, marginHorizontal: 8 },
  value: { color: '#D4AF37', fontSize: 13, fontWeight: '700', width: 45, textAlign: 'right' },
});


// ─── Main Editor ─────────────────────────────────────────────────────────────
export function EditorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route.params || {}) as RouteParams;

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Trim
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(1);

  // Effects
  const [autotuneStrength, setAutotuneStrength] = useState(75);
  const [reverbAmount, setReverbAmount] = useState(15);
  const [eqBass, setEqBass] = useState(50);
  const [eqMid, setEqMid] = useState(50);
  const [eqTreble, setEqTreble] = useState(50);
  const [compression, setCompression] = useState(30);

  // Toggle playback
  const togglePlay = useCallback(async () => {
    if (playing && soundRef.current) {
      await soundRef.current.pauseAsync();
      setPlaying(false);
      return;
    }

    const uri = params.audioUri;
    if (!uri) { Alert.alert('No audio', 'No recording loaded'); return; }

    try {
      if (soundRef.current) {
        await soundRef.current.playAsync();
      } else {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status: any) => {
            if (status.isLoaded) {
              if (status.didJustFinish) {
                setPlaying(false);
                setProgress(0);
                soundRef.current = null;
              } else if (status.durationMillis && status.positionMillis) {
                setProgress(status.positionMillis / status.durationMillis);
              }
            }
          }
        );
        soundRef.current = sound;
      }
      setPlaying(true);
    } catch (e) {
      console.error('[Editor] Playback error:', e);
    }
  }, [playing, params.audioUri]);

  // Cleanup
  useEffect(() => () => {
    soundRef.current?.unloadAsync();
  }, []);

  // Apply effects (sends to backend)
  const applyEffects = async () => {
    if (!params.audioUri) return;
    setProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', { uri: params.audioUri, name: 'audio.m4a', type: 'audio/mp4' } as any);
      formData.append('autotune_strength', String(autotuneStrength / 100));
      formData.append('reverb', String(reverbAmount / 100));
      formData.append('eq_bass', String(eqBass / 100));
      formData.append('eq_mid', String(eqMid / 100));
      formData.append('eq_treble', String(eqTreble / 100));
      formData.append('compression', String(compression / 100));
      formData.append('trim_start', String(trimStart));
      formData.append('trim_end', String(trimEnd));

      const res = await fetch(`${BACKEND_URL}/audio/process`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        Alert.alert('✓ Processing Complete',
          `Effects applied successfully.\nEngine: ${data.autotune_mode || 'standard'}`);
      } else {
        Alert.alert('Processing Error', 'Server returned an error');
      }
    } catch (e) {
      console.error('[Editor] Process error:', e);
      Alert.alert('Network Error', 'Could not reach the server');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={s.container}>
      <LinearGradient colors={['#0B0B12', '#13131E']} style={StyleSheet.absoluteFillObject} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Editor</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Project name */}
        {params.projectName && (
          <Text style={s.projectLabel}>{params.projectName}</Text>
        )}

        {/* Waveform */}
        <Waveform
          progress={progress}
          trimStart={trimStart}
          trimEnd={trimEnd}
          onTrimStartChange={setTrimStart}
          onTrimEndChange={setTrimEnd}
        />

        {/* Play controls */}
        <View style={s.controls}>
          <TouchableOpacity style={s.playBtn} onPress={togglePlay}>
            <LinearGradient
              colors={playing ? ['#FF3B5C', '#FF1744'] : ['#D4AF37', '#B8962E']}
              style={s.playGrad}
            >
              <Text style={s.playIcon}>{playing ? '⏸' : '▶'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Effects Section */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Effects</Text>

          <EffectSlider
            label="Auto-Tune" icon="🎤" value={autotuneStrength}
            onChange={setAutotuneStrength}
          />
          <EffectSlider
            label="Reverb" icon="🏛️" value={reverbAmount}
            onChange={setReverbAmount}
          />
          <EffectSlider
            label="Compression" icon="📊" value={compression}
            onChange={setCompression}
          />
        </View>

        {/* EQ Section */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Equalizer</Text>
          <EffectSlider label="Bass" icon="🔊" value={eqBass} onChange={setEqBass} />
          <EffectSlider label="Mid" icon="🔉" value={eqMid} onChange={setEqMid} />
          <EffectSlider label="Treble" icon="🔔" value={eqTreble} onChange={setEqTreble} />
        </View>

        {/* Apply button */}
        <TouchableOpacity
          style={s.applyBtn}
          onPress={applyEffects}
          disabled={processing}
        >
          <LinearGradient colors={['#D4AF37', '#B8962E']} style={s.applyGrad}>
            {processing ? (
              <ActivityIndicator color="#0B0B12" />
            ) : (
              <Text style={s.applyTxt}>Apply All Effects</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B12' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  backBtn: { width: 60 },
  backTxt: { color: '#D4AF37', fontSize: 15, fontWeight: '600' },
  title: { color: '#F0E6C8', fontSize: 20, fontWeight: '800' },

  scroll: { paddingBottom: 50 },
  projectLabel: {
    color: 'rgba(240,230,200,0.4)', fontSize: 13, fontWeight: '600',
    textAlign: 'center', marginTop: 4,
  },

  controls: { alignItems: 'center', marginVertical: 12 },
  playBtn: { borderRadius: 30, overflow: 'hidden' },
  playGrad: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { fontSize: 22, color: '#0B0B12' },

  section: {
    marginHorizontal: 20, marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionTitle: {
    color: '#F0E6C8', fontSize: 15, fontWeight: '700',
    marginLeft: 20, marginBottom: 8,
  },

  applyBtn: {
    marginHorizontal: 20, marginTop: 24,
    borderRadius: 14, overflow: 'hidden',
  },
  applyGrad: {
    paddingVertical: 16, alignItems: 'center',
  },
  applyTxt: { color: '#0B0B12', fontSize: 15, fontWeight: '800' },
});

export default EditorScreen;
