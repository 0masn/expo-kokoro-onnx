import { useState, useCallback, useRef } from 'react';

interface OCRResult {
    resultText: string;
    blocks?: any[];
}

export function useOCR() {
    const [lastText, setLastText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const lastProcessedRef = useRef<string>('');
    const onNewTextRef = useRef<((text: string) => void) | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingTextRef = useRef<string>('');

    // Calculate word-level Jaccard similarity
    const similarity = (a: string, b: string): number => {
        if (!a || !b) return 0;
        const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        if (wordsA.size === 0 || wordsB.size === 0) return 0;

        let intersection = 0;
        wordsA.forEach(w => { if (wordsB.has(w)) intersection++; });
        const union = new Set([...wordsA, ...wordsB]).size;
        return intersection / union;
    };

    // Split text into speakable chunks, handling German punctuation
    const extractSentences = (text: string): string[] => {
        return text
            .split(/[.!?;:\n]+/)
            .map(s => s.trim())
            // German text often has commas in long sentences - keep longer segments
            .filter(s => s.length > 8)
            // Rejoin short orphaned fragments
            .reduce<string[]>((acc, s) => {
                if (acc.length > 0 && s.length < 15 && acc[acc.length - 1].length < 80) {
                    acc[acc.length - 1] += ', ' + s;
                } else {
                    acc.push(s);
                }
                return acc;
            }, []);
    };

    const fireNewText = useCallback((text: string) => {
        lastProcessedRef.current = text;
        setLastText(text);
        if (onNewTextRef.current) {
            onNewTextRef.current(text);
        }
    }, []);

    const processOCRResult = useCallback((result: OCRResult) => {
        if (!result?.resultText || result.resultText.trim().length < 5) return;

        const newText = result.resultText.trim();

        // Skip if very similar to already-processed text
        if (similarity(newText, lastProcessedRef.current) > 0.75) return;

        // Accumulate pending text and debounce to wait for stable read
        pendingTextRef.current = newText;

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            const stableText = pendingTextRef.current;
            if (!stableText || stableText.length < 5) return;

            // Skip if still too similar
            if (similarity(stableText, lastProcessedRef.current) > 0.75) return;

            const sentences = extractSentences(stableText);
            if (sentences.length === 0) return;

            // Find genuinely new sentences
            const newSentences = sentences.filter(
                s => similarity(s, lastProcessedRef.current) < 0.45
            );

            if (newSentences.length > 0) {
                fireNewText(newSentences.join('. '));
            }
        }, 400); // 400ms debounce - wait for stable OCR frame

    }, [fireNewText]);

    const setOnNewText = useCallback((callback: (text: string) => void) => {
        onNewTextRef.current = callback;
    }, []);

    const reset = useCallback(() => {
        lastProcessedRef.current = '';
        pendingTextRef.current = '';
        setLastText('');
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
    }, []);

    return {
        lastText,
        isProcessing,
        processOCRResult,
        setOnNewText,
        reset,
    };
}
