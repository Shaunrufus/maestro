// App.tsx — MAESTRO Phase 2
// Adds: NavigationContainer, Auth gate, Splash screen
//
// Install dependencies first:
//   npx expo install expo-av @supabase/supabase-js expo-web-browser expo-auth-session
//   npm install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/stack
//   npx expo install react-native-screens react-native-safe-area-context

import 'react-native-url-polyfill/auto'; // required for Supabase on React Native
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import { supabase } from './src/services/supabase';
import { AppNavigator }  from './src/navigation/AppNavigator';
import { AuthNavigator } from './src/navigation/AuthNavigator';
import { Colors } from './src/theme';

export default function App() {
  const [session,  setSession ] = useState<any>(null);
  const [loading,  setLoading ] = useState(true);

  useEffect(() => {
    // Check existing session on boot
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Listen for auth state changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      {session ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
