import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Dimensions,
    StatusBar,
    Platform,
    SafeAreaView,
    NativeModules,
} from 'react-native';
import SettingsModal from '../components/SettingsModal';
import { useOCR } from '../hooks/useOCR';
import { useTTSQueue } from '../hooks/useTTSQueue';

// Check if these are available
let Camera: any = null;
let useCameraDevice: any = null;

try {
    // CRITICAL: Prevent top-level crash in environments without native modules (Expo Go)
    // We only attempt to require if we are likely in a native build or on web
    const isLikelyNative = Platform.OS === 'web' || !!NativeModules.CameraManager || !!NativeModules.VisionCameraModule;

    // However, vision-camera 4.x uses Nitro, so NativeModules might be empty.
    // The safest way is to wrap the require and check if it throws early.
    const VisionCamera = require('react-native-vision-camera');
    const OCRCamera = require('react-native-vision-camera-ocr-plus');

    if (OCRCamera) Camera = OCRCamera.Camera;
    if (VisionCamera) useCameraDevice = VisionCamera.useCameraDevice;
} catch (e) {
    console.warn('Vision Camera or OCR plugin not available (common in Expo Go):', e);
}

const { width, height } = Dimensions.get('window');

interface CameraScreenProps {
    selectedModelId: string;
    selectedVoiceId: string;
    speed: number;
    language: string;
    ocrLanguage: string;
    currentModelId: string | null;
    onModelChange: (modelId: string) => void;
    onVoiceChange: (voiceId: string) => void;
    onSpeedChange: (speed: number) => void;
    onLanguageChange: (language: string) => void;
}

export default function CameraScreen({
    selectedModelId,
    selectedVoiceId,
    speed,
    language,
    ocrLanguage,
    currentModelId,
    onModelChange,
    onVoiceChange,
    onSpeedChange,
    onLanguageChange,
}: CameraScreenProps) {
    const [isReading, setIsReading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const { lastText, processOCRResult, setOnNewText, reset } = useOCR();
    const { isPlaying, currentText, enqueue, pause, stop } = useTTSQueue(selectedVoiceId, speed);

    // Safely attempt to use camera device hook
    let device: any = null;
    try {
        if (useCameraDevice) {
            device = useCameraDevice('back');
        }
    } catch (e) {
        // Camera not available
    }

    // Animations
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const textOpacity = useRef(new Animated.Value(0)).current;
    const overlayOpacity = useRef(new Animated.Value(0)).current;
    const scanLineAnim = useRef(new Animated.Value(0)).current;

    // Pulse animation for play button
    useEffect(() => {
        if (!isReading) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.1, duration: 1500, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isReading]);

    // Scan line animation when reading
    useEffect(() => {
        if (isReading) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(scanLineAnim, { toValue: 1, duration: 2500, useNativeDriver: true }),
                    Animated.timing(scanLineAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
                ])
            ).start();
        } else {
            scanLineAnim.setValue(0);
        }
    }, [isReading]);

    // Text overlay animation
    useEffect(() => {
        if (currentText) {
            Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        } else {
            Animated.timing(textOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
        }
    }, [currentText]);

    // Reading indicator animation
    useEffect(() => {
        Animated.timing(overlayOpacity, {
            toValue: isReading ? 1 : 0,
            duration: 400,
            useNativeDriver: true,
        }).start();
    }, [isReading]);

    // Connect OCR to TTS
    useEffect(() => {
        setOnNewText((text: string) => {
            if (isReading) {
                enqueue(text);
            }
        });
    }, [isReading, setOnNewText, enqueue]);

    const toggleReading = useCallback(async () => {
        if (isReading) {
            setIsReading(false);
            await stop();
            reset();
        } else {
            setIsReading(true);
        }
    }, [isReading, stop, reset]);

    const handleOCRResult = useCallback((result: any) => {
        if (isReading && result) {
            processOCRResult(result);
        }
    }, [isReading, processOCRResult]);

    // Fallback if no native camera
    if (!Camera || !device) {
        return (
            <View style={styles.noCameraContainer}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
                <TouchableOpacity
                    style={styles.settingsBtn}
                    onPress={() => setShowSettings(true)}
                >
                    <Text style={styles.settingsIconText}>⚙️</Text>
                </TouchableOpacity>

                <Text style={styles.noCameraEmoji}>📷</Text>
                <Text style={styles.noCameraMsg}>Kamera nicht verfügbar</Text>
                <Text style={styles.noCameraHint}>
                    Diese App benötigt einen Development Build.{'\n'}
                    Führen Sie aus: npx expo run:android{'\n'}
                    oder: npx expo run:ios
                </Text>

                <SettingsModal
                    visible={showSettings}
                    onClose={() => setShowSettings(false)}
                    selectedModelId={selectedModelId}
                    selectedVoiceId={selectedVoiceId}
                    speed={speed}
                    language={language}
                    currentModelId={currentModelId}
                    onModelChange={onModelChange}
                    onVoiceChange={onVoiceChange}
                    onSpeedChange={onSpeedChange}
                    onLanguageChange={onLanguageChange}
                />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* FULLSCREEN CAMERA */}
            <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
                mode="recognize"
                options={{
                    language: ocrLanguage,
                    frameSkipThreshold: isReading ? 5 : 40,
                }}
                callback={handleOCRResult}
            />

            {/* SCANNING FRAME OVERLAY */}
            {isReading && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <View style={styles.viewfinderContainer}>
                        <View style={styles.cornerTopLeft} />
                        <View style={styles.cornerTopRight} />
                        <View style={styles.cornerBottomLeft} />
                        <View style={styles.cornerBottomRight} />
                        <Animated.View
                            style={[
                                styles.scanLine,
                                {
                                    transform: [{
                                        translateY: scanLineAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0, height * 0.4]
                                        })
                                    }]
                                }
                            ]}
                        />
                    </View>
                </View>
            )}

            {/* TOP UI: Reading Badge & Settings */}
            <SafeAreaView style={styles.topBar}>
                <View style={styles.topBarContent}>
                    {isReading ? (
                        <Animated.View style={[styles.readingBadge, { opacity: overlayOpacity }]}>
                            <View style={styles.readingDot} />
                            <Text style={styles.readingText}>LIVE LESEN</Text>
                        </Animated.View>
                    ) : <View />}

                    <TouchableOpacity
                        style={styles.settingsBtn}
                        onPress={() => setShowSettings(true)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.glassCircle}>
                            <Text style={styles.settingsIconText}>⚙️</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/* CENTER PLAY BUTTON */}
            <View style={styles.centerControls} pointerEvents="box-none">
                <Animated.View style={{ transform: [{ scale: pulseAnim }], opacity: isReading ? 0.3 : 1 }}>
                    <TouchableOpacity
                        style={[styles.bigPlayBtn, isReading && styles.bigPlayBtnActive]}
                        onPress={toggleReading}
                        activeOpacity={0.8}
                    >
                        <View style={styles.btnInner}>
                            <Text style={styles.playIcon}>{isReading ? '⏸' : '▶️'}</Text>
                        </View>
                    </TouchableOpacity>
                </Animated.View>
                {!isReading && (
                    <Text style={styles.centerHint}>
                        {language === 'de' ? 'Zum Starten antippen' : 'Tap to Start'}
                    </Text>
                )}
            </View>

            {/* BOTTOM TEXT OVERLAY */}
            {currentText ? (
                <Animated.View style={[styles.bottomTextContainer, { opacity: textOpacity }]}>
                    <View style={styles.glassTextCard}>
                        <Text style={styles.spokenText} numberOfLines={3}>
                            {currentText}
                        </Text>
                    </View>
                </Animated.View>
            ) : null}

            {/* SETTINGS MODAL */}
            <SettingsModal
                visible={showSettings}
                onClose={() => setShowSettings(false)}
                selectedModelId={selectedModelId}
                selectedVoiceId={selectedVoiceId}
                speed={speed}
                language={language}
                currentModelId={currentModelId}
                onModelChange={onModelChange}
                onVoiceChange={onVoiceChange}
                onSpeedChange={onSpeedChange}
                onLanguageChange={onLanguageChange}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    noCameraContainer: {
        flex: 1,
        backgroundColor: '#0a0a0f',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    noCameraEmoji: {
        fontSize: 80,
        marginBottom: 20,
    },
    noCameraMsg: {
        fontSize: 22,
        fontWeight: '700',
        color: '#ffffff',
        textAlign: 'center',
    },
    noCameraHint: {
        fontSize: 16,
        color: '#8e8e93',
        marginTop: 12,
        textAlign: 'center',
        lineHeight: 24,
    },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
    },
    topBarContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 10,
    },
    readingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(220, 38, 38, 0.8)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    readingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#fff',
        marginRight: 8,
    },
    readingText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1,
    },
    glassCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    settingsBtn: {
        zIndex: 20,
    },
    settingsIconText: {
        fontSize: 22,
    },
    viewfinderContainer: {
        position: 'absolute',
        top: height * 0.2,
        left: width * 0.1,
        right: width * 0.1,
        height: height * 0.4,
        borderWidth: 0,
    },
    cornerTopLeft: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 40,
        height: 40,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderColor: '#6366f1',
        borderTopLeftRadius: 12,
    },
    cornerTopRight: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 40,
        height: 40,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderColor: '#6366f1',
        borderTopRightRadius: 12,
    },
    cornerBottomLeft: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: 40,
        height: 40,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderColor: '#6366f1',
        borderBottomLeftRadius: 12,
    },
    cornerBottomRight: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 40,
        height: 40,
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderColor: '#6366f1',
        borderBottomRightRadius: 12,
    },
    scanLine: {
        height: 2,
        backgroundColor: 'rgba(99, 102, 241, 0.5)',
        width: '100%',
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
    },
    centerControls: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
    },
    bigPlayBtn: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(99, 102, 241, 0.3)',
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    bigPlayBtnActive: {
        backgroundColor: 'rgba(220, 38, 38, 0.3)',
        borderColor: 'rgba(220, 38, 38, 0.5)',
    },
    btnInner: {
        flex: 1,
        borderRadius: 46,
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    playIcon: {
        fontSize: 40,
        color: '#fff',
    },
    centerHint: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        marginTop: 20,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    bottomTextContainer: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        zIndex: 20,
    },
    glassTextCard: {
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    spokenText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        lineHeight: 26,
        textAlign: 'center',
    },
});
