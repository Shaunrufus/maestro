// src/screens/DiscoverScreen.tsx
// Community feed — public recordings, weekly challenge, trending artists

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { Audio } from 'expo-av';
import { supabase } from '../services/supabase';
import { Colors, Radius, Spacing } from '../theme';

interface PublicRecording {
  id:           string;
  user_id:      string;
  project_name: string;
  duration_ms:  number;
  key:          string;
  bpm:          number;
  file_url:     string;
  created_at:   string;
}

const WEEKLY_CHALLENGE = {
  title:    '🎙 Week 4 Challenge',
  song:     '"Tera Ban Jaunga" — Kabir Singh',
  ends:     '7 days left',
  entries:  42,
  desc:     'Record a cover of this romantic bollywood classic. Best pitch score wins!',
};

const GENRES = ['All', 'Bollywood', 'Classical', 'Pop', 'Devotional', 'Hip-hop'];

export const DiscoverScreen: React.FC = () => {
  const [recordings, setRecordings] = useState<PublicRecording[]>([]);
  const [loading,    setLoading   ] = useState(true);
  const [genre,      setGenre     ] = useState('All');
  const [playingId,  setPlayingId ] = useState<string | null>(null);
  const [sound,      setSound     ] = useState<Audio.Sound | null>(null);

  useEffect(() => {
    loadPublicRecordings();
    return () => { sound?.unloadAsync(); };
  }, []);

  const loadPublicRecordings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setRecordings(data as PublicRecording[]);
      }
    } catch (e) {
      // Table may not have is_public column yet — silently ignore
      console.log('[Discover] No public recordings found (is_public column may not exist)');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (rec: PublicRecording) => {
    try {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        if (playingId === rec.id) { setPlayingId(null); return; }
      }
      setPlayingId(rec.id);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound: s } = await Audio.Sound.createAsync({ uri: rec.file_url }, { shouldPlay: true });
      setSound(s);
      s.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          s.unloadAsync(); setSound(null); setPlayingId(null);
        }
      });
    } catch (e) {
      setPlayingId(null);
      Alert.alert('Playback failed', 'Could not play this recording.');
    }
  };

  const fmtDuration = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short' });

  // Demo recordings shown while community is empty
  const DEMO_RECORDS = [
    { id:'d1', user_id:'demo1', project_name:'Tum Hi Ho Cover', duration_ms:187000, key:'C', bpm:68, file_url:'', created_at: new Date().toISOString() },
    { id:'d2', user_id:'demo2', project_name:'Raabta Original', duration_ms:212000, key:'Am', bpm:82, file_url:'', created_at: new Date().toISOString() },
    { id:'d3', user_id:'demo3', project_name:'Morning Raga', duration_ms:143000, key:'D', bpm:60, file_url:'', created_at: new Date().toISOString() },
    { id:'d4', user_id:'demo4', project_name:'Bhajan Session', duration_ms:305000, key:'G', bpm:75, file_url:'', created_at: new Date().toISOString() },
  ] as PublicRecording[];

  const displayRecords = recordings.length > 0 ? recordings : DEMO_RECORDS;
  const isDemoMode    = recordings.length === 0;

  return (
    <View style={s.root}>
      <View style={s.glowTeal}   />
      <View style={s.glowGold}   />
      <View style={s.veil}       />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Discover</Text>
          <Text style={s.subtitle}>Community Studio</Text>
        </View>

        {/* Weekly Challenge Banner */}
        <View style={s.challengeCard}>
          <View style={s.challengeHeader}>
            <View>
              <Text style={s.challengeTag}>WEEKLY CHALLENGE</Text>
              <Text style={s.challengeTitle}>{WEEKLY_CHALLENGE.song}</Text>
            </View>
            <View style={s.challengeBadge}>
              <Text style={s.challengeBadgeTx}>{WEEKLY_CHALLENGE.entries}</Text>
              <Text style={s.challengeBadgeSub}>entries</Text>
            </View>
          </View>
          <Text style={s.challengeDesc}>{WEEKLY_CHALLENGE.desc}</Text>
          <View style={s.challengeFooter}>
            <Text style={s.challengeEnds}>⏱ {WEEKLY_CHALLENGE.ends}</Text>
            <Pressable style={s.joinBtn}>
              <Text style={s.joinTx}>Join Challenge</Text>
            </Pressable>
          </View>
        </View>

        {/* Genre filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.genreRow}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: 8 }}
        >
          {GENRES.map(g => (
            <Pressable
              key={g}
              style={[s.genreChip, genre === g && s.genreChipActive]}
              onPress={() => setGenre(g)}
            >
              <Text style={[s.genreTx, genre === g && s.genreTxActive]}>{g}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Section header */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>
            {isDemoMode ? 'Top Community Picks' : 'Recent Recordings'}
          </Text>
          {isDemoMode && (
            <View style={s.demoBadge}>
              <Text style={s.demoBadgeTx}>PREVIEW</Text>
            </View>
          )}
        </View>

        {/* Feed */}
        {loading ? (
          <ActivityIndicator color={Colors.gold} style={{ marginTop: 40 }} size="large" />
        ) : (
          <View style={s.feed}>
            {displayRecords.map((rec, idx) => {
              const isPlaying = playingId === rec.id;
              const avatarLetter = String.fromCharCode(65 + (idx % 26));
              const avatarColor  = [Colors.teal, Colors.gold, Colors.red, Colors.purple][idx % 4];
              return (
                <View key={rec.id} style={s.card}>
                  {/* Artist avatar */}
                  <View style={[s.avatar, { backgroundColor: avatarColor + '30', borderColor: avatarColor }]}>
                    <Text style={[s.avatarTx, { color: avatarColor }]}>{avatarLetter}</Text>
                  </View>

                  {/* Info */}
                  <View style={s.cardInfo}>
                    <Text style={s.cardName} numberOfLines={1}>{rec.project_name}</Text>
                    <Text style={s.cardMeta}>
                      {fmtDate(rec.created_at)}  ·  {fmtDuration(rec.duration_ms ?? 0)}
                      {rec.key ? `  ·  ${rec.key}` : ''}
                    </Text>
                    {/* Fake waveform */}
                    <View style={s.miniWave}>
                      {Array.from({ length: 16 }, (_, i) => (
                        <View
                          key={i}
                          style={[s.miniBar, {
                            height: 3 + (isPlaying ? Math.sin(i + Date.now() / 200) * 5 : Math.sin(i * 0.7) * 4),
                            backgroundColor: isPlaying ? Colors.teal : Colors.border,
                            opacity: isPlaying ? 1 : 0.6,
                          }]}
                        />
                      ))}
                    </View>
                  </View>

                  {/* Play button */}
                  <Pressable
                    style={[s.playBtn, isPlaying && s.playBtnActive, !rec.file_url && { opacity: 0.4 }]}
                    onPress={() => rec.file_url ? handlePlay(rec) : undefined}
                    disabled={!rec.file_url}
                  >
                    <Text style={[s.playTx, isPlaying && { color: Colors.bg }]}>
                      {isPlaying ? '⏹' : '▶'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {/* Share CTA */}
        {isDemoMode && (
          <View style={s.shareCard}>
            <Text style={s.shareTitle}>Be the first to share! 🎤</Text>
            <Text style={s.shareSub}>Record a song in Studio, then share it to the community feed.</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root:             { flex:1, backgroundColor:Colors.bg },
  glowTeal:         { position:'absolute', width:260, height:260, borderRadius:130, backgroundColor:'rgba(0,217,192,0.18)', top:-60, right:-40 },
  glowGold:         { position:'absolute', width:200, height:200, borderRadius:100, backgroundColor:'rgba(212,175,55,0.15)', top:200, left:-60 },
  veil:             { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.5)' },

  header:           { paddingTop:60, paddingHorizontal:Spacing.lg, paddingBottom:Spacing.sm },
  title:            { fontSize:26, fontWeight:'800', color:Colors.textPrimary },
  subtitle:         { fontSize:13, color:Colors.textMuted, marginTop:2 },

  challengeCard:    { margin:Spacing.lg, backgroundColor:'rgba(212,175,55,0.12)', borderWidth:1, borderColor:Colors.gold, borderRadius:Radius.lg, padding:Spacing.lg },
  challengeHeader:  { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:Spacing.sm },
  challengeTag:     { fontSize:9, fontWeight:'800', color:Colors.gold, letterSpacing:1, marginBottom:4 },
  challengeTitle:   { fontSize:16, fontWeight:'700', color:Colors.textPrimary, maxWidth:'80%' },
  challengeBadge:   { backgroundColor:Colors.gold, borderRadius:Radius.md, paddingHorizontal:10, paddingVertical:6, alignItems:'center' },
  challengeBadgeTx: { fontSize:18, fontWeight:'800', color:Colors.bg },
  challengeBadgeSub:{ fontSize:8, fontWeight:'600', color:Colors.bg },
  challengeDesc:    { fontSize:12, color:Colors.textSecondary, lineHeight:18, marginBottom:Spacing.md },
  challengeFooter:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  challengeEnds:    { fontSize:11, color:Colors.textMuted },
  joinBtn:          { backgroundColor:Colors.gold, borderRadius:Radius.pill, paddingHorizontal:18, paddingVertical:8 },
  joinTx:           { fontSize:12, fontWeight:'700', color:Colors.bg },

  genreRow:         { marginBottom:Spacing.md },
  genreChip:        { borderRadius:Radius.pill, paddingHorizontal:14, paddingVertical:7, borderWidth:1, borderColor:Colors.border, backgroundColor:Colors.bgCard },
  genreChipActive:  { backgroundColor:Colors.tealBg, borderColor:Colors.teal },
  genreTx:          { fontSize:12, color:Colors.textMuted },
  genreTxActive:    { color:Colors.teal, fontWeight:'600' },

  sectionRow:       { flexDirection:'row', alignItems:'center', paddingHorizontal:Spacing.lg, marginBottom:Spacing.sm, gap:8 },
  sectionTitle:     { fontSize:13, fontWeight:'700', color:Colors.textSecondary, letterSpacing:0.3 },
  demoBadge:        { backgroundColor:Colors.bgCard, borderRadius:4, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor:Colors.border },
  demoBadgeTx:      { fontSize:8, fontWeight:'700', color:Colors.textMuted },

  feed:             { paddingHorizontal:Spacing.lg, gap:Spacing.sm },
  card:             { flexDirection:'row', alignItems:'center', gap:Spacing.md, backgroundColor:Colors.bgCard, borderRadius:Radius.lg, borderWidth:1, borderColor:Colors.border, padding:Spacing.md },
  avatar:           { width:44, height:44, borderRadius:22, borderWidth:1, alignItems:'center', justifyContent:'center', flexShrink:0 },
  avatarTx:         { fontSize:16, fontWeight:'800' },
  cardInfo:         { flex:1, minWidth:0 },
  cardName:         { fontSize:13, fontWeight:'600', color:Colors.textPrimary, marginBottom:2 },
  cardMeta:         { fontSize:10, color:Colors.textMuted, marginBottom:4 },
  miniWave:         { flexDirection:'row', alignItems:'center', gap:2 },
  miniBar:          { width:3, borderRadius:1 },
  playBtn:          { width:36, height:36, borderRadius:18, backgroundColor:Colors.tealBg, borderWidth:1, borderColor:Colors.teal, alignItems:'center', justifyContent:'center', flexShrink:0 },
  playBtnActive:    { backgroundColor:Colors.teal },
  playTx:           { fontSize:12, color:Colors.teal },

  shareCard:        { margin:Spacing.lg, backgroundColor:Colors.bgCard, borderRadius:Radius.lg, borderWidth:1, borderColor:Colors.border, padding:Spacing.xl, alignItems:'center' },
  shareTitle:       { fontSize:16, fontWeight:'700', color:Colors.textPrimary, marginBottom:8 },
  shareSub:         { fontSize:13, color:Colors.textSecondary, textAlign:'center', lineHeight:20 },
});
