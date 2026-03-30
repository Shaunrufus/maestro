import React, { useState, useEffect } from 'react';
import {
  Pressable, ScrollView, StyleSheet,
  Text, View, ActivityIndicator, Alert
} from 'react-native';
import { useStudioStore, Take, Track } from '../store/useStudioStore';
import { Colors, Spacing, Radius } from '../theme';
import { startRecording, stopRecording, uploadToSupabase } from '../services/audioService';
import { db } from '../services/supabase';

type Mode = 'record' | 'edit' | 'mix';

const MODE_COLORS: Record<Mode, string> = {
  record: Colors.red,
  edit:   Colors.teal,
  mix:    Colors.gold,
};

// Stable pseudorandom number generator for waveform bars based on a seed string
const stableRand = (seed: string, max: number) => {
  let val = 0;
  for (let i = 0; i < seed.length; i++) val += seed.charCodeAt(i);
  return ((val * 9301 + 49297) % 233280) / 233280 * max;
};

export const MultitrackScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { currentProject, studioMode, setStudioMode, backendUrl, userId,
          toggleMute, toggleSolo, updateTrackVolume, addTake, addTrack, setTakes } = useStudioStore();

  const [mode,          setMode         ] = useState<Mode>('record');
  const [playheadPct,   setPlayheadPct  ] = useState(0);
  const [isRecording,   setIsRecording  ] = useState(false);
  const [isProcessing,  setIsProcessing ] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

  const tracks = currentProject?.tracks ?? [];

  // Load takes from DB on mount
  useEffect(() => {
    if (!currentProject) return;
    const loadTakes = async () => {
      const { data, error } = await db.getTakes(currentProject.id);
      if (data) {
        // Group by track_id
        const takesByTrack: Record<string, any[]> = {};
        tracks.forEach(t => takesByTrack[t.id] = []);
        data.forEach(takeRow => {
          if (!takesByTrack[takeRow.track_id]) takesByTrack[takeRow.track_id] = [];
          takesByTrack[takeRow.track_id].push({
            id:          takeRow.id,
            uri:         takeRow.file_url,
            durationMs:  takeRow.duration_ms,
            createdAt:   new Date(takeRow.created_at),
            pitchScore:  takeRow.pitch_score,
            timingScore: takeRow.timing_score,
            energyScore: takeRow.energy_score,
            tuned:       false,
          });
        });
        Object.entries(takesByTrack).forEach(([tid, tks]) => {
          setTakes(tid, tks);
        });
      }
    };
    loadTakes();
    // Default active track to the first track
    if (tracks.length > 0 && !activeTrackId) {
      setActiveTrackId(tracks[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  const setModeAll = (m: Mode) => {
    setMode(m);
    setStudioMode(m);
  };

  const handleStartRec = async () => {
    const targetTrackId = activeTrackId || (tracks.length > 0 ? tracks[0].id : null);
    if (!targetTrackId) {
      Alert.alert('No tracks', 'Please add a track first.');
      return;
    }
    if (!activeTrackId) setActiveTrackId(targetTrackId);

    const started = await startRecording();
    if (started) {
      setIsRecording(true);
    }
  };

  const handleStopRec = async () => {
    setIsRecording(false);
    setIsProcessing(true);
    const uri = await stopRecording();
    if (!uri || !activeTrackId || !currentProject) {
      setIsProcessing(false);
      return;
    }

    try {
      const uId = userId || 'anonymous';
      const storagePath = `${uId}/takes/${Date.now()}.m4a`;
      const cloudUrl = await uploadToSupabase(uri, storagePath);

      if (cloudUrl) {
        // Score the take
        const form = new FormData();
        form.append('file', { uri, name: 'take.m4a', type: 'audio/m4a' } as any);
        let scores = { pitch: 85, timing: 90, energy: 75 }; // Default fallback
        try {
          const res = await fetch(`${backendUrl}/multitrack/score-take`, {
            method: 'POST',
            body: form,
          });
          if (res.ok) {
            try {
              const text = await res.text();
              scores = JSON.parse(text);
            } catch (err) {
              console.warn('[Backend] Non-JSON payload returned, using fallback');
            }
          } else {
            console.warn(`[Backend] Scoring returned ${res.status}`);
          }
        } catch (err) {
          console.warn('[Backend] JSON parse / network error, using fallback AI scores:', err);
        }
        const durationMs = 3000; // placeholder for demo

        // Save to Supabase
        const { data } = await db.saveTake({
          projectId:   currentProject.id,
          trackId:     activeTrackId,
          userId:      uId,
          fileUrl:     cloudUrl,
          durationMs,
          pitchScore:  scores.pitch,
          timingScore: scores.timing,
          energyScore: scores.energy,
        });

        if (data) {
          addTake(activeTrackId, {
            id:          data.id,
            uri:         cloudUrl, // Store cloud URL directly for playback
            durationMs,
            createdAt:   new Date(data.created_at),
            pitchScore:  scores.pitch,
            timingScore: scores.timing,
            energyScore: scores.energy,
            tuned:       false,
          });
        }
      }
    } catch (e) {
      console.error('Take save error:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecPress = () => {
    if (isRecording) {
      handleStopRec();
    } else {
      handleStartRec();
    }
  };

  const handleAddTrack = () => {
    const newId = `track_${Date.now()}`;
    addTrack({
      id: newId,
      name: `Vocal ${tracks.length + 1}`,
      type: 'vocal',
      takes: [],
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      selectedTakeId: undefined,
    });
    setActiveTrackId(newId);
  };

  return (
    <View style={s.root}>
      {/* Ambient */}
      <View style={[s.glow, { backgroundColor: MODE_COLORS[mode] + '30', top: -40, left: -40 }]} />
      <View style={s.veil} />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTx}>←</Text>
        </Pressable>
        <Text style={s.title}>{currentProject?.name ?? 'Untitled'}</Text>
        <Text style={s.bpmTx}>{currentProject?.bpm} BPM · {currentProject?.key}</Text>
      </View>

      {/* Mode selector */}
      <View style={s.modeBar}>
        {(['record', 'edit', 'mix'] as Mode[]).map(m => (
          <Pressable
            key={m}
            style={[s.modeBtn, mode === m && { backgroundColor: MODE_COLORS[m] + '20', borderColor: MODE_COLORS[m] }]}
            onPress={() => setModeAll(m)}
          >
            <Text style={[s.modeTx, mode === m && { color: MODE_COLORS[m] }]}>
              {m.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── RECORD MODE ── */}
      {mode === 'record' && (
        <ScrollView style={s.trackList} contentContainerStyle={{ gap: 8, padding: Spacing.lg }}>
          {tracks.map(track => (
            <Pressable key={track.id} onPress={() => setActiveTrackId(track.id)} style={[s.trackRow, activeTrackId === track.id && s.trackRowActive]}>
              {/* Track header */}
              <View style={s.trackHead}>
                <Text style={[s.trackName, activeTrackId === track.id && { color: Colors.teal }]}>{track.name}</Text>
                <View style={s.trackBtns}>
                  <Pressable
                    style={[s.trackBtn, track.muted && s.trackBtnRed]}
                    onPress={() => toggleMute(track.id)}
                  >
                    <Text style={s.trackBtnTx}>M</Text>
                  </Pressable>
                  <Pressable
                    style={[s.trackBtn, track.solo && s.trackBtnGold]}
                    onPress={() => toggleSolo(track.id)}
                  >
                    <Text style={s.trackBtnTx}>S</Text>
                  </Pressable>
                </View>
              </View>

              {/* Take lanes */}
              <View style={s.laneArea}>
                {track.takes.length === 0 ? (
                  <View style={s.emptyLane}>
                    <Text style={s.emptyLaneTx}>
                      {activeTrackId === track.id ? (isRecording ? '⏺ Recording...' : 'Tap ⏺ to record a take') : 'No takes'}
                    </Text>
                  </View>
                ) : (
                  track.takes.map((take, i) => (
                    <Pressable
                      key={take.id}
                      style={[
                        s.takeLane,
                        take.id === track.selectedTakeId && s.takeLaneActive,
                      ]}
                    >
                      {/* Sub-Lane Waveform: Stable Seeded pseudo-random generation */}
                      <View style={s.miniWave}>
                        {Array.from({ length: 20 }, (_, j) => {
                          const h = 4 + stableRand(take.id + j, 14);
                          return (
                            <View
                              key={j}
                              style={[s.miniBar, {
                                height: h,
                                backgroundColor: take.id === track.selectedTakeId
                                  ? Colors.teal : Colors.textMuted,
                              }]}
                            />
                          );
                        })}
                      </View>
                      <Text style={s.takeLbl}>Take {i + 1}</Text>
                      {take.pitchScore != null && (
                        <Text style={[s.takeScore, { color: take.pitchScore > 80 ? Colors.teal : Colors.gold }]}>
                          {Math.round(take.pitchScore)}%
                        </Text>
                      )}
                    </Pressable>
                  ))
                )}
                {/* Visual feedback for active recording in this track */}
                {isRecording && activeTrackId === track.id && track.takes.length > 0 && (
                   <View style={s.takeLane}>
                     <Text style={[s.takeLbl, { color: Colors.red }]}>⏺ Recording...</Text>
                   </View>
                )}
              </View>
            </Pressable>
          ))}

          {/* Add track button */}
          <Pressable style={s.addTrackBtn} onPress={handleAddTrack}>
            <Text style={s.addTrackTx}>+ Add Track</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* ── EDIT MODE ── */}
      {mode === 'edit' && (
        <View style={s.editArea}>
          <Text style={s.comingSoon}>Tap "Comping" to edit takes</Text>
          <Pressable
            style={s.compBtn}
            onPress={() => navigation.navigate('Comping')}
          >
            <Text style={s.compBtnTx}>Open Vocal Comp Editor →</Text>
          </Pressable>
        </View>
      )}

      {/* ── MIX MODE ── */}
      {mode === 'mix' && (
        <ScrollView horizontal style={s.mixArea} contentContainerStyle={s.mixContent}>
          {tracks.map(track => (
            <View key={track.id} style={s.faderChannel}>
              <Text style={s.faderName}>{track.name}</Text>
              {/* Vertical fader */}
              <View style={s.faderTrack}>
                <View style={[s.faderFill, { height: `${track.volume * 100}%` as any }]} />
                <View style={[s.faderThumb, { bottom: `${track.volume * 100}%` as any, marginBottom: -8 }]} />
              </View>
              <Text style={s.faderVal}>{Math.round(track.volume * 100)}</Text>
              <View style={s.faderBtns}>
                <Pressable style={[s.faderBtn, track.muted && { backgroundColor: Colors.redBg, borderColor: Colors.red }]} onPress={() => toggleMute(track.id)}>
                  <Text style={[s.faderBtnTx, track.muted && { color: Colors.red }]}>M</Text>
                </Pressable>
                <Pressable style={[s.faderBtn, track.solo && { backgroundColor: Colors.goldBg, borderColor: Colors.gold }]} onPress={() => toggleSolo(track.id)}>
                  <Text style={[s.faderBtnTx, track.solo && { color: Colors.gold }]}>S</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {/* Master channel */}
          <View style={[s.faderChannel, s.masterChannel]}>
            <Text style={s.faderName}>MASTER</Text>
            <View style={s.faderTrack}>
              <View style={[s.faderFill, { height: '85%', backgroundColor: Colors.gold }]} />
              <View style={[s.faderThumb, { bottom: '85%', marginBottom: -8, backgroundColor: Colors.gold }]} />
            </View>
            <Text style={s.faderVal}>85</Text>
          </View>
        </ScrollView>
      )}

      {/* Bottom: transport */}
      <View style={s.bottomBar}>
        <Pressable style={s.tBtnSm}><Text style={s.tBtnTx}>⏮</Text></Pressable>
        <Pressable style={s.tBtnSm}><Text style={s.tBtnTx}>▶</Text></Pressable>
        <Pressable
          style={[s.tBtnRec, mode !== 'record' && { opacity: 0.4 }, isRecording && { backgroundColor: Colors.red }]}
          disabled={mode !== 'record' || isProcessing}
          onPress={handleRecPress}
        >
          {isProcessing ? (
            <ActivityIndicator color={Colors.bg} size="small" />
          ) : (
            <Text style={[s.tBtnTx, isRecording && { color: Colors.bg }]}>{isRecording ? '⏹' : '⏺'}</Text>
          )}
        </Pressable>
        <Pressable style={s.tBtnSm} disabled={!isRecording} onPress={isRecording ? handleStopRec : undefined}><Text style={s.tBtnTx}>⏹</Text></Pressable>
        <Pressable
          style={s.exportBtn}
          onPress={() => navigation.navigate('MixMode')}
        >
          <Text style={s.exportTx}>Mix & Export →</Text>
        </Pressable>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: Colors.bg },
  glow:         { position: 'absolute', width: 300, height: 300, borderRadius: 150 },
  veil:         { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,11,18,0.48)' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  backBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  backTx:       { fontSize: 18, color: Colors.textSecondary },
  title:        { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  bpmTx:        { fontSize: 11, color: Colors.textMuted },
  modeBar:      { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, gap: 8 },
  modeBtn:      { flex: 1, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.bgCard },
  modeTx:       { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1 },
  trackList:    { flex: 1 },
  trackRow:     { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  trackRowActive:{ borderColor: Colors.teal },
  trackHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  trackName:    { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  trackBtns:    { flexDirection: 'row', gap: 6 },
  trackBtn:     { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bgSurf, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  trackBtnRed:  { backgroundColor: Colors.redBg, borderColor: Colors.red },
  trackBtnGold: { backgroundColor: Colors.goldBg, borderColor: Colors.gold },
  trackBtnTx:   { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
  laneArea:     { padding: 10, gap: 6 },
  emptyLane:    { height: 40, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  emptyLaneTx:  { fontSize: 11, color: Colors.textMuted },
  takeLane:     { height: 48, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgSurf, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 },
  takeLaneActive:{ borderColor: Colors.teal, backgroundColor: Colors.tealBg },
  miniWave:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 1 },
  miniBar:      { width: 3, borderRadius: 1 },
  takeLbl:      { fontSize: 10, color: Colors.textMuted, minWidth: 44 },
  takeScore:    { fontSize: 11, fontWeight: '700' },
  addTrackBtn:  { padding: 14, borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.teal, alignItems: 'center' },
  addTrackTx:   { fontSize: 13, fontWeight: '600', color: Colors.teal },
  editArea:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40 },
  comingSoon:   { fontSize: 14, color: Colors.textSecondary },
  compBtn:      { backgroundColor: Colors.tealBg, borderWidth: 1, borderColor: Colors.teal, borderRadius: Radius.pill, paddingHorizontal: 24, paddingVertical: 13 },
  compBtnTx:    { fontSize: 14, fontWeight: '600', color: Colors.teal },
  mixArea:      { flex: 1 },
  mixContent:   { padding: 16, gap: 12, alignItems: 'flex-end' },
  faderChannel: { width: 64, alignItems: 'center', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 8, height: 260 },
  masterChannel:{ borderColor: Colors.gold, backgroundColor: Colors.goldBg },
  faderName:    { fontSize: 9, fontWeight: '600', color: Colors.textMuted, textAlign: 'center' },
  faderTrack:   { flex: 1, width: 12, backgroundColor: Colors.border, borderRadius: 6, position: 'relative', justifyContent: 'flex-end' },
  faderFill:    { width: 12, backgroundColor: Colors.teal, borderRadius: 6 },
  faderThumb:   { position: 'absolute', left: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },
  faderVal:     { fontSize: 10, color: Colors.textMuted },
  faderBtns:    { flexDirection: 'row', gap: 4 },
  faderBtn:     { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.bgSurf, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  faderBtnTx:   { fontSize: 8, fontWeight: '700', color: Colors.textMuted },
  bottomBar:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, backgroundColor: Colors.bgSurf, borderTopWidth: 1, borderTopColor: Colors.border },
  tBtnSm:       { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  tBtnRec:      { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.redBg, borderWidth: 1, borderColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  tBtnTx:       { fontSize: 14, color: Colors.textSecondary },
  exportBtn:    { flex: 1, backgroundColor: Colors.gold, borderRadius: Radius.pill, paddingVertical: 11, alignItems: 'center' },
  exportTx:     { fontSize: 13, fontWeight: '700', color: Colors.bg },
});
