/**
 * TTSPlayer handles text-to-speech audio playback on the frontend.
 *
 * It listens for AudioQueued / AudioReady events from the WebSocket stream
 * and plays the synthesized interviewer voice.
 *
 * Flow:
 *  1. Backend publishes QuestionAsked
 *  2. TTS worker picks it up, publishes AudioQueued (generation started)
 *  3. TTS worker finishes, publishes AudioReady with base64 WAV audio
 *  4. TTSPlayer decodes the base64 and plays it via Web Audio API
 */

import { type BackendEvent } from "./backend";

export type TTSState = "idle" | "generating" | "playing" | "error";

export type TTSCallbacks = {
  onStateChange: (state: TTSState) => void;
  onPlaying?: () => void;
  onFinished?: () => void;
  onError?: (error: string) => void;
};

export class TTSPlayer {
  private audioContext: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private state: TTSState = "idle";
  private callbacks: TTSCallbacks;
  private currentQuestionNumber = 0;

  constructor(callbacks: TTSCallbacks) {
    this.callbacks = callbacks;
  }

  get currentState(): TTSState {
    return this.state;
  }

  private setState(newState: TTSState) {
    this.state = newState;
    this.callbacks.onStateChange(newState);
  }

  /**
   * Process an incoming event from the WebSocket stream.
   * Call this from your event handler for each event received.
   */
  handleEvent(event: BackendEvent): void {
    switch (event.type) {
      case "AudioQueued": {
        const status = event.payload?.status as string;
        if (status === "generating") {
          this.currentQuestionNumber = (event.payload?.question_number as number) ?? 0;
          this.setState("generating");
        }
        break;
      }

      case "AudioReady": {
        const audioUrl = event.payload?.audio_url as string;
        if (!audioUrl) {
          this.callbacks.onError?.("AudioReady event missing audio_url payload");
          this.setState("error");
          return;
        }
        void this.playAudioFromURL(audioUrl);
        break;
      }
    }
  }

  /**
   * Fetch and play a WAV audio buffer from a URL.
   */
  private async playAudioFromURL(url: string): Promise<void> {
    try {
      // Create AudioContext if needed
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Fetch the audio file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();

      // Decode the WAV audio data
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Stop any currently playing audio
      this.stop();

      // Create and play the source
      this.source = this.audioContext.createBufferSource();
      this.source.buffer = audioBuffer;
      this.source.connect(this.audioContext.destination);

      this.source.onended = () => {
        this.source = null;
        this.setState("idle");
        this.callbacks.onFinished?.();
      };

      this.source.start(0);
      this.setState("playing");
      this.callbacks.onPlaying?.();
    } catch (err) {
      this.setState("error");
      this.callbacks.onError?.(err instanceof Error ? err.message : "Failed to play TTS audio");
    }
  }

  /**
   * Stop any currently playing audio.
   */
  stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // Already stopped
      }
      this.source = null;
    }
    this.setState("idle");
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}