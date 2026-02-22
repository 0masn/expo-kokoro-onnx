import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Dimensions,
    Animated,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { MODELS, downloadModel, getDownloadedModels } from '../../kokoro/models';
import { VOICES } from '../../kokoro/voices';
import KokoroOnnx from '../../kokoro/kokoroOnnx';

const { width, height } = Dimensions.get('window');

interface FirstLaunchScreenProps {
    onComplete: (modelId: string, voiceId: string, language?: string) => void;
}

type Step = 'welcome' | 'language' | 'model' | 'voice' | 'ready';

const LANGUAGES = [
    { id: 'de', label: 'Deutsch', icon: '🇩🇪', desc: 'Optimiert für deutsche Texte' },
    { id: 'en', label: 'English', icon: '🇺🇸', desc: 'Optimized for English text' },
];

export default function FirstLaunchScreen({ onComplete }: FirstLaunchScreenProps) {
    const [step, setStep] = useState<Step>('welcome');
    const [selectedLanguage, setSelectedLanguage] = useState('de');
    const [selectedModelId, setSelectedModelId] = useState('model_q8f16.onnx');
    const [selectedVoiceId, setSelectedVoiceId] = useState('af_heart');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
    const [downloadedVoices, setDownloadedVoices] = useState<Set<string>>(new Set());
    const [isModelReady, setIsModelReady] = useState(false);
    const [isVoiceReady, setIsVoiceReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isInitializing, setIsInitializing] = useState(false);
    const fadeAnim = useState(new Animated.Value(0))[0];

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
        }).start();
        checkExistingData();
    }, []);

    const checkExistingData = async () => {
        const models = await getDownloadedModels();
        setDownloadedModels(models);
        if (models.length > 0) {
            setIsModelReady(true);
            setSelectedModelId(models.includes('model_q8f16.onnx') ? 'model_q8f16.onnx' : models[0]);
        }

        // Check voices
        try {
            const voiceDirPath = `${FileSystem.documentDirectory}voices`;
            const dirInfo = await FileSystem.getInfoAsync(voiceDirPath);
            if (dirInfo.exists) {
                const files = await FileSystem.readDirectoryAsync(voiceDirPath);
                const voices = new Set<string>();
                files.forEach(f => { if (f.endsWith('.bin')) voices.add(f.replace('.bin', '')); });
                setDownloadedVoices(voices);
                if (voices.size > 0) setIsVoiceReady(true);
            }
        } catch (err) {
            console.error('Error checking voices:', err);
        }
    };

    const handleDownloadModel = async () => {
        setIsDownloading(true);
        setDownloadProgress(0);
        setError(null);
        try {
            const success = await downloadModel(selectedModelId, (p: number) => setDownloadProgress(p));
            if (success) {
                setDownloadedModels(prev => [...prev, selectedModelId]);
                setIsModelReady(true);
                setStep('voice');
            } else {
                setError('Download fehlgeschlagen. Bitte Verbindung prüfen.');
            }
        } catch (err) {
            setError('Fehler beim Download.');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadVoice = async () => {
        setIsDownloading(true);
        setError(null);
        try {
            const success = await KokoroOnnx.downloadVoice(selectedVoiceId);
            if (success) {
                setDownloadedVoices(prev => new Set([...prev, selectedVoiceId]));
                setIsVoiceReady(true);
                setStep('ready');
            } else {
                setError('Stimme konnte nicht geladen werden.');
            }
        } catch (err) {
            setError('Fehler beim Download der Stimme.');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleGetStarted = async () => {
        setIsInitializing(true);
        setError(null);
        try {
            const success = await KokoroOnnx.loadModel(selectedModelId);
            if (success) {
                onComplete(selectedModelId, selectedVoiceId, selectedLanguage);
            } else {
                setError('Initialisierung fehlgeschlagen.');
                setIsInitializing(false);
            }
        } catch (err) {
            setError('Fehler beim Starten.');
            setIsInitializing(false);
        }
    };

    const recommendedModels = ['model_q8f16.onnx', 'model_q4f16.onnx', 'model_quantized.onnx'];

    const renderWelcome = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.emoji}>📖</Text>
            <Text style={styles.title}>VoiceLens</Text>
            <Text style={styles.subtitle}>Texte mit der Kamera scannen{'\n'}und vorlesen lassen</Text>
            <View style={styles.featureList}>
                <FeatureItem icon="📷" text="Echtzeit OCR Scan" />
                <FeatureItem icon="🔊" text="Natürliche Sprachausgabe" />
                <FeatureItem icon="⚡" text="Schnelle On-Device KI" />
                <FeatureItem icon="🇩🇪" text="Optimiert für Deutsch" />
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('language')}>
                <Text style={styles.primaryButtonText}>Jetzt einrichten</Text>
            </TouchableOpacity>
        </View>
    );

    const renderLanguageStep = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Sprache wählen</Text>
            <Text style={styles.stepSubtitle}>Welche Sprache soll bevorzugt gelesen werden?</Text>
            <View style={styles.listContainer}>
                {LANGUAGES.map(l => (
                    <TouchableOpacity
                        key={l.id}
                        style={[styles.card, selectedLanguage === l.id && styles.cardSelected]}
                        onPress={() => setSelectedLanguage(l.id)}
                    >
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardTitle}>{l.icon} {l.label}</Text>
                        </View>
                        <Text style={styles.cardDesc}>{l.desc}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('model')}>
                <Text style={styles.primaryButtonText}>Weiter</Text>
            </TouchableOpacity>
        </View>
    );

    const renderModelStep = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>KI-Modell wählen</Text>
            <Text style={styles.stepSubtitle}>Größere Modelle klingen besser, sind aber langsamer</Text>
            <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
                {recommendedModels.map(id => {
                    const model = (MODELS as any)[id];
                    const isSelected = id === selectedModelId;
                    const isDownloaded = downloadedModels.includes(id);
                    return (
                        <TouchableOpacity
                            key={id}
                            style={[styles.card, isSelected && styles.cardSelected]}
                            onPress={() => setSelectedModelId(id)}
                        >
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardTitle}>{model.name}</Text>
                                <Text style={[styles.cardBadge, id === 'model_q8f16.onnx' && styles.cardBadgeHighlight]}>
                                    {id === 'model_q8f16.onnx' ? 'Empfohlen' : model.size}
                                </Text>
                            </View>
                            <Text style={styles.cardDesc}>{model.description}</Text>
                            {isDownloaded && <Text style={styles.downloadedBadge}>✓ Heruntergeladen</Text>}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {isDownloading && (
                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: `${downloadProgress * 100}%` }]} />
                    <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}%</Text>
                </View>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
                style={[styles.primaryButton, isDownloading && styles.buttonDisabled]}
                onPress={downloadedModels.includes(selectedModelId) ? () => { setIsModelReady(true); setStep('voice'); } : handleDownloadModel}
                disabled={isDownloading}
            >
                <Text style={styles.primaryButtonText}>
                    {isDownloading ? 'Wird geladen...' :
                        downloadedModels.includes(selectedModelId) ? 'Weiter' : 'Modell laden & Weiter'}
                </Text>
            </TouchableOpacity>
        </View>
    );

    const voiceOptions = ['af_heart', 'af_bella', 'bf_emma', 'am_michael', 'am_fenrir'];

    const renderVoiceStep = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Stimme wählen</Text>
            <Text style={styles.stepSubtitle}>Wähle eine Stimme für die Vorlesefunktion</Text>
            <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
                {voiceOptions.map(id => {
                    const voice = (VOICES as any)[id];
                    const isSelected = id === selectedVoiceId;
                    const isDownloaded = downloadedVoices.has(id);
                    return (
                        <TouchableOpacity
                            key={id}
                            style={[styles.card, isSelected && styles.cardSelected]}
                            onPress={() => setSelectedVoiceId(id)}
                        >
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardTitle}>{voice.name} {voice.traits || ''}</Text>
                                <Text style={styles.cardBadge}>{voice.gender} · Grade {voice.overallGrade || '?'}</Text>
                            </View>
                            {isDownloaded && <Text style={styles.downloadedBadge}>✓ Vorhanden</Text>}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
                style={[styles.primaryButton, isDownloading && styles.buttonDisabled]}
                onPress={downloadedVoices.has(selectedVoiceId) ? () => { setIsVoiceReady(true); setStep('ready'); } : handleDownloadVoice}
                disabled={isDownloading}
            >
                <Text style={styles.primaryButtonText}>
                    {isDownloading ? 'Wird geladen...' :
                        downloadedVoices.has(selectedVoiceId) ? 'Weiter' : 'Stimme laden'}
                </Text>
            </TouchableOpacity>
        </View>
    );

    const renderReady = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.emoji}>🎉</Text>
            <Text style={styles.title}>Bereit!</Text>
            <Text style={styles.subtitle}>
                Modell: {(MODELS as any)[selectedModelId]?.name}{'\n'}
                Stimme: {(VOICES as any)[selectedVoiceId]?.name}
            </Text>
            <Text style={styles.hint}>
                Halte dein Handy über einen Text und drücke den Play-Knopf in der Mitte.
            </Text>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
                style={[styles.primaryButton, styles.greenButton, isInitializing && styles.buttonDisabled]}
                onPress={handleGetStarted}
                disabled={isInitializing}
            >
                {isInitializing ? (
                    <View style={styles.loadingRow}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={[styles.primaryButtonText, { marginLeft: 10 }]}>Wird gestartet...</Text>
                    </View>
                ) : (
                    <Text style={styles.primaryButtonText}>Jetzt Loslegen →</Text>
                )}
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                {step === 'welcome' && renderWelcome()}
                {step === 'language' && renderLanguageStep()}
                {step === 'model' && renderModelStep()}
                {step === 'voice' && renderVoiceStep()}
                {step === 'ready' && renderReady()}
            </Animated.View>

            {/* Step indicators */}
            <View style={styles.stepsRow}>
                {(['welcome', 'language', 'model', 'voice', 'ready'] as Step[]).map((s, i) => (
                    <View key={s} style={[styles.stepDot, step === s && styles.stepDotActive]} />
                ))}
            </View>
        </View>
    );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
    return (
        <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>{icon}</Text>
            <Text style={styles.featureText}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0f',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    stepContainer: {
        alignItems: 'center',
    },
    emoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    title: {
        fontSize: 36,
        fontWeight: '800',
        color: '#ffffff',
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 17,
        color: '#8e8e93',
        textAlign: 'center',
        marginTop: 12,
        lineHeight: 24,
    },
    stepTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#ffffff',
        textAlign: 'center',
        marginBottom: 8,
    },
    stepSubtitle: {
        fontSize: 15,
        color: '#8e8e93',
        textAlign: 'center',
        marginBottom: 24,
    },
    featureList: {
        marginTop: 40,
        marginBottom: 48,
        width: '100%',
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
    },
    featureIcon: {
        fontSize: 24,
        marginRight: 16,
    },
    featureText: {
        fontSize: 17,
        color: '#e5e5ea',
        fontWeight: '500',
    },
    listContainer: {
        maxHeight: height * 0.45,
        width: '100%',
        marginBottom: 20,
    },
    card: {
        backgroundColor: '#1c1c1e',
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    cardSelected: {
        borderColor: '#6366f1',
        backgroundColor: '#1e1b4b',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#ffffff',
    },
    cardBadge: {
        fontSize: 13,
        color: '#8e8e93',
        backgroundColor: '#2c2c2e',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        overflow: 'hidden',
    },
    cardBadgeHighlight: {
        backgroundColor: '#312e81',
        color: '#a5b4fc',
        fontWeight: '700',
    },
    cardDesc: {
        fontSize: 14,
        color: '#636366',
        marginTop: 6,
    },
    downloadedBadge: {
        fontSize: 13,
        color: '#34d399',
        marginTop: 6,
        fontWeight: '500',
    },
    progressContainer: {
        width: '100%',
        height: 28,
        backgroundColor: '#1c1c1e',
        borderRadius: 14,
        marginBottom: 16,
        overflow: 'hidden',
        justifyContent: 'center',
    },
    progressBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: '#6366f1',
        borderRadius: 14,
    },
    progressText: {
        textAlign: 'center',
        color: '#ffffff',
        fontWeight: '600',
        fontSize: 13,
    },
    primaryButton: {
        backgroundColor: '#6366f1',
        paddingVertical: 16,
        paddingHorizontal: 40,
        borderRadius: 14,
        width: '100%',
        alignItems: 'center',
        marginTop: 10,
    },
    greenButton: {
        backgroundColor: '#10b981',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '700',
    },
    hint: {
        fontSize: 15,
        color: '#636366',
        textAlign: 'center',
        marginTop: 20,
        marginBottom: 32,
        lineHeight: 22,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 16,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    stepsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingBottom: 40,
        gap: 8,
    },
    stepDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#2c2c2e',
    },
    stepDotActive: {
        backgroundColor: '#6366f1',
        width: 24,
    },
});
