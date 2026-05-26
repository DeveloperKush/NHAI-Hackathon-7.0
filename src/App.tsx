import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import DemoAuthScreen from './screens/DemoAuthScreen';
import EnrollmentScreen from './screens/EnrollmentScreen';

const Stack = createStackNavigator();

export default function App() {
  // Activate global connection monitoring and auto-sync on network reconnection
  useNetworkStatus();

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
