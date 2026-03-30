import React, { useState, useRef } from 'react';
import {
  ActivityIndicator, Animated, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useStudioStore } from '../store/useStudioStore';
import { Colors, Radius, Spacing } from '../theme';

const BACKEND = 'https://maestro-production-c525.up.railway.app';

// A "region" is a time slice — which take is chosen for that slice
interface CompRegion {
  id:        string;
  startPct:  number;  // 0-1
  endPct:    number;
  takeIndex: number;
  label:     string;  // e.g. "verse line 1"
}

const DEFAULT_REGIONS: CompRegion[] = [
  { id:'r1', startPct:0.00, endPct:0.18, takeIndex:0, label:'Intro' },
  { id:'r2', startPct:0.18, endPct:0.40, takeIndex:1, label:'Verse 1' },
  { id:'r3', startPct:0.40, endPct:0.60, takeIndex:0, label:'Chorus' },
  { id:'r4', startPct:0.60, endPct:0.80, takeIndex:2, label:'Verse 2' },
  { id:'r5', startPct:0.80, endPct:1.00, takeIndex:1, label:'Outro' },
];

// Fake per-take bar heights for visual demo
const WAVE_ROWS = [
  [5,9,16,24,34,50,38,28,18,32,54,66,52,42,32,24,16,28,42,54],
  [8,14,20,28,40,58,44,32,22,38,60,72,56,46,36,28,20,32,46,60],
  [4,7,12,20,30,44,34,26,16,28,48,62,48,38,28,22,14,24,38,50],
];

export const CompingScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { currentProject } = useStudioStore();
  const leadTrack = currentProject?.tracks.find(t => t.id === 'lead');
  const takes = leadTrack?.takes ?? [];

  const [regions,   setRegions  ] = useState<CompRegion[]>(DEFAULT_REGIONS);
  const [activeTake, setActiveTake] = useState(0);  // currently soloed take
  const [loading,   setLoading  ] = useState(false);
  const [rendered,  setRendered ] = useState(false);

  const assignRegionToTake = (regionId: string, takeIndex: number) => {
    setRegions(prev => prev.map(r =>
      r.id === regionId ? { ...r, takeIndex } : r
    ));
  };

  const getAISuggestion = async () => {
    if (takes.length === 0) {
      // Demo mode — just assign based on fake scores
      setRegions([
        { id:'r1', startPct:0.00, endPct:0.18, takeIndex:1, label:'Intro' },
        { id:'r2', startPct:0.18, endPct:0.40, takeIndex:0, label:'Verse 1' },
        { id:'r3', startPct:0.40, endPct:0.60, takeIndex:2, label:'Chorus' },
        { id:'r4', startPct:0.60, endPct:0.80, takeIndex:1, label:'Verse 2' },
        { id:'r5', startPct:0.80, endPct:1.00, takeIndex:0, label:'Outro' },
      ]);
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/multitrack/comp-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject?.id,
          track_id:   'lead',
          take_ids:   takes.map(t => t.id),
        }),
      });
      const data = await res.json();
      if (data.regions) setRegions(data.regions);
    } catch (e) {
      console.error('Comp suggest failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const renderComp = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/multitrack/render-comp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject?.id, regions }),
      });
      const data = await res.json();
      console.log('Comp rendered:', data.output_url);
      setRendered(true);
    } catch (e) {
      console.error('Render failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const TAKE_COLORS = [Colors.teal, Colors.gold, Colors.red];
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
        <View>
          <Text style={s.title}>Vocal Comp Editor</Text>
          <Text style={s.subtitle}>{LANE_COUNT} takes · {regions.length} regions</Text>
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
        {Array.from({ length: LANE_COUNT }, (_, i) => (
          <Pressable
            key={i}
            style={[s.takeTab, activeTake === i && { backgroundColor: TAKE_COLORS[i % 3] + '20', borderColor: TAKE_COLORS[i % 3] }]}
            onPress={() => setActiveTake(i)}
          >
            <Text style={[s.takeTabTx, activeTake === i && { color: TAKE_COLORS[i % 3] }]}>
              Take {i + 1}
            </Text>
            {takes[i]?.pitchScore && (
              <Text style={[s.takeScore, { color: TAKE_COLORS[i % 3] }]}>
                {takes[i].pitchScore}%
              </Text>
            )}
          </Pressable>
        ))}
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
        {Array.from({ length: LANE_COUNT }, (_, laneIdx) => (
          <View key={laneIdx} style={s.lane}>
            <Text style={[s.laneLabel, { color: TAKE_COLORS[laneIdx % 3] }]}>
              T{laneIdx + 1}
            </Text>
            <View style={[s.laneWave, { borderColor: laneIdx === activeTake ? TAKE_COLORS[laneIdx % 3] : Colors.border }]}>
              {/* Waveform bars */}
              <View style={s.barRow}>
                {WAVE_ROWS[laneIdx % 3].map((h, bi) => (
                  <View
                    key={bi}
                    style={[s.wBar, {
                      height: h * 0.7,
                      backgroundColor: laneIdx === activeTake
                        ? TAKE_COLORS[laneIdx % 3]
                        : Colors.textMuted,
                    }]}
                  />
                ))}
              </View>
              {/* Region highlight overlays */}
              {regions.filter(r => r.takeIndex === laneIdx).map(region => (
                <Pressable
                  key={region.id}
                  style={[s.regionOverlay, {
                    left:  `${region.startPct * 100}%` as any,
                    width: `${(region.endPct - region.startPct) * 100}%` as any,
                    backgroundColor: TAKE_COLORS[laneIdx % 3] + '30',
                    borderColor: TAKE_COLORS[laneIdx % 3],
                  }]}
                  onPress={() => console.log('Region:', region.label)}
                >
                  <Text style={[s.regionTx, { color: TAKE_COLORS[laneIdx % 3] }]}>
                    {region.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* ── ASSEMBLED COMP ── */}
        <View style={s.compRow}>
          <Text style={s.compLabel}>COMP</Text>
          <View style={s.compLane}>
            {regions.map(region => (
              <Pressable
                key={region.id}
                style={[s.compSegment, {
                  left:  `${region.startPct * 100}%` as any,
                  width: `${(region.endPct - region.startPct) * 100}%` as any,
                  backgroundColor: TAKE_COLORS[region.takeIndex % 3],
                }]}
              >
                <Text style={s.compSegTx}>T{region.takeIndex + 1}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Crossfade info */}
        <View style={s.infoRow}>
          <Text style={s.infoTx}>
            ✦ Auto-crossfades applied: 5ms on consonants, 15ms on vowels
          </Text>
        </View>
      </ScrollView>

      {/* Bottom actions */}
      <View style={s.bottomBar}>
        <Pressable style={s.resetBtn} onPress={() => setRegions(DEFAULT_REGIONS)}>
          <Text style={s.resetTx}>Reset</Text>
        </Pressable>
        <Pressable
          style={[s.renderBtn, loading && { opacity: 0.6 }]}
          onPress={renderComp}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={Colors.bg} size="small" />
            : <Text style={s.renderTx}>{rendered ? 'Re-render Comp' : 'Render Comp'}</Text>
          }
        </Pressable>
      </View>
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
  takeTabs:      { flexDirection:'row',gap:8,paddingHorizontal:16,marginBottom:8 },
  takeTab:       { flex:1,paddingVertical:7,borderRadius:Radius.md,borderWidth:1,borderColor:Colors.border,backgroundColor:Colors.bgCard,alignItems:'center' },
  takeTabTx:     { fontSize:11,fontWeight:'600',color:Colors.textMuted },
  takeScore:     { fontSize:10,fontWeight:'700' },
  canvas:        { flex:1 },
  ruler:         { flexDirection:'row',justifyContent:'space-between',marginBottom:8 },
  rulerTx:       { fontSize:9,color:Colors.textMuted },
  lane:          { flexDirection:'row',alignItems:'center',marginBottom:6,gap:8 },
  laneLabel:     { fontSize:10,fontWeight:'700',width:20 },
  laneWave:      { flex:1,height:42,borderRadius:8,borderWidth:1,backgroundColor:Colors.bgSurf,overflow:'hidden',position:'relative' },
  barRow:        { flex:1,flexDirection:'row',alignItems:'center',paddingHorizontal:4,gap:1 },
  wBar:          { width:3,borderRadius:1 },
  regionOverlay: { position:'absolute',top:0,bottom:0,borderWidth:1,borderRadius:4,alignItems:'center',justifyContent:'center' },
  regionTx:      { fontSize:8,fontWeight:'700' },
  compRow:       { flexDirection:'row',alignItems:'center',marginTop:12,gap:8 },
  compLabel:     { fontSize:10,fontWeight:'700',color:Colors.gold,width:36 },
  compLane:      { flex:1,height:36,backgroundColor:Colors.bgSurf,borderRadius:8,borderWidth:1,borderColor:Colors.border,position:'relative',overflow:'hidden' },
  compSegment:   { position:'absolute',top:2,bottom:2,borderRadius:4,alignItems:'center',justifyContent:'center' },
  compSegTx:     { fontSize:8,fontWeight:'700',color:'#fff' },
  infoRow:       { marginTop:12,padding:12,backgroundColor:Colors.tealBg,borderRadius:Radius.md,borderWidth:1,borderColor:Colors.teal },
  infoTx:        { fontSize:11,color:Colors.teal,lineHeight:18 },
  bottomBar:     { flexDirection:'row',gap:12,padding:16,backgroundColor:Colors.bgSurf,borderTopWidth:1,borderTopColor:Colors.border },
  resetBtn:      { flex:1,borderRadius:Radius.pill,paddingVertical:13,alignItems:'center',borderWidth:1,borderColor:Colors.border,backgroundColor:Colors.bgCard },
  resetTx:       { fontSize:14,fontWeight:'600',color:Colors.textSecondary },
  renderBtn:     { flex:2,borderRadius:Radius.pill,paddingVertical:13,alignItems:'center',backgroundColor:Colors.gold },
  renderTx:      { fontSize:14,fontWeight:'700',color:Colors.bg },
});
