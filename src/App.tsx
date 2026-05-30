import './utils/cryptoPolyfill';
import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import DemoAuthScreen from './screens/DemoAuthScreen';
import EnrollmentScreen from './screens/EnrollmentScreen';
import { initializeDatabase } from './services/database/sqlite';
import { initRecognitionModel } from './services/ai/recognition';
import { ensureMediaPipeAssets, getMediaPipeHTMLUri, handleWebViewMessage, setWebViewRef } from './services/ai/mediapipeLandmarks';

const Stack = createStackNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const webViewRef = useRef<any>(null);

  // Activate global connection monitoring and auto-sync on network reconnection
  useNetworkStatus();

  useEffect(() => {
    async function setupApp() {
      try {
        await initializeDatabase();
        await initRecognitionModel();
        await ensureMediaPipeAssets((p) => setProgress(p));
      } catch (err) {
        console.error('Failed to initialize application components:', err);
      } finally {
        setIsReady(true);
      }
    }
    setupApp();
  }, []);

  useEffect(() => {
    if (isReady && webViewRef.current) {
      setWebViewRef(webViewRef.current);
    }
    return () => {
      setWebViewRef(null);
    };
  }, [isReady]);

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#1a237e" />
          <Text style={{ marginTop: 16, color: '#1a237e', fontWeight: 'bold' }}>
            {progress > 0 ? `Downloading AI models... ${progress}%` : 'Initializing database...'}
          </Text>
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
      <View style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}>
        <WebView
          ref={webViewRef}
          style={{ width: 1, height: 1 }}
          originWhitelist={['*', 'file://*']}
          source={{ uri: getMediaPipeHTMLUri() }}
          onMessage={handleWebViewMessage}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          mixedContentMode="always"
        />
      </View>
    </SafeAreaProvider>
  );
}
