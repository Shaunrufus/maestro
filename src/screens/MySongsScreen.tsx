// src/screens/MySongsScreen.tsx
// Shows all recordings saved by the user from Supabase.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { supabase, db } from '../services/supabase';
import { Colors, Radius, Spacing } from '../theme';

export const MySongsScreen: React.FC = () => {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading,    setLoading   ] = useState(true);

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await db.getUserRecordings(user.id);
      setRecordings(data ?? []);
    } catch (e) {
      console.warn("Supabase not configured, showing empty state.");
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  };

  const fmtDuration = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short' });

  return (
    <View style={s.root}>
      <View style={s.glowPurple} />
      <View style={s.veil}       />

      <View style={s.header}>
        <Text style={s.title}>My Songs</Text>
        <Text style={s.count}>{recordings.length} recordings</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.gold} style={{ marginTop:60 }} />
      ) : recordings.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🎙</Text>
          <Text style={s.emptyTitle}>No recordings yet</Text>
          <Text style={s.emptySub}>Go to Studio and record your first song!</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {recordings.map((rec, i) => (
            <Pressable key={i} style={s.card}>
              <View style={s.cardIcon}>
                <Text style={{ fontSize:20 }}>🎵</Text>
              </View>
              <View style={s.cardInfo}>
                <Text style={s.cardName}>{rec.project_name}</Text>
                <Text style={s.cardMeta}>
                  {fmtDate(rec.created_at)}  ·  {fmtDuration(rec.duration_ms ?? 0)}
                  {rec.key ? `  ·  Key: ${rec.key}` : ''}
                </Text>
                {rec.instruments?.length > 0 && (
                  <Text style={s.cardInstr}>{rec.instruments.join(' · ')}</Text>
                )}
              </View>
              <View style={s.cardActions}>
                <Pressable style={s.actionBtn}>
                  <Text style={s.actionTx}>▶</Text>
                </Pressable>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root:        { flex:1, backgroundColor:Colors.bg },
  glowPurple:  { position:'absolute', width:260, height:260, borderRadius:130, backgroundColor:'rgba(106,42,230,0.3)', top:-40, left:-40 },
  veil:        { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.5)' },
  header:      { paddingTop:60, paddingHorizontal:Spacing.lg, paddingBottom:Spacing.lg, flexDirection:'row', justifyContent:'space-between', alignItems:'flex-end' },
  title:       { fontSize:26, fontWeight:'800', color:Colors.textPrimary },
  count:       { fontSize:13, color:Colors.textMuted, marginBottom:3 },
  list:        { padding:Spacing.lg, gap:Spacing.md },
  empty:       { flex:1, alignItems:'center', justifyContent:'center', padding:40 },
  emptyIcon:   { fontSize:56, marginBottom:16 },
  emptyTitle:  { fontSize:20, fontWeight:'700', color:Colors.textPrimary, marginBottom:8 },
  emptySub:    { fontSize:14, color:Colors.textSecondary, textAlign:'center', lineHeight:22 },
  card:        { flexDirection:'row', alignItems:'center', gap:Spacing.md, backgroundColor:Colors.bgCard, borderRadius:Radius.lg, borderWidth:1, borderColor:Colors.border, padding:Spacing.md },
  cardIcon:    { width:48, height:48, borderRadius:24, backgroundColor:Colors.bgSurf, alignItems:'center', justifyContent:'center' },
  cardInfo:    { flex:1 },
  cardName:    { fontSize:14, fontWeight:'600', color:Colors.textPrimary, marginBottom:3 },
  cardMeta:    { fontSize:11, color:Colors.textMuted },
  cardInstr:   { fontSize:10, color:Colors.teal, marginTop:2 },
  cardActions: { gap:6 },
  actionBtn:   { width:34, height:34, borderRadius:17, backgroundColor:Colors.tealBg, borderWidth:1, borderColor:Colors.teal, alignItems:'center', justifyContent:'center' },
  actionTx:    { fontSize:12, color:Colors.teal },
});
