import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback } from 'react';

const SETTINGS_KEY = '@voicelens_settings';

export interface AppSettings {
    selectedModelId: string;
    selectedVoiceId: string;
    speed: number;
    hasCompletedOnboarding: boolean;
    language: string;        // UI/reading language preference e.g. 'de', 'en'
    ocrLanguage: string;     // OCR engine language hint e.g. 'latin'
}

const DEFAULT_SETTINGS: AppSettings = {
    selectedModelId: 'model_q8f16.onnx',
    selectedVoiceId: 'af_heart',
    speed: 0.9,
    hasCompletedOnboarding: false,
    language: 'de',
    ocrLanguage: 'latin',
};

export function useSettings() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const stored = await AsyncStorage.getItem(SETTINGS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                setSettings({ ...DEFAULT_SETTINGS, ...parsed });
            }
        } catch (err) {
            console.error('Error loading settings:', err);
        } finally {
            setIsLoaded(true);
        }
    };

    const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
        try {
            const newSettings = { ...settings, ...updates };
            setSettings(newSettings);
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
        } catch (err) {
            console.error('Error saving settings:', err);
        }
    }, [settings]);

    return { settings, updateSettings, isLoaded };
}
