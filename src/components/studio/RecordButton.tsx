// src/components/studio/RecordButton.tsx
// Animated pulsing RECORD button — hero element of MAESTRO
// Zero external dependencies beyond React Native core.
// Enhanced with Liquid Morph and robust animation management.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Colors } from '../../theme';

interface Props {
  isRecording: boolean;
  onPress: () => void;
  size?: number;
}

export const RecordButton: React.FC<Props> = ({
  isRecording,
  onPress,
  size = 68,
}) => {
  // Animation Values
  const pulse  = useRef(new Animated.Value(1)).current;
  const glow   = useRef(new Animated.Value(0.4)).current;
  const scale  = useRef(new Animated.Value(1)).current;
  const morph  = useRef(new Animated.Value(0)).current; // 0 = squareish, 1 = circle

  // Animation Controllers (to stop memory leaks)
  const pulseAnim = useRef<Animated.CompositeAnimation | null>(null);
  const glowAnim  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // 1. Cleanup old animations
    if (pulseAnim.current) pulseAnim.current.stop();
    if (glowAnim.current)  glowAnim.current.stop();

    if (isRecording) {
      // 2. Loop Pulse (Heartbeat)
      pulseAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.18, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.00, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      pulseAnim.current.start();

      // 3. Loop Glow
      glowAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 0.85, duration: 650, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.35, duration: 650, useNativeDriver: true }),
        ])
      );
      glowAnim.current.start();

      // 4. Liquid Morph to Circle
      Animated.spring(morph, { toValue: 1, friction: 8, tension: 40, useNativeDriver: false }).start();
    } else {
      // 5. Idle / Reset Animations
      Animated.parallel([
        Animated.spring(pulse, { toValue: 1, friction: 10, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 300, useNativeDriver: true }),
        Animated.spring(morph, { toValue: 0, friction: 8, tension: 40, useNativeDriver: false }),
      ]).start();
    }

    // CLEANUP on unmount
    return () => {
      pulseAnim.current?.stop();
      glowAnim.current?.stop();
    };
  }, [isRecording]);

  const handlePress = () => {
    // Immediate "pop" feedback
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const outer = size + 26;
  const ring  = size + 12;
  const iconSize = size * 0.37;

  // Calculate morphing border radius (Liquid Morph)
  // 0 -> iconSize * 0.18 (idle squareish)
  // 1 -> iconSize / 2 (recording circle)
  const borderRadius = morph.interpolate({
    inputRange: [0, 1],
    outputRange: [iconSize * 0.18, iconSize / 2],
  });

  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      {/* Ambient glow blob */}
      <Animated.View style={[styles.aura, {
        width: outer, height: outer, borderRadius: outer / 2, opacity: glow, transform: [{ scale: pulse }],
      }]} />

      {/* Pulse ring */}
      <Animated.View style={[styles.ring, {
        width: ring, height: ring, borderRadius: ring / 2, transform: [{ scale: pulse }],
      }]} />

      {/* Main button structure */}
      <Pressable onPress={handlePress}>
        <Animated.View style={[styles.btn, {
          width: size, height: size, borderRadius: size / 2, transform: [{ scale }],
        }]}>
          {/* Surface highlights */}
          <View style={[styles.highlight, {
            width: size * 0.3, height: size * 0.18,
            borderRadius: size * 0.09,
            top: size * 0.14, left: size * 0.18,
          }]} />

          {/* Morphing icon (Square -> Circle) */}
          <Animated.View style={[styles.icon, {
            width: iconSize, height: iconSize,
            borderRadius,
          }]} />
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  aura: {
    position: 'absolute',
    backgroundColor: Colors.red,
    shadowColor: Colors.red,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 22,
    elevation: 12,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,59,92,0.38)',
  },
  btn: {
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 14,
  },
  highlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  icon: {
    backgroundColor: '#FFFFFF',
  },
});
