// src/navigation/AppNavigator.tsx
// Bottom tab navigator for authenticated users.
// Tabs: Studio, My Songs, Discover, Profile

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';

import { StudioScreen }   from '../screens/StudioScreen';
import { MySongsScreen }  from '../screens/MySongsScreen';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { ProfileScreen }  from '../screens/ProfileScreen';
import { GuruScreen }     from '../screens/GuruScreen';
import { LyricsScreen }   from '../screens/LyricsScreen';
import { PaywallScreen }  from '../screens/PaywallScreen';
import { MultitrackScreen } from '../screens/MultitrackScreen';
import { CompingScreen }    from '../screens/CompingScreen';
import { MixModeScreen }    from '../screens/MixModeScreen';
import { BandResultsScreen } from '../screens/BandResultsScreen';
import { Colors }         from '../theme';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Tab icon component
const TabIcon = ({ label, active }: { label: string; active: boolean }) => (
  <View style={{
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: active ? 'rgba(0,217,192,0.15)' : 'rgba(255,255,255,0.06)',
    borderWidth: active ? 1 : 0,
    borderColor: Colors.teal,
    alignItems: 'center', justifyContent: 'center',
  }}>
    <Text style={{ fontSize: 9, fontWeight: '700', color: active ? Colors.teal : Colors.textMuted }}>
      {label[0]}
    </Text>
  </View>
);

// Studio tab has nested stack (Studio → Guru → Lyrics → BandResults)
function StudioStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StudioMain"  component={StudioScreen} />
      <Stack.Screen name="Multitrack"  component={MultitrackScreen} />
      <Stack.Screen name="Comping"     component={CompingScreen} />
      <Stack.Screen name="MixMode"     component={MixModeScreen} />
      <Stack.Screen name="Guru"        component={GuruScreen}   />
      <Stack.Screen name="Lyrics"      component={LyricsScreen} />
      <Stack.Screen name="Paywall"     component={PaywallScreen} />
      <Stack.Screen name="BandResults" component={BandResultsScreen} />
    </Stack.Navigator>
  );
}

export const AppNavigator = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: Colors.bgSurf,
        borderTopColor:  Colors.border,
        borderTopWidth:  1,
        paddingBottom:   8,
        height:          62,
      },
      tabBarActiveTintColor:   Colors.teal,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarLabelStyle: { fontSize: 9, fontWeight: '600', marginTop: 2 },
    }}
  >
    <Tab.Screen
      name="Studio"
      component={StudioStack}
      options={{ tabBarIcon: ({ focused }) => <TabIcon label="Studio"   active={focused} /> }}
    />
    <Tab.Screen
      name="My Songs"
      component={MySongsScreen}
      options={{ tabBarIcon: ({ focused }) => <TabIcon label="My Songs" active={focused} /> }}
    />
    <Tab.Screen
      name="Discover"
      component={DiscoverScreen}
      options={{ tabBarIcon: ({ focused }) => <TabIcon label="Discover" active={focused} /> }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{ tabBarIcon: ({ focused }) => <TabIcon label="Profile"  active={focused} /> }}
    />
  </Tab.Navigator>
);
