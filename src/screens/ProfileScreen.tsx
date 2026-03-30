import React, { useEffect, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View, Alert
} from 'react-native';
import { supabase } from '../services/supabase';
import { useStudioStore } from '../store/useStudioStore';
import { Colors, Radius, Spacing } from '../theme';

export const ProfileScreen: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const { currentProject } = useStudioStore();

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

  const handleSetting = (item: string) => {
    Alert.alert(item, 'This settings module is not yet connected in the demo.');
  };

  const tracksCount = currentProject?.tracks?.length || 0;
  const projectStats = [
    { label: 'Active Projects', value: '1' }, // Hardcoded 1 for demo
    { label: 'Total Tracks', value: String(tracksCount) },
    { label: 'Collabs', value: '0' }
  ];

  return (
    <View style={s.root}>
      <View style={s.glowGold}   />
      <View style={s.veil}       />

      <View style={s.header}>
        <Text style={s.title}>Studio Profile</Text>
      </View>

      <ScrollView contentContainerStyle={[s.list, { alignItems:'center', paddingTop:20 }]}>
        {/* Avatar */}
        <View style={s.bigAvatar}>
          <Text style={s.bigAvatarTx}>
            {user?.email?.[0]?.toUpperCase() ?? 'S'}
          </Text>
        </View>
        <Text style={s.profileName}>{user?.email ?? 'Studio Guest'}</Text>
        <View style={s.proBadge}>
           <Text style={s.proBadgeTx}>MAESTRO PRO</Text>
        </View>

        {/* Stats Row */}
        <View style={s.statsCard}>
           {projectStats.map((stat, i) => (
             <React.Fragment key={stat.label}>
               <View style={s.statCol}>
                 <Text style={s.statVal}>{stat.value}</Text>
                 <Text style={s.statLbl}>{stat.label}</Text>
               </View>
               {i < projectStats.length - 1 && <View style={s.statDiv} />}
             </React.Fragment>
           ))}
        </View>

        {/* Settings rows */}
        <View style={s.settingsContainer}>
          {[
            'Subscription Plan',
            'Connected Hardware',
            'Audio Quality (WAV/MP3)',
            'Privacy & Data',
            'Help & Feedback',
            'About MAESTRO',
          ].map((item, i) => (
            <Pressable key={i} style={s.settingRow} onPress={() => handleSetting(item)}>
              <Text style={s.settingTx}>{item}</Text>
              <Text style={s.settingArrow}>›</Text>
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Pressable style={s.signOutBtn} onPress={signOut}>
          <Text style={s.signOutTx}>Sign out of Studio</Text>
        </Pressable>
        <Text style={s.versionTx}>MAESTRO Studio v1.0.0</Text>
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
  bigAvatar:   { width:80, height:80, borderRadius:40, backgroundColor:Colors.gold, alignItems:'center', justifyContent:'center', marginBottom:8, shadowColor:Colors.gold, shadowOffset:{width:0,height:0}, shadowOpacity:0.7, shadowRadius:12, elevation:8 },
  bigAvatarTx: { fontSize:28, fontWeight:'800', color:Colors.bg },
  profileName: { fontSize:18, fontWeight: '600', color:Colors.textPrimary, marginBottom:8 },
  proBadge:    { backgroundColor:Colors.tealBg, borderWidth:1, borderColor:Colors.teal, paddingHorizontal:12, paddingVertical:4, borderRadius:Radius.pill, marginBottom: 24 },
  proBadgeTx:  { fontSize:10, fontWeight:'700', color:Colors.teal, letterSpacing:1 },
  
  statsCard:   { flexDirection:'row', backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.md, paddingVertical:Spacing.lg, paddingHorizontal:Spacing.sm, width:'100%', alignItems:'center', justifyContent:'space-between', marginBottom: 20 },
  statCol:     { flex:1, alignItems:'center' },
  statVal:     { fontSize:20, fontWeight:'700', color:Colors.gold, marginBottom:4 },
  statLbl:     { fontSize:10, color:Colors.textSecondary },
  statDiv:     { width:1, height:30, backgroundColor:Colors.borderSub },

  settingsContainer: { width: '100%', backgroundColor: Colors.bgCard, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  settingRow:  { width:'100%', flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:16, paddingHorizontal: Spacing.md, borderBottomWidth:1, borderBottomColor:Colors.borderSub },
  settingTx:   { fontSize:14, color:Colors.textPrimary },
  settingArrow:{ fontSize:20, color:Colors.textMuted },
  signOutBtn:  { marginTop:20, width:'100%', borderRadius:Radius.pill, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:Colors.border, backgroundColor:Colors.bgCard },
  signOutTx:   { fontSize:14, fontWeight:'600', color:Colors.red },
  versionTx:   { marginTop: 20, fontSize:10, color:Colors.textMuted },
});
