// src/screens/LyricsScreen.tsx
// MAESTRO Lyrics Editor
// Features: AI autocomplete, rhyme suggestions, mood selector,
//           language toggle (English / Hindi / Telugu), syllable count

import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Colors, Radius, Spacing } from '../theme';

type Language = 'english' | 'hindi' | 'telugu';
type Mood     = 'upbeat' | 'romantic' | 'sad' | 'devotional' | 'party' | 'motivational';

const LANGUAGES: { key: Language; label: string }[] = [
  { key:'english',  label:'EN' },
  { key:'hindi',    label:'HI' },
  { key:'telugu',   label:'TE' },
];

const MOODS: { key: Mood; label: string; color: string }[] = [
  { key:'upbeat',      label:'Upbeat',      color:Colors.teal  },
  { key:'romantic',    label:'Romantic',    color:Colors.red   },
  { key:'sad',         label:'Sad',         color:Colors.purple },
  { key:'devotional',  label:'Devotional',  color:Colors.gold  },
  { key:'party',       label:'Party',       color:Colors.teal  },
  { key:'motivational',label:'Motivational',color:Colors.gold  },
];

const BACKEND = 'https://YOUR_BACKEND_URL';

export const LyricsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [lyrics,      setLyrics     ] = useState('');
  const [prompt,      setPrompt     ] = useState('');
  const [language,    setLanguage   ] = useState<Language>('english');
  const [mood,        setMood       ] = useState<Mood>('upbeat');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading,     setLoading    ] = useState(false);

  const wordCount    = lyrics.trim().split(/\s+/).filter(Boolean).length;
  const lineCount    = lyrics.trim().split('\n').filter(Boolean).length;

  const generateLyrics = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append('prompt',   prompt);
      form.append('language', language);
      form.append('mood',     mood);
      form.append('lines',    '4');

      const res  = await fetch(`${BACKEND}/guru/lyrics`, { method:'POST', body:form });
      const data = await res.json();

      if (data.lines?.length) setSuggestions(data.lines);
    } catch {
      setSuggestions(['Could not reach Guru. Check your backend URL.']);
    } finally {
      setLoading(false);
    }
  };

  const applySuggestion = (line: string) => {
    setLyrics(prev => prev + (prev ? '\n' : '') + line);
    setSuggestions([]);
  };

  return (
    <View style={s.root}>
      <View style={s.glowPurple} />
      <View style={s.veil}       />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTx}>←</Text>
        </Pressable>
        <Text style={s.title}>Lyrics Editor</Text>
        <View style={s.stats}>
          <Text style={s.statTx}>{lineCount}L · {wordCount}W</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex:1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={s.scroll} contentContainerStyle={{ padding:Spacing.lg, gap:Spacing.md }}>

          {/* Language selector */}
          <View style={s.row}>
            {LANGUAGES.map(lang => (
              <Pressable
                key={lang.key}
                style={[s.pill, language === lang.key && s.pillActive]}
                onPress={() => setLanguage(lang.key)}
              >
                <Text style={[s.pillTx, language === lang.key && s.pillTxActive]}>
                  {lang.label}
                </Text>
              </Pressable>
            ))}
            <View style={{ flex:1 }} />
            <Text style={s.moodLabel}>Mood:</Text>
          </View>

          {/* Mood selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.moodRow}>
            {MOODS.map(m => (
              <Pressable
                key={m.key}
                style={[s.moodChip, mood === m.key && { backgroundColor: m.color + '25', borderColor: m.color }]}
                onPress={() => setMood(m.key)}
              >
                <Text style={[s.moodTx, mood === m.key && { color: m.color }]}>{m.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Main lyrics editor */}
          <View style={s.editorWrap}>
            <TextInput
              style={s.editor}
              value={lyrics}
              onChangeText={setLyrics}
              placeholder={'Write your lyrics here...\n\nOr type a theme below\nand tap "Generate" for AI help.'}
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* AI suggestions */}
          {suggestions.length > 0 && (
            <View style={s.suggestWrap}>
              <Text style={s.suggestTitle}>Guru suggests:</Text>
              {suggestions.map((line, i) => (
                <Pressable key={i} style={s.suggestLine} onPress={() => applySuggestion(line)}>
                  <Text style={s.suggestTx}>+ {line}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Prompt input */}
          <View style={s.promptRow}>
            <TextInput
              style={s.promptInput}
              value={prompt}
              onChangeText={setPrompt}
              placeholder="Theme or next line idea..."
              placeholderTextColor={Colors.textMuted}
            />
            <Pressable style={s.genBtn} onPress={generateLyrics} disabled={loading}>
              {loading
                ? <ActivityIndicator color={Colors.bg} size="small" />
                : <Text style={s.genTx}>Generate</Text>
              }
            </Pressable>
          </View>

          {/* Action row */}
          <View style={s.actionRow}>
            <Pressable style={s.actionBtn} onPress={() => setLyrics('')}>
              <Text style={s.actionTx}>Clear</Text>
            </Pressable>
            <Pressable
              style={[s.actionBtn, s.actionBtnPrimary]}
              onPress={() => navigation.navigate('StudioMain', { lyrics })}
            >
              <Text style={[s.actionTx, { color:Colors.bg }]}>Use in Studio →</Text>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const s = StyleSheet.create({
  root:          { flex:1, backgroundColor:Colors.bg },
  glowPurple:    { position:'absolute', width:300, height:300, borderRadius:150, backgroundColor:'rgba(106,42,230,0.3)', top:-60, right:-40 },
  veil:          { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.5)' },
  header:        { flexDirection:'row', alignItems:'center', paddingTop:56, paddingHorizontal:Spacing.lg, paddingBottom:Spacing.md },
  backBtn:       { width:40, height:40, borderRadius:20, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, alignItems:'center', justifyContent:'center', marginRight:12 },
  backTx:        { fontSize:20, color:Colors.textSecondary },
  title:         { fontSize:18, fontWeight:'700', color:Colors.textPrimary, flex:1 },
  stats:         { backgroundColor:Colors.bgCard, borderRadius:Radius.sm, paddingHorizontal:10, paddingVertical:4, borderWidth:1, borderColor:Colors.border },
  statTx:        { fontSize:11, color:Colors.textMuted },
  scroll:        { flex:1 },
  row:           { flexDirection:'row', alignItems:'center', gap:8 },
  pill:          { borderRadius:Radius.pill, paddingHorizontal:14, paddingVertical:6, borderWidth:1, borderColor:Colors.border, backgroundColor:Colors.bgCard },
  pillActive:    { backgroundColor:Colors.tealBg, borderColor:Colors.teal },
  pillTx:        { fontSize:12, fontWeight:'600', color:Colors.textMuted },
  pillTxActive:  { color:Colors.teal },
  moodLabel:     { fontSize:12, color:Colors.textMuted },
  moodRow:       { flexDirection:'row', marginLeft:-Spacing.lg, paddingLeft:Spacing.lg },
  moodChip:      { borderRadius:Radius.pill, paddingHorizontal:14, paddingVertical:6, borderWidth:1, borderColor:Colors.border, backgroundColor:Colors.bgCard, marginRight:8 },
  moodTx:        { fontSize:12, color:Colors.textMuted },
  editorWrap:    { backgroundColor:Colors.bgSurf, borderRadius:Radius.lg, borderWidth:1, borderColor:Colors.border, minHeight:200 },
  editor:        { padding:Spacing.lg, color:Colors.textPrimary, fontSize:16, lineHeight:28, minHeight:200 },
  suggestWrap:   { backgroundColor:Colors.goldBg, borderWidth:1, borderColor:Colors.gold, borderRadius:Radius.md, padding:Spacing.md },
  suggestTitle:  { fontSize:11, fontWeight:'600', color:Colors.gold, marginBottom:8 },
  suggestLine:   { paddingVertical:6, borderBottomWidth:1, borderBottomColor:'rgba(212,175,55,0.2)' },
  suggestTx:     { fontSize:14, color:Colors.gold },
  promptRow:     { flexDirection:'row', gap:8 },
  promptInput:   { flex:1, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.md, padding:Spacing.md, color:Colors.textPrimary, fontSize:14 },
  genBtn:        { backgroundColor:Colors.gold, borderRadius:Radius.md, paddingHorizontal:Spacing.lg, alignItems:'center', justifyContent:'center', minWidth:90 },
  genTx:         { fontSize:13, fontWeight:'700', color:Colors.bg },
  actionRow:     { flexDirection:'row', gap:Spacing.md },
  actionBtn:     { flex:1, borderRadius:Radius.pill, paddingVertical:13, alignItems:'center', borderWidth:1, borderColor:Colors.border, backgroundColor:Colors.bgCard },
  actionBtnPrimary: { backgroundColor:Colors.gold, borderColor:Colors.gold },
  actionTx:      { fontSize:14, fontWeight:'600', color:Colors.textSecondary },
});
