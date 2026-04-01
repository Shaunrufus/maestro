import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { AppNavigator } from './navigation/AppNavigator';
import { AuthNavigator } from './navigation/AuthNavigator';
import { useStudioStore } from './store/useStudioStore';
import { Colors } from './theme';

export default function App() {
  const [loading, setLoading] = useState(true);
  const { userId } = useStudioStore();

  useEffect(() => {
    // Simulate auth check
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg }}>
        <ActivityIndicator size="large" color={Colors.teal} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {userId ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
