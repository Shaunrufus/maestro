// src/screens/DiscoverScreen.tsx
// Placeholder for Phase 3 community features.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing } from '../theme';

export const DiscoverScreen: React.FC = () => (
  <View style={s.root}>
    <View style={s.glowTeal}   />
    <View style={s.veil}       />
    <View style={s.header}>
      <Text style={s.title}>Discover</Text>
    </View>
    <View style={s.empty}>
      <Text style={s.emptyIcon}>🌍</Text>
      <Text style={s.emptyTitle}>Coming in Phase 3</Text>
      <Text style={s.emptySub}>Community challenges, trending covers, and duet singing are on the way.</Text>
    </View>
  </View>
);

const s = StyleSheet.create({
  root:        { flex:1, backgroundColor:Colors.bg },
  glowTeal:    { position:'absolute', width:260, height:260, borderRadius:130, backgroundColor:'rgba(0,217,192,0.2)', top:-40, right:-40 },
  veil:        { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.5)' },
  header:      { paddingTop:60, paddingHorizontal:Spacing.lg, paddingBottom:Spacing.lg },
  title:       { fontSize:26, fontWeight:'800', color:Colors.textPrimary },
  empty:       { flex:1, alignItems:'center', justifyContent:'center', padding:40 },
  emptyIcon:   { fontSize:56, marginBottom:16 },
  emptyTitle:  { fontSize:20, fontWeight:'700', color:Colors.textPrimary, marginBottom:8 },
  emptySub:    { fontSize:14, color:Colors.textSecondary, textAlign:'center', lineHeight:22 },
});
