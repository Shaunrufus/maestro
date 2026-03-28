// src/screens/OnboardingScreen.tsx
// Onboarding Screen — welcome flow for MAESTRO.
// Provides a premium entrance to the virtual studio.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, APP_NAME } from '../theme';

export const OnboardingScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  return (
    <View style={s.root}>
      {/* Glows */}
      <View style={s.glowPurple} />
      <View style={s.glowGold}   />
      <View style={s.veil}       />

      <View style={s.content}>
        <View style={s.logoWrap}>
          <Text style={s.logoIcon}>🎙</Text>
        </View>
        <Text style={s.title}>Welcome to {APP_NAME}</Text>
        <Text style={s.sub}>Your AI-powered virtual recording studio. Master your voice, create lyrics, and produce hits.</Text>

        <View style={s.features}>
          <Text style={s.feat}>✦ AI Vocal Coaching with GURU</Text>
          <Text style={s.feat}>✦ Professional Autotune & Pitch Correction</Text>
          <Text style={s.feat}>✦ Smart Lyrics Assistant</Text>
          <Text style={s.feat}>✦ Authentic Indian Percussion</Text>
        </View>

        <Pressable style={s.btn} onPress={() => navigation.navigate('Login')}>
          <Text style={s.btnTx}>Get Started</Text>
        </Pressable>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root:       { flex:1, backgroundColor:Colors.bg },
  glowPurple: { position:'absolute', width:300, height:300, borderRadius:150, backgroundColor:'rgba(106,42,230,0.3)', top:-60, left:-40 },
  glowGold:   { position:'absolute', width:300, height:300, borderRadius:150, backgroundColor:'rgba(212,175,55,0.2)', bottom:-60, right:-40 },
  veil:       { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.5)' },
  content:    { flex:1, alignItems:'center', justifyContent:'center', padding:Spacing.xl },
  logoWrap:   { width:80, height:80, borderRadius:40, backgroundColor:Colors.goldBg, borderWidth:1, borderColor:Colors.gold, alignItems:'center', justifyContent:'center', marginBottom:24 },
  logoIcon:   { fontSize:40 },
  title:      { fontSize:28, fontWeight:'800', color:Colors.gold, textAlign:'center', marginBottom:12 },
  sub:        { fontSize:15, color:Colors.textSecondary, textAlign:'center', lineHeight:24, marginBottom:32 },
  features:   { gap:12, marginBottom:48, width:'100%', paddingHorizontal:20 },
  feat:       { fontSize:13, color:Colors.textMuted, fontWeight:'600' },
  btn:        { width:'100%', backgroundColor:Colors.gold, borderRadius:Radius.pill, paddingVertical:16, alignItems:'center', shadowColor:Colors.gold, shadowOffset:{width:0,height:4}, shadowOpacity:0.5, shadowRadius:12, elevation:8 },
  btnTx:      { fontSize:16, fontWeight:'800', color:Colors.bg },
});
