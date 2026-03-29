// src/screens/ProfileScreen.tsx
// User profile and sign-out logic via Supabase Auth.

import React, { useEffect, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { supabase } from '../services/supabase';
import { Colors, Radius, Spacing } from '../theme';

export const ProfileScreen: React.FC = () => {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    try {
      supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
    } catch (e) {
      console.warn("Supabase not configured.");
      setUser(null);
    }
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Ignore
    }
  };

  return (
    <View style={s.root}>
      <View style={s.glowGold}   />
      <View style={s.veil}       />

      <View style={s.header}>
        <Text style={s.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={[s.list, { alignItems:'center', paddingTop:20 }]}>
        {/* Avatar */}
        <View style={s.bigAvatar}>
          <Text style={s.bigAvatarTx}>
            {user?.email?.[0]?.toUpperCase() ?? 'S'}
          </Text>
        </View>
        <Text style={s.profileName}>{user?.email ?? '—'}</Text>

        {/* Settings rows */}
        {[
          'Subscription',
          'Notification settings',
          'Audio quality',
          'Privacy & data',
          'Help & feedback',
          'About MAESTRO',
        ].map((item, i) => (
          <Pressable key={i} style={s.settingRow}>
            <Text style={s.settingTx}>{item}</Text>
            <Text style={s.settingArrow}>›</Text>
          </Pressable>
        ))}

        {/* Sign out */}
        <Pressable style={s.signOutBtn} onPress={signOut}>
          <Text style={s.signOutTx}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root:        { flex:1, backgroundColor:Colors.bg },
  glowGold:    { position:'absolute', width:260, height:260, borderRadius:130, backgroundColor:'rgba(212,175,55,0.25)', top:-40, right:-40 },
  veil:        { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.5)' },
  header:      { paddingTop:60, paddingHorizontal:Spacing.lg, paddingBottom:Spacing.lg },
  title:       { fontSize:26, fontWeight:'800', color:Colors.textPrimary },
  list:        { padding:Spacing.lg, gap:Spacing.md },
  bigAvatar:   { width:80, height:80, borderRadius:40, backgroundColor:Colors.gold, alignItems:'center', justifyContent:'center', marginBottom:12, shadowColor:Colors.gold, shadowOffset:{width:0,height:0}, shadowOpacity:0.7, shadowRadius:12, elevation:8 },
  bigAvatarTx: { fontSize:28, fontWeight:'800', color:Colors.bg },
  profileName: { fontSize:16, color:Colors.textSecondary, marginBottom:28 },
  settingRow:  { width:'100%', flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:14, borderBottomWidth:1, borderBottomColor:Colors.borderSub },
  settingTx:   { fontSize:14, color:Colors.textPrimary },
  settingArrow:{ fontSize:20, color:Colors.textMuted },
  signOutBtn:  { marginTop:32, width:'100%', borderRadius:Radius.pill, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:Colors.border, backgroundColor:Colors.bgCard },
  signOutTx:   { fontSize:14, fontWeight:'600', color:Colors.red },
});
