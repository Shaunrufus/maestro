import React, { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView,
  StyleSheet, Text, View, Share
} from 'react-native';
import { Colors, Radius, Spacing } from '../theme';

const BACKEND = 'https://maestro-production-c525.up.railway.app';

type Preset   = 'clean_pop' | 'lofi' | 'worship' | 'bollywood' | 'hip_hop' | 'classical';
type ExportFmt = 'wav_hq' | 'mp3_social' | 'stems';

const PRESETS: { key: Preset; label: string; desc: string; estTime: string }[] = [
  { key:'clean_pop',  label:'Clean Pop',   desc:'Bright EQ, light compression, wide stereo', estTime: '~4s' },
  { key:'lofi',       label:'Lo-Fi',       desc:'Warm low-pass, tape saturation, vinyl noise', estTime: '~6s' },
  { key:'worship',    label:'Worship',     desc:'Open reverb, soft compression, airy highs', estTime: '~5s' },
  { key:'bollywood',  label:'Bollywood',   desc:'Punchy mid boost, reverb, bright presence', estTime: '~4s' },
  { key:'hip_hop',    label:'Hip-Hop',     desc:'Heavy sub, punchy drums, compressed vocals', estTime: '~5s' },
  { key:'classical',  label:'Classical',   desc:'Natural room, minimal processing, wide dynamics', estTime: '~3s' },
];

const PRESET_EQ_CURVES: Record<Preset, number[]> = {
  clean_pop: [10,12,14, 15,14,13, 12,12,14, 16,18,20, 22,20,18, 16,18,22, 24,26,24, 22,20,18],
  lofi:      [22,24,20, 18,18,16, 14,14,12, 10,8,6,   4,3,2,    1,1,1,    1,1,1,    1,1,1],
  worship:   [12,12,12, 14,14,14, 12,12,12, 14,16,18, 20,22,24, 26,28,30, 28,26,24, 22,20,18],
  bollywood: [14,16,14, 12,12,14, 16,18,22, 26,28,26, 22,18,16, 14,16,18, 20,18,16, 14,12,10],
  hip_hop:   [28,30,28, 24,20,16, 14,12,12, 12,14,16, 14,12,12, 14,16,18, 20,22,20, 18,16,14],
  classical: [14,14,14, 14,14,14, 14,14,14, 14,14,14, 14,14,14, 14,14,14, 14,14,14, 14,14,14],
};

const EXPORT_FORMATS: { key: ExportFmt; label: string; desc: string }[] = [
  { key:'wav_hq',    label:'WAV 44.1kHz',  desc:'Highest quality for archiving' },
  { key:'mp3_social',label:'MP3 320kbps',  desc:'Optimised for Instagram / WhatsApp' },
  { key:'stems',     label:'Stems',        desc:'Separate vocal + instruments files' },
];

const LOUDNESS_TARGETS = [
  { label:'Spotify',   lufs:-14 },
  { label:'YouTube',   lufs:-14 },
  { label:'Apple',     lufs:-16 },
  { label:'Instagram', lufs:-14 },
];

export const MixModeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [preset,       setPreset      ] = useState<Preset>('clean_pop');
  const [exportFmt,    setExportFmt   ] = useState<ExportFmt>('wav_hq');
  const [loudnessTarget, setLoudness  ] = useState(-14);
  const [loading,      setLoading     ] = useState(false);
  const [exportUrl,    setExportUrl   ] = useState<string | null>(null);

  const runMix = async () => {
    setLoading(true);
    setExportUrl(null);
    try {
      const res = await fetch(`${BACKEND}/multitrack/mixdown`, {
        method:  'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          project_id:    `mix_${Date.now()}`,
          preset,
          loudness_lufs: loudnessTarget,
          format:        exportFmt,
        }),
      });
      const data = await res.json();
      setExportUrl(data.download_url ?? null);
    } catch (e) {
      console.error('Mix failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const shareMix = async () => {
    if (!exportUrl) return;
    try {
      await Share.share({
        message: `Listen to my mix on MAESTRO: ${exportUrl}`,
        url: exportUrl,
        title: 'MAESTRO Mix'
      });
    } catch(e) {
      console.error(e);
    }
  };

  return (
    <View style={s.root}>
      <View style={s.glowGold}   />
      <View style={s.veil}       />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTx}>←</Text>
        </Pressable>
        <Text style={s.title}>Mix & Export</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding:Spacing.lg, gap:Spacing.lg }}>

        {/* EQ Curve Visualization */}
        <View style={s.eqCard}>
          <Text style={s.sectionTitle}>EQ Curve ({PRESETS.find(p => p.key === preset)?.label})</Text>
          <View style={s.eqGraph}>
            {PRESET_EQ_CURVES[preset]?.map((h, i) => (
              <View key={i} style={[s.eqBar, { height: Math.max(2, h * 1.5) }]} />
            ))}
          </View>
          <View style={s.eqLabels}>
            {['20Hz', '200Hz', '1kHz', '5kHz', '20kHz'].map(f => (
              <Text key={f} style={s.eqLabel}>{f}</Text>
            ))}
          </View>
        </View>

        {/* Genre presets */}
        <View>
          <Text style={s.sectionTitle}>Genre Preset</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection:'row', gap:8, paddingVertical:4 }}>
              {PRESETS.map(p => (
                <Pressable
                  key={p.key}
                  style={[s.presetCard, preset === p.key && s.presetCardActive]}
                  onPress={() => setPreset(p.key)}
                >
                  <View style={s.presetHeader}>
                    <Text style={[s.presetLabel, preset === p.key && { color:Colors.gold }]}>
                      {p.label}
                    </Text>
                    <View style={s.estBadge}>
                       <Text style={s.estTimeTx}>{p.estTime}</Text>
                    </View>
                  </View>
                  <Text style={s.presetDesc}>{p.desc}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Loudness target */}
        <View>
          <Text style={s.sectionTitle}>Loudness Target (LUFS)</Text>
          <View style={s.loudnessRow}>
            {LOUDNESS_TARGETS.map(t => (
              <Pressable
                key={t.label}
                style={[s.loudBtn, loudnessTarget === t.lufs && s.loudBtnActive]}
                onPress={() => setLoudness(t.lufs)}
              >
                <Text style={[s.loudPlatform, loudnessTarget === t.lufs && { color:Colors.teal }]}>
                  {t.label}
                </Text>
                <Text style={[s.loudLufs, loudnessTarget === t.lufs && { color:Colors.teal }]}>
                  {t.lufs} LUFS
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Export format */}
        <View>
          <Text style={s.sectionTitle}>Export Format</Text>
          <View style={s.fmtRow}>
            {EXPORT_FORMATS.map(f => (
              <Pressable
                key={f.key}
                style={[s.fmtCard, exportFmt === f.key && s.fmtCardActive]}
                onPress={() => setExportFmt(f.key)}
              >
                <Text style={[s.fmtLabel, exportFmt === f.key && { color:Colors.gold }]}>{f.label}</Text>
                <Text style={s.fmtDesc}>{f.desc}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Export result */}
        {exportUrl && (
          <View style={s.successCard}>
            <Text style={s.successTitle}>Mix complete! ✦</Text>
            <Text style={s.successUrl}>{exportUrl}</Text>
            <Pressable style={s.shareBtn} onPress={shareMix}>
              <Text style={s.shareBtnTx}>Share Mix</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>

      {/* Mix CTA */}
      <View style={s.bottomBar}>
        <Pressable
          style={[s.mixBtn, loading && { opacity: 0.6 }]}
          onPress={runMix}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={Colors.bg} size="large" />
            : <Text style={s.mixBtnTx}>Mix & Export</Text>
          }
        </Pressable>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root:           { flex:1, backgroundColor:Colors.bg },
  glowGold:       { position:'absolute', width:280, height:280, borderRadius:140, backgroundColor:'rgba(212,175,55,0.22)', top:-40, right:-40 },
  veil:           { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.48)' },
  header:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingTop:52, paddingHorizontal:16, paddingBottom:12 },
  backBtn:        { width:36,height:36,borderRadius:18,backgroundColor:Colors.bgCard,borderWidth:1,borderColor:Colors.border,alignItems:'center',justifyContent:'center' },
  backTx:         { fontSize:18, color:Colors.textSecondary },
  title:          { fontSize:17, fontWeight:'700', color:Colors.textPrimary },
  sectionTitle:   { fontSize:12, fontWeight:'600', color:Colors.textMuted, marginBottom:10, letterSpacing:0.5 },
  eqCard:         { backgroundColor:Colors.bgCard, borderRadius:Radius.lg, borderWidth:1, borderColor:Colors.border, padding:Spacing.md },
  eqGraph:        { flexDirection:'row', alignItems:'flex-end', gap:2, height:60, marginBottom:6 },
  eqBar:          { flex:1, backgroundColor:Colors.teal, borderRadius:2, opacity:0.7 },
  eqLabels:       { flexDirection:'row', justifyContent:'space-between' },
  eqLabel:        { fontSize:8, color:Colors.textMuted },
  presetCard:     { width:140, backgroundColor:Colors.bgCard, borderRadius:Radius.md, borderWidth:1, borderColor:Colors.border, padding:Spacing.md },
  presetCardActive:{ backgroundColor:Colors.goldBg, borderColor:Colors.gold },
  presetHeader:   { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 },
  presetLabel:    { fontSize:13, fontWeight:'600', color:Colors.textPrimary, flex:1 },
  estBadge:       { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal:4, paddingVertical:2, borderRadius:4 },
  estTimeTx:      { fontSize:8, color:Colors.textMuted, fontWeight:'700' },
  presetDesc:     { fontSize:10, color:Colors.textMuted, lineHeight:15 },
  loudnessRow:    { flexDirection:'row', gap:8, flexWrap:'wrap' },
  loudBtn:        { flex:1, minWidth:70, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.md, padding:Spacing.md, alignItems:'center' },
  loudBtnActive:  { backgroundColor:Colors.tealBg, borderColor:Colors.teal },
  loudPlatform:   { fontSize:11, fontWeight:'600', color:Colors.textSecondary },
  loudLufs:       { fontSize:12, fontWeight:'700', color:Colors.textMuted, marginTop:2 },
  fmtRow:         { gap:8 },
  fmtCard:        { backgroundColor:Colors.bgCard, borderRadius:Radius.md, borderWidth:1, borderColor:Colors.border, padding:Spacing.md, flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  fmtCardActive:  { backgroundColor:Colors.goldBg, borderColor:Colors.gold },
  fmtLabel:       { fontSize:13, fontWeight:'600', color:Colors.textPrimary },
  fmtDesc:        { fontSize:11, color:Colors.textMuted },
  successCard:    { backgroundColor:'rgba(0,217,192,0.1)', borderWidth:1, borderColor:Colors.teal, borderRadius:Radius.md, padding:Spacing.md },
  successTitle:   { fontSize:16, fontWeight:'700', color:Colors.teal, marginBottom:6 },
  successUrl:     { fontSize:11, color:Colors.textMuted, marginBottom:12 },
  shareBtn:       { backgroundColor:Colors.teal, paddingVertical:10, borderRadius:Radius.md, alignItems:'center' },
  shareBtnTx:     { fontSize:13, fontWeight:'700', color:Colors.bg },
  bottomBar:      { padding:16, backgroundColor:Colors.bgSurf, borderTopWidth:1, borderTopColor:Colors.border },
  mixBtn:         { backgroundColor:Colors.gold, borderRadius:Radius.pill, paddingVertical:16, alignItems:'center', shadowColor:Colors.gold, shadowOffset:{width:0,height:0}, shadowOpacity:0.7, shadowRadius:14, elevation:8 },
  mixBtnTx:       { fontSize:16, fontWeight:'800', color:Colors.bg },
});
