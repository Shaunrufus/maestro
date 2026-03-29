import React, { useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet,
  Text, View,
} from 'react-native';
import { useStudioStore } from '../store/useStudioStore';
import { Colors, Spacing, Radius } from '../theme';

type Mode = 'record' | 'edit' | 'mix';

const MODE_COLORS: Record<Mode, string> = {
  record: Colors.red,
  edit:   Colors.teal,
  mix:    Colors.gold,
};

export const MultitrackScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { currentProject, studioMode, setStudioMode,
          toggleMute, toggleSolo, updateTrackVolume } = useStudioStore();

  const [mode,        setMode       ] = useState<Mode>('record');
  const [playheadPct, setPlayheadPct] = useState(0);

  const tracks = currentProject?.tracks ?? [];

  const setModeAll = (m: Mode) => {
    setMode(m);
    setStudioMode(m);
  };

  return (
    <View style={s.root}>
      {/* Ambient */}
      <View style={[s.glow, { backgroundColor: MODE_COLORS[mode] + '30', top: -40, left: -40 }]} />
      <View style={s.veil} />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTx}>←</Text>
        </Pressable>
        <Text style={s.title}>{currentProject?.name ?? 'Untitled'}</Text>
        <Text style={s.bpmTx}>{currentProject?.bpm} BPM · {currentProject?.key}</Text>
      </View>

      {/* Mode selector */}
      <View style={s.modeBar}>
        {(['record', 'edit', 'mix'] as Mode[]).map(m => (
          <Pressable
            key={m}
            style={[s.modeBtn, mode === m && { backgroundColor: MODE_COLORS[m] + '20', borderColor: MODE_COLORS[m] }]}
            onPress={() => setModeAll(m)}
          >
            <Text style={[s.modeTx, mode === m && { color: MODE_COLORS[m] }]}>
              {m.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── RECORD MODE ── */}
      {mode === 'record' && (
        <ScrollView style={s.trackList} contentContainerStyle={{ gap: 8, padding: Spacing.lg }}>
          {tracks.map(track => (
            <View key={track.id} style={s.trackRow}>
              {/* Track header */}
              <View style={s.trackHead}>
                <Text style={s.trackName}>{track.name}</Text>
                <View style={s.trackBtns}>
                  <Pressable
                    style={[s.trackBtn, track.muted && s.trackBtnRed]}
                    onPress={() => toggleMute(track.id)}
                  >
                    <Text style={s.trackBtnTx}>M</Text>
                  </Pressable>
                  <Pressable
                    style={[s.trackBtn, track.solo && s.trackBtnGold]}
                    onPress={() => toggleSolo(track.id)}
                  >
                    <Text style={s.trackBtnTx}>S</Text>
                  </Pressable>
                </View>
              </View>

              {/* Take lanes */}
              <View style={s.laneArea}>
                {track.takes.length === 0 ? (
                  <View style={s.emptyLane}>
                    <Text style={s.emptyLaneTx}>
                      {mode === 'record' ? 'Tap REC to record' : 'No takes'}
                    </Text>
                  </View>
                ) : (
                  track.takes.map((take, i) => (
                    <Pressable
                      key={take.id}
                      style={[
                        s.takeLane,
                        take.id === track.selectedTakeId && s.takeLaneActive,
                      ]}
                    >
                      {/* Mini waveform bars */}
                      <View style={s.miniWave}>
                        {Array.from({ length: 20 }, (_, j) => (
                          <View
                            key={j}
                            style={[s.miniBar, {
                              height: 4 + Math.random() * 14,
                              backgroundColor: take.id === track.selectedTakeId
                                ? Colors.teal : Colors.textMuted,
                            }]}
                          />
                        ))}
                      </View>
                      <Text style={s.takeLbl}>Take {i + 1}</Text>
                      {take.pitchScore && (
                        <Text style={[s.takeScore, { color: take.pitchScore > 80 ? Colors.teal : Colors.gold }]}>
                          {take.pitchScore}%
                        </Text>
                      )}
                    </Pressable>
                  ))
                )}
              </View>
            </View>
          ))}

          {/* Add track button */}
          <Pressable style={s.addTrackBtn}>
            <Text style={s.addTrackTx}>+ Add Track</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* ── EDIT MODE ── */}
      {mode === 'edit' && (
        <View style={s.editArea}>
          <Text style={s.comingSoon}>Tap "Comping" to edit takes</Text>
          <Pressable
            style={s.compBtn}
            onPress={() => navigation.navigate('Comping')}
          >
            <Text style={s.compBtnTx}>Open Vocal Comp Editor →</Text>
          </Pressable>
        </View>
      )}

      {/* ── MIX MODE ── */}
      {mode === 'mix' && (
        <ScrollView horizontal style={s.mixArea} contentContainerStyle={s.mixContent}>
          {tracks.map(track => (
            <View key={track.id} style={s.faderChannel}>
              <Text style={s.faderName}>{track.name}</Text>
              {/* Vertical fader */}
              <View style={s.faderTrack}>
                <View style={[s.faderFill, { height: `${track.volume * 100}%` as any }]} />
                <View style={[s.faderThumb, { bottom: `${track.volume * 100}%` as any, marginBottom: -8 }]} />
              </View>
              <Text style={s.faderVal}>{Math.round(track.volume * 100)}</Text>
              <View style={s.faderBtns}>
                <Pressable style={[s.faderBtn, track.muted && { backgroundColor: Colors.redBg, borderColor: Colors.red }]} onPress={() => toggleMute(track.id)}>
                  <Text style={[s.faderBtnTx, track.muted && { color: Colors.red }]}>M</Text>
                </Pressable>
                <Pressable style={[s.faderBtn, track.solo && { backgroundColor: Colors.goldBg, borderColor: Colors.gold }]} onPress={() => toggleSolo(track.id)}>
                  <Text style={[s.faderBtnTx, track.solo && { color: Colors.gold }]}>S</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {/* Master channel */}
          <View style={[s.faderChannel, s.masterChannel]}>
            <Text style={s.faderName}>MASTER</Text>
            <View style={s.faderTrack}>
              <View style={[s.faderFill, { height: '85%', backgroundColor: Colors.gold }]} />
              <View style={[s.faderThumb, { bottom: '85%', marginBottom: -8, backgroundColor: Colors.gold }]} />
            </View>
            <Text style={s.faderVal}>85</Text>
          </View>
        </ScrollView>
      )}

      {/* Bottom: transport */}
      <View style={s.bottomBar}>
        <Pressable style={s.tBtnSm}><Text style={s.tBtnTx}>⏮</Text></Pressable>
        <Pressable style={s.tBtnSm}><Text style={s.tBtnTx}>▶</Text></Pressable>
        <Pressable
          style={[s.tBtnRec, mode !== 'record' && { opacity: 0.4 }]}
          disabled={mode !== 'record'}
        >
          <Text style={s.tBtnTx}>⏺</Text>
        </Pressable>
        <Pressable style={s.tBtnSm}><Text style={s.tBtnTx}>⏹</Text></Pressable>
        <Pressable
          style={s.exportBtn}
          onPress={() => navigation.navigate('MixMode')}
        >
          <Text style={s.exportTx}>Mix & Export →</Text>
        </Pressable>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root:         { flex:1, backgroundColor: Colors.bg },
  glow:         { position:'absolute', width:300, height:300, borderRadius:150 },
  veil:         { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.48)' },
  header:       { flexDirection:'row', alignItems:'center', paddingTop:52, paddingHorizontal:16, paddingBottom:12, gap:12 },
  backBtn:      { width:36,height:36,borderRadius:18,backgroundColor:Colors.bgCard,borderWidth:1,borderColor:Colors.border,alignItems:'center',justifyContent:'center' },
  backTx:       { fontSize:18,color:Colors.textSecondary },
  title:        { flex:1,fontSize:17,fontWeight:'700',color:Colors.textPrimary },
  bpmTx:        { fontSize:11,color:Colors.textMuted },
  modeBar:      { flexDirection:'row',marginHorizontal:16,marginBottom:12,gap:8 },
  modeBtn:      { flex:1,paddingVertical:8,borderRadius:Radius.md,borderWidth:1,borderColor:Colors.border,alignItems:'center',backgroundColor:Colors.bgCard },
  modeTx:       { fontSize:11,fontWeight:'700',color:Colors.textMuted,letterSpacing:1 },
  trackList:    { flex:1 },
  trackRow:     { backgroundColor:Colors.bgCard,borderRadius:Radius.lg,borderWidth:1,borderColor:Colors.border,overflow:'hidden' },
  trackHead:    { flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:10,borderBottomWidth:1,borderBottomColor:Colors.border },
  trackName:    { fontSize:13,fontWeight:'600',color:Colors.textPrimary },
  trackBtns:    { flexDirection:'row',gap:6 },
  trackBtn:     { width:28,height:28,borderRadius:14,backgroundColor:Colors.bgSurf,borderWidth:1,borderColor:Colors.border,alignItems:'center',justifyContent:'center' },
  trackBtnRed:  { backgroundColor:Colors.redBg,borderColor:Colors.red },
  trackBtnGold: { backgroundColor:Colors.goldBg,borderColor:Colors.gold },
  trackBtnTx:   { fontSize:10,fontWeight:'700',color:Colors.textMuted },
  laneArea:     { padding:10,gap:6 },
  emptyLane:    { height:40,borderRadius:8,borderWidth:1,borderStyle:'dashed',borderColor:Colors.border,alignItems:'center',justifyContent:'center' },
  emptyLaneTx:  { fontSize:11,color:Colors.textMuted },
  takeLane:     { height:48,borderRadius:8,borderWidth:1,borderColor:Colors.border,backgroundColor:Colors.bgSurf,flexDirection:'row',alignItems:'center',paddingHorizontal:10,gap:8 },
  takeLaneActive:{ borderColor:Colors.teal,backgroundColor:Colors.tealBg },
  miniWave:     { flex:1,flexDirection:'row',alignItems:'center',gap:1 },
  miniBar:      { width:3,borderRadius:1 },
  takeLbl:      { fontSize:10,color:Colors.textMuted,minWidth:44 },
  takeScore:    { fontSize:11,fontWeight:'700' },
  addTrackBtn:  { padding:14,borderRadius:Radius.lg,borderWidth:1,borderStyle:'dashed',borderColor:Colors.teal,alignItems:'center' },
  addTrackTx:   { fontSize:13,fontWeight:'600',color:Colors.teal },
  editArea:     { flex:1,alignItems:'center',justifyContent:'center',gap:20,padding:40 },
  comingSoon:   { fontSize:14,color:Colors.textSecondary },
  compBtn:      { backgroundColor:Colors.tealBg,borderWidth:1,borderColor:Colors.teal,borderRadius:Radius.pill,paddingHorizontal:24,paddingVertical:13 },
  compBtnTx:    { fontSize:14,fontWeight:'600',color:Colors.teal },
  mixArea:      { flex:1 },
  mixContent:   { padding:16,gap:12,alignItems:'flex-end' },
  faderChannel: { width:64,alignItems:'center',gap:6,backgroundColor:Colors.bgCard,borderRadius:Radius.md,borderWidth:1,borderColor:Colors.border,padding:8,height:260 },
  masterChannel:{ borderColor:Colors.gold,backgroundColor:Colors.goldBg },
  faderName:    { fontSize:9,fontWeight:'600',color:Colors.textMuted,textAlign:'center' },
  faderTrack:   { flex:1,width:12,backgroundColor:Colors.border,borderRadius:6,position:'relative',justifyContent:'flex-end' },
  faderFill:    { width:12,backgroundColor:Colors.teal,borderRadius:6 },
  faderThumb:   { position:'absolute',left:-2,width:16,height:16,borderRadius:8,backgroundColor:'#fff' },
  faderVal:     { fontSize:10,color:Colors.textMuted },
  faderBtns:    { flexDirection:'row',gap:4 },
  faderBtn:     { width:24,height:24,borderRadius:12,backgroundColor:Colors.bgSurf,borderWidth:1,borderColor:Colors.border,alignItems:'center',justifyContent:'center' },
  faderBtnTx:   { fontSize:8,fontWeight:'700',color:Colors.textMuted },
  bottomBar:    { flexDirection:'row',alignItems:'center',gap:8,padding:16,backgroundColor:Colors.bgSurf,borderTopWidth:1,borderTopColor:Colors.border },
  tBtnSm:       { width:38,height:38,borderRadius:19,backgroundColor:Colors.bgCard,borderWidth:1,borderColor:Colors.border,alignItems:'center',justifyContent:'center' },
  tBtnRec:      { width:38,height:38,borderRadius:19,backgroundColor:Colors.redBg,borderWidth:1,borderColor:Colors.red,alignItems:'center',justifyContent:'center' },
  tBtnTx:       { fontSize:14,color:Colors.textSecondary },
  exportBtn:    { flex:1,backgroundColor:Colors.gold,borderRadius:Radius.pill,paddingVertical:11,alignItems:'center' },
  exportTx:     { fontSize:13,fontWeight:'700',color:Colors.bg },
});
