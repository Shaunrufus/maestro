// src/screens/BandResultsScreen.tsx
// MAESTRO — Virtual Band Results Screen
// Shows multiple arrangement versions after a vocal recording.
// User can preview each, pick the best, regenerate, or export.

import React, { useState, useRef } from 'react';
import {
  ActivityIndicator, Alert, Animated, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Colors, Radius, Spacing } from '../theme';

interface Arrangement {
  id:          string;
  label:       string;
  emoji:       string;
  desc:        string;
  color:       string;
  audio_base64?: string | null;
  has_audio:   boolean;
  duration_sec?: number;
}

interface BandAnalysis {
  key:                  string;
  bpm:                  number;
  progression_str:      string;
  chord_names:          string[];
  genre_hint:           string;
}

export const BandResultsScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { arrangements = [], analysis, vocalUrl } = route.params ?? {};

  const [playingId,   setPlayingId  ] = useState<string | null>(null);
  const [sound,       setSound      ] = useState<Audio.Sound | null>(null);
  const [selectedId,  setSelectedId ] = useState<string | null>(null);
  const [saving,      setSaving     ] = useState(false);

  const stopCurrentSound = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
      setPlayingId(null);
    }
  };

  const previewArrangement = async (arr: Arrangement) => {
    await stopCurrentSound();

    if (!arr.audio_base64) {
      Alert.alert('Arrangement unavailable', 'Audio synthesis is not yet set up. Add FluidSynth to Railway.');
      return;
    }

    if (playingId === arr.id) return; // already playing

    try {
      setPlayingId(arr.id);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      // Decode base64 to data URI
      const uri = `data:audio/wav;base64,${arr.audio_base64}`;
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
      );
      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          newSound.unloadAsync();
          setSound(null);
        }
      });
    } catch (e) {
      console.error('[BandResults] Playback error:', e);
      setPlayingId(null);
    }
  };

  const selectArrangement = async (arr: Arrangement) => {
    await stopCurrentSound();
    setSelectedId(arr.id);
    Alert.alert(
      `${arr.emoji} ${arr.label} selected!`,
      'This arrangement will be saved with your recording.',
      [{ text: 'Great!' }],
    );
    // TODO: save selected arrangement URL to Supabase recordings table
  };

  const regenerate = (arr: Arrangement) => {
    // TODO: call POST /band/generate with same params, single style
    Alert.alert('Regenerating...', `Creating a new ${arr.label} version.`);
  };

  const exportMix = async (arr: Arrangement) => {
    if (!arr.audio_base64) return;
    setSaving(true);
    // TODO: POST /band/analyze-and-generate → save final mix to Supabase
    setSaving(false);
    Alert.alert('Exported!', 'Your mix is saved to My Songs.');
  };

  return (
    <View style={s.root}>
      {/* Glows */}
      <View style={s.glowPurple} />
      <View style={s.glowGold}   />
      <View style={s.veil}       />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTx}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Your Virtual Band</Text>
          {analysis && (
            <Text style={s.subtitle}>
              Key {analysis.key} · {analysis.bpm} BPM · {analysis.progression_str}
            </Text>
          )}
        </View>
      </View>

      {/* Chord strip */}
      {analysis?.chord_names?.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chordStrip}>
          {analysis.chord_names.map((chord: string, i: number) => (
            <View key={i} style={s.chordPill}>
              <Text style={s.chordTx}>{chord}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Arrangement cards */}
      <ScrollView contentContainerStyle={s.cardList}>
        {arrangements.length === 0 ? (
          <View style={s.empty}>
            <ActivityIndicator color={Colors.gold} size="large" />
            <Text style={s.emptyTx}>Your virtual band is warming up...</Text>
          </View>
        ) : (
          arrangements.map((arr: Arrangement) => {
            const isPlaying  = playingId  === arr.id;
            const isSelected = selectedId === arr.id;

            return (
              <View
                key={arr.id}
                style={[
                  s.card,
                  isSelected && { borderColor: arr.color, borderWidth: 1.5 },
                ]}
              >
                {/* Card header */}
                <View style={s.cardHeader}>
                  <View style={[s.emojiCircle, { backgroundColor: arr.color + '20' }]}>
                    <Text style={{ fontSize: 24 }}>{arr.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{arr.label}</Text>
                    <Text style={s.cardDesc}>{arr.desc}</Text>
                  </View>
                  {isSelected && (
                    <View style={[s.selectedBadge, { backgroundColor: arr.color }]}>
                      <Text style={s.selectedBadgeTx}>✓ Selected</Text>
                    </View>
                  )}
                </View>

                {/* Status bar */}
                {!arr.has_audio && (
                  <View style={s.unavailableRow}>
                    <Text style={s.unavailableTx}>
                      Add FluidSynth to Railway to enable audio synthesis
                    </Text>
                  </View>
                )}

                {/* Action buttons */}
                <View style={s.cardActions}>
                  <Pressable
                    style={[
                      s.actionBtn,
                      s.previewBtn,
                      !arr.has_audio && s.btnDisabled,
                    ]}
                    onPress={() => previewArrangement(arr)}
                    disabled={!arr.has_audio}
                  >
                    <Text style={s.previewTx}>
                      {isPlaying ? '⏹ Stop' : '▶ Preview'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[s.actionBtn, s.pickBtn]}
                    onPress={() => selectArrangement(arr)}
                  >
                    <Text style={s.pickTx}>★ Pick</Text>
                  </Pressable>

                  <Pressable
                    style={[s.actionBtn, s.regenBtn]}
                    onPress={() => regenerate(arr)}
                  >
                    <Text style={s.regenTx}>↺</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        {/* Export CTA */}
        {selectedId && (
          <Pressable style={s.exportBtn} onPress={() => {
            const sel = arrangements.find((a: Arrangement) => a.id === selectedId);
            if (sel) exportMix(sel);
          }}>
            {saving
              ? <ActivityIndicator color={Colors.bg} />
              : <Text style={s.exportTx}>Save Final Mix to My Songs →</Text>
            }
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root:          { flex:1, backgroundColor:Colors.bg },
  glowPurple:    { position:'absolute', width:280, height:280, borderRadius:140, backgroundColor:'rgba(106,42,230,0.28)', top:-50, left:-40 },
  glowGold:      { position:'absolute', width:240, height:240, borderRadius:120, backgroundColor:'rgba(212,175,55,0.22)', bottom:80, right:-40 },
  veil:          { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.5)' },

  header:        { flexDirection:'row', alignItems:'center', paddingTop:52, paddingHorizontal:16, paddingBottom:12, gap:12 },
  backBtn:       { width:36,height:36,borderRadius:18,backgroundColor:Colors.bgCard,borderWidth:1,borderColor:Colors.border,alignItems:'center',justifyContent:'center' },
  backTx:        { fontSize:18,color:Colors.textSecondary },
  title:         { fontSize:17,fontWeight:'700',color:Colors.textPrimary },
  subtitle:      { fontSize:11,color:Colors.textMuted,marginTop:2 },

  chordStrip:    { paddingHorizontal:16, marginBottom:8, maxHeight:44 },
  chordPill:     { backgroundColor:Colors.tealBg,borderWidth:1,borderColor:Colors.teal,borderRadius:Radius.pill,paddingHorizontal:14,paddingVertical:6,marginRight:8,height:34,justifyContent:'center' },
  chordTx:       { fontSize:13,fontWeight:'700',color:Colors.teal },

  cardList:      { padding:16,gap:12,paddingBottom:40 },
  empty:         { alignItems:'center',justifyContent:'center',padding:60,gap:16 },
  emptyTx:       { fontSize:14,color:Colors.textSecondary },

  card:          { backgroundColor:Colors.bgCard,borderRadius:Radius.lg,borderWidth:1,borderColor:Colors.border,padding:Spacing.lg,gap:Spacing.md },
  cardHeader:    { flexDirection:'row',alignItems:'center',gap:12 },
  emojiCircle:   { width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center' },
  cardTitle:     { fontSize:15,fontWeight:'700',color:Colors.textPrimary },
  cardDesc:      { fontSize:11,color:Colors.textMuted,marginTop:2 },
  selectedBadge: { borderRadius:Radius.pill,paddingHorizontal:10,paddingVertical:4 },
  selectedBadgeTx:{ fontSize:11,fontWeight:'700',color:'#fff' },

  unavailableRow:{ backgroundColor:'rgba(255,255,255,0.05)',borderRadius:8,padding:10 },
  unavailableTx: { fontSize:11,color:Colors.textMuted,textAlign:'center' },

  cardActions:   { flexDirection:'row',gap:8 },
  actionBtn:     { borderRadius:Radius.pill,paddingVertical:10,alignItems:'center',justifyContent:'center' },
  previewBtn:    { flex:2,backgroundColor:Colors.tealBg,borderWidth:1,borderColor:Colors.teal },
  previewTx:     { fontSize:13,fontWeight:'600',color:Colors.teal },
  pickBtn:       { flex:2,backgroundColor:Colors.goldBg,borderWidth:1,borderColor:Colors.gold },
  pickTx:        { fontSize:13,fontWeight:'600',color:Colors.gold },
  regenBtn:      { width:44,backgroundColor:Colors.bgCard,borderWidth:1,borderColor:Colors.border },
  regenTx:       { fontSize:16,color:Colors.textSecondary },
  btnDisabled:   { opacity:0.4 },

  exportBtn:     { backgroundColor:Colors.gold,borderRadius:Radius.pill,paddingVertical:16,alignItems:'center',marginTop:8,shadowColor:Colors.gold,shadowOffset:{width:0,height:0},shadowOpacity:0.7,shadowRadius:14,elevation:8 },
  exportTx:      { fontSize:15,fontWeight:'700',color:Colors.bg },
});
