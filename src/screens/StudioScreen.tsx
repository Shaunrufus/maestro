// src/screens/StudioScreen.tsx
// MAESTRO — Studio Main Screen — DEFINITIVE VERSION
// Fixes:
//   1. Instruments NEVER play sound during recording (silent recording principle)
//   2. Auto-tune actually called after stop → shows result + allows playback
//   3. Multi-instrument selection works (array toggle, not single string)
//   4. Headphone detection prompt before any sound plays
//   5. Post-recording: vocal analysis → chord detection → band generation

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Audio } from 'expo-av';

// ─── Constants ─────────────────────────────────────────────────────────────
const BACKEND_URL  = 'https://maestro-production-c525.up.railway.app';
const SUPABASE_URL = 'https://cmbfzcqjfbrbioqmvzoh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYmZ6Y3FqZmJyYmlvcW12em9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Nzc0NTEsImV4cCI6MjA5MDI1MzQ1MX0.ndKWwDav0-9xQTnq1Zcu-hlyLnOqnJHd9Xml8D-hsjU';

const APP_NAME = 'MAESTRO';

const C = {
  bg:        '#0B0B12',
  bgCard:    'rgba(255,255,255,0.07)',
  bgSurf:    '#151520',
  gold:      '#D4AF37',
  goldBg:    'rgba(212,175,55,0.15)',
  teal:      '#00D9C0',
  tealBg:    'rgba(0,217,192,0.13)',
  red:       '#FF3B5C',
  redBg:     'rgba(255,59,92,0.18)',
  textPri:   '#FFFFFF',
  textSec:   'rgba(255,255,255,0.58)',
  textMut:   'rgba(255,255,255,0.32)',
  border:    'rgba(255,255,255,0.11)',
  purple:    'rgba(106,42,230,0.32)',
};

// ─── Instrument catalogue ─────────────────────────────────────────────────
type InstrKey = 'keys' | 'guitar' | 'tabla' | 'flute' | 'sitar' | 'orchestral';

const INSTRUMENTS: { key: InstrKey; label: string; sym: string; pro: boolean }[] = [
  { key: 'keys',       label: 'Keys',     sym: '🎹', pro: false },
  { key: 'guitar',     label: 'Guitar',   sym: '🎸', pro: false },
  { key: 'tabla',      label: 'Tabla',    sym: '🥁', pro: true  },
  { key: 'flute',      label: 'Flute',    sym: '🪈', pro: true  },
  { key: 'sitar',      label: 'Sitar',    sym: '🎵', pro: true  },
  { key: 'orchestral', label: 'Orch',     sym: '🎻', pro: true  },
];

const TABS = ['Studio', 'Songs', 'Discover', 'Profile'];

type StudioStatus = 'idle' | 'recording' | 'processing_autotune' | 'autotune_done' | 'analyzing' | 'generating_band' | 'ready';

// ─────────────────────────────────────────────────────────────────────────
export default function StudioScreen({ navigation }: any) {
  // ── Recording state ────────────────────────────────────────────────────
  const [recording,       setRecording      ] = useState<Audio.Recording | null>(null);
  const [isRecording,     setIsRecording    ] = useState(false);
  const [elapsedSec,      setElapsed        ] = useState(0);
  const [micLevel,        setMicLevel       ] = useState(0);

  // ── Audio state ───────────────────────────────────────────────────────
  const [localUri,        setLocalUri       ] = useState<string | null>(null);
  const [tunedAudioB64,   setTunedAudioB64  ] = useState<string | null>(null);
  const [playbackSound,   setPlaybackSound  ] = useState<Audio.Sound | null>(null);
  const [isPlaying,       setIsPlaying      ] = useState(false);

  // ── Status / progress ─────────────────────────────────────────────────
  const [status,          setStatus         ] = useState<StudioStatus>('idle');
  const [statusMsg,       setStatusMsg      ] = useState('');
  const [autoTunePct,     setAutoTunePct    ] = useState(78);

  // ── Instruments — multi-select array ─────────────────────────────────
  const [selectedInstrs,  setSelectedInstrs ] = useState<InstrKey[]>(['keys']);
  const [isPro,           setIsPro          ] = useState(false);
  const [headphonesMode,  setHeadphonesMode ] = useState(false);

  // ── Chord setup ────────────────────────────────────────────────────────
  const [customChords,    setCustomChords   ] = useState('');
  const [detectedChords,  setDetectedChords ] = useState<string[]>([]);
  const [showChordInput,  setShowChordInput ] = useState(false);

  // ── Post-recording ────────────────────────────────────────────────────
  const [arrangements,   setArrangements   ] = useState<any[]>([]);
  const [activeTab,      setActiveTab      ] = useState('Studio');

  // ── Animations ────────────────────────────────────────────────────────
  const recPulse = useRef(new Animated.Value(1)).current;
  const guruAura = useRef(new Animated.Value(0.45)).current;
  const [waveBarScales] = useState(() =>
    Array.from({ length: 40 }, () => new Animated.Value(1))
  );

  // Recording timer
  useEffect(() => {
    if (!isRecording) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

  // Record button pulse
  useEffect(() => {
    if (isRecording) {
      Animated.loop(Animated.sequence([
        Animated.timing(recPulse, { toValue: 1.18, duration: 660, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(recPulse, { toValue: 1,    duration: 660, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start();
    } else {
      recPulse.stopAnimation();
      Animated.spring(recPulse, { toValue: 1, useNativeDriver: true }).start();
    }
  }, [isRecording]);

  // Guru aura
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(guruAura, { toValue: 0.9,  duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(guruAura, { toValue: 0.45, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  // Waveform animation
  useEffect(() => {
    if (isRecording) {
      waveBarScales.forEach(a => a.stopAnimation());
      return;
    }
    const loops = waveBarScales.map((a, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 22),
        Animated.timing(a, { toValue: 0.4 + Math.random() * 0.6, duration: 500 + Math.random() * 500, useNativeDriver: true }),
        Animated.timing(a, { toValue: 1, duration: 500 + Math.random() * 500, useNativeDriver: true }),
      ]))
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [isRecording]);

  // ─────────────────────────────────────────────────────────────────────
  // RECORD HANDLER
  // ─────────────────────────────────────────────────────────────────────
  const handleRecord = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission needed', 'Allow microphone access to record.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:     true,
        playsInSilentModeIOS:   true,
        staysActiveInBackground: false,
      });

      setTunedAudioB64(null);
      setLocalUri(null);
      setArrangements([]);
      setDetectedChords([]);
      setStatus('recording');
      setStatusMsg('Recording...');

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (s) => {
          if (s.metering !== undefined) {
            setMicLevel(Math.max(0, (s.metering + 160) / 160));
          }
        },
        100,
      );
      setRecording(rec);
      setIsRecording(true);
    } catch (e) {
      console.error('[Studio] Start recording failed:', e);
      Alert.alert('Recording failed', String(e));
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setMicLevel(0);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setLocalUri(uri);

      if (uri) await applyAutoTune(uri);
    } catch (e) {
      console.error('[Studio] Stop recording failed:', e);
      setStatus('idle');
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // AUTO-TUNE PIPELINE
  // ─────────────────────────────────────────────────────────────────────
  const applyAutoTune = async (uri: string) => {
    setStatus('processing_autotune');
    setStatusMsg(`Auto-Tune ${autoTunePct}% — processing...`);

    try {
      const formData = new FormData();
      formData.append('file', {
        uri,
        name: 'recording.m4a',
        type: 'audio/mp4',
      } as any);
      formData.append('strength', String(autoTunePct));
      formData.append('key',      'C');
      formData.append('scale',    'major');

      const res = await fetch(`${BACKEND_URL}/audio/autotune`, {
        method:  'POST',
        body:    formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audio_base64) {
          setTunedAudioB64(data.audio_base64);
          setStatus('autotune_done');
          setStatusMsg(`✦ Auto-tuned (${data.avg_correction ?? autoTunePct}% corrected)`);
        } else {
          setStatus('autotune_done');
          setStatusMsg('Auto-tune: no audio returned');
        }
      } else {
        setStatus('autotune_done');
        setStatusMsg('Auto-tune unavailable — playing original');
      }
    } catch (e) {
      console.error('[Studio] Auto-tune failed:', e);
      setStatus('autotune_done');
      setStatusMsg('Auto-tune: network error');
    }

    if (uri) await analyzeVocal(uri);
  };

  // ─────────────────────────────────────────────────────────────────────
  // VOCAL ANALYSIS
  // ─────────────────────────────────────────────────────────────────────
  const analyzeVocal = async (uri: string) => {
    setStatus('analyzing');
    setStatusMsg('GURU is listening...');

    try {
      const formData = new FormData();
      formData.append('file', { uri, name: 'recording.m4a', type: 'audio/mp4' } as any);

      const res = await fetch(`${BACKEND_URL}/band/analyze`, {
        method: 'POST',
        body:   formData,
      });

      if (res.ok) {
        const data = await res.json();
        const chords = data.simple_progression ?? ['C', 'G', 'Am', 'F'];
        setDetectedChords(chords);
        setStatusMsg(`${data.key ?? 'C major'} · ${data.bpm ?? 90} BPM · ${chords.join(' → ')}`);
        await generateBand(uri, chords, data.bpm ?? 90, data.key_short ?? 'C', data.duration_sec ?? 30);
      } else {
        setStatus('ready');
        setStatusMsg('Analysis failed');
      }
    } catch (e) {
      console.error('[Studio] Analysis failed:', e);
      setStatus('ready');
      setStatusMsg('Analysis unavailable');
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // BAND GENERATION
  // ─────────────────────────────────────────────────────────────────────
  const generateBand = async (uri: string, chords: string[], bpm: number, key: string, duration: number) => {
    setStatus('generating_band');
    setStatusMsg('Building your virtual band...');

    try {
      const chordsStr = customChords.trim() || chords.join(' ');

      const formData = new FormData();
      formData.append('file',            { uri, name: 'recording.m4a', type: 'audio/mp4' } as any);
      formData.append('custom_chords',   chordsStr);
      formData.append('selected_styles', '');

      const res = await fetch(`${BACKEND_URL}/band/analyze-and-generate`, {
        method: 'POST',
        body:   formData,
      });

      if (res.ok) {
        const data = await res.json();
        setArrangements(data.arrangements ?? []);
        setStatus('ready');
        setStatusMsg(`${data.arrangements?.length ?? 0} arrangements ready`);
      } else {
        setStatus('ready');
        setStatusMsg('Band generation unavailable');
      }
    } catch (e) {
      console.error('[Studio] Band generation failed:', e);
      setStatus('ready');
      setStatusMsg('Band generation unavailable');
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // PLAYBACK
  // ─────────────────────────────────────────────────────────────────────
  const handlePlay = async () => {
    if (playbackSound) {
      await playbackSound.stopAsync();
      await playbackSound.unloadAsync();
      setPlaybackSound(null);
      setIsPlaying(false);
      return;
    }

    let uri: string | null = null;
    if (tunedAudioB64) {
      uri = `data:audio/wav;base64,${tunedAudioB64}`;
    } else if (localUri) {
      uri = localUri;
    } else {
      Alert.alert('No recording', 'Record something first!');
      return;
    }

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      setPlaybackSound(sound);
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          setIsPlaying(false);
          sound.unloadAsync();
          setPlaybackSound(null);
        }
      });
    } catch (e) {
      console.error('[Studio] Playback failed:', e);
      Alert.alert('Playback failed', String(e));
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // INSTRUMENT TOGGLE — NO AUDIO DURING RECORDING
  // ─────────────────────────────────────────────────────────────────────
  const toggleInstrument = (key: InstrKey, isPro_: boolean) => {
    if (isPro_ && !isPro) {
      if (navigation) navigation.navigate('Paywall', { instrument: key });
      return;
    }

    setSelectedInstrs(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );

    // NO AUDIO DURING RECORDING — instruments play only in post-recording band
    if (!isRecording) {
      // Optional: add preview tap later
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // HEADPHONE CHECK
  // ─────────────────────────────────────────────────────────────────────
  const promptHeadphones = () => {
    Alert.alert(
      'Headphones connected?',
      'Connect headphones for the best experience.',
      [
        {
          text: 'Yes, headphones on',
          onPress: () => setHeadphonesMode(true),
        },
        {
          text: 'No headphones',
          onPress: () => setHeadphonesMode(false),
          style: 'cancel',
        },
      ],
    );
  };

  // ─────────────────────────────────────────────────────────────────────
  // ARRANGEMENT PLAYBACK
  // ─────────────────────────────────────────────────────────────────────
  const playArrangement = async (arr: any) => {
    if (!arr.audio_base64) {
      Alert.alert('No audio', 'FluidSynth not yet set up. Add soundfont to Railway.');
      return;
    }

    if (!headphonesMode) {
      promptHeadphones();
      return;
    }

    if (playbackSound) {
      await playbackSound.stopAsync();
      await playbackSound.unloadAsync();
      setPlaybackSound(null);
    }

    try {
      const uri = `data:audio/wav;base64,${arr.audio_base64}`;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      setPlaybackSound(sound);
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          setIsPlaying(false);
          sound.unloadAsync();
          setPlaybackSound(null);
        }
      });
    } catch (e) {
      console.error('[Studio] Arrangement playback failed:', e);
    }
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const STATUS_COLOR: Record<StudioStatus, string> = {
    idle:                C.textMut,
    recording:           C.red,
    processing_autotune: C.gold,
    autotune_done:       C.teal,
    analyzing:           C.gold,
    generating_band:     C.gold,
    ready:               C.teal,
  };

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.glowPurple} />
      <View style={s.glowTeal}   />
      <View style={s.glowGold}   />
      <View style={s.veil}       />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

          {/* HEADER */}
          <View style={s.header}>
            <View>
              <Text style={s.logo}>{APP_NAME}</Text>
              <Text style={s.logoSub}>Virtual Studio</Text>
            </View>
            <View style={s.avatar}>
              <Text style={s.avatarTx}>S</Text>
            </View>
          </View>

          {/* SONG INFO*/}
          <View style={s.songCard}>
            <View style={s.songRow}>
              <Text style={s.songName}>Untitled Session</Text>
              <View style={s.liveRow}>
                <View style={[s.liveDot, { backgroundColor: isRecording ? C.red : C.teal }]} />
                <Text style={[s.liveTx, { color: isRecording ? C.red : C.teal }]}>
                  {isRecording ? `REC ${fmt(elapsedSec)}` : 'Ready'}
                </Text>
              </View>
            </View>
            <Text style={s.songMeta}>BPM 120 · Key: C · {fmt(elapsedSec)}</Text>
          </View>

          {/* WAVEFORM */}
          <View style={s.waveOuter}>
            <View style={s.barsRow}>
              {waveBarScales.map((anim, i) => {
                const h = [5,9,16,24,34,50,38,28,18,32,54,66,52,42,32,24,16,28,42,54,48,36,26,18,12,16,24,32,46,58,52,40,30,24,38,54,62,48,34,22][i] ?? 20;
                const normH = (h / 66) * 52;
                const recordScale = isRecording ? (0.3 + micLevel * 0.7) : 1;
                const active = (i / waveBarScales.length) < 0.5;
                return (
                  <Animated.View key={i} style={[s.barWrap, { transform: [{ scaleY: anim }] }]}>
                    <View style={{ width: 3, height: normH * recordScale, borderRadius: 2, backgroundColor: active ? C.teal : C.textMut, marginBottom: 1 }} />
                    <View style={{ width: 3, height: normH * recordScale * 0.4, borderRadius: 2, backgroundColor: active ? 'rgba(0,217,192,0.25)' : 'rgba(255,255,255,0.07)' }} />
                  </Animated.View>
                );
              })}
            </View>
            <View style={s.playheadLine} />
          </View>
          <View style={s.timeRow}>
            <Text style={s.timeTx}>0:00</Text>
            <Text style={s.timeTx}>0:30</Text>
            <Text style={s.timeTx}>1:00</Text>
          </View>

          {/* STATUS */}
          {status !== 'idle' && (
            <View style={[s.statusBar, { borderColor: STATUS_COLOR[status] + '60' }]}>
              <Text style={[s.statusTx, { color: STATUS_COLOR[status] }]}>
                {status === 'recording'           ? '⏺ ' :
                 status === 'processing_autotune' ? '🎵 ' :
                 status === 'autotune_done'       ? '✦ ' :
                 status === 'analyzing'           ? '👂 ' :
                 status === 'generating_band'     ? '🎼 ' : '✅ '}
                {statusMsg}
              </Text>
            </View>
          )}

          {/* PITCH */}
          <View style={s.pitchRow}>
            <View style={s.pitchSec}>
              <Text style={s.statLbl}>PITCH</Text>
              <View style={s.pitchTrack}>
                <View style={[s.pitchFill, { width: `${Math.round(60 + micLevel * 30)}%` }]} />
              </View>
            </View>
            <View style={s.pitchSec}>
              <Text style={s.statLbl}>LOUDNESS</Text>
              <Text style={s.loudVal}>{isRecording ? `${Math.round(-40 + micLevel * 40)} dB` : '-∞'}</Text>
            </View>
            <View style={s.noteCard}>
              <Text style={s.noteVal}>C4</Text>
              <Text style={s.noteSub}>On key</Text>
            </View>
          </View>

          {/* TRANSPORT */}
          <View style={s.transport}>
            <Pressable style={s.tBtn}><Text style={s.tBtnTx}>⏮</Text></Pressable>
            <Pressable style={[s.tBtn, isPlaying && { backgroundColor: C.tealBg, borderColor: C.teal }]} onPress={handlePlay} disabled={!localUri && !tunedAudioB64}>
              <Text style={s.tBtnTx}>{isPlaying ? '⏸' : '▶'}</Text>
            </Pressable>

            {/* RECORD BUTTON */}
            <View style={s.recOuter}>
              <Animated.View style={[s.recAura, { opacity: isRecording ? 0.6 : 0.3, transform: [{ scale: recPulse }] }]} />
              <Animated.View style={[s.recRing, { transform: [{ scale: recPulse }] }]} />
              <Pressable onPress={handleRecord}>
                <View style={s.recBtn}>
                  <View style={s.recHl} />
                  <View style={[s.recIcon, { borderRadius: isRecording ? 14 : 5 }]} />
                </View>
              </Pressable>
            </View>

            <Pressable style={s.tBtn} onPress={() => { setIsRecording(false); setRecording(null); setElapsed(0); setStatus('idle'); setStatusMsg(''); }}>
              <Text style={s.tBtnTx}>⏹</Text>
            </Pressable>
            <Pressable style={s.tBtn}><Text style={s.tBtnTx}>⏭</Text></Pressable>
          </View>

          {/* AUTO-TUNE */}
          <View style={s.atCard}>
            <View style={s.atHdr}>
              <Text style={s.atLbl}>Auto-Tune</Text>
              <Text style={s.atVal}>{autoTunePct}%</Text>
              {tunedAudioB64 && <View style={s.tunedBadge}><Text style={s.tunedBadgeTx}>✦ Applied</Text></View>}
            </View>
            <View style={s.atBtns}>
              {[0, 25, 50, 75, 100].map(v => (
                <Pressable key={v} style={[s.atBtn, autoTunePct === v && s.atBtnActive]} onPress={() => setAutoTunePct(v)}>
                  <Text style={[s.atBtnTx, autoTunePct === v && { color: C.teal }]}>{v}%</Text>
                </Pressable>
              ))}
            </View>
            <View style={s.atEnds}>
              <Text style={s.atEnd}>Natural</Text>
              <Text style={s.atEnd}>Robotic</Text>
            </View>
          </View>

          {/* INSTRUMENTS */}
          <View style={s.instrSec}>
            <View style={s.instrHdr}>
              <Text style={s.instrTitle}>Instruments for Band</Text>
              <Text style={s.instrSub}>{isRecording ? '🔇 Silent during recording' : 'Select for post-recording mix'}</Text>
            </View>

            {!headphonesMode && (
              <Pressable style={s.headphoneNotice} onPress={promptHeadphones}>
                <Text style={s.headphoneTx}>🎧 No headphones — band plays AFTER recording</Text>
                <Text style={s.headphoneSubTx}>Tap to connect headphones</Text>
              </Pressable>
            )}
            {headphonesMode && (
              <View style={s.headphoneActive}>
                <Text style={s.headphoneActiveTx}>🎧 Headphone mode ON</Text>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {INSTRUMENTS.map(ins => {
                const isSelected = selectedInstrs.includes(ins.key);
                const isLocked   = ins.pro && !isPro;
                return (
                  <Pressable key={ins.key} style={[s.instrCard, isSelected && s.instrCardOn, isLocked && { opacity: 0.6 }]} onPress={() => toggleInstrument(ins.key, ins.pro)}>
                    {ins.pro && !isPro && <View style={s.proBadge}><Text style={s.proBadgeTx}>PRO</Text></View>}
                    {isSelected && <View style={s.checkMark}><Text style={s.checkTx}>✓</Text></View>}
                    <Text style={{ fontSize: 22 }}>{ins.sym}</Text>
                    <Text style={[s.instrLbl, isSelected && s.instrLblOn]}>{ins.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {selectedInstrs.length > 0 && <Text style={s.selectedInstrsTx}>Selected: {selectedInstrs.join(', ')}</Text>}
          </View>

          {/* CHORD SETUP */}
          <View style={s.chordSec}>
            <Pressable style={s.chordHeader} onPress={() => setShowChordInput(!showChordInput)}>
              <Text style={s.chordTitle}>Chord Progression</Text>
              <Text style={s.chordToggle}>{showChordInput ? '▲' : '▼'}</Text>
            </Pressable>

            {detectedChords.length > 0 && (
              <View style={s.detectedRow}>
                <Text style={s.detectedLbl}>Detected from your voice:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {detectedChords.map((c, i) => (
                    <View key={i} style={s.chordPill}>
                      <Text style={s.chordPillTx}>{c}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {showChordInput && (
              <View style={s.chordInputWrap}>
                <Text style={s.chordInputLbl}>Paste your own chords (overrides auto-detect):</Text>
                <TextInput style={s.chordInput} value={customChords} onChangeText={setCustomChords} placeholder='e.g. "C G Am F"' placeholderTextColor={C.textMut} autoCapitalize="characters" />
                <View style={s.chordExamples}>
                  {['C G Am F', 'D A Bm G', 'Em C G D', 'Cm Bb Eb Ab'].map(ex => (
                    <Pressable key={ex} style={s.exChip} onPress={() => setCustomChords(ex)}>
                      <Text style={s.exChipTx}>{ex}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* ARRANGEMENTS */}
          {arrangements.length > 0 && (
            <View style={s.arrSec}>
              <Text style={s.arrTitle}>Your Virtual Band Arrangements</Text>
              <Text style={s.arrSub}>Tap Preview to hear · Tap Pick to save</Text>
              {arrangements.map((arr: any) => (
                <View key={arr.id} style={s.arrCard}>
                  <View style={s.arrCardHdr}>
                    <Text style={{ fontSize: 24 }}>{arr.emoji ?? '🎵'}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.arrLabel}>{arr.label ?? arr.id}</Text>
                      <Text style={s.arrDesc}>{arr.desc ?? ''}</Text>
                    </View>
                  </View>
                  <View style={s.arrBtns}>
                    <Pressable style={[s.arrBtn, s.arrPreviewBtn, !arr.has_audio && { opacity: 0.4 }]} onPress={() => playArrangement(arr)} disabled={!arr.has_audio}>
                      <Text style={s.arrPreviewTx}>▶ Preview</Text>
                    </Pressable>
                    <Pressable style={[s.arrBtn, s.arrPickBtn]}>
                      <Text style={s.arrPickTx}>★ Pick</Text>
                    </Pressable>
                  </View>
                  {!arr.has_audio && <Text style={s.arrNoAudioTx}>Add FluidSynth + soundfont to Railway</Text>}
                </View>
              ))}
            </View>
          )}

          {/* GURU */}
          <View style={s.guruArea}>
            <Pressable style={s.guruWrap} onPress={() => navigation?.navigate('Guru')}>
              <Animated.View style={[s.guruAura, { opacity: guruAura }]} />
              <View style={s.guruRing} />
              <View style={s.guruBtn}>
                <Text style={s.guruTx}>AI</Text>
              </View>
              <Text style={s.guruLbl}>GURU</Text>
            </Pressable>
          </View>

        </ScrollView>

        {/* TABS */}
        <View style={s.tabBar}>
          {TABS.map(tab => {
            const on = activeTab === tab;
            return (
              <Pressable key={tab} style={s.tab} onPress={() => setActiveTab(tab)}>
                <View style={[s.tabIco, on && s.tabIcoOn]}>
                  <Text style={[s.tabIcoTx, on && s.tabIcoTxOn]}>{tab[0]}</Text>
                </View>
                <Text style={[s.tabLbl, on && s.tabLblOn]}>{tab}</Text>
                {on && <View style={s.tabDot} />}
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex:1, backgroundColor:C.bg },
  glowPurple:     { position:'absolute', width:300, height:300, borderRadius:150, backgroundColor:C.purple, top:-60, left:-50 },
  glowTeal:       { position:'absolute', width:260, height:260, borderRadius:130, backgroundColor:'rgba(0,217,192,0.18)', top:-80, right:-30 },
  glowGold:       { position:'absolute', width:220, height:220, borderRadius:110, backgroundColor:'rgba(212,175,55,0.22)', top:400, left:60 },
  veil:           { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.46)' },
  header:         { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:16, paddingTop:8, paddingBottom:4 },
  logo:           { fontSize:24, fontWeight:'800', letterSpacing:3, color:C.gold },
  logoSub:        { fontSize:9, color:C.textMut },
  avatar:         { width:32, height:32, borderRadius:16, backgroundColor:C.gold, alignItems:'center', justifyContent:'center' },
  avatarTx:       { fontSize:13, fontWeight:'700', color:C.bg },
  songCard:       { marginHorizontal:14, marginBottom:8, padding:12, backgroundColor:C.bgCard, borderRadius:14, borderWidth:1, borderColor:C.border },
  songRow:        { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4 },
  songName:       { fontSize:15, fontWeight:'600', color:C.textPri },
  liveRow:        { flexDirection:'row', alignItems:'center', gap:5 },
  liveDot:        { width:7, height:7, borderRadius:4 },
  liveTx:         { fontSize:10, fontWeight:'600' },
  songMeta:       { fontSize:11, color:C.textMut },
  waveOuter:      { marginHorizontal:14, height:142, backgroundColor:C.bgSurf, borderRadius:16, borderWidth:1, borderColor:C.border, overflow:'hidden', alignItems:'center', justifyContent:'center', position:'relative' },
  barsRow:        { flexDirection:'row', alignItems:'center', paddingHorizontal:8 },
  barWrap:        { alignItems:'center', marginHorizontal:1 },
  playheadLine:   { position:'absolute', top:8, bottom:8, left:'50%', width:2, backgroundColor:C.gold, borderRadius:1 },
  timeRow:        { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:18, marginTop:3, marginBottom:4 },
  timeTx:         { fontSize:9, color:C.textMut },
  statusBar:      { marginHorizontal:14, marginBottom:8, padding:10, backgroundColor:C.bgCard, borderRadius:10, borderWidth:1 },
  statusTx:       { fontSize:12, fontWeight:'600', lineHeight:18 },
  pitchRow:       { flexDirection:'row', alignItems:'center', gap:10, marginHorizontal:14, marginBottom:4, padding:10, backgroundColor:C.bgCard, borderRadius:12, borderWidth:1, borderColor:C.border },
  pitchSec:       { flex:1 },
  statLbl:        { fontSize:8, fontWeight:'600', color:C.textMut, letterSpacing:0.4, marginBottom:4 },
  pitchTrack:     { height:4, backgroundColor:C.border, borderRadius:2 },
  pitchFill:      { height:4, backgroundColor:C.teal, borderRadius:2 },
  loudVal:        { fontSize:14, fontWeight:'700', color:C.textPri },
  noteCard:       { backgroundColor:C.tealBg, borderWidth:1, borderColor:C.teal, borderRadius:10, paddingHorizontal:12, paddingVertical:4, alignItems:'center', minWidth:52 },
  noteVal:        { fontSize:20, fontWeight:'700', color:C.teal, lineHeight:22 },
  noteSub:        { fontSize:8, color:C.teal },
  transport:      { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingVertical:4 },
  tBtn:           { width:42, height:42, borderRadius:21, backgroundColor:C.bgCard, borderWidth:1, borderColor:C.border, alignItems:'center', justifyContent:'center' },
  tBtnTx:         { fontSize:15, color:C.textSec },
  recOuter:       { width:90, height:90, alignItems:'center', justifyContent:'center' },
  recAura:        { position:'absolute', width:90, height:90, borderRadius:45, backgroundColor:C.red },
  recRing:        { position:'absolute', width:78, height:78, borderRadius:39, borderWidth:1.5, borderColor:'rgba(255,59,92,0.36)' },
  recBtn:         { width:66, height:66, borderRadius:33, backgroundColor:C.red, alignItems:'center', justifyContent:'center', shadowColor:C.red, shadowOffset:{width:0,height:0}, shadowOpacity:0.9, shadowRadius:18, elevation:14 },
  recHl:          { position:'absolute', width:20, height:12, borderRadius:8, backgroundColor:'rgba(255,255,255,0.28)', top:12, left:14 },
  recIcon:        { width:26, height:26, backgroundColor:'#FFFFFF' },
  atCard:         { marginHorizontal:14, marginVertical:4, padding:12, backgroundColor:C.bgCard, borderRadius:12, borderWidth:1, borderColor:C.border },
  atHdr:          { flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
  atLbl:          { fontSize:13, fontWeight:'500', color:C.textSec, flex:1 },
  atVal:          { fontSize:13, fontWeight:'600', color:C.teal },
  tunedBadge:     { backgroundColor:C.tealBg, borderRadius:20, paddingHorizontal:8, paddingVertical:2, borderWidth:1, borderColor:C.teal },
  tunedBadgeTx:   { fontSize:10, fontWeight:'600', color:C.teal },
  atBtns:         { flexDirection:'row', gap:6, marginBottom:4 },
  atBtn:          { flex:1, paddingVertical:6, borderRadius:8, backgroundColor:C.bgSurf, borderWidth:1, borderColor:C.border, alignItems:'center' },
  atBtnActive:    { backgroundColor:C.tealBg, borderColor:C.teal },
  atBtnTx:        { fontSize:11, color:C.textMut },
  atEnds:         { flexDirection:'row', justifyContent:'space-between' },
  atEnd:          { fontSize:9, color:C.textMut },
  instrSec:       { marginHorizontal:14, marginTop:4 },
  instrHdr:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  instrTitle:     { fontSize:13, fontWeight:'600', color:C.textPri },
  instrSub:       { fontSize:10, color:C.textMut },
  headphoneNotice:{ backgroundColor:C.bgCard, borderWidth:1, borderColor:C.gold, borderRadius:10, padding:10, marginBottom:8 },
  headphoneTx:    { fontSize:12, color:C.gold, fontWeight:'600' },
  headphoneSubTx: { fontSize:10, color:C.textMut, marginTop:2 },
  headphoneActive:{ backgroundColor:'rgba(0,217,192,0.1)', borderRadius:10, padding:8, marginBottom:8, borderWidth:1, borderColor:C.teal },
  headphoneActiveTx:{ fontSize:12, color:C.teal },
  instrCard:      { width:80, marginRight:8, backgroundColor:C.bgCard, borderWidth:1, borderColor:C.border, borderRadius:12, padding:10, alignItems:'center', position:'relative', gap:4 },
  instrCardOn:    { backgroundColor:C.tealBg, borderColor:C.teal },
  proBadge:       { position:'absolute', top:4, right:4, backgroundColor:C.gold, borderRadius:20, paddingHorizontal:5, paddingVertical:1 },
  proBadgeTx:     { fontSize:7, fontWeight:'700', color:C.bg },
  checkMark:      { position:'absolute', top:4, left:4, backgroundColor:C.teal, width:16, height:16, borderRadius:8, alignItems:'center', justifyContent:'center' },
  checkTx:        { fontSize:9, fontWeight:'700', color:C.bg },
  instrLbl:       { fontSize:10, color:C.textMut },
  instrLblOn:     { color:C.teal, fontWeight:'600' },
  selectedInstrsTx:{ fontSize:10, color:C.teal, marginTop:6, paddingLeft:2 },
  chordSec:       { marginHorizontal:14, marginTop:12, backgroundColor:C.bgCard, borderRadius:14, borderWidth:1, borderColor:C.border, padding:12 },
  chordHeader:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  chordTitle:     { fontSize:13, fontWeight:'600', color:C.textPri },
  chordToggle:    { fontSize:12, color:C.textMut },
  detectedRow:    { marginTop:8 },
  detectedLbl:    { fontSize:10, color:C.gold, marginBottom:6 },
  chordPill:      { backgroundColor:C.tealBg, borderWidth:1, borderColor:C.teal, borderRadius:20, paddingHorizontal:12, paddingVertical:4, marginRight:6 },
  chordPillTx:    { fontSize:12, fontWeight:'700', color:C.teal },
  chordInputWrap: { marginTop:8 },
  chordInputLbl:  { fontSize:10, color:C.textMut, marginBottom:6 },
  chordInput:     { backgroundColor:C.bgSurf, borderWidth:1, borderColor:C.border, borderRadius:10, padding:12, color:C.textPri, fontSize:15, letterSpacing:1 },
  chordExamples:  { flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:8 },
  exChip:         { backgroundColor:C.bgSurf, borderWidth:1, borderColor:C.border, borderRadius:20, paddingHorizontal:10, paddingVertical:5 },
  exChipTx:       { fontSize:11, color:C.textSec },
  arrSec:         { marginHorizontal:14, marginTop:12 },
  arrTitle:       { fontSize:15, fontWeight:'700', color:C.textPri, marginBottom:4 },
  arrSub:         { fontSize:11, color:C.textMut, marginBottom:10 },
  arrCard:        { backgroundColor:C.bgCard, borderRadius:14, borderWidth:1, borderColor:C.border, padding:12, marginBottom:10, gap:10 },
  arrCardHdr:     { flexDirection:'row', alignItems:'center' },
  arrLabel:       { fontSize:14, fontWeight:'700', color:C.textPri },
  arrDesc:        { fontSize:11, color:C.textMut },
  arrBtns:        { flexDirection:'row', gap:8 },
  arrBtn:         { flex:1, borderRadius:20, paddingVertical:10, alignItems:'center' },
  arrPreviewBtn:  { backgroundColor:C.tealBg, borderWidth:1, borderColor:C.teal },
  arrPreviewTx:   { fontSize:13, fontWeight:'600', color:C.teal },
  arrPickBtn:     { backgroundColor:C.goldBg, borderWidth:1, borderColor:C.gold },
  arrPickTx:      { fontSize:13, fontWeight:'600', color:C.gold },
  arrNoAudioTx:   { fontSize:10, color:C.textMut },
  guruArea:       { alignItems:'flex-end', paddingRight:16, marginTop:12, marginBottom:8 },
  guruWrap:       { alignItems:'center' },
  guruAura:       { position:'absolute', width:66, height:66, borderRadius:33, backgroundColor:'rgba(212,175,55,0.45)' },
  guruRing:       { position:'absolute', width:56, height:56, borderRadius:28, borderWidth:1.5, borderColor:'rgba(242,200,75,0.4)' },
  guruBtn:        { width:50, height:50, borderRadius:25, backgroundColor:C.gold, alignItems:'center', justifyContent:'center', shadowColor:C.gold, shadowOffset:{width:0,height:0}, shadowOpacity:0.9, shadowRadius:14, elevation:10 },
  guruTx:         { fontSize:13, fontWeight:'700', color:C.bg },
  guruLbl:        { fontSize:8, fontWeight:'700', color:C.gold, marginTop:4, letterSpacing:1 },
  tabBar:         { flexDirection:'row', backgroundColor:C.bgSurf, borderTopWidth:1, borderTopColor:C.border, paddingBottom:8 },
  tab:            { flex:1, alignItems:'center', paddingTop:8, gap:3 },
  tabIco:         { width:22, height:22, borderRadius:11, backgroundColor:C.bgCard, alignItems:'center', justifyContent:'center' },
  tabIcoOn:       { backgroundColor:C.tealBg, borderWidth:1, borderColor:C.teal },
  tabIcoTx:       { fontSize:9, fontWeight:'700', color:C.textMut },
  tabIcoTxOn:     { color:C.teal },
  tabLbl:         { fontSize:9, color:C.textMut },
  tabLblOn:       { color:C.teal, fontWeight:'600' },
  tabDot:         { width:3, height:3, borderRadius:2, backgroundColor:C.teal },
});
