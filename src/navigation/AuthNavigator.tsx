// src/navigation/AuthNavigator.tsx
// Stack navigator shown when user is NOT logged in.
// Uses native-stack (same as AppNavigator) — no extra package needed.

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { LoginScreen }      from '../screens/LoginScreen';

const Stack = createNativeStackNavigator();

export const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Onboarding" component={OnboardingScreen} />
    <Stack.Screen name="Login"      component={LoginScreen} />
  </Stack.Navigator>
);
