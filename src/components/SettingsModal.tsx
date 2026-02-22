import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView,
    ActivityIndicator,
    Alert,
    Dimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { MODELS, downloadModel, getDownloadedModels, deleteModel } from '../../kokoro/models';
import { VOICES } from '../../kokoro/voices';
import KokoroOnnx from '../../kokoro/kokoroOnnx';

const { height } = Dimensions.get('window');

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
    selectedModelId: string;
    selectedVoiceId: string;
    speed: number;
    language: string;
    currentModelId: string | null;
    onModelChange: (modelId: string) => void;
    onVoiceChange: (voiceId: string) => void;
    onSpeedChange: (speed: number) => void;
    onLanguageChange: (language: string) => void;
}

const LANGUAGES = [
    { id: 'de', label: 'Deutsch', icon: '🇩🇪' },
    { id: 'en', label: 'English', icon: '🇺🇸' },
    { id: 'fr', label: 'Français', icon: '🇫🇷' },
    { id: 'es', label: 'Español', icon: '🇪🇸' },
];

export default function SettingsModal({
    visible,
    onClose,
    selectedModelId,
    selectedVoiceId,
    speed,
    language,
    currentModelId,
    onModelChange,
    onVoiceChange,
    onSpeedChange,
    onLanguageChange,
}: SettingsModalProps) {
    const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
    const [downloadedVoices, setDownloadedVoices] = useState<Set<string>>(new Set());
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadingItem, setDownloadingItem] = useState<string | null>(null);
    const [isLoadingModel, setIsLoadingModel] = useState(false);

    useEffect(() => {
        if (visible) {
            refreshData();
        }
    }, [visible]);

    const refreshData = async () => {
        const models = await getDownloadedModels();
        setDownloadedModels(models);

        try {
            const voiceDirPath = `${FileSystem.documentDirectory}voices`;
            const dirInfo = await FileSystem.getInfoAsync(voiceDirPath);
            if (dirInfo.exists) {
                const files = await FileSystem.readDirectoryAsync(voiceDirPath);
                const voices = new Set<string>();
                files.forEach(f => { if (f.endsWith('.bin')) voices.add(f.replace('.bin', '')); });
                setDownloadedVoices(voices);
            }
        } catch (err) {
            console.error('Error checking voices:', err);
        }
    };

    const handleDownloadModel = async (modelId: string) => {
        setIsDownloading(true);
        setDownloadingItem(modelId);
        setDownloadProgress(0);
        try {
            const success = await downloadModel(modelId, (p: number) => setDownloadProgress(p));
            if (success) {
                setDownloadedModels(prev => [...prev, modelId]);
            } else {
                Alert.alert('Fehler', 'Modell-Download fehlgeschlagen');
            }
        } catch (err) {
            Alert.alert('Fehler', 'Download fehlgeschlagen');
        } finally {
            setIsDownloading(false);
            setDownloadingItem(null);
        }
    };

    const handleDeleteModel = async (modelId: string) => {
        if (modelId === currentModelId) {
            Alert.alert('Aktion nicht möglich', 'Dieses Modell wird gerade verwendet.');
            return;
        }
        const success = await deleteModel(modelId);
        if (success) {
            setDownloadedModels(prev => prev.filter(id => id !== modelId));
        }
    };

    const handleLoadModel = async (modelId: string) => {
        setIsLoadingModel(true);
        try {
            const success = await KokoroOnnx.loadModel(modelId);
            if (success) {
                onModelChange(modelId);
            } else {
                Alert.alert('Fehler', 'Modell konnte nicht geladen werden');
            }
        } catch (err) {
            Alert.alert('Fehler', 'Modell konnte nicht geladen werden');
        } finally {
            setIsLoadingModel(false);
        }
    };

    const handleDownloadVoice = async (voiceId: string) => {
        setIsDownloading(true);
        setDownloadingItem(voiceId);
        try {
            const success = await KokoroOnnx.downloadVoice(voiceId);
            if (success) {
                setDownloadedVoices(prev => new Set([...prev, voiceId]));
            } else {
                Alert.alert('Fehler', 'Stimme konnte nicht geladen werden');
            }
        } catch (err) {
            Alert.alert('Fehler', 'Stimmen-Download fehlgeschlagen');
        } finally {
            setIsDownloading(false);
            setDownloadingItem(null);
        }
    };

    const speedValues = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const modelKeys = Object.keys(MODELS);

    // Group voices by language
    const groupedVoices: Record<string, string[]> = {};
    Object.keys(VOICES).forEach(id => {
        const voice = (VOICES as any)[id];
        const lang = voice.language || 'en-us';
        if (!groupedVoices[lang]) groupedVoices[lang] = [];
        groupedVoices[lang].push(id);
    });

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.modal}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Einstellungen</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                        {/* Language */}
                        <Text style={styles.sectionTitle}>Sprache</Text>
                        <View style={styles.languageRow}>
                            {LANGUAGES.map(l => (
                                <TouchableOpacity
                                    key={l.id}
                                    style={[styles.langChip, language === l.id && styles.langChipActive]}
                                    onPress={() => onLanguageChange(l.id)}
                                >
                                    <Text style={styles.langIcon}>{l.icon}</Text>
                                    <Text style={[styles.langLabel, language === l.id && styles.langLabelActive]}>
                                        {l.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Speed */}
                        <Text style={styles.sectionTitle}>Geschwindigkeit</Text>
                        <View style={styles.speedRow}>
                            {speedValues.map(s => (
                                <TouchableOpacity
                                    key={s}
                                    style={[styles.speedChip, speed === s && styles.speedChipActive]}
                                    onPress={() => onSpeedChange(s)}
                                >
                                    <Text style={[styles.speedChipText, speed === s && styles.speedChipTextActive]}>
                                        {s}x
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Models */}
                        <Text style={styles.sectionTitle}>KI-Modelle</Text>
                        {modelKeys.map(id => {
                            const model = (MODELS as any)[id];
                            const isDownloaded = downloadedModels.includes(id);
                            const isLoaded = id === currentModelId;
                            const isDownloadingThis = downloadingItem === id;

                            return (
                                <View key={id} style={[styles.itemCard, isLoaded && styles.itemCardActive]}>
                                    <View style={styles.itemRow}>
                                        <View style={styles.itemInfo}>
                                            <Text style={styles.itemName}>{model.name}</Text>
                                            <Text style={styles.itemMeta}>{model.size} · {model.description}</Text>
                                        </View>
                                        <View style={styles.itemActions}>
                                            {isLoaded ? (
                                                <Text style={styles.activeBadge}>Aktiv</Text>
                                            ) : isDownloaded ? (
                                                <View style={styles.actionRow}>
                                                    <TouchableOpacity
                                                        style={styles.loadBtn}
                                                        onPress={() => handleLoadModel(id)}
                                                        disabled={isLoadingModel}
                                                    >
                                                        {isLoadingModel ? (
                                                            <ActivityIndicator size="small" color="#6366f1" />
                                                        ) : (
                                                            <Text style={styles.loadBtnText}>Laden</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={styles.deleteBtn}
                                                        onPress={() => handleDeleteModel(id)}
                                                    >
                                                        <Text style={styles.deleteBtnText}>🗑</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ) : isDownloadingThis ? (
                                                <View style={styles.miniProgress}>
                                                    <View style={[styles.miniProgressBar, { width: `${downloadProgress * 100}%` }]} />
                                                    <Text style={styles.miniProgressText}>{Math.round(downloadProgress * 100)}%</Text>
                                                </View>
                                            ) : (
                                                <TouchableOpacity
                                                    style={styles.downloadBtn}
                                                    onPress={() => handleDownloadModel(id)}
                                                    disabled={isDownloading}
                                                >
                                                    <Text style={styles.downloadBtnText}>↓</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            );
                        })}

                        {/* Voices grouped by language */}
                        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Stimmen</Text>
                        {Object.keys(groupedVoices).sort().map(lang => (
                            <View key={lang} style={styles.langSection}>
                                <Text style={styles.langHeader}>{lang.toUpperCase()}</Text>
                                {groupedVoices[lang].map(id => {
                                    const voice = (VOICES as any)[id];
                                    const isDownloaded = downloadedVoices.has(id);
                                    const isSelected = id === selectedVoiceId;
                                    const isDownloadingThis = downloadingItem === id;

                                    return (
                                        <TouchableOpacity
                                            key={id}
                                            style={[styles.itemCard, isSelected && styles.itemCardActive]}
                                            onPress={() => { if (isDownloaded) onVoiceChange(id); }}
                                            disabled={!isDownloaded}
                                        >
                                            <View style={styles.itemRow}>
                                                <View style={styles.itemInfo}>
                                                    <Text style={styles.itemName}>
                                                        {voice.name} {voice.traits || ''} {isSelected ? '✓' : ''}
                                                    </Text>
                                                    <Text style={styles.itemMeta}>{voice.gender}</Text>
                                                </View>
                                                {!isDownloaded && (
                                                    <View style={styles.itemActions}>
                                                        {isDownloadingThis ? (
                                                            <ActivityIndicator size="small" color="#6366f1" />
                                                        ) : (
                                                            <TouchableOpacity
                                                                style={styles.downloadBtn}
                                                                onPress={() => handleDownloadVoice(id)}
                                                                disabled={isDownloading}
                                                            >
                                                                <Text style={styles.downloadBtnText}>↓</Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ))}

                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modal: {
        backgroundColor: '#1c1c1e',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: height * 0.85,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2c2c2e',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#ffffff',
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#2c2c2e',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeBtnText: {
        color: '#8e8e93',
        fontSize: 16,
        fontWeight: '600',
    },
    body: {
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#8e8e93',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginBottom: 12,
    },
    languageRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 24,
    },
    langChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: '#2c2c2e',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    langChipActive: {
        backgroundColor: '#1e1b4b',
        borderColor: '#6366f1',
    },
    langIcon: {
        fontSize: 18,
        marginRight: 8,
    },
    langLabel: {
        color: '#8e8e93',
        fontSize: 14,
        fontWeight: '600',
    },
    langLabelActive: {
        color: '#fff',
    },
    speedRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 24,
    },
    speedChip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: '#2c2c2e',
    },
    speedChipActive: {
        backgroundColor: '#6366f1',
    },
    speedChipText: {
        color: '#8e8e93',
        fontSize: 15,
        fontWeight: '600',
    },
    speedChipTextActive: {
        color: '#ffffff',
    },
    itemCard: {
        backgroundColor: '#2c2c2e',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    itemCardActive: {
        borderColor: '#6366f1',
        backgroundColor: '#1e1b4b',
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    itemInfo: {
        flex: 1,
        marginRight: 12,
    },
    itemName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    itemMeta: {
        fontSize: 13,
        color: '#636366',
        marginTop: 2,
    },
    itemActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    activeBadge: {
        fontSize: 13,
        color: '#34d399',
        fontWeight: '600',
        backgroundColor: '#064e3b',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        overflow: 'hidden',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    loadBtn: {
        backgroundColor: '#312e81',
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 8,
    },
    loadBtnText: {
        color: '#a5b4fc',
        fontSize: 13,
        fontWeight: '600',
    },
    deleteBtn: {
        padding: 6,
    },
    deleteBtnText: {
        fontSize: 16,
    },
    downloadBtn: {
        backgroundColor: '#312e81',
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    downloadBtnText: {
        color: '#a5b4fc',
        fontSize: 18,
        fontWeight: '600',
    },
    miniProgress: {
        width: 60,
        height: 24,
        backgroundColor: '#0a0a0f',
        borderRadius: 6,
        overflow: 'hidden',
        justifyContent: 'center',
    },
    miniProgressBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: '#6366f1',
        borderRadius: 6,
    },
    miniProgressText: {
        textAlign: 'center',
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
    },
    langSection: {
        marginBottom: 16,
    },
    langHeader: {
        fontSize: 12,
        fontWeight: '800',
        color: '#6366f1',
        marginBottom: 8,
        paddingLeft: 4,
    },
});
