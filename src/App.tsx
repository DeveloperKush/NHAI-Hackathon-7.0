import './utils/cryptoPolyfill';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View } from 'react-native';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import DemoAuthScreen from './screens/DemoAuthScreen';
import EnrollmentScreen from './screens/EnrollmentScreen';
import { initializeDatabase } from './services/database/sqlite';
import { initRecognitionModel } from './services/ai/recognition';

const Stack = createStackNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);

  // Activate global connection monitoring and auto-sync on network reconnection
  useNetworkStatus();

  useEffect(() => {
    async function setupApp() {
      try {
        await initializeDatabase();
        await initRecognitionModel();
      } catch (err) {
        console.error('Failed to initialize application components:', err);
      } finally {
        setIsReady(true);
      }
    }
    setupApp();
  }, []);

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#1a237e" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="DemoAuthScreen">
          <Stack.Screen
            name="DemoAuthScreen"
            component={DemoAuthScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EnrollmentScreen"
            component={EnrollmentScreen}
            options={{
              title: 'Enrollment',
              headerStyle: {
                backgroundColor: '#ffffff',
              },
              headerTintColor: '#1a237e',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
