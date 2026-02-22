import * as FileSystem from 'expo-file-system';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { VOICES, getVoiceData } from './voices';
import { Platform, NativeModules } from 'react-native';

// Lazy type imports (removed for absolute safety in Expo Go)
// import type { InferenceSession as InferenceSessionType, Tensor as TensorType } from 'onnxruntime-react-native';

let InferenceSession: any = null;
let Tensor: any = null;

// Constants
const SAMPLE_RATE = 24000;
const STYLE_DIM = 256;

// Voice data URL
const VOICE_DATA_URL = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices";

// Complete vocabulary from Python code
const VOCAB: Record<string, number> = (() => {
  const _pad = "$";
  const _punctuation = ';:,.!?¡¿—…"«»"" ';
  const _letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const _letters_ipa = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";

  const symbols = [_pad, ..._punctuation.split(''), ..._letters.split(''), ..._letters_ipa.split('')];
  const dicts: Record<string, number> = {};

  for (let i = 0; i < symbols.length; i++) {
    dicts[symbols[i]] = i;
  }

  return dicts;
})();

// Common English phoneme mappings for basic phonemization
const ENGLISH_PHONEME_MAP: Record<string, string> = {
  'a': 'ə',
  'e': 'ɛ',
  'i': 'ɪ',
  'o': 'oʊ',
  'u': 'ʌ',
  'th': 'θ',
  'sh': 'ʃ',
  'ch': 'tʃ',
  'ng': 'ŋ',
  'j': 'dʒ',
  'r': 'ɹ',
  'er': 'ɝ',
  'ar': 'ɑɹ',
  'or': 'ɔɹ',
  'ir': 'ɪɹ',
  'ur': 'ʊɹ',
};

// Common word to phoneme mappings
const COMMON_WORD_PHONEMES: Record<string, string> = {
  'hello': 'hɛˈloʊ',
  'world': 'wˈɝld',
  'this': 'ðˈɪs',
  'is': 'ˈɪz',
  'a': 'ə',
  'test': 'tˈɛst',
  'of': 'ʌv',
  'the': 'ðə',
  'kokoro': 'kˈoʊkəɹoʊ',
  'text': 'tˈɛkst',
  'to': 'tˈuː',
  'speech': 'spˈiːtʃ',
  'system': 'sˈɪstəm',
  'running': 'ɹˈʌnɪŋ',
  'on': 'ˈɑːn',
  'expo': 'ˈɛkspoʊ',
  'with': 'wˈɪð',
  'onnx': 'ˈɑːnɛks',
  'runtime': 'ɹˈʌntaɪm',
};

export interface StreamProgress {
  progress: number;
  tokensPerSecond: number;
  timeToFirstToken: number;
  position: number;
  duration: number;
  phonemes: string;
}

class KokoroOnnx {
  private session: any = null;
  public isModelLoaded: boolean = false;
  private isOnnxAvailable: boolean = true;
  private currentModelId: string | null = null;
  private isStreaming: boolean = false;
  private streamingSound: Audio.Sound | null = null;
  private tokensPerSecond: number = 0;
  private timeToFirstToken: number = 0;
  private streamingPhonemes: string = "";

  constructor() {
    this.checkOnnxAvailability();
  }

  private tryLoadOnnx(): boolean {
    if (this.session || (InferenceSession && Tensor)) return true;

    try {
      // CRITICAL: In Expo Go or mismatched SDKs, NativeModules.Onnxruntime might exist
      // but lack the .install() method, which the package calls at top-level.
      // We must check for both the module and the method presence before requiring.
      const OnnxModule = NativeModules?.Onnxruntime;
      if (Platform.OS !== 'web' && (!OnnxModule || typeof OnnxModule.install !== 'function')) {
        console.warn('Onnxruntime Native Module not found or missing .install() method');
        return false;
      }

      const ort = require('onnxruntime-react-native');
      if (!ort) return false;
      InferenceSession = ort.InferenceSession;
      Tensor = ort.Tensor;
      return !!InferenceSession && !!Tensor;
    } catch (e) {
      console.warn('ONNX Runtime native module failure:', e);
      return false;
    }
  }

  /**
   * Check if ONNX runtime is available on this platform
   */
  checkOnnxAvailability(): boolean {
    try {
      if (!this.tryLoadOnnx()) {
        this.isOnnxAvailable = false;
        return false;
      }

      if (typeof InferenceSession === 'undefined' || typeof InferenceSession.create !== 'function') {
        console.error('ONNX Runtime is not properly initialized');
        this.isOnnxAvailable = false;
        return false;
      }

      const OnnxModule = NativeModules.Onnxruntime;
      if (!OnnxModule && Platform.OS !== 'web') {
        console.error('Onnxruntime Native Module is missing');
        this.isOnnxAvailable = false;
        return false;
      }

      if (Platform.OS === 'web') {
        console.warn('ONNX Runtime may not be fully supported on web platform');
      }

      this.isOnnxAvailable = true;
      return true;
    } catch (error) {
      console.error('Error checking ONNX availability:', error);
      this.isOnnxAvailable = false;
      return false;
    }
  }

  /**
   * Load a specific ONNX model
   */
  async loadModel(modelId: string = 'model_q8f16.onnx'): Promise<boolean> {
    try {
      if (!this.checkOnnxAvailability()) return false;

      const modelPath = FileSystem.cacheDirectory + modelId;
      const fileInfo = await FileSystem.getInfoAsync(modelPath);
      if (!fileInfo.exists) {
        console.error('Model file not found at', modelPath);
        return false;
      }

      const options: any = {
        executionProviders: ['cpuexecutionprovider'],
      };

      try {
        this.session = await InferenceSession.create(modelPath, options);
      } catch (optionsError) {
        console.warn('Failed to create session with options, trying without options:', optionsError);
        this.session = await InferenceSession.create(modelPath);
      }

      if (!this.session) return false;

      this.isModelLoaded = true;
      this.currentModelId = modelId;
      return true;
    } catch (error) {
      console.error('Error loading model:', error);
      return false;
    }
  }

  getCurrentModelId(): string | null {
    return this.currentModelId;
  }

  getTokensPerSecond(): number {
    return this.tokensPerSecond;
  }

  getTimeToFirstToken(): number {
    return this.timeToFirstToken;
  }

  isAudioStreaming(): boolean {
    return this.isStreaming;
  }

  getStreamingPhonemes(): string {
    return this.streamingPhonemes;
  }

  async stopStreaming(): Promise<void> {
    if (this.streamingSound) {
      try {
        await this.streamingSound.stopAsync();
        await this.streamingSound.unloadAsync();
      } catch (error) {
        console.error('Error stopping streaming audio:', error);
      }
      this.streamingSound = null;
    }
    this.isStreaming = false;
    this.tokensPerSecond = 0;
    this.timeToFirstToken = 0;
    this.streamingPhonemes = "";
  }

  async downloadVoice(voiceId: string): Promise<boolean> {
    try {
      const voiceDirPath = `${FileSystem.documentDirectory}voices`;
      const dirInfo = await FileSystem.getInfoAsync(voiceDirPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(voiceDirPath, { intermediates: true });
      }

      const voiceFilePath = `${voiceDirPath}/${voiceId}.bin`;
      const fileInfo = await FileSystem.getInfoAsync(voiceFilePath);
      if (fileInfo.exists) return true;

      const voiceUrl = `${VOICE_DATA_URL}/${voiceId}.bin`;
      const downloadResult = await FileSystem.downloadAsync(voiceUrl, voiceFilePath);
      return downloadResult.status === 200;
    } catch (error) {
      console.error(`Error downloading voice ${voiceId}:`, error);
      return false;
    }
  }

  normalizeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/…/g, '...');
  }

  phonemize(text: string): string {
    text = this.normalizeText(text);
    const words = text.split(/\s+/);

    const phonemizedWords = words.map(word => {
      const lowerWord = word.toLowerCase().replace(/[.,!?;:'"]/g, '');
      if (COMMON_WORD_PHONEMES[lowerWord]) return COMMON_WORD_PHONEMES[lowerWord];

      let phonemes = '';
      let i = 0;
      while (i < word.length) {
        if (i < word.length - 1) {
          const digraph = word.substring(i, i + 2).toLowerCase();
          if (ENGLISH_PHONEME_MAP[digraph]) {
            phonemes += ENGLISH_PHONEME_MAP[digraph];
            i += 2;
            continue;
          }
        }

        const char = word[i].toLowerCase();
        if (ENGLISH_PHONEME_MAP[char]) {
          phonemes += ENGLISH_PHONEME_MAP[char];
        } else if (/[a-z]/.test(char)) {
          phonemes += char;
        } else if (/[.,!?;:'"]/g.test(char)) {
          phonemes += char;
        }
        i++;
      }

      if (phonemes.length > 2 && !/[.,!?;:'"]/g.test(phonemes)) {
        const firstVowelMatch = phonemes.match(/[ɑɐɒæəɘɚɛɜɝɞɨɪʊʌɔoeiuaɑː]/);
        if (firstVowelMatch && firstVowelMatch.index !== undefined) {
          const vowelIndex = firstVowelMatch.index;
          phonemes = phonemes.substring(0, vowelIndex) + 'ˈ' + phonemes.substring(vowelIndex);
        }
      }
      return phonemes;
    });

    return phonemizedWords.join(' ');
  }

  tokenize(phonemes: string): number[] {
    if (!/[ɑɐɒæəɘɚɛɜɝɞɨɪʊʌɔˈˌː]/.test(phonemes)) {
      phonemes = this.phonemize(phonemes);
    }

    this.streamingPhonemes = phonemes;
    const tokens = [0];
    for (const char of phonemes) {
      if (VOCAB[char] !== undefined) {
        tokens.push(VOCAB[char]);
      }
    }
    tokens.push(0);
    return tokens;
  }

  async streamAudio(text: string, voiceId: string = 'af_heart', speed: number = 1.0, onProgress: ((p: StreamProgress) => void) | null = null): Promise<any> {
    if (this.isStreaming) await this.stopStreaming();
    if (!this.isOnnxAvailable || !this.isModelLoaded || !this.session) {
      throw new Error('Model or ONNX runtime not available');
    }

    try {
      this.isStreaming = true;
      await this.downloadVoice(voiceId);

      const tokens = this.tokenize(text);
      const numTokens = Math.min(Math.max(tokens.length - 2, 0), 509);

      const voiceData = await getVoiceData(voiceId);
      const offset = numTokens * STYLE_DIM;
      const styleData = voiceData.slice(offset, offset + STYLE_DIM);

      const inputs: Record<string, any> = {};
      inputs['input_ids'] = new Tensor('int64', new BigInt64Array(tokens.map(t => BigInt(t))), [1, tokens.length]);
      inputs['style'] = new Tensor('float32', new Float32Array(styleData), [1, STYLE_DIM]);
      inputs['speed'] = new Tensor('float32', new Float32Array([speed]), [1]);

      const inferenceStartTime = Date.now();
      const outputs = await this.session.run(inputs);
      this.timeToFirstToken = Date.now() - inferenceStartTime;
      this.tokensPerSecond = numTokens / (this.timeToFirstToken / 1000);

      const waveform = outputs['waveform'].data as Float32Array;
      const audioUri = await this._floatArrayToAudioFile(waveform);

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true },
        (status) => {
          if (onProgress && status.isLoaded && status.durationMillis) {
            onProgress({
              progress: status.positionMillis / status.durationMillis,
              tokensPerSecond: this.tokensPerSecond,
              timeToFirstToken: this.timeToFirstToken,
              position: status.positionMillis,
              duration: status.durationMillis,
              phonemes: this.streamingPhonemes
            });
          }
          if (status.isLoaded && status.didJustFinish) {
            this.isStreaming = false;
            this.streamingSound = null;
          }
        }
      );

      this.streamingSound = sound;
      return {
        tokensPerSecond: this.tokensPerSecond,
        timeToFirstToken: this.timeToFirstToken,
        totalTokens: numTokens
      };
    } catch (error) {
      this.isStreaming = false;
      console.error('Error streaming audio:', error);
      throw error;
    }
  }

  async _floatArrayToAudioFile(floatArray: Float32Array): Promise<string> {
    const wavBuffer = this._floatArrayToWav(floatArray, SAMPLE_RATE);
    const base64Data = this._arrayBufferToBase64(wavBuffer);
    const tempFilePath = `${FileSystem.cacheDirectory}temp_audio_${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(tempFilePath, base64Data, { encoding: FileSystem.EncodingType.Base64 });
    return tempFilePath;
  }

  _arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  _floatArrayToWav(floatArray: Float32Array, sampleRate: number): ArrayBuffer {
    const numSamples = floatArray.length;
    const int16Array = new Int16Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      int16Array[i] = Math.max(-32768, Math.min(32767, Math.floor(floatArray[i] * 32767)));
    }
    const headerLength = 44;
    const dataLength = int16Array.length * 2;
    const buffer = new ArrayBuffer(headerLength + dataLength);
    const view = new DataView(buffer);
    view.setUint8(0, 'R'.charCodeAt(0)); view.setUint8(1, 'I'.charCodeAt(0)); view.setUint8(2, 'F'.charCodeAt(0)); view.setUint8(3, 'F'.charCodeAt(0));
    view.setUint32(4, 36 + dataLength, true);
    view.setUint8(8, 'W'.charCodeAt(0)); view.setUint8(9, 'A'.charCodeAt(0)); view.setUint8(10, 'V'.charCodeAt(0)); view.setUint8(11, 'E'.charCodeAt(0));
    view.setUint8(12, 'f'.charCodeAt(0)); view.setUint8(13, 'm'.charCodeAt(0)); view.setUint8(14, 't'.charCodeAt(0)); view.setUint8(15, ' '.charCodeAt(0));
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint8(36, 'd'.charCodeAt(0)); view.setUint8(37, 'a'.charCodeAt(0)); view.setUint8(38, 't'.charCodeAt(0)); view.setUint8(39, 'a'.charCodeAt(0));
    view.setUint32(40, dataLength, true);
    for (let i = 0; i < numSamples; i++) view.setInt16(headerLength + i * 2, int16Array[i], true);
    return buffer;
  }
}

// Singleton pattern to avoid instantiation at top-level
let instance: KokoroOnnx | null = null;

const getKokoroInstance = () => {
  if (!instance) {
    instance = new KokoroOnnx();
  }
  return instance;
};

// Export a proxy or the getter to keep API compatibility with App.tsx
export default new Proxy({}, {
  get: (target, prop) => {
    const kokoro = getKokoroInstance();
    const value = (kokoro as any)[prop];
    return typeof value === 'function' ? value.bind(kokoro) : value;
  }
}) as KokoroOnnx;