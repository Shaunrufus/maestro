// src/screens/MySongsScreen.tsx
// Shows all recordings saved by the user from Supabase, with real playback.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { Audio } from 'expo-av';
import { supabase, db } from '../services/supabase';
import { Colors, Radius, Spacing } from '../theme';

export const MySongsScreen: React.FC = () => {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading,    setLoading   ] = useState(true);
  const [playingId,  setPlayingId ] = useState<string | null>(null);
  const [sound,      setSound     ] = useState<Audio.Sound | null>(null);

  useEffect(() => {
    loadRecordings();
    // Unload any sound when screen unmounts
    return () => { sound?.unloadAsync(); };
  }, []);

  const loadRecordings = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id || 'anonymous';
      
      const { data } = await db.getUserRecordings(currentUserId);
      setRecordings(data ?? []);
    } catch (e) {
      console.warn('Could not load recordings:', e);
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (rec: any) => {
    try {
      // Stop any currently playing audio
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        if (playingId === rec.id) {
          setPlayingId(null);
          return;
        }
      }

      if (!rec.file_url) {
        Alert.alert('No audio', 'This recording has no audio URL.');
        return;
      }

      setPlayingId(rec.id);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:   false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: rec.file_url },
        { shouldPlay: true, volume: 1.0 }
      );
      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          newSound.unloadAsync();
          setSound(null);
          setPlayingId(null);
        }
      });
    } catch (e) {
      console.error('[MySongs] Playback error:', e);
      setPlayingId(null);
      Alert.alert('Playback failed', 'Could not play this recording.');
    }
  };

  const handleDelete = async (rec: any) => {
    Alert.alert('Delete recording?', rec.project_name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            if (rec.file_url) {
              const parts = rec.file_url.split('/recordings/');
              if (parts.length > 1) {
                const storagePath = parts[1];
                await supabase.storage.from('recordings').remove([storagePath]);
                console.log('[MySongs] Deleted from storage:', storagePath);
              }
            }
            await supabase.from('recordings').delete().eq('id', rec.id);
            setRecordings(prev => prev.filter(r => r.id !== rec.id));
          } catch (e) {
            console.error('[MySongs] Delete error:', e);
          }
        },
      },
    ]);
  };

  const fmtDuration = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' });

  return (
    <View style={s.root}>
      <View style={s.glowPurple} />
      <View style={s.veil}       />

      <View style={s.header}>
        <View>
          <Text style={s.title}>My Songs</Text>
          <Text style={s.count}>{recordings.length} recording{recordings.length !== 1 ? 's' : ''}</Text>
        </View>
        <Pressable style={s.refreshBtn} onPress={loadRecordings}>
          <Text style={s.refreshTx}>↻</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.gold} style={{ marginTop:60 }} size="large" />
      ) : recordings.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🎙</Text>
          <Text style={s.emptyTitle}>No recordings yet</Text>
          <Text style={s.emptySub}>Go to Studio, record your first song, and it will appear here!</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {recordings.map((rec) => {
            const isPlaying = playingId === rec.id;
            return (
              <View key={rec.id} style={s.card}>
                {/* Song icon */}
                <View style={[s.cardIcon, isPlaying && s.cardIconPlaying]}>
                  <Text style={{ fontSize: 20 }}>{isPlaying ? '🔊' : '🎵'}</Text>
                </View>

                {/* Info */}
                <View style={s.cardInfo}>
                  <Text style={s.cardName} numberOfLines={1}>{rec.project_name}</Text>
                  <Text style={s.cardMeta}>
                    {fmtDate(rec.created_at)}  ·  {fmtDuration(rec.duration_ms ?? 0)}
                    {rec.key ? `  ·  Key: ${rec.key}` : ''}
                    {rec.bpm ? `  ·  ${rec.bpm} BPM` : ''}
                  </Text>
                  {rec.instruments?.length > 0 && (
                    <Text style={s.cardInstr}>{rec.instruments.join(' · ')}</Text>
                  )}
                </View>

                {/* Actions */}
                <View style={s.cardActions}>
                  <Pressable
                    style={[s.actionBtn, isPlaying && s.actionBtnPlaying]}
                    onPress={() => handlePlay(rec)}
                  >
                    <Text style={[s.actionTx, isPlaying && { color: Colors.bg }]}>
                      {isPlaying ? '⏹' : '▶'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={s.deleteBtn}
                    onPress={() => handleDelete(rec)}
                  >
                    <Text style={s.deleteTx}>✕</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root:             { flex:1, backgroundColor:Colors.bg },
  glowPurple:       { position:'absolute', width:260, height:260, borderRadius:130, backgroundColor:'rgba(106,42,230,0.3)', top:-40, left:-40 },
  veil:             { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.5)' },
  header:           { paddingTop:60, paddingHorizontal:Spacing.lg, paddingBottom:Spacing.lg, flexDirection:'row', justifyContent:'space-between', alignItems:'flex-end' },
  title:            { fontSize:26, fontWeight:'800', color:Colors.textPrimary },
  count:            { fontSize:13, color:Colors.textMuted, marginTop:2 },
  refreshBtn:       { width:38, height:38, borderRadius:19, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, alignItems:'center', justifyContent:'center' },
  refreshTx:        { fontSize:18, color:Colors.teal },
  list:             { padding:Spacing.lg, gap:Spacing.md, paddingBottom:40 },
  empty:            { flex:1, alignItems:'center', justifyContent:'center', padding:40 },
  emptyIcon:        { fontSize:56, marginBottom:16 },
  emptyTitle:       { fontSize:20, fontWeight:'700', color:Colors.textPrimary, marginBottom:8 },
  emptySub:         { fontSize:14, color:Colors.textSecondary, textAlign:'center', lineHeight:22 },
  card:             { flexDirection:'row', alignItems:'center', gap:Spacing.md, backgroundColor:Colors.bgCard, borderRadius:Radius.lg, borderWidth:1, borderColor:Colors.border, padding:Spacing.md },
  cardIcon:         { width:48, height:48, borderRadius:24, backgroundColor:Colors.bgSurf, alignItems:'center', justifyContent:'center' },
  cardIconPlaying:  { backgroundColor:Colors.tealBg, borderWidth:1, borderColor:Colors.teal },
  cardInfo:         { flex:1 },
  cardName:         { fontSize:14, fontWeight:'600', color:Colors.textPrimary, marginBottom:3 },
  cardMeta:         { fontSize:11, color:Colors.textMuted },
  cardInstr:        { fontSize:10, color:Colors.teal, marginTop:2 },
  cardActions:      { gap:6 },
  actionBtn:        { width:34, height:34, borderRadius:17, backgroundColor:Colors.tealBg, borderWidth:1, borderColor:Colors.teal, alignItems:'center', justifyContent:'center' },
  actionBtnPlaying: { backgroundColor:Colors.teal },
  actionTx:         { fontSize:12, color:Colors.teal },
  deleteBtn:        { width:34, height:34, borderRadius:17, backgroundColor:Colors.bgSurf, borderWidth:1, borderColor:Colors.border, alignItems:'center', justifyContent:'center' },
  deleteTx:         { fontSize:11, color:Colors.textMuted },
});
