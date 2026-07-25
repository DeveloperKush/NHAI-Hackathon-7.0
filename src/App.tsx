import './utils/cryptoPolyfill';
import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import * as SplashScreen from 'expo-splash-screen';
import DemoAuthScreen from './screens/DemoAuthScreen';
import EnrollmentScreen from './screens/EnrollmentScreen';
import { initializeDatabase } from './services/database/sqlite';
import { initRecognitionModel } from './services/ai/recognition';
import { ensureMediaPipeAssets, getMediaPipeHTMLUri, handleWebViewMessage, setWebViewRef } from './services/ai/mediapipeLandmarks';

// Keep native splash screen visible while app resources are initializing
SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createStackNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dbError, setDbError] = useState<string | null>(null);
  const [stage, setStage] = useState<string>('');
  const webViewRef = useRef<any>(null);

  // Activate global connection monitoring and auto-sync on network reconnection
  useNetworkStatus();

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let currentStage = 'Starting setup...';

    const setupApp = async () => {
      try {
        timeoutId = setTimeout(() => {
          setDbError(`Timed out at: ${currentStage}. Likely native module stripped by R8.`);
        }, 10000); // 10s hard ceiling

        console.log('[App Startup] Starting setup...');

        currentStage = '1/3 Initializing database...';
        setStage(currentStage);
        await initializeDatabase();
        console.log('[App Startup] Database ready.');

        currentStage = '2/3 Initializing TFLite model...';
        setStage(currentStage);
        await initRecognitionModel();
        console.log('[App Startup] TFLite model ready.');

        currentStage = '3/3 Caching MediaPipe assets...';
        setStage(currentStage);
        await ensureMediaPipeAssets((p) => {
          console.log(`[App Startup] MediaPipe progress: ${p}%`);
          setProgress(p);
        });
        console.log('[App Startup] MediaPipe assets ready.');

        clearTimeout(timeoutId);
        setIsReady(true);
        await SplashScreen.hideAsync().catch(() => {});
      } catch (err: any) {
        clearTimeout(timeoutId);
        const msg = err?.message || String(err);
        setDbError(`[${currentStage}] ${msg}`);
        console.error('Startup failed:', err);
        await SplashScreen.hideAsync().catch(() => {});
      }
    };

    setupApp();
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (isReady && webViewRef.current) {
      setWebViewRef(webViewRef.current);
    }
    return () => {
      setWebViewRef(null);
    };
  }, [isReady]);

  if (dbError) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#f44336', fontSize: 18, fontWeight: 'bold' }}>Startup Failed</Text>
          <Text style={{ marginTop: 12, color: '#212121', textAlign: 'center', lineHeight: 20 }}>{dbError}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#1a237e', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={{ marginTop: 16, color: '#ffffff', fontWeight: 'bold' }}>
            {progress > 0 ? `Downloading AI models... ${progress}%` : (stage || 'Initializing...')}
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
          allowingReadAccessToURL={getMediaPipeHTMLUri().substring(0, getMediaPipeHTMLUri().lastIndexOf('/') + 1)}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          mixedContentMode="always"
        />
      </View>
    </SafeAreaProvider>
  );
}
