// src/components/studio/RecordButton.tsx
// Animated pulsing RECORD button — hero element of MAESTRO
// Enhanced with 3D Triple Pulse Rings and Liquid Morph.

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
  const morph  = useRef(new Animated.Value(0)).current;

  // Triple rings
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  // Animation Controllers
  const loopAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (loopAnim.current) loopAnim.current.stop();

    if (isRecording) {
      const pulseRing = (anim: Animated.Value, duration: number) => {
        return Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]);
      };

      loopAnim.current = Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1.18, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1.00, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ])
        ),
        Animated.loop(
          Animated.stagger(400, [
            pulseRing(ring1, 1200),
            pulseRing(ring2, 1200),
            pulseRing(ring3, 1200),
          ])
        )
      ]);
      
      loopAnim.current.start();
      Animated.spring(morph, { toValue: 1, friction: 8, tension: 40, useNativeDriver: false }).start();
    } else {
      Animated.parallel([
        Animated.spring(pulse, { toValue: 1, friction: 10, useNativeDriver: true }),
        Animated.spring(morph, { toValue: 0, friction: 8, tension: 40, useNativeDriver: false }),
        Animated.timing(ring1, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(ring2, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(ring3, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }

    return () => loopAnim.current?.stop();
  }, [isRecording]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const outer = size + 80;
  const iconSize = size * 0.37;
  const borderRadius = morph.interpolate({
    inputRange: [0, 1],
    outputRange: [iconSize * 0.18, iconSize / 2],
  });

  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      
      {/* Triple Pulse Rings */}
      {[ring1, ring2, ring3].map((ring, i) => {
        const ringSize = size + i * 24;
        return (
          <Animated.View key={i} style={{
            position: 'absolute',
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderWidth: 1.5,
            borderColor: 'rgba(255,59,92,0.4)',
            opacity: ring.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.5, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
          }} />
        );
      })}

      {/* Main button structure */}
      <Pressable onPress={handlePress}>
        <Animated.View style={[styles.btn, {
          width: size, height: size, borderRadius: size / 2, transform: [{ scale: pulse }],
        }]}>
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
  icon: {
    backgroundColor: '#FFFFFF',
  },
});
