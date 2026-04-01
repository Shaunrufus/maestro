// src/components/studio/ArrangementSetupPanel.tsx
// MAESTRO — Arrangement Setup Panel
// Appears in StudioScreen scrolled down section.
// User sets up the band BEFORE recording:
//   - Paste chord progression
//   - Add reference YouTube/audio URL
//   - Choose BPM + key
//   - Select instruments
//   - Toggle headphone mode

import React, { useState } from 'react';
import {
  Alert, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { Colors, Radius, Spacing } from '../../theme';

export type InstrumentKey = 'keys' | 'guitar' | 'tabla' | 'flute' | 'sitar' | 'orchestral';

interface Props {
  onConfigChange: (config: ArrangementConfig) => void;
  isUserPro: boolean;
}

export interface ArrangementConfig {
  customChords:      string;
  referenceUrl:      string;
  key:               string;
  bpm:               number;
  selectedInstruments: InstrumentKey[];
  headphonesConnected: boolean;
  autoDetectChords:  boolean;
}

const MUSICAL_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const INSTRUMENTS: { key: InstrumentKey; label: string; isPro: boolean; emoji: string }[] = [
  { key:'keys',       label:'Piano',      isPro:false, emoji:'🎹' },
  { key:'guitar',     label:'Guitar',     isPro:false, emoji:'🎸' },
  { key:'tabla',      label:'Tabla',      isPro:true,  emoji:'🥁' },
  { key:'flute',      label:'Flute',      isPro:true,  emoji:'🪈' },
  { key:'sitar',      label:'Sitar',      isPro:true,  emoji:'🎵' },
  { key:'orchestral', label:'Orchestra',  isPro:true,  emoji:'🎻' },
];

const CHORD_EXAMPLES = [
  'C G Am F',
  'Cm Bb Eb Ab',
  'D A Bm G',
  'Em C G D',
  'I V vi IV',
];

export const ArrangementSetupPanel: React.FC<Props> = ({ onConfigChange, isUserPro }) => {
  const [customChords,      setCustomChords     ] = useState('');
  const [referenceUrl,      setReferenceUrl     ] = useState('');
  const [selectedKey,       setSelectedKey      ] = useState('C');
  const [bpm,               setBpm              ] = useState(90);
  const [selectedInstrs,    setSelectedInstrs   ] = useState<InstrumentKey[]>(['keys', 'guitar']);
  const [headphones,        setHeadphones       ] = useState(false);
  const [autoDetect,        setAutoDetect       ] = useState(true);
  const [showKeyPicker,     setShowKeyPicker    ] = useState(false);

  const notify = (config: ArrangementConfig) => onConfigChange(config);

  const toggleInstrument = (key: InstrumentKey, isPro: boolean) => {
    if (isPro && !isUserPro) {
      Alert.alert(
        '🔒 Pro Instrument',
        `${key} is available with MAESTRO Pro. Upgrade for ₹199/month.`,
        [
          { text: 'Maybe later' },
          { text: 'Upgrade', style: 'default' },
        ],
      );
      return;
    }

    const updated = selectedInstrs.includes(key)
      ? selectedInstrs.filter(i => i !== key)
      : [...selectedInstrs, key];

    setSelectedInstrs(updated);
    notify({ customChords, referenceUrl, key: selectedKey, bpm, selectedInstruments: updated, headphonesConnected: headphones, autoDetectChords: autoDetect });
  };

  const handleChordsChange = (text: string) => {
    setCustomChords(text);
    if (text.trim()) setAutoDetect(false);
    notify({ customChords: text, referenceUrl, key: selectedKey, bpm, selectedInstruments: selectedInstrs, headphonesConnected: headphones, autoDetectChords: !text.trim() });
  };

  return (
    <View style={s.root}>
      {/* Section title */}
      <View style={s.sectionHdr}>
        <Text style={s.sectionTitle}>Virtual Band Setup</Text>
        <Text style={s.sectionSub}>Runs after recording</Text>
      </View>

      {/* Headphone toggle */}
      <View style={s.card}>
        <View style={s.row}>
          <View style={{ flex:1 }}>
            <Text style={s.cardTitle}>Headphones / Bluetooth</Text>
            <Text style={s.cardSub}>
              {headphones
                ? 'Click track plays while recording'
                : 'Band plays silently — added after recording'}
            </Text>
          </View>
          <Switch
            value={headphones}
            onValueChange={(v) => {
              setHeadphones(v);
              notify({ customChords, referenceUrl, key: selectedKey, bpm, selectedInstruments: selectedInstrs, headphonesConnected: v, autoDetectChords: autoDetect });
            }}
            trackColor={{ false: Colors.border, true: Colors.teal }}
            thumbColor="#fff"
          />
        </View>
        {!headphones && (
          <View style={s.infoBox}>
            <Text style={s.infoTx}>
              Recording in silent mode. MAESTRO will generate your band accompaniment after you stop.
            </Text>
          </View>
        )}
      </View>

      {/* Chord progression input */}
      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.cardTitle}>Chord Progression</Text>
          <Pressable onPress={() => setAutoDetect(!autoDetect)}>
            <Text style={[s.toggleTx, autoDetect && s.toggleTxActive]}>
              {autoDetect ? '✦ Auto-detect ON' : 'Auto-detect OFF'}
            </Text>
          </Pressable>
        </View>

        {!autoDetect && (
          <>
            <TextInput
              style={s.chordInput}
              value={customChords}
              onChangeText={handleChordsChange}
              placeholder='e.g. "C G Am F" or "I V vi IV"'
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:8 }}>
              {CHORD_EXAMPLES.map((ex) => (
                <Pressable
                  key={ex}
                  style={s.exampleChip}
                  onPress={() => handleChordsChange(ex)}
                >
                  <Text style={s.exampleTx}>{ex}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {autoDetect && (
          <Text style={s.autoDetectInfo}>
            MAESTRO will analyze your vocal recording and detect the chord progression automatically.
          </Text>
        )}
      </View>

      {/* Reference track */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Reference Track</Text>
        <Text style={s.cardSub}>Paste a YouTube URL or audio link to match its style</Text>
        <TextInput
          style={s.chordInput}
          value={referenceUrl}
          onChangeText={(v) => {
            setReferenceUrl(v);
            notify({ customChords, referenceUrl: v, key: selectedKey, bpm, selectedInstruments: selectedInstrs, headphonesConnected: headphones, autoDetectChords: autoDetect });
          }}
          placeholder="youtube.com/watch?v=... or audio URL"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          keyboardType="url"
        />
        {referenceUrl.length > 0 && (
          <Text style={s.refNote}>
            ✦ MAESTRO will extract the BPM and chord style — not the audio itself.
          </Text>
        )}
      </View>

      {/* Key + BPM */}
      <View style={[s.card, { flexDirection:'row', gap:12 }]}>
        <View style={{ flex:1 }}>
          <Text style={s.cardTitle}>Key</Text>
          <Pressable style={s.keyBtn} onPress={() => setShowKeyPicker(!showKeyPicker)}>
            <Text style={s.keyBtnTx}>{selectedKey}</Text>
          </Pressable>
          {showKeyPicker && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:8 }}>
              {MUSICAL_KEYS.map((k) => (
                <Pressable
                  key={k}
                  style={[s.keyChip, selectedKey === k && s.keyChipActive]}
                  onPress={() => { setSelectedKey(k); setShowKeyPicker(false); }}
                >
                  <Text style={[s.keyChipTx, selectedKey === k && s.keyChipTxActive]}>{k}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
        <View style={{ flex:1 }}>
          <Text style={s.cardTitle}>BPM</Text>
          <View style={s.bpmRow}>
            <Pressable style={s.bpmBtn} onPress={() => setBpm(Math.max(40, bpm - 5))}>
              <Text style={s.bpmBtnTx}>−</Text>
            </Pressable>
            <Text style={s.bpmVal}>{bpm}</Text>
            <Pressable style={s.bpmBtn} onPress={() => setBpm(Math.min(200, bpm + 5))}>
              <Text style={s.bpmBtnTx}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Instrument selection */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Instruments for Your Band</Text>
        <Text style={s.cardSub}>Select up to 4 — they'll play together after recording</Text>
        <View style={s.instrGrid}>
          {INSTRUMENTS.map((instr) => {
            const isSelected = selectedInstrs.includes(instr.key);
            const isLocked   = instr.isPro && !isUserPro;
            return (
              <Pressable
                key={instr.key}
                style={[
                  s.instrCard,
                  isSelected && s.instrCardActive,
                  isLocked   && s.instrCardLocked,
                ]}
                onPress={() => toggleInstrument(instr.key, instr.isPro)}
              >
                {isLocked && (
                  <View style={s.lockBadge}>
                    <Text style={s.lockTx}>PRO</Text>
                  </View>
                )}
                <Text style={{ fontSize:20 }}>{instr.emoji}</Text>
                <Text style={[s.instrLabel, isSelected && s.instrLabelActive]}>
                  {instr.label}
                </Text>
                {isSelected && <View style={s.checkDot} />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root:          { gap:Spacing.md },
  sectionHdr:    { flexDirection:'row', justifyContent:'space-between', alignItems:'baseline' },
  sectionTitle:  { fontSize:16, fontWeight:'700', color:Colors.textPrimary },
  sectionSub:    { fontSize:11, color:Colors.textMuted },
  card:          { backgroundColor:Colors.bgCard, borderRadius:Radius.lg, borderWidth:1, borderColor:Colors.border, padding:Spacing.md, gap:8 },
  row:           { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  cardTitle:     { fontSize:13, fontWeight:'600', color:Colors.textPrimary },
  cardSub:       { fontSize:11, color:Colors.textMuted, lineHeight:16 },
  infoBox:       { backgroundColor:'rgba(0,217,192,0.08)', borderRadius:8, padding:10 },
  infoTx:        { fontSize:11, color:Colors.teal, lineHeight:18 },
  toggleTx:      { fontSize:11, color:Colors.textMuted },
  toggleTxActive:{ color:Colors.teal, fontWeight:'600' },
  chordInput:    { backgroundColor:Colors.bgSurf, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.md, padding:12, color:Colors.textPrimary, fontSize:15, letterSpacing:1 },
  exampleChip:   { backgroundColor:Colors.bgSurf, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.pill, paddingHorizontal:12, paddingVertical:6, marginRight:8 },
  exampleTx:     { fontSize:11, color:Colors.textSecondary },
  autoDetectInfo:{ fontSize:12, color:Colors.textMuted, lineHeight:18, fontStyle:'italic' },
  refNote:       { fontSize:11, color:Colors.gold, lineHeight:16 },
  keyBtn:        { backgroundColor:Colors.bgSurf, borderWidth:1, borderColor:Colors.teal, borderRadius:Radius.md, padding:10, alignItems:'center' },
  keyBtnTx:      { fontSize:18, fontWeight:'700', color:Colors.teal },
  keyChip:       { borderRadius:Radius.pill, paddingHorizontal:12, paddingVertical:6, marginRight:8, borderWidth:1, borderColor:Colors.border, backgroundColor:Colors.bgCard },
  keyChipActive: { backgroundColor:Colors.tealBg, borderColor:Colors.teal },
  keyChipTx:     { fontSize:12, color:Colors.textMuted },
  keyChipTxActive:{ color:Colors.teal, fontWeight:'700' },
  bpmRow:        { flexDirection:'row', alignItems:'center', gap:12, justifyContent:'center' },
  bpmBtn:        { width:36, height:36, borderRadius:18, backgroundColor:Colors.bgSurf, borderWidth:1, borderColor:Colors.border, alignItems:'center', justifyContent:'center' },
  bpmBtnTx:      { fontSize:20, color:Colors.textSecondary },
  bpmVal:        { fontSize:22, fontWeight:'700', color:Colors.textPrimary, minWidth:50, textAlign:'center' },
  instrGrid:     { flexDirection:'row', flexWrap:'wrap', gap:8 },
  instrCard:     { width:'30%', backgroundColor:Colors.bgSurf, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.md, padding:10, alignItems:'center', gap:4, position:'relative' },
  instrCardActive:{ backgroundColor:Colors.tealBg, borderColor:Colors.teal },
  instrCardLocked:{ opacity:0.6 },
  lockBadge:     { position:'absolute', top:4, right:4, backgroundColor:Colors.gold, borderRadius:4, paddingHorizontal:4, paddingVertical:1 },
  lockTx:        { fontSize:7, fontWeight:'700', color:Colors.bg },
  instrLabel:    { fontSize:10, color:Colors.textMuted, textAlign:'center' },
  instrLabelActive:{ color:Colors.teal, fontWeight:'600' },
  checkDot:      { width:6, height:6, borderRadius:3, backgroundColor:Colors.teal },
});
