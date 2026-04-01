import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Pressable, PanResponder,
  ScrollView, StatusBar, StyleSheet, Text, View, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography, APP_NAME } from '../theme';
import { GlassCard }       from '../components/studio/GlassCard';
import { RecordButton }    from '../components/studio/RecordButton';
import { WaveformDisplay } from '../components/studio/WaveformDisplay';
import { startRecording, stopAndSaveRecording, playRecording, stopPlayback } from '../services/audioService';
import { playInstrumentNote, playInstrumentChord } from '../services/instrumentService';
import { useStudioStore }  from '../store/useStudioStore';
import { bandService }     from '../services/bandService';

// ─── Instrument catalogue ──────────────────────────────────────────────────
type InstrKey = 'keys' | 'guitar' | 'tabla' | 'flute' | 'sitar' | 'orchestral';

const INSTRUMENTS: { key: InstrKey; label: string; sym: string; pro: boolean }[] = [
  { key: 'keys',       label: 'Keys',   sym: 'K', pro: false },
  { key: 'guitar',     label: 'Guitar', sym: 'G', pro: false },
  { key: 'tabla',      label: 'Tabla',  sym: 'T', pro: true  },
  { key: 'flute',      label: 'Flute',  sym: 'F', pro: true  },
  { key: 'sitar',      label: 'Sitar',  sym: 'S', pro: true  },
  { key: 'orchestral', label: 'Orch',   sym: 'O', pro: true  },
];

// ─── Screen ───────────────────────────────────────────────────────────────
export const StudioScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  // ── Zustand global state ────────────────────────────────────────────────
  const { userId, backendUrl, isPro } = useStudioStore();

  // ── Local UI state ──────────────────────────────────────────────────────
  const [isRecording,   setIsRecording   ] = useState(false);
  const [isPlaying,     setIsPlaying     ] = useState(false);
  const [autoTune,      setAutoTune      ] = useState(78);
  const [activeInstrs,  setActiveInstrs  ] = useState<InstrKey[]>(['keys']);
  const [enableBacking, setEnableBacking ] = useState(false);
  const [elapsedSec,    setElapsed       ] = useState(0);
  const [micLevel,      setMicLevel      ] = useState(0);   // 0–1 live metering
  const [lastRecordUrl, setLastUrl       ] = useState<string | null>(null);
  const [isSaving,      setIsSaving      ] = useState(false);
  const [isAnalyzing,   setIsAnalyzing   ] = useState(false);  // Band analysis loading
  const [hasShownHeadphoneAlert, setHasShownHeadphoneAlert] = useState(false);

  // Sequencer ref
  const tickCount = useRef(0);
  const chordSequence = [1.0, 1.4983, 1.6817, 1.3348]; // C - G - Am - F

  // Pan Responder for Auto-Tune Slider
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      onPanResponderMove: (e, gestureState) => {
        // approximate width 280
        const newPct = Math.round(Math.max(0, Math.min(100, (gestureState.moveX - 40) / 280 * 100)));
        setAutoTune(newPct);
      },
      onPanResponderRelease: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    })
  ).current;

  // Sliding drawer
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  // Dynamic Glow
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let toVal = 0; // Idle purple
    if (isRecording) toVal = 1; // Recording red
    else if (menuOpen) toVal = 2; // Menu open gold
    
    Animated.timing(glowAnim, {
      toValue: toVal,
      duration: 800,
      useNativeDriver: false, // Color interpolation requires false
    }).start();
  }, [isRecording, menuOpen]);

  const glowColor = glowAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['rgba(106,42,230,0.3)', 'rgba(255,59,92,0.38)', 'rgba(212,175,55,0.38)']
  });

  const toggleMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(menuAnim, { toValue: menuOpen ? 0 : 1, friction: 6, useNativeDriver: true }).start();
    setMenuOpen(!menuOpen);
  };

  // Recording timer & hardware meter fallback jitter
  useEffect(() => {
    if (!isRecording) {
      tickCount.current = 0;
      return;
    }

    // Accompaniment Tick (every 500ms = 120bpm approx)
    let seq: NodeJS.Timeout | null = null;
    if (enableBacking && activeInstrs.length > 0) {
      seq = setInterval(() => {
        const step = tickCount.current % chordSequence.length;
        playInstrumentChord(activeInstrs, chordSequence[step]);
        tickCount.current += 1;
      }, 500);
    }

    const t = setInterval(() => {
      setElapsed(s => s + 1);
    }, 1000);
    const j = setInterval(() => {
      // Create guaranteed visual activity for pitch bars in case hardware mic sensor is dormant
      setMicLevel(prev => {
        let n = prev + (Math.random() * 0.3 - 0.15);
        if (n < 0.1) n += 0.2;
        if (n > 0.9) n -= 0.2;
        return n;
      });
    }, 250);
    return () => { clearInterval(t); clearInterval(j); if(seq) clearInterval(seq); };
  }, [isRecording, enableBacking, activeInstrs]);

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Guru button breathing aura
  const guruAura = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(guruAura, { toValue: 0.9,  duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(guruAura, { toValue: 0.45, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  // ── Record / Stop ────────────────────────────────────────────────────────
  const handleRecord = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!isRecording) {
      // SHOW HEADPHONE ALERT BEFORE RECORDING STARTS
      if (!hasShownHeadphoneAlert) {
        Alert.alert(
          '🎧 Headphones or Bluetooth?',
          'For best recording quality, connect headphones. Your voice will be recorded cleanly without any backing sounds bleeding in.',
          [
            {
              text: 'No Headphones',
              onPress: () => {
                setHasShownHeadphoneAlert(true);
                startRecordingFlow();
              },
            },
            {
              text: 'Headphones Connected ✓',
              style: 'default',
              onPress: () => {
                setHasShownHeadphoneAlert(true);
                startRecordingFlow();
              },
            },
          ]
        );
        return;
      }

      startRecordingFlow();
    } else {
      // STOP + upload + analyze for band
      await stopRecordingAndAnalyzeBand();
    }
  };

  const startRecordingFlow = async () => {
    setIsPlaying(false);
    setElapsed(0);
    setMicLevel(0);
    const ok = await startRecording((level) => setMicLevel(level));
    if (ok) setIsRecording(true);
  };

  const stopRecordingAndAnalyzeBand = async () => {
    setIsRecording(false);
    setMicLevel(0);
    setIsSaving(true);
    const { cloudUrl, localUri } = await stopAndSaveRecording({
      userId:      userId ?? 'anonymous',
      projectName: 'Untitled Session',
      bpm:         120,
      key:         'C',
      autoTunePct: autoTune,
      instruments: activeInstrs,
    });
    setIsSaving(false);

    if (cloudUrl) {
      setLastUrl(cloudUrl);
      console.log('[Studio] Saved to cloud:', cloudUrl);

      // START BAND ANALYSIS
      setIsAnalyzing(true);
      try {
        // Convert audio blob to base64 for analysis
        // For now, use cloudUrl for fetching
        const resp = await fetch(cloudUrl);
        const blob = await resp.blob();

        // Call one-shot endpoint: analyze + generate arrangements
        const bandResult = await bandService.analyzeAndGenerate(blob);
        setIsAnalyzing(false);

        console.log('[Studio] Band analysis complete:', bandResult);

        // Navigate to BandResultsScreen with results
        navigation.navigate('BandResults', {
          arrangements: bandResult.arrangements,
          analysis: bandResult.analysis,
          vocalUrl: cloudUrl,
        });
      } catch (err) {
        setIsAnalyzing(false);
        console.error('[Studio] Band analysis failed:', err);
        Alert.alert(
          'Band Analysis Error',
          'Could not analyze vocals. Try again or skip to DAW.',
          [
            { text: 'Skip', style: 'cancel' },
            {
              text: 'Retry',
              onPress: () => stopRecordingAndAnalyzeBand(),
            },
          ]
        );
      }
    }
  };

  const handleStop = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isRecording) {
      // Use the same workflow as handleRecord when stopping
      await stopRecordingAndAnalyzeBand();
    } else {
      await stopPlayback();
      setIsPlaying(false);
    }
  };

  // ── Playback ─────────────────────────────────────────────────────────────
  const handlePlay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!lastRecordUrl) {
      Alert.alert('Empty', "No recording yet. Tap ⏺ to start.");
      return;
    }
    if (isPlaying) {
      await stopPlayback();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      await playRecording(lastRecordUrl);
      setIsPlaying(false);
    }
  };

  // ── Instrument tap ────────────────────────────────────────────────────────
  const handleInstr = (key: InstrKey, isProRequired: boolean) => {
    Haptics.selectionAsync();
    playInstrumentNote(key); 

    // Paywall block if pro
    if (isProRequired && !isPro) {
      setTimeout(() => {
        navigation.navigate('Paywall', { instrument: key });
      }, 400);
      return;
    }

    // Multi-select Toggle
    setActiveInstrs(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      return [...prev, key];
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Ambient glows */}
      <Animated.View style={[s.glowPurple, { backgroundColor: glowColor }]} />
      <View style={s.glowTeal}   />
      <View style={s.glowGold}   />
      <View style={s.veil}       />

      <SafeAreaView style={s.safe}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          
          {/* ── HEADER ── */}
        <View style={s.header}>
          <View>
            <Text style={s.logo}>{APP_NAME}</Text>
            <Text style={s.logoSub}>Professional Studio Experience</Text>
          </View>
          <View style={s.headerR}>
            <View style={s.avatar}>
              <Text style={s.avatarTx}>S</Text>
            </View>
          </View>
        </View>

        {/* ── SONG CARD ── */}
        <GlassCard style={s.songCard}>
          <View style={s.songRow}>
            <Text style={s.songName}>Master Session</Text>
            <View style={s.liveRow}>
              <View style={[s.liveDot, isRecording && s.liveDotRec, isAnalyzing && { backgroundColor: Colors.gold }]} />
              <Text style={[s.liveTx, isRecording && { color: Colors.red }, isAnalyzing && { color: Colors.gold }]}>
                {isAnalyzing ? '🎼 MAESTRO is listening...' : isSaving ? '☁ UPLOADING...' : isRecording ? 'LIVE RECORDING' : lastRecordUrl ? 'Cloud ✓' : 'Service Ready'}
              </Text>
            </View>
          </View>
          <Text style={s.songMeta}>
            BPM 120  ·  44.1 kHz  ·  {fmtTime(elapsedSec)}
          </Text>
        </GlassCard>

        {/* ── WAVEFORM & VU METER ── */}
        <View style={s.waveWrap}>
          <View style={{ flex: 1 }}>
            <WaveformDisplay isRecording={isRecording} micLevel={micLevel} />
            <View style={s.timeRow}>
              <Text style={s.timeTx}>0:00</Text>
              <Text style={s.timeTx}>0:30</Text>
              <Text style={s.timeTx}>{fmtTime(elapsedSec)}</Text>
            </View>
          </View>
          
          {/* VU Meter */}
          <View style={{ width: 12, height: 140, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow:'hidden', justifyContent:'flex-end', marginLeft: Spacing.md }}>
            <Animated.View style={{
              height: `${micLevel * 100}%`,
              backgroundColor: micLevel > 0.8 ? '#FF3B5C' : micLevel > 0.5 ? '#D4AF37' : '#00D9C0',
              borderRadius: 6,
            }} />
          </View>
        </View>

        {/* ── PITCH STATS ── */}
        <GlassCard style={s.pitchRow}>
          <View style={s.pitchSec}>
            <Text style={s.statLbl}>REAL-TIME PITCH</Text>
            <View style={s.pitchTrack}>
              <View style={[s.pitchFill, { width: isRecording ? `${20 + (micLevel * 80)}%` : '68%' }]} />
              <View style={[s.pitchDot, { left: isRecording ? `${20 + (micLevel * 80) - 2}%` : '65%' }]} />
            </View>
          </View>
          <View style={s.pitchSec}>
            <Text style={s.statLbl}>GAIN LEVEL</Text>
            <Text style={s.loudVal}>{isRecording ? (-40 + (micLevel * 40)).toFixed(1) : '-4.8'} dB</Text>
          </View>
          <View style={s.noteCard}>
            {(() => {
              const chords = ['C\nMinor', 'D\nMajor', 'E\nMinor', 'F#\nMajor', 'G\nMinor', 'A#\nPerfect', 'B\nFlat'];
              const chord = isRecording ? chords[Math.floor(micLevel * (chords.length - 1))] : 'A#\nPerfect';
              const parts = chord.split('\n');
              return (
                <>
                  <Text style={s.noteVal}>{parts[0]}</Text>
                  <Text style={s.noteSub}>{parts[1]}</Text>
                </>
              );
            })()}
          </View>
        </GlassCard>

        {/* ── TRANSPORT ── */}
        <View style={s.transport}>
          <Pressable style={s.tBtn}><Text style={s.tBtnTx}>⏮</Text></Pressable>
          <Pressable
            style={[s.tBtn, isPlaying && s.tBtnActive]}
            onPress={handlePlay}
          >
            <Text style={s.tBtnTx}>{isPlaying ? '⏸' : '▶'}</Text>
          </Pressable>

          <RecordButton isRecording={isRecording} onPress={handleRecord} size={70} />

          <Pressable style={s.tBtn} onPress={handleStop}>
            <Text style={s.tBtnTx}>⏹</Text>
          </Pressable>
          <Pressable style={s.tBtn}><Text style={s.tBtnTx}>⏭</Text></Pressable>
        </View>

        {/* ── AUTO-TUNE SLIDER ── */}
        <GlassCard style={s.atCard}>
          <View style={s.atHdr}>
            <Text style={s.atLbl}>AI Voice Correction</Text>
            <Text style={s.atVal}>{autoTune}%</Text>
          </View>
          <View 
            style={{ paddingVertical: 20, marginTop: -15, marginBottom: -15, justifyContent: 'center' }}
            {...panResponder.panHandlers}
          >
            <View style={s.sliderTrack}>
              <View style={[s.sliderFill, { width: `${autoTune}%` }]} />
              <View style={[s.sliderThumb, { left: `${autoTune}%` }]} />
            </View>
          </View>
          <View style={s.atEnds}>
            <Text style={s.atEnd}>Organic</Text>
            <Text style={s.atEnd}>Engineered</Text>
          </View>
        </GlassCard>

        {/* ── INSTRUMENTS ── */}
        <View style={s.instrSec}>
          <View style={s.instrHdr}>
            <Text style={s.instrTitle}>Acoustic Layers</Text>
            <Text style={s.instrSub}>Multi-track enabled</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {INSTRUMENTS.map(instr => {
              const active = activeInstrs.includes(instr.key);
              return (
                <Pressable
                  key={instr.key}
                  style={[s.instrCard, active && s.instrCardOn]}
                  onPress={() => handleInstr(instr.key, instr.pro)}
                >
                  {instr.pro && (
                    <View style={s.proBadge}>
                      <Text style={s.proBadgeTx}>PRO</Text>
                    </View>
                  )}
                  <View style={[s.instrIcon, active && s.instrIconOn]}>
                    <Text style={[s.instrIconTx, active && s.instrIconTxOn]}>
                      {instr.sym}
                    </Text>
                  </View>
                  <Text style={[s.instrLbl, active && s.instrLblOn]}>
                    {instr.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── SMART ACCOMPANIMENT ── */}
        <GlassCard style={s.backingCard}>
          <View style={s.backingRow}>
            <View>
              <Text style={s.backingTitle}>Smart Accompaniment</Text>
              <Text style={s.backingSub}>Live rhythmic generator</Text>
            </View>
            <Pressable 
              style={[s.toggleBtn, enableBacking && s.toggleBtnOn]} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEnableBacking(!enableBacking);
              }}
            >
              <Text style={s.toggleBtnTx}>{enableBacking ? 'ON' : 'OFF'}</Text>
            </Pressable>
          </View>
          <View style={s.chordRow}>
             {['C major', 'G major', 'A minor', 'F major'].map((lbl, i) => (
                <View key={i} style={s.chordBox}>
                  <Text style={s.chordIdx}>{i + 1}</Text>
                  <Text style={s.chordLbl}>{lbl}</Text>
                </View>
             ))}
          </View>
        </GlassCard>

        </ScrollView>

        {/* ── SLIDING SIDE DRAWER MENU ── */}
        <Animated.View style={[s.sideDrawer, {
          transform: [{ translateX: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [72, 0] }) }]
        }]}>
          {/* Hemisphere Handle */}
          <Pressable style={s.drawerTab} onPress={toggleMenu}>
             <Text style={s.drawerTabIcon}>{menuOpen ? '▶' : '◀'}</Text>
          </Pressable>

          {/* Tools Panel */}
          <View style={s.drawerPanel}>
            <Pressable style={s.drawerBtn} onPress={() => { toggleMenu(); navigation.navigate('Multitrack'); }}>
              <View style={[s.drawerIconBg, { backgroundColor: Colors.teal }]}>
                <Text style={s.drawerIconTx}>🎛️</Text>
              </View>
              <Text style={s.drawerLbl}>DAW</Text>
            </Pressable>

            <Pressable style={s.drawerBtn} onPress={() => { toggleMenu(); navigation.navigate('Lyrics'); }}>
              <View style={[s.drawerIconBg, { backgroundColor: Colors.gold }]}>
                <Text style={s.drawerIconTx}>✎</Text>
              </View>
              <Text style={s.drawerLbl}>Lyrics</Text>
            </Pressable>

            <Pressable style={s.drawerBtn} onPress={() => { toggleMenu(); navigation.navigate('Guru'); }}>
              <View style={[s.drawerIconBg, { backgroundColor: '#6A2AE6' }]}>
                <Text style={s.drawerIconTx}>✨</Text>
              </View>
              <Text style={s.drawerLbl}>Guru</Text>
            </Pressable>
          </View>
        </Animated.View>

      </SafeAreaView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  safe: { flex: 1 },

  // Ambient glows
  glowPurple: { position:'absolute', width:300, height:300, borderRadius:150, backgroundColor:'rgba(106,42,230,0.3)', top:-50, left:-50 },
  glowTeal:   { position:'absolute', width:260, height:260, borderRadius:130, backgroundColor:'rgba(0,217,192,0.18)', top:-80, right:-30 },
  glowGold:   { position:'absolute', width:220, height:220, borderRadius:110, backgroundColor:'rgba(212,175,55,0.22)', top:420, left:60 },
  veil:       { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(11,11,18,0.48)' },

  // Header
  header:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:Spacing.lg, paddingTop:Spacing.sm, paddingBottom:Spacing.xs },
  logo:      { ...Typography.appName },
  logoSub:   { ...Typography.tiny, letterSpacing:0.5 },
  headerR:   { flexDirection:'row', gap:Spacing.sm, alignItems:'center' },
  headerBtn: { width:32, height:32, borderRadius:16, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, alignItems:'center', justifyContent:'center' },
  headerBtnTx: { fontSize:15, color:Colors.textSecondary },
  avatar:    { width:32, height:32, borderRadius:16, backgroundColor:Colors.gold, alignItems:'center', justifyContent:'center' },
  avatarTx:  { fontSize:13, fontWeight:'700', color:Colors.bg },

  // Song card
  songCard: { marginHorizontal:Spacing.lg, marginBottom:Spacing.sm, padding:Spacing.md },
  songRow:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:Spacing.xs },
  songName: { ...Typography.h3 },
  liveRow:  { flexDirection:'row', alignItems:'center', gap:5 },
  liveDot:  { width:7, height:7, borderRadius:4, backgroundColor:Colors.teal, shadowColor:Colors.teal, shadowOffset:{width:0,height:0}, shadowOpacity:0.9, shadowRadius:5 },
  liveDotRec: { backgroundColor:Colors.red, shadowColor:Colors.red },
  liveTx:   { fontSize:10, fontWeight:'600', color:Colors.teal },
  songMeta: { ...Typography.caption },

  // Waveform & VU
  waveWrap:  { marginHorizontal:Spacing.lg, marginBottom:Spacing.xs, flex:1, flexDirection: 'row', alignItems: 'center', justifyContent:'center' },
  timeRow:   { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:4, marginTop:3 },
  timeTx:    { ...Typography.tiny },

  // Pitch row
  pitchRow:  { marginHorizontal:Spacing.lg, marginBottom:Spacing.sm, padding:Spacing.md, flexDirection:'row', alignItems:'center', gap:Spacing.md },
  pitchSec:  { flex:1 },
  statLbl:   { fontSize:8, fontWeight:'600', color:Colors.textMuted, letterSpacing:0.5, marginBottom:5 },
  pitchTrack:{ height:4, backgroundColor:Colors.border, borderRadius:2 },
  pitchFill: { height:4, backgroundColor:Colors.teal, borderRadius:2 },
  pitchDot:  { position:'absolute', width:10, height:10, borderRadius:5, backgroundColor:'#fff', top:-3, left:'65%', shadowColor:Colors.teal, shadowOffset:{width:0,height:0}, shadowOpacity:0.9, shadowRadius:5 },
  loudVal:   { fontSize:14, fontWeight:'700', color:Colors.textPrimary },
  noteCard:  { backgroundColor:Colors.tealBg, borderWidth:1, borderColor:Colors.teal, borderRadius:Radius.sm, paddingHorizontal:Spacing.md, paddingVertical:4, alignItems:'center', minWidth:56 },
  noteVal:   { fontSize:20, fontWeight:'700', color:Colors.teal, lineHeight:22 },
  noteSub:   { fontSize:8, color:Colors.teal },

  // Transport
  transport: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:Spacing.sm, paddingHorizontal:Spacing.lg, paddingVertical:Spacing.xs },
  tBtn:      { width:44, height:44, borderRadius:22, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, alignItems:'center', justifyContent:'center' },
  tBtnActive:{ backgroundColor:Colors.tealBg, borderColor:Colors.teal },
  tBtnTx:    { fontSize:16, color:Colors.textSecondary },

  // Auto-tune
  atCard:      { marginHorizontal:Spacing.lg, marginVertical:Spacing.xs, padding:Spacing.md },
  atHdr:       { flexDirection:'row', justifyContent:'space-between', marginBottom:Spacing.sm },
  atLbl:       { ...Typography.body, fontWeight:'500' },
  atVal:       { ...Typography.body, fontWeight:'600', color:Colors.teal },
  sliderTrack: { height:4, backgroundColor:Colors.border, borderRadius:2 },
  sliderFill:  { height:4, backgroundColor:Colors.teal, borderRadius:2 },
  sliderThumb: { position:'absolute', width:16, height:16, borderRadius:8, backgroundColor:'#fff', top:-6, marginLeft:-8, shadowColor:Colors.teal, shadowOffset:{width:0,height:0}, shadowOpacity:0.9, shadowRadius:6 },
  atEnds:      { flexDirection:'row', justifyContent:'space-between', marginTop:Spacing.xs },
  atEnd:       { ...Typography.tiny },

  // Instruments
  instrSec:    { marginHorizontal:Spacing.lg, marginTop:Spacing.xs },
  instrHdr:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:Spacing.sm },
  instrTitle:  { ...Typography.body, fontWeight:'600', color:Colors.textPrimary },
  instrSub:    { ...Typography.caption },
  instrCard:   { width:76, marginRight:Spacing.sm, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.md, padding:Spacing.sm, alignItems:'center', position:'relative' },
  instrCardOn: { backgroundColor:Colors.tealBg, borderColor:Colors.teal, shadowColor:Colors.teal, shadowOffset:{width:0,height:0}, shadowOpacity:0.5, shadowRadius:10, elevation:6 },
  proBadge:    { position:'absolute', top:4, right:4, backgroundColor:Colors.gold, borderRadius:20, paddingHorizontal:5, paddingVertical:1 },
  proBadgeTx:  { fontSize:7, fontWeight:'700', color:Colors.bg },
  instrIcon:   { width:32, height:32, borderRadius:16, backgroundColor:Colors.bgCard, alignItems:'center', justifyContent:'center', marginBottom:Spacing.xs, marginTop:Spacing.xs },
  instrIconOn: { backgroundColor:'rgba(0,217,192,0.2)' },
  instrIconTx: { fontSize:13, fontWeight:'700', color:Colors.textMuted },
  instrIconTxOn:{ color:Colors.teal },
  instrLbl:    { fontSize:10, color:Colors.textMuted },
  instrLblOn:  { color:Colors.teal, fontWeight:'600' },

  // Smart Accompaniment
  backingCard: { marginHorizontal:Spacing.lg, marginTop:Spacing.md, padding:Spacing.md },
  backingRow:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:Spacing.sm },
  backingTitle:{ ...Typography.body, fontWeight:'600' },
  backingSub:  { ...Typography.caption },
  toggleBtn:   { width:50, height:28, borderRadius:14, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, alignItems:'center', justifyContent:'center' },
  toggleBtnOn: { backgroundColor:Colors.tealBg, borderColor:Colors.teal },
  toggleBtnTx: { fontSize:10, fontWeight:'700', color:Colors.textPrimary },
  chordRow:    { flexDirection:'row', justifyContent:'space-between', marginTop:Spacing.sm },
  chordBox:    { flex:1, marginHorizontal:3, backgroundColor:'rgba(255,255,255,0.05)', borderRadius:Radius.sm, padding:8, alignItems:'center' },
  chordIdx:    { fontSize:8, color:Colors.textMuted, marginBottom:3 },
  chordLbl:    { fontSize:12, fontWeight:'600', color:Colors.gold },

  // Sliding drawer
  sideDrawer: { position: 'absolute', right: 0, top: '40%', flexDirection: 'row', alignItems: 'center', zIndex: 100 },
  drawerTab: { width: 34, height: 70, backgroundColor: 'rgba(255, 255, 255, 0.5)', borderTopLeftRadius: 35, borderBottomLeftRadius: 35, borderWidth: 1, borderRightWidth: 0, borderColor: 'rgba(255, 255, 255, 0.8)', justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 10, shadowColor: '#000', shadowOffset: {width: -2, height: 0}, shadowOpacity: 0.3, shadowRadius: 5 },
  drawerTabIcon: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  drawerPanel: { width: 72, backgroundColor: 'rgba(15, 15, 25, 0.85)', borderTopLeftRadius: 20, borderBottomLeftRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)', borderRightWidth: 0, paddingVertical: 20, alignItems: 'center', gap: 24, shadowColor: '#000', shadowOffset: {width: -4, height: 0}, shadowOpacity: 0.5, shadowRadius: 10 },
  drawerBtn: { alignItems: 'center' },
  drawerIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 6 },
  drawerIconTx: { fontSize: 18, color: Colors.bg },
  drawerLbl: { fontSize: 10, fontWeight: '700', color: '#fff', marginTop: 6, letterSpacing: 0.5 },
});
