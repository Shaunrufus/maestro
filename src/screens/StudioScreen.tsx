import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography, APP_NAME } from '../theme';
import { GlassCard }       from '../components/studio/GlassCard';
import { RecordButton }    from '../components/studio/RecordButton';
import { WaveformDisplay } from '../components/studio/WaveformDisplay';
import { startRecording, stopAndSaveRecording, playRecording, stopPlayback } from '../services/audioService';
import { playInstrumentNote } from '../services/instrumentService';
import { useStudioStore }  from '../store/useStudioStore';

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
  const { userId, backendUrl } = useStudioStore();

  // ── Local UI state ──────────────────────────────────────────────────────
  const [isRecording,   setIsRecording  ] = useState(false);
  const [isPlaying,     setIsPlaying    ] = useState(false);
  const [autoTune,      setAutoTune     ] = useState(78);
  const [activeInstr,   setActiveInstr  ] = useState<InstrKey>('keys');
  const [elapsedSec,    setElapsed      ] = useState(0);
  const [micLevel,      setMicLevel     ] = useState(0);   // 0–1 live metering
  const [lastRecordUrl, setLastUrl      ] = useState<string | null>(null);
  const [isSaving,      setIsSaving     ] = useState(false);

  // Sliding drawer
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const toggleMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(menuAnim, { toValue: menuOpen ? 0 : 1, friction: 6, useNativeDriver: true }).start();
    setMenuOpen(!menuOpen);
  };

  // Recording timer
  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

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
      // START recording with live metering callback
      setIsPlaying(false);
      setElapsed(0);
      setMicLevel(0);
      const ok = await startRecording((level) => setMicLevel(level));
      if (ok) setIsRecording(true);
    } else {
      // STOP + upload to Supabase
      setIsRecording(false);
      setMicLevel(0);
      setIsSaving(true);
      const { cloudUrl } = await stopAndSaveRecording({
        userId:      userId ?? 'anonymous',
        projectName: 'Untitled Session',
        bpm:         120,
        key:         'C',
        autoTunePct: autoTune,
        instruments: [activeInstr],
      });
      setIsSaving(false);
      if (cloudUrl) {
        setLastUrl(cloudUrl);
        console.log('[Studio] Saved to cloud:', cloudUrl);
      }
    }
  };

  const handleStop = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isRecording) {
      setIsRecording(false);
      setMicLevel(0);
      setIsSaving(true);
      const { cloudUrl } = await stopAndSaveRecording({
        userId: userId ?? 'anonymous', bpm: 120, key: 'C',
        autoTunePct: autoTune, instruments: [activeInstr],
      });
      setIsSaving(false);
      if (cloudUrl) setLastUrl(cloudUrl);
    } else {
      await stopPlayback();
      setIsPlaying(false);
    }
  };

  // ── Playback ─────────────────────────────────────────────────────────────
  const handlePlay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!lastRecordUrl) return;
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
  const handleInstr = (key: InstrKey, isPro: boolean) => {
    Haptics.selectionAsync();
    if (isPro) {
      navigation.navigate('Paywall', { instrument: key });
      return;
    }
    setActiveInstr(key);
    playInstrumentNote(key); // plays preview sound
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Ambient glows */}
      <View style={s.glowPurple} />
      <View style={s.glowTeal}   />
      <View style={s.glowGold}   />
      <View style={s.veil}       />

      <SafeAreaView style={s.safe}>

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
              <View style={[s.liveDot, isRecording && s.liveDotRec]} />
              <Text style={[s.liveTx, isRecording && { color: Colors.red }]}>
                {isSaving ? '☁ UPLOADING...' : isRecording ? 'LIVE RECORDING' : lastRecordUrl ? 'Cloud ✓' : 'Service Ready'}
              </Text>
            </View>
          </View>
          <Text style={s.songMeta}>
            BPM 120  ·  44.1 kHz  ·  {fmtTime(elapsedSec)}
          </Text>
        </GlassCard>

        {/* ── WAVEFORM ── */}
        <View style={s.waveWrap}>
          <WaveformDisplay isRecording={isRecording} micLevel={micLevel} />
          <View style={s.timeRow}>
            <Text style={s.timeTx}>0:00</Text>
            <Text style={s.timeTx}>0:30</Text>
            <Text style={s.timeTx}>{fmtTime(elapsedSec)}</Text>
          </View>
        </View>

        {/* ── PITCH STATS ── */}
        <GlassCard style={s.pitchRow}>
          <View style={s.pitchSec}>
            <Text style={s.statLbl}>REAL-TIME PITCH</Text>
            <View style={s.pitchTrack}>
              <View style={[s.pitchFill, { width: '68%' }]} />
              <View style={s.pitchDot} />
            </View>
          </View>
          <View style={s.pitchSec}>
            <Text style={s.statLbl}>GAIN LEVEL</Text>
            <Text style={s.loudVal}>-4.8 dB</Text>
          </View>
          <View style={s.noteCard}>
            <Text style={s.noteVal}>A#</Text>
            <Text style={s.noteSub}>Perfect</Text>
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
          <View style={s.sliderTrack}>
            <View style={[s.sliderFill, { width: `${autoTune}%` }]} />
            <View style={[s.sliderThumb, { left: `${autoTune}%` }]} />
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
              const active = activeInstr === instr.key;
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

  // Waveform
  waveWrap:  { marginHorizontal:Spacing.lg, marginBottom:Spacing.xs, flex:1, justifyContent:'center' },
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
