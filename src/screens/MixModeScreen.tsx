import React, { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { Colors, Radius, Spacing } from '../theme';

const BACKEND = 'https://maestro-production-c525.up.railway.app';

type Preset   = 'clean_pop' | 'lofi' | 'worship' | 'bollywood' | 'hip_hop' | 'classical';
type ExportFmt = 'wav_hq' | 'mp3_social' | 'stems';

const PRESETS: { key: Preset; label: string; desc: string }[] = [
  { key:'clean_pop',  label:'Clean Pop',   desc:'Bright EQ, light compression, wide stereo' },
  { key:'lofi',       label:'Lo-Fi',       desc:'Warm low-pass, tape saturation, vinyl noise' },
  { key:'worship',    label:'Worship',     desc:'Open reverb, soft compression, airy highs' },
  { key:'bollywood',  label:'Bollywood',   desc:'Punchy mid boost, reverb, bright presence' },
  { key:'hip_hop',    label:'Hip-Hop',     desc:'Heavy sub, punchy drums, compressed vocals' },
  { key:'classical',  label:'Classical',   desc:'Natural room, minimal processing, wide dynamics' },
];

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

        {/* EQ visual placeholder */}
        <View style={s.eqCard}>
          <Text style={s.sectionTitle}>EQ Curve</Text>
          <View style={s.eqGraph}>
            {[...Array(24)].map((_, i) => {
              const h = 10 + Math.sin(i / 4) * 20 + Math.random() * 12;
              return (
                <View key={i} style={[s.eqBar, { height: h }]} />
              );
            })}
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
                  <Text style={[s.presetLabel, preset === p.key && { color:Colors.gold }]}>
                    {p.label}
                  </Text>
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
            <Text style={s.successSub}>File saved to Supabase Storage. Download from My Songs.</Text>
          </View>
        )}

      </ScrollView>

      {/* Mix CTA */}
      <View style={s.bottomBar}>
        <Pressable
          style={[s.mixBtn, loading && { opacity:0.6 }]}
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
  presetCard:     { width:130, backgroundColor:Colors.bgCard, borderRadius:Radius.md, borderWidth:1, borderColor:Colors.border, padding:Spacing.md },
  presetCardActive:{ backgroundColor:Colors.goldBg, borderColor:Colors.gold },
  presetLabel:    { fontSize:13, fontWeight:'600', color:Colors.textPrimary, marginBottom:4 },
  presetDesc:     { fontSize:10, color:Colors.textMuted, lineHeight:16 },
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
  successUrl:     { fontSize:11, color:Colors.textMuted, marginBottom:4 },
  successSub:     { fontSize:12, color:Colors.textSecondary },
  bottomBar:      { padding:16, backgroundColor:Colors.bgSurf, borderTopWidth:1, borderTopColor:Colors.border },
  mixBtn:         { backgroundColor:Colors.gold, borderRadius:Radius.pill, paddingVertical:16, alignItems:'center', shadowColor:Colors.gold, shadowOffset:{width:0,height:0}, shadowOpacity:0.7, shadowRadius:14, elevation:8 },
  mixBtnTx:       { fontSize:16, fontWeight:'800', color:Colors.bg },
});
