import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Colors, Radius } from '../../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const GlassCard: React.FC<Props> = ({ children, style }) => {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    overflow: 'hidden',
  },
});
