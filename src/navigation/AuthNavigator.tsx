// src/navigation/AuthNavigator.tsx
// Stack navigator shown when user is NOT logged in.

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { LoginScreen }      from '../screens/LoginScreen';

const Stack = createStackNavigator();

export const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Onboarding" component={OnboardingScreen} />
    <Stack.Screen name="Login"      component={LoginScreen} />
  </Stack.Navigator>
);
