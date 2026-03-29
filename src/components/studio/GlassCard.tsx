import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, Radius } from '../../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const GlassCard: React.FC<Props> = ({ children, style }) => {
  return (
    <BlurView intensity={24} tint="dark" style={[styles.card, style]}>
      {children}
    </BlurView>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 16,
    overflow: 'hidden',
  },
});
