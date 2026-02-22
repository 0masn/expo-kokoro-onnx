import { useState, useCallback, useRef } from 'react';
import KokoroOnnx from '../../kokoro/kokoroOnnx';

export function useTTSQueue(voiceId: string, speed: number) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentText, setCurrentText] = useState('');
    const queueRef = useRef<string[]>([]);
    const isProcessingRef = useRef(false);
    const isPausedRef = useRef(false);
    const voiceIdRef = useRef(voiceId);
    const speedRef = useRef(speed);

    // Keep refs in sync
    voiceIdRef.current = voiceId;
    speedRef.current = speed;

    const processQueue = useCallback(async () => {
        if (isProcessingRef.current || isPausedRef.current) return;
        if (queueRef.current.length === 0) {
            setIsPlaying(false);
            setCurrentText('');
            return;
        }

        isProcessingRef.current = true;
        setIsPlaying(true);

        const text = queueRef.current.shift()!;
        setCurrentText(text);

        try {
            // Split long text into chunks of ~200 chars at sentence boundaries
            const chunks = splitTextIntoChunks(text, 200);

            for (const chunk of chunks) {
                if (isPausedRef.current) break;

                await KokoroOnnx.streamAudio(
                    chunk,
                    voiceIdRef.current,
                    speedRef.current,
                    null
                );

                // Wait for audio to finish playing
                await waitForAudioComplete();
            }
        } catch (err) {
            console.error('TTS queue error:', err);
        } finally {
            isProcessingRef.current = false;
            // Process next item
            if (!isPausedRef.current) {
                processQueue();
            }
        }
    }, []);

    const enqueue = useCallback((text: string) => {
        if (!text || text.trim().length < 3) return;

        // Limit queue size to prevent memory issues
        if (queueRef.current.length > 5) {
            queueRef.current = queueRef.current.slice(-3);
        }

        queueRef.current.push(text.trim());

        if (!isProcessingRef.current && !isPausedRef.current) {
            processQueue();
        }
    }, [processQueue]);

    const pause = useCallback(async () => {
        isPausedRef.current = true;
        setIsPlaying(false);
        try {
            await KokoroOnnx.stopStreaming();
        } catch (err) {
            console.error('Error pausing TTS:', err);
        }
    }, []);

    const resume = useCallback(() => {
        isPausedRef.current = false;
        if (queueRef.current.length > 0 || isProcessingRef.current) {
            processQueue();
        }
    }, [processQueue]);

    const stop = useCallback(async () => {
        isPausedRef.current = true;
        queueRef.current = [];
        isProcessingRef.current = false;
        setIsPlaying(false);
        setCurrentText('');
        try {
            await KokoroOnnx.stopStreaming();
        } catch (err) {
            console.error('Error stopping TTS:', err);
        }
    }, []);

    const clear = useCallback(() => {
        queueRef.current = [];
    }, []);

    return {
        isPlaying,
        currentText,
        enqueue,
        pause,
        resume,
        stop,
        clear,
        queueLength: queueRef.current.length,
    };
}

function splitTextIntoChunks(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        // Find a good break point
        let breakAt = remaining.lastIndexOf('. ', maxLen);
        if (breakAt < maxLen * 0.3) breakAt = remaining.lastIndexOf(', ', maxLen);
        if (breakAt < maxLen * 0.3) breakAt = remaining.lastIndexOf(' ', maxLen);
        if (breakAt < maxLen * 0.3) breakAt = maxLen;

        chunks.push(remaining.substring(0, breakAt + 1).trim());
        remaining = remaining.substring(breakAt + 1).trim();
    }

    return chunks;
}

function waitForAudioComplete(): Promise<void> {
    return new Promise((resolve) => {
        const check = () => {
            if (!KokoroOnnx.isAudioStreaming()) {
                resolve();
            } else {
                setTimeout(check, 200);
            }
        };
        // Small initial delay to let streaming start
        setTimeout(check, 500);
    });
}
