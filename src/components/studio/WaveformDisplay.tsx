// src/components/studio/WaveformDisplay.tsx
// Animated waveform display — idle animation + live bar data support.
// Zero external dependencies.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Colors } from '../../theme';

const STATIC_BARS = [
  5,9,16,24,34,50,38,28,18,32,54,66,52,42,32,
  24,16,28,42,54,48,36,26,18,12,16,24,32,46,58,
  52,40,30,24,38,54,62,48,34,22,14,10,7,11,16,
  24,36,50,58,50,38,26,18,12,
];

const BAR_W   = 4;
const BAR_GAP = 2;

interface Props {
  isRecording:     boolean;
  liveLevels?:     number[];   // 0–100 per bar, from audio API
  playheadRatio?:  number;     // 0–1, how far the playhead is
  height?:         number;
}

export const WaveformDisplay: React.FC<Props> = ({
  isRecording,
  liveLevels,
  playheadRatio = 0.5,
  height = 148,
}) => {
  const bars   = liveLevels ?? STATIC_BARS;
  const maxH   = Math.max(...bars);
  const centerY = height / 2;
  const totalW  = bars.length * (BAR_W + BAR_GAP);

  // Idle breathing animations — one per bar
  const idleAnims = useRef(bars.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    const loops = idleAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 20),
          Animated.timing(anim, { 
            toValue: isRecording ? 1.4 : 0.6 + Math.random() * 0.4, 
            duration: isRecording ? 150 : 600 + Math.random() * 600, 
            useNativeDriver: true 
          }),
          Animated.timing(anim, { 
            toValue: 1, 
            duration: isRecording ? 150 : 600 + Math.random() * 600, 
            useNativeDriver: true 
          }),
        ])
      )
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [isRecording]);

  return (
    <View style={[styles.container, { height }]}>
      {/* Subtle grid lines */}
      {[-44, 0, 44].map(offset => (
        <View key={offset} style={[styles.gridLine, { top: centerY + offset }]} />
      ))}

      {/* Bars */}
      <View style={[styles.barsWrap, { width: totalW }]}>
        {bars.map((h, i) => {
          const normH  = (h / maxH) * (centerY - 16);
          const active = (i / bars.length) < playheadRatio;
          const barColor = isRecording ? Colors.red : (active ? Colors.teal : Colors.textMuted);
          
          return (
            <Animated.View
              key={i}
              style={[styles.barCol, { transform: [{ scaleY: idleAnims[i] }] }]}
            >
              <View style={{
                width: BAR_W, height: normH, borderRadius: 2,
                backgroundColor: barColor,
                marginBottom: 1,
              }} />
              <View style={{
                width: BAR_W, height: normH * 0.45, borderRadius: 2,
                backgroundColor: isRecording ? Colors.redGlow : (active ? 'rgba(0,217,192,0.2)' : Colors.borderSub),
              }} />
            </Animated.View>
          );
        })}
      </View>

      {/* Gold playhead */}
      <View style={[styles.playheadWrap, { left: 10 + totalW * playheadRatio }]}>
        <View style={styles.playheadLine} />
        <View style={styles.playheadGlow} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.bgSurf,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLine: {
    position: 'absolute',
    left: 0, right: 0,
    height: 1,
    backgroundColor: Colors.borderSub,
  },
  barsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  barCol: {
    alignItems: 'center',
    marginHorizontal: BAR_GAP / 2,
  },
  playheadWrap: {
    position: 'absolute',
    top: 8, bottom: 8,
    width: 2,
    alignItems: 'center',
  },
  playheadLine: {
    flex: 1, width: 2,
    backgroundColor: Colors.gold,
    borderRadius: 1,
  },
  playheadGlow: {
    position: 'absolute',
    top: 0, bottom: 0, width: 10,
    backgroundColor: 'rgba(212,175,55,0.28)',
    borderRadius: 5,
  },
});
