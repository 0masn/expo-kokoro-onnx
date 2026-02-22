import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import { useSettings } from './src/hooks/useSettings';
import { getDownloadedModels } from './kokoro/models';
import KokoroOnnx from './kokoro/kokoroOnnx';
import FirstLaunchScreen from './src/screens/FirstLaunchScreen';
import CameraScreen from './src/screens/CameraScreen';

export default function App() {
  const { settings, updateSettings, isLoaded } = useSettings();
  const [appState, setAppState] = useState<'loading' | 'onboarding' | 'ready' | 'invalid_env'>('loading');
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded) {
      initializeApp();
    }
  }, [isLoaded]);

  const initializeApp = async () => {
    try {
      // Check for native modules availability
      if (!KokoroOnnx.checkOnnxAvailability()) {
        setAppState('invalid_env');
        return;
      }

      // Setup audio
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Check if user has completed onboarding
      if (!settings.hasCompletedOnboarding) {
        setAppState('onboarding');
        return;
      }

      // Check if we have a downloaded model
      const models = await getDownloadedModels();
      if (models.length === 0) {
        // Reset onboarding if no models found
        await updateSettings({ hasCompletedOnboarding: false });
        setAppState('onboarding');
        return;
      }

      // Try to load the saved model
      const modelToLoad = models.includes(settings.selectedModelId)
        ? settings.selectedModelId
        : models[0];

      const success = await KokoroOnnx.loadModel(modelToLoad);
      if (success) {
        setCurrentModelId(modelToLoad);
        setAppState('ready');
      } else {
        // Model load failed, show onboarding to re-download
        await updateSettings({ hasCompletedOnboarding: false });
        setAppState('onboarding');
      }
    } catch (err) {
      console.error('Failed to initialize app:', err);
      setInitError(String(err));
      // Fallback to onboarding
      setAppState('onboarding');
    }
  };

  const handleOnboardingComplete = useCallback(async (modelId: string, voiceId: string, language?: string) => {
    setCurrentModelId(modelId);
    await updateSettings({
      selectedModelId: modelId,
      selectedVoiceId: voiceId,
      language: language || settings.language,
      hasCompletedOnboarding: true,
    });
    setAppState('ready');
  }, [updateSettings, settings.language]);

  const handleModelChange = useCallback(async (modelId: string) => {
    setCurrentModelId(modelId);
    await updateSettings({ selectedModelId: modelId });
  }, [updateSettings]);

  const handleVoiceChange = useCallback(async (voiceId: string) => {
    await updateSettings({ selectedVoiceId: voiceId });
  }, [updateSettings]);

  const handleSpeedChange = useCallback(async (speed: number) => {
    await updateSettings({ speed });
  }, [updateSettings]);

  const handleLanguageChange = useCallback(async (language: string) => {
    await updateSettings({ language });
  }, [updateSettings]);

  if (appState === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Vorbereitung...</Text>
      </View>
    );
  }

  if (appState === 'onboarding') {
    return (
      <>
        <StatusBar style="light" />
        <FirstLaunchScreen onComplete={handleOnboardingComplete} />
      </>
    );
  }

  if (appState === 'invalid_env') {
    return (
      <View style={styles.errorContainer}>
        <StatusBar style="light" />
        <Text style={styles.errorTitle}>Entwicklung-Build erforderlich</Text>
        <Text style={styles.errorText}>
          Diese App verwendet native KI-Module (ONNX Runtime), die in der Standard-App "Expo Go" nicht verfügbar sind.
        </Text>
        <Text style={styles.errorSubtitle}>Bitte führen Sie die App mit folgendem Befehl aus:</Text>
        <View style={styles.codeBlock}>
          <Text style={styles.codeText}>npx expo run:android</Text>
        </View>
        <Text style={styles.errorSmall}>
          Stellen Sie sicher, dass Sie ein Android-Gerät angeschlossen oder einen Emulator gestartet haben.
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" translucent />
      <CameraScreen
        selectedModelId={settings.selectedModelId}
        selectedVoiceId={settings.selectedVoiceId}
        speed={settings.speed}
        language={settings.language}
        ocrLanguage={settings.ocrLanguage}
        currentModelId={currentModelId}
        onModelChange={handleModelChange}
        onVoiceChange={handleVoiceChange}
        onSpeedChange={handleSpeedChange}
        onLanguageChange={handleLanguageChange}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#8e8e93',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorSubtitle: {
    color: '#8e8e93',
    fontSize: 14,
    marginBottom: 12,
  },
  codeBlock: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 8,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  codeText: {
    color: '#6366f1',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
    textAlign: 'center',
  },
  errorSmall: {
    color: '#4b5563',
    fontSize: 12,
    textAlign: 'center',
  },
});