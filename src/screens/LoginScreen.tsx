// src/screens/LoginScreen.tsx
// Sign in with Google (OAuth) + Email magic link via Supabase Auth.
// No passwords to manage.
//
// Setup:
// 1. Supabase Dashboard → Authentication → Providers → Enable Google
// 2. Add your Google OAuth client ID (from console.cloud.google.com)
// 3. Set redirect URL in Supabase to: maestro://auth

import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../services/supabase';
import { Colors, Radius, Spacing, APP_NAME } from '../theme';

WebBrowser.maybeCompleteAuthSession();

export const LoginScreen: React.FC = () => {
  const [email,   setEmail  ] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent   ] = useState(false);

  // ── Google OAuth ──────────────────────────────────────────────────────
  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const redirectUri = makeRedirectUri({ scheme: 'maestro', path: 'auth' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo:  redirectUri,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) throw error;
      if (data?.url) await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
    } catch (e: any) {
      Alert.alert('Sign-in failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Email magic link ──────────────────────────────────────────────────
  const signInWithEmail = async () => {
    if (!email.trim()) { Alert.alert('Enter your email'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (error) throw error;
      setSent(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Glows */}
      <View style={s.glowPurple} />
      <View style={s.glowGold}   />
      <View style={s.veil}       />

      <View style={s.content}>
        {/* Logo */}
        <Text style={s.logo}>{APP_NAME}</Text>
        <Text style={s.tagline}>Your virtual recording studio</Text>

        {sent ? (
          <View style={s.sentBox}>
            <Text style={s.sentTitle}>Check your email ✦</Text>
            <Text style={s.sentSub}>We sent a magic link to {email}. Tap it to sign in.</Text>
          </View>
        ) : (
          <>
            {/* Google button */}
            <Pressable style={s.googleBtn} onPress={signInWithGoogle} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={Colors.bg} />
              ) : (
                <Text style={s.googleTx}>Continue with Google</Text>
              )}
            </Pressable>

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.divLine} />
              <Text style={s.divTx}>or use email</Text>
              <View style={s.divLine} />
            </View>

            {/* Email input */}
            <TextInput
              style={s.input}
              placeholder="your@email.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <Pressable style={s.emailBtn} onPress={signInWithEmail} disabled={loading}>
              <Text style={s.emailTx}>Send magic link</Text>
            </Pressable>
          </>
        )}

        {/* Terms */}
        <Text style={s.terms}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  root:       { flex:1, backgroundColor:Colors.bg },
  glowPurple: { position:'absolute', width:300, height:300, borderRadius:150, backgroundColor:'rgba(106,42,230,0.35)', top:-60, left:-40 },
  glowGold:   { position:'absolute', width:250, height:250, borderRadius:125, backgroundColor:'rgba(212,175,55,0.25)', bottom:-40, right:-40 },
  veil:       { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.52)' },
  content:    { flex:1, alignItems:'center', justifyContent:'center', paddingHorizontal:Spacing.xl },
  logo:       { fontSize:36, fontWeight:'800', letterSpacing:4, color:Colors.gold, marginBottom:8 },
  tagline:    { fontSize:14, color:Colors.textSecondary, marginBottom:48 },
  googleBtn:  { width:'100%', backgroundColor:Colors.textPrimary, borderRadius:Radius.pill, paddingVertical:15, alignItems:'center', marginBottom:20 },
  googleTx:   { fontSize:15, fontWeight:'700', color:Colors.bg },
  divider:    { flexDirection:'row', alignItems:'center', gap:12, marginBottom:20, width:'100%' },
  divLine:    { flex:1, height:1, backgroundColor:Colors.border },
  divTx:      { fontSize:12, color:Colors.textMuted },
  input:      { width:'100%', backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.md, padding:14, color:Colors.textPrimary, fontSize:14, marginBottom:12 },
  emailBtn:   { width:'100%', backgroundColor:Colors.tealBg, borderWidth:1, borderColor:Colors.teal, borderRadius:Radius.pill, paddingVertical:14, alignItems:'center', marginBottom:24 },
  emailTx:    { fontSize:15, fontWeight:'600', color:Colors.teal },
  sentBox:    { alignItems:'center', marginVertical:24 },
  sentTitle:  { fontSize:22, fontWeight:'700', color:Colors.gold, marginBottom:12 },
  sentSub:    { fontSize:14, color:Colors.textSecondary, textAlign:'center', lineHeight:22 },
  terms:      { fontSize:11, color:Colors.textHint, textAlign:'center', lineHeight:18, marginTop:16 },
});
