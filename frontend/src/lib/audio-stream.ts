/**
 * AudioStream manages a WebSocket connection to the backend's
 * /interview/:id/audio endpoint. It:
 *
 * 1. Captures microphone input via the MediaStream Recording API
 * 2. Streams raw PCM audio chunks (16-bit mono 16kHz) over the WebSocket
 * 3. Receives interim TranscriptChunk events for near-real-time feedback
 * 4. Detects silence client-side and sends force_complete when appropriate
 * 5. Receives TranscriptCompleted confirmation from the backend
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

const WS_BASE =
  import.meta.env.VITE_WS_BASE_URL ??
  (API_BASE ?? "http://localhost:8080").replace(/^http/, "ws");

export type AudioStreamEvent =
  | { type: "AudioConnected"; message: string }
  | { type: "TranscriptChunk"; text: string; final: boolean; offset: number }
  | { type: "TranscriptCompleted"; text: string; length: number }
  | { type: "AudioError"; error: string };

export type AudioStreamCallbacks = {
  onEvent: (event: AudioStreamEvent) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: AudioStreamState) => void;
};

export type AudioStreamState =
  | "idle"
  | "connecting"
  | "connected"
  | "recording"
  | "processing"
  | "disconnected"
  | "error";

export class AudioStream {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private interviewId: string;
  private callbacks: AudioStreamCallbacks;
  private state: AudioStreamState = "idle";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAudioLevel = 0;
  private silenceThreshold = 0.02; // RMS threshold for silence detection
  private silenceDurationMs = 0;
  private silenceTimeoutMs = 3000; // 3s of silence = utterance complete
  private readonly CHUNK_INTERVAL_MS = 1000; // send chunks every 1s
  private chunkInterval: ReturnType<typeof setInterval> | null = null;
  private analyserNode: AnalyserNode | null = null;

  constructor(interviewId: string, callbacks: AudioStreamCallbacks) {
    this.interviewId = interviewId;
    this.callbacks = callbacks;
  }

  get currentState(): AudioStreamState {
    return this.state;
  }

  private setState(newState: AudioStreamState) {
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }

  /**
   * Start the audio stream: connect WebSocket, request mic, begin recording.
   */
  async start(): Promise<void> {
    if (this.state !== "idle" && this.state !== "disconnected") {
      throw new Error(`Cannot start from state: ${this.state}`);
    }

    this.setState("connecting");
    this.reconnectAttempts = 0;

    try {
      await this.connectWebSocket();
      await this.startMicrophone();
      this.setState("recording");
    } catch (err) {
      this.setState("error");
      throw err;
    }
  }

  /**
   * Stop the audio stream gracefully.
   */
  stop(): void {
    this.stopMicrophone();
    this.closeWebSocket();
    this.setState("disconnected");
  }

  /**
   * Manually signal that the user has finished speaking.
   * This sends a force_complete control message to the backend.
   */
  forceComplete(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "force_complete" }));
      this.setState("processing");
    }
  }

  /**
   * Adjust the silence detection threshold.
   * Lower values = more sensitive (detects silence sooner).
   * @param threshold RMS value between 0 and 1 (default 0.02)
   */
  setSilenceThreshold(threshold: number): void {
    this.silenceThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Adjust the silence timeout duration.
   * @param ms milliseconds of silence before auto-completing (default 3000)
   */
  setSilenceTimeout(ms: number): void {
    this.silenceTimeoutMs = ms;
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${WS_BASE}/interview/${encodeURIComponent(this.interviewId)}/audio`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.setState("connected");
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as AudioStreamEvent;
          this.callbacks.onEvent(data);

          // If we get a TranscriptCompleted, we can start recording again
          if (data.type === "TranscriptCompleted") {
            this.setState("recording");
          }
        } catch {
          // Binary data (audio echo from server) — ignore
        }
      };

      this.ws.onerror = () => {
        this.callbacks.onError?.(new Error("WebSocket error"));
      };

      this.ws.onclose = () => {
        if (this.state === "connecting") {
          reject(new Error("WebSocket connection failed"));
        }
        this.handleDisconnect();
      };

      // Timeout if connection takes too long
      setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          this.ws?.close();
          reject(new Error("WebSocket connection timeout"));
        }
      }, 5000);
    });
  }

  private async startMicrophone(): Promise<void> {
    // Request microphone access
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Set up audio context for silence detection
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    source.connect(this.analyserNode);

    // Use MediaRecorder to capture raw PCM chunks
    // We use audio/webm; codecs=opus and then decode to PCM on the backend,
    // OR we can use the AudioContext to get raw PCM directly.
    // For simplicity, we use MediaRecorder with opus and let the backend
    // handle decoding. But the backend expects raw PCM 16-bit mono 16kHz.
    //
    // To get raw PCM, we use AudioWorklet or ScriptProcessorNode.
    // ScriptProcessorNode is deprecated but widely supported.
    this.startPCMCapture();

    // Start the silence detection loop
    this.startSilenceDetection();
  }

  private startPCMCapture(): void {
    if (!this.audioContext || !this.stream) return;

    // Use ScriptProcessorNode to get raw PCM data
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    const source = this.audioContext.createMediaStreamSource(this.stream);
    source.connect(processor);
    processor.connect(this.audioContext.destination);

    processor.onaudioprocess = (event) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;

      const inputData = event.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        // Clamp to [-1, 1] and convert to Int16
        const sample = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      }

      // Send as binary WebSocket frame
      this.ws?.send(pcmData.buffer);

      // Calculate RMS for silence detection
      let sumSquares = 0;
      for (let i = 0; i < inputData.length; i++) {
        sumSquares += inputData[i] * inputData[i];
      }
      this.lastAudioLevel = Math.sqrt(sumSquares / inputData.length);
    };
  }

  private startSilenceDetection(): void {
    // Check audio levels every 200ms
    this.chunkInterval = setInterval(() => {
      if (this.lastAudioLevel < this.silenceThreshold) {
        this.silenceDurationMs += 200;
      } else {
        this.silenceDurationMs = 0;
      }

      // If silence exceeds threshold, auto-complete
      if (this.silenceDurationMs >= this.silenceTimeoutMs && this.state === "recording") {
        this.forceComplete();
      }
    }, 200);
  }

  private handleDisconnect(): void {
    this.stopMicrophone();
    this.setState("disconnected");

    // Auto-reconnect if not intentionally stopped
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connectWebSocket().catch(() => {});
      }, 1000 * this.reconnectAttempts);
    }
  }

  private stopMicrophone(): void {
    if (this.chunkInterval) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  private closeWebSocket(): void {
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
  }
}