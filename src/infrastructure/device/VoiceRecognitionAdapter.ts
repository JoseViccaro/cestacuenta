import { Haptics } from './Haptics.js';

export type VoiceRecognitionState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

export type VoiceRecognitionErrorType =
  | 'not-allowed'
  | 'network'
  | 'no-speech'
  | 'audio-capture'
  | 'not-supported'
  | 'aborted'
  | 'unknown';

export interface VoiceRecognitionError {
  type: VoiceRecognitionErrorType;
  message: string;
  originalError?: unknown;
}

export interface VoiceRecognitionCallbacks {
  onStateChange: (state: VoiceRecognitionState) => void;
  onInterimResult: (transcript: string) => void;
  onFinalResult: (transcript: string) => void;
  onError: (error: VoiceRecognitionError) => void;
}

export interface IVoiceRecognitionAdapter {
  isSupported(): boolean;
  getState(): VoiceRecognitionState;
  start(callbacks: VoiceRecognitionCallbacks): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => any;

function getSpeechRecognitionClass(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export class VoiceRecognitionAdapter implements IVoiceRecognitionAdapter {
  private state: VoiceRecognitionState = 'idle';
  private recognitionInstance: any = null;
  private callbacks: VoiceRecognitionCallbacks | null = null;

  public isSupported(): boolean {
    return getSpeechRecognitionClass() !== null;
  }

  public getState(): VoiceRecognitionState {
    return this.state;
  }

  public start(callbacks: VoiceRecognitionCallbacks): void {
    const RecognitionClass = getSpeechRecognitionClass();

    if (!RecognitionClass) {
      callbacks.onError({
        type: 'not-supported',
        message: 'El navegador no soporta reconocimiento de voz.',
      });
      return;
    }

    if (this.recognitionInstance) {
      this.abort();
    }

    this.callbacks = callbacks;
    this.setState('starting');

    try {
      const recognition = new RecognitionClass();
      recognition.lang = 'es-ES';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        this.setState('listening');
        Haptics.triggerVoiceCue('start');
      };

      recognition.onresult = (event: any) => {
        if (!event.results) return;
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const transcript = item[0]?.transcript || '';
          if (item.isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (interim && this.callbacks) {
          this.callbacks.onInterimResult(interim.trim());
        }
        if (final && this.callbacks) {
          this.callbacks.onFinalResult(final.trim());
        }
      };

      recognition.onerror = (event: any) => {
        const errorString = event.error || '';
        let mappedType: VoiceRecognitionErrorType = 'unknown';
        let message = 'Error desconocido en el reconocimiento de voz.';

        if (errorString === 'not-allowed' || errorString === 'service-not-allowed') {
          mappedType = 'not-allowed';
          message = 'Permiso denegado para el micrófono. Por favor habilítalo en los ajustes del navegador.';
        } else if (errorString === 'network') {
          mappedType = 'network';
          message = 'Error de conexión: El dictado por voz requiere conexión a internet.';
        } else if (errorString === 'no-speech') {
          mappedType = 'no-speech';
          message = 'No se detectó voz.';
        } else if (errorString === 'audio-capture') {
          mappedType = 'audio-capture';
          message = 'No se pudo capturar audio del micrófono.';
        } else if (errorString === 'aborted') {
          mappedType = 'aborted';
          message = 'Dictado cancelado.';
        }

        if (mappedType === 'no-speech' || mappedType === 'aborted') {
          this.setState('idle');
          return;
        }

        this.setState('idle');
        if (this.callbacks) {
          this.callbacks.onError({
            type: mappedType,
            message,
            originalError: event,
          });
        }
      };

      recognition.onend = () => {
        if (this.state !== 'idle') {
          this.setState('idle');
          Haptics.triggerVoiceCue('stop');
        }
      };

      recognition.start();
      this.recognitionInstance = recognition;
    } catch (err) {
      this.setState('idle');
      callbacks.onError({
        type: 'unknown',
        message: 'No se pudo iniciar el reconocimiento de voz.',
        originalError: err,
      });
    }
  }

  public stop(): void {
    if (this.recognitionInstance && (this.state === 'listening' || this.state === 'starting')) {
      this.setState('stopping');
      try {
        this.recognitionInstance.stop();
      } catch {
        this.setState('idle');
      }
    }
  }

  public abort(): void {
    if (this.recognitionInstance) {
      try {
        this.recognitionInstance.abort();
      } catch {
        // ignore abort errors
      }
      this.recognitionInstance = null;
    }
    this.setState('idle');
  }

  private setState(state: VoiceRecognitionState): void {
    this.state = state;
    if (this.callbacks) {
      this.callbacks.onStateChange(state);
    }
  }
}

export { VoiceRecognitionAdapter as WebSpeechRecognitionAdapter };
