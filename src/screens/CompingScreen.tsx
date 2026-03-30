import React, { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView,
  StyleSheet, Text, View, Modal, Alert
} from 'react-native';
import { useStudioStore } from '../store/useStudioStore';
import { Colors, Radius, Spacing } from '../theme';

const BACKEND = 'https://maestro-production-c525.up.railway.app';

interface CompRegion {
  id:        string;
  startPct:  number;
  endPct:    number;
  takeIndex: number;
  label:     string;
}

const DEFAULT_REGIONS: CompRegion[] = [
  { id:'r1', startPct:0.00, endPct:0.18, takeIndex:0, label:'Intro' },
  { id:'r2', startPct:0.18, endPct:0.40, takeIndex:0, label:'Verse 1' },
  { id:'r3', startPct:0.40, endPct:0.60, takeIndex:0, label:'Chorus' },
  { id:'r4', startPct:0.60, endPct:0.80, takeIndex:0, label:'Verse 2' },
  { id:'r5', startPct:0.80, endPct:1.00, takeIndex:0, label:'Outro' },
];

const stableRand = (seed: string, max: number) => {
  let val = 0;
  for (let i = 0; i < seed.length; i++) val += seed.charCodeAt(i);
  return ((val * 9301 + 49297) % 233280) / 233280 * max;
};

export const CompingScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { currentProject } = useStudioStore();
  
  // Find the first track with > 1 takes if possible, otherwise first track
  const tracksWithTakes = currentProject?.tracks.filter(t => t.takes.length > 0) || [];
  const activeTrack = tracksWithTakes.length > 0 ? tracksWithTakes[0] : currentProject?.tracks[0];
  const takes = activeTrack?.takes ?? [];

  const [regions,          setRegions       ] = useState<CompRegion[]>(DEFAULT_REGIONS);
  const [activeTake,       setActiveTake    ] = useState(0);
  const [loading,          setLoading       ] = useState(false);
  const [renderedUrl,      setRenderedUrl   ] = useState<string | null>(null);
  const [crossfadeMs,      setCrossfadeMs   ] = useState(15);
  const [modalRegionId,    setModalRegionId ] = useState<string | null>(null);

  const assignRegionToTake = (regionId: string, takeIndex: number) => {
    setRegions(prev => prev.map(r =>
      r.id === regionId ? { ...r, takeIndex } : r
    ));
    setModalRegionId(null);
  };

  const getAISuggestion = async () => {
    if (takes.length === 0) {
      Alert.alert('No Takes', 'Please record some takes in Multitrack first.');
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/multitrack/comp-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject?.id,
          track_id:   activeTrack?.id,
          take_ids:   takes.map(t => t.id),
        }),
      });
      const data = await res.json();
      if (data.regions) {
        setRegions(data.regions);
      }
    } catch (e) {
      console.error('Comp suggest failed:', e);
      Alert.alert('AI Error', 'Failed to get suggestions. Make sure you are connected to the internet.');
    } finally {
      setLoading(false);
    }
  };

  const renderComp = async () => {
    setLoading(true);
    setRenderedUrl(null);
    try {
      const res = await fetch(`${BACKEND}/multitrack/render-comp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          project_id: currentProject?.id, 
          regions,
          crossfade_ms: crossfadeMs 
        }),
      });
      const data = await res.json();
      console.log('Comp rendered:', data.output_url);
      setRenderedUrl(data.output_url);
      Alert.alert('Success!', 'Comp rendered successfully. URL is in the backend response.');
    } catch (e) {
      console.error('Render failed:', e);
      Alert.alert('Error', 'Failed to render comp.');
    } finally {
      setLoading(false);
    }
  };

  const TAKE_COLORS = [Colors.teal, Colors.gold, Colors.red, Colors.purple];
  const LANE_COUNT  = Math.max(3, takes.length);

  return (
    <View style={s.root}>
      <View style={s.glowPurple} />
      <View style={s.veil}       />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTx}>←</Text>
        </Pressable>
        <View style={{ flex: 1, paddingLeft: 12 }}>
          <Text style={s.title}>Vocal Comp Editor</Text>
          <Text style={s.subtitle}>{takes.length} takes · {regions.length} regions</Text>
        </View>
        <Pressable style={s.aiBtn} onPress={getAISuggestion} disabled={loading}>
          {loading
            ? <ActivityIndicator color={Colors.bg} size="small" />
            : <Text style={s.aiBtnTx}>AI Suggest</Text>
          }
        </Pressable>
      </View>

      {/* Take selector */}
      <View style={s.takeTabs}>
        {takes.length === 0 ? (
          <Text style={{color: Colors.textMuted, paddingHorizontal: 16, fontSize: 13}}>No takes found. Record takes in Multitrack first.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {takes.map((take, i) => {
              const color = TAKE_COLORS[i % TAKE_COLORS.length];
              return (
                <Pressable
                  key={take.id}
                  style={[s.takeTab, activeTake === i && { backgroundColor: color + '20', borderColor: color }]}
                  onPress={() => setActiveTake(i)}
                >
                  <Text style={[s.takeTabTx, activeTake === i && { color }]}>
                    Take {i + 1}
                  </Text>
                  {take.pitchScore != null && (
                    <Text style={[s.takeScore, { color }]}>
                      {'Pitch: ' + Math.round(take.pitchScore)}%
                    </Text>
                  )}
                  {take.timingScore != null && (
                    <Text style={[s.takeScoreSub, { color: Colors.textMuted }]}>
                      {'Timing: ' + Math.round(take.timingScore)}%
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── COMP CANVAS ── */}
      <ScrollView style={s.canvas} contentContainerStyle={{ padding: Spacing.lg }}>
        {/* Timeline ruler */}
        <View style={s.ruler}>
          {['0:00', '0:15', '0:30', '0:45', '1:00'].map((t, i) => (
            <Text key={i} style={s.rulerTx}>{t}</Text>
          ))}
        </View>

        {/* Take lanes — stacked waveforms */}
        {takes.map((take, laneIdx) => {
          const color = TAKE_COLORS[laneIdx % TAKE_COLORS.length];
          return (
            <View key={take.id} style={s.lane}>
              <Text style={[s.laneLabel, { color }]}>
                T{laneIdx + 1}
              </Text>
              <View style={[s.laneWave, { borderColor: laneIdx === activeTake ? color : Colors.border }]}>
                {/* Waveform bars */}
                <View style={s.barRow}>
                  {Array.from({ length: 20 }, (_, bi) => {
                    const h = 4 + stableRand(take.id + bi, 40);
                    return (
                      <View
                        key={bi}
                        style={[s.wBar, {
                          height: h,
                          backgroundColor: laneIdx === activeTake ? color : Colors.textMuted,
                        }]}
                      />
                    );
                  })}
                </View>
                {/* Region highlight overlays */}
                {regions.filter(r => r.takeIndex === laneIdx).map(region => (
                  <Pressable
                    key={region.id}
                    style={[s.regionOverlay, {
                      left:  `${region.startPct * 100}%` as any,
                      width: `${(region.endPct - region.startPct) * 100}%` as any,
                      backgroundColor: color + '30',
                      borderLeftWidth: 1, borderRightWidth: 1,
                      borderColor: color,
                    }]}
                    onPress={() => setModalRegionId(region.id)}
                  >
                    <Text style={[s.regionTx, { color }]}>
                      {region.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}

        {/* ── ASSEMBLED COMP ── */}
        <View style={s.compRow}>
          <Text style={s.compLabel}>COMP</Text>
          <View style={s.compLane}>
            {regions.map(region => {
              const validIdx = region.takeIndex < takes.length ? region.takeIndex : 0;
              const color = TAKE_COLORS[validIdx % TAKE_COLORS.length];
              return (
                <Pressable
                  key={region.id}
                  style={[s.compSegment, {
                    left:  `${region.startPct * 100}%` as any,
                    width: `${(region.endPct - region.startPct) * 100}%` as any,
                    backgroundColor: color,
                  }]}
                  onPress={() => setModalRegionId(region.id)}
                >
                  <Text style={s.compSegTx}>T{validIdx + 1}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Crossfade controls */}
        <View style={s.infoRow}>
          <Text style={s.infoTx}>Auto-crossfade Amount:</Text>
          <View style={s.cfOptions}>
            {[5, 10, 15, 25].map(ms => (
              <Pressable
                key={ms}
                style={[s.cfBtn, crossfadeMs === ms && s.cfBtnActive]}
                onPress={() => setCrossfadeMs(ms)}
              >
                <Text style={[s.cfBtnTx, crossfadeMs === ms && s.cfBtnTxActive]}>{ms}ms</Text>
              </Pressable>
            ))}
          </View>
        </View>
        
        {renderedUrl && (
          <View style={s.successCard}>
            <Text style={s.successTitle}>Comp Rendered!</Text>
            <Text style={s.successUrl}>{renderedUrl}</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom actions */}
      <View style={s.bottomBar}>
        <Pressable style={s.resetBtn} onPress={() => setRegions(DEFAULT_REGIONS)}>
          <Text style={s.resetTx}>Reset</Text>
        </Pressable>
        <Pressable
          style={[s.renderBtn, (loading || takes.length === 0) && { opacity: 0.6 }]}
          onPress={renderComp}
          disabled={loading || takes.length === 0}
        >
          {loading
            ? <ActivityIndicator color={Colors.bg} size="small" />
            : <Text style={s.renderTx}>{renderedUrl ? 'Re-render Comp' : 'Render Comp'}</Text>
          }
        </Pressable>
      </View>

      {/* Region Assignment Modal */}
      <Modal visible={modalRegionId !== null} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Reassign Region</Text>
            {takes.map((take, idx) => {
              const color = TAKE_COLORS[idx % TAKE_COLORS.length];
              return (
                <Pressable
                  key={take.id}
                  style={s.modalTakeRow}
                  onPress={() => {
                    if (modalRegionId) assignRegionToTake(modalRegionId, idx);
                  }}
                >
                  <View style={[s.modalColorDot, { backgroundColor: color }]} />
                  <Text style={s.modalTakeName}>Take {idx + 1}</Text>
                  {take.pitchScore && (
                    <Text style={s.modalTakeScore}>{Math.round(take.pitchScore)}% Pitch</Text>
                  )}
                </Pressable>
              );
            })}
            <Pressable style={s.modalCancelBtn} onPress={() => setModalRegionId(null)}>
              <Text style={s.modalCancelTx}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  root:          { flex:1, backgroundColor:Colors.bg },
  glowPurple:    { position:'absolute', width:280, height:280, borderRadius:140, backgroundColor:'rgba(106,42,230,0.28)', top:-50, right:-30 },
  veil:          { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.48)' },
  header:        { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingTop:52, paddingHorizontal:16, paddingBottom:12 },
  backBtn:       { width:36,height:36,borderRadius:18,backgroundColor:Colors.bgCard,borderWidth:1,borderColor:Colors.border,alignItems:'center',justifyContent:'center' },
  backTx:        { fontSize:18,color:Colors.textSecondary },
  title:         { fontSize:16,fontWeight:'700',color:Colors.textPrimary },
  subtitle:      { fontSize:11,color:Colors.textMuted },
  aiBtn:         { backgroundColor:Colors.gold,borderRadius:Radius.pill,paddingHorizontal:14,paddingVertical:8 },
  aiBtnTx:       { fontSize:12,fontWeight:'700',color:Colors.bg },
  takeTabs:      { flexDirection:'row',gap:8,marginBottom:8, height: 60 },
  takeTab:       { minWidth: 100, paddingVertical:7,borderRadius:Radius.md,borderWidth:1,borderColor:Colors.border,backgroundColor:Colors.bgCard,alignItems:'center', justifyContent:'center' },
  takeTabTx:     { fontSize:12,fontWeight:'600',color:Colors.textMuted },
  takeScore:     { fontSize:10,fontWeight:'700', marginTop: 2 },
  takeScoreSub:  { fontSize:9 },
  canvas:        { flex:1 },
  ruler:         { flexDirection:'row',justifyContent:'space-between',marginBottom:8 },
  rulerTx:       { fontSize:9,color:Colors.textMuted },
  lane:          { flexDirection:'row',alignItems:'center',marginBottom:6,gap:8 },
  laneLabel:     { fontSize:10,fontWeight:'700',width:20 },
  laneWave:      { flex:1,height:46,borderRadius:8,borderWidth:1,backgroundColor:Colors.bgSurf,overflow:'hidden',position:'relative' },
  barRow:        { flex:1,flexDirection:'row',alignItems:'center',paddingHorizontal:4,gap:1, justifyContent: 'space-between' },
  wBar:          { flex:1, borderRadius:1, marginHorizontal:1 },
  regionOverlay: { position:'absolute',top:0,bottom:0,borderWidth:1,alignItems:'center',justifyContent:'center' },
  regionTx:      { fontSize:8,fontWeight:'700', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal:2, borderRadius:2 },
  compRow:       { flexDirection:'row',alignItems:'center',marginTop:12,gap:8 },
  compLabel:     { fontSize:10,fontWeight:'700',color:Colors.gold,width:36 },
  compLane:      { flex:1,height:40,backgroundColor:Colors.bgSurf,borderRadius:8,borderWidth:1,borderColor:Colors.border,position:'relative',overflow:'hidden' },
  compSegment:   { position:'absolute',top:2,bottom:2,borderRadius:4,alignItems:'center',justifyContent:'center' },
  compSegTx:     { fontSize:10,fontWeight:'700',color:'#fff' },
  infoRow:       { marginTop:16,padding:12,backgroundColor:Colors.bgCard,borderRadius:Radius.md,borderWidth:1,borderColor:Colors.border },
  infoTx:        { fontSize:12,color:Colors.textPrimary,marginBottom:8 },
  cfOptions:     { flexDirection:'row',gap:8 },
  cfBtn:         { flex:1, paddingVertical:6, borderRadius:4, borderWidth:1, borderColor:Colors.border, alignItems:'center' },
  cfBtnActive:   { backgroundColor:Colors.tealBg, borderColor:Colors.teal },
  cfBtnTx:       { fontSize:11, color:Colors.textMuted },
  cfBtnTxActive: { color:Colors.teal, fontWeight:'600' },
  successCard:   { marginTop:12, backgroundColor:'rgba(0,217,192,0.1)', borderWidth:1, borderColor:Colors.teal, borderRadius:Radius.md, padding:Spacing.md },
  successTitle:  { fontSize:14, fontWeight:'700', color:Colors.teal, marginBottom:4 },
  successUrl:    { fontSize:10, color:Colors.textMuted },
  bottomBar:     { flexDirection:'row',gap:12,padding:16,backgroundColor:Colors.bgSurf,borderTopWidth:1,borderTopColor:Colors.border },
  resetBtn:      { flex:1,borderRadius:Radius.pill,paddingVertical:13,alignItems:'center',borderWidth:1,borderColor:Colors.border,backgroundColor:Colors.bgCard },
  resetTx:       { fontSize:14,fontWeight:'600',color:Colors.textSecondary },
  renderBtn:     { flex:2,borderRadius:Radius.pill,paddingVertical:13,alignItems:'center',backgroundColor:Colors.gold },
  renderTx:      { fontSize:14,fontWeight:'700',color:Colors.bg },
  
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent:  { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.xl },
  modalTitle:    { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  modalTakeRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalColorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  modalTakeName: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  modalTakeScore:{ fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  modalCancelBtn:{ marginTop: 16, paddingTop: 16, alignItems: 'center' },
  modalCancelTx: { fontSize: 14, color: Colors.textSecondary },
});
