/**
 * AudioStream — Robust Speech-to-Text via WebSocket audio streaming.
 *
 * Instead of relying on the notoriously unreliable webkitSpeechRecognition API,
 * this module:
 * 1. Captures microphone audio via Web Audio API (raw PCM 16-bit 16kHz mono)
 * 2. Streams raw PCM audio chunks to the backend via a dedicated WebSocket
 * 3. Receives transcription results (interim + final) from the backend's STT pipeline
 *
 * NOTE: This uses AudioContext + ScriptProcessorNode to capture raw PCM audio,
 * NOT MediaRecorder (which outputs WebM chunks). The backend expects raw PCM
 * as documented by the "AudioConnected" message.
 */

export interface AudioStreamCallbacks {
  /** Called with interim transcription text as the user speaks */
  onInterimTranscript?: (text: string) => void;
  /** Called when a complete utterance has been transcribed */
  onFinalTranscript?: (text: string) => void;
  /** Called when the connection state changes */
  onStatusChange?: (status: AudioStreamStatus) => void;
  /** Called on error */
  onError?: (error: string) => void;
}

export interface AudioStreamStatus {
  connected: boolean;
  listening: boolean;
  error: string | null;
}

export class AudioStream {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private wsUrl: string;
  private callbacks: AudioStreamCallbacks;
  private _listening = false;
  private _connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;
  private shouldReconnect = false;
  private wsOpenPromiseResolve: (() => void) | null = null;
  private wsOpenPromiseReject: ((err: Error) => void) | null = null;
  private wsTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Accumulated final transcript from this session */
  private accumulatedText = "";

  /** Raw PCM buffer to send as a single chunk on stop */
  private pcmBuffer: Int16Array[] = [];
  private actualSampleRate: number = 16000;

  constructor(interviewId: string, callbacks: AudioStreamCallbacks) {
    const base =
      import.meta.env.VITE_WS_BASE_URL ??
      (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080").replace(/^http/, "ws");
    this.wsUrl = `${base}/interview/${encodeURIComponent(interviewId)}/audio`;
    this.callbacks = callbacks;
    console.log(`[AudioStream] Created for interview ${interviewId}, WS URL: ${this.wsUrl}`);
  }

  get listening(): boolean {
    return this._listening;
  }

  get connected(): boolean {
    return this._connected;
  }

  get transcript(): string {
    return this.accumulatedText;
  }

  /**
   * Start streaming audio to the backend for transcription.
   * Captures raw PCM via Web Audio API and streams to WebSocket.
   */
  async start(): Promise<void> {
    if (this._listening) {
      console.log("[AudioStream] Already listening, ignoring start()");
      return;
    }

    console.log("[AudioStream] Starting audio capture (raw PCM mode)...");

    try {
      // 1. Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      console.log("[AudioStream] Microphone access granted");

      // 2. Create AudioContext for PCM capture
      this.audioContext = new AudioContext();

      // 3. Connect WebSocket
      this.shouldReconnect = true;
      this.reconnectAttempts = 0;
      await this.connectWebSocket();

      // 4. Start raw PCM capture via ScriptProcessorNode
      this.startPCMCapture();

      this._listening = true;
      this.pcmBuffer = [];
      this.accumulatedText = "";
      this.emitStatus();
      console.log("[AudioStream] Audio capture started successfully");
    } catch (err) {
      console.error("[AudioStream] Failed to start:", err);
      const message = err instanceof DOMException && err.name === "NotAllowedError"
        ? "Microphone access denied. Please check site permissions."
        : err instanceof DOMException && err.name === "NotFoundError"
          ? "No microphone found. Please connect a microphone."
          : err instanceof Error
            ? err.message
            : "Failed to start audio capture";
      this.callbacks.onError?.(message);
      this.emitStatus();
      this.cleanup();
    }
  }

  /**
   * Stop listening and flush any pending audio.
   */
  stop(): void {
    console.log("[AudioStream] Stopping audio capture...");
    this._listening = false;
    this.shouldReconnect = false;

    // Stop PCM capture
    this.stopPCMCapture();

    // Send any remaining buffered PCM data as final chunk
    this.flushPCMBuffer();

    // Send force_complete to finalize the utterance
    if (this.ws && this._connected) {
      try {
        this.ws.send(JSON.stringify({ type: "force_complete" }));
        console.log("[AudioStream] Sent force_complete");
      } catch (e) {
        console.warn("[AudioStream] Could not send force_complete:", e);
      }
    }

    // Close WebSocket after enough time for finalize to process
    setTimeout(() => {
      this.cleanup();
      this.emitStatus();
      console.log("[AudioStream] Audio capture stopped and cleaned up");
    }, 1500);
  }

  /**
   * Manually finalize the current utterance (like pressing "Done speaking").
   */
  forceComplete(): void {
    if (this.ws && this._connected) {
      this.flushPCMBuffer();
      this.ws.send(JSON.stringify({ type: "force_complete" }));
    }
  }

  /**
   * Reset accumulated transcript for a new question.
   */
  resetTranscript(): void {
    this.accumulatedText = "";
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    console.log("[AudioStream] Destroying audio stream...");
    this.shouldReconnect = false;
    this.cleanup();
    this.callbacks = {};
    console.log("[AudioStream] Destroyed");
  }

  // ─── Private: Raw PCM Capture via Web Audio API ─────────────────────

  private startPCMCapture() {
    if (!this.audioContext || !this.stream) return;

    const sampleRate = this.audioContext.sampleRate;
    this.actualSampleRate = sampleRate;
    console.log(`[AudioStream] Starting PCM capture at ${sampleRate}Hz${sampleRate !== 16000 ? ` (will downsample to 16kHz)` : ''}`);

    // Create source from mic
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    // ScriptProcessorNode for raw PCM access
    // Buffer size: 4096 frames, ~85ms at 48kHz, ~256ms at 16kHz
    this.scriptNode = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this._listening || !this._connected) return;

      const input = event.inputBuffer.getChannelData(0); // Float32 samples
      
      // Downsample to 16kHz for consistent STT processing
      let float16k: Float32Array;
      if (sampleRate === 16000) {
        float16k = input;
      } else {
        // Simple decimation: take every Nth sample
        const ratio = sampleRate / 16000;
        const outputLen = Math.floor(input.length / ratio);
        float16k = new Float32Array(outputLen);
        for (let i = 0; i < outputLen; i++) {
          float16k[i] = input[Math.floor(i * ratio)];
        }
      }

      // Convert to 16-bit PCM and buffer it
      const pcm16 = this.float32ToInt16(float16k);
      this.pcmBuffer.push(pcm16);

      // Send every 4 bufferfuls to keep latency reasonable
      // At 4096 input frames @ 48kHz → ~170ms per batch → ~85ms output at 16kHz
      // 4 batches = ~340ms chunks (good balance of latency vs chunk overhead)
      if (this.pcmBuffer.length >= 4) {
        this.flushPCMBuffer();
      }
    };

    this.sourceNode.connect(this.scriptNode);
    this.scriptNode.connect(this.audioContext.destination);
    console.log("[AudioStream] PCM capture nodes connected");
  }

  private stopPCMCapture() {
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
  }

  private flushPCMBuffer() {
    if (this.pcmBuffer.length === 0 || !this.ws || !this._connected) return;

    // Concatenate all buffered PCM16 arrays
    let totalLength = 0;
    for (const buf of this.pcmBuffer) {
      totalLength += buf.length;
    }

    const combined = new Int16Array(totalLength);
    let offset = 0;
    for (const buf of this.pcmBuffer) {
      combined.set(buf, offset);
      offset += buf.length;
    }

    this.pcmBuffer = [];

    // Send as raw binary (Int16Array -> ArrayBuffer)
    this.ws.send(combined.buffer);
    console.log(`[AudioStream] Sent PCM chunk: ${combined.length} samples (${combined.buffer.byteLength} bytes)`);
  }

  private float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }

  // ─── Private: WebSocket ─────────────────────────────────────────────

  private connectWebSocket(): Promise<void> {
    // Clear any stale timeout from previous connection
    if (this.wsTimeoutId) {
      clearTimeout(this.wsTimeoutId);
      this.wsTimeoutId = null;
    }

    return new Promise((resolve, reject) => {
      this.wsOpenPromiseResolve = resolve;
      this.wsOpenPromiseReject = reject;

      try {
        console.log(`[AudioStream] Opening WebSocket to ${this.wsUrl}`);
        this.ws = new WebSocket(this.wsUrl);
      } catch (err) {
        console.error("[AudioStream] WebSocket creation failed:", err);
        reject(err);
        return;
      }

      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        console.log("[AudioStream] WebSocket opened successfully");
        this._connected = true;
        this.reconnectAttempts = 0;
        this.emitStatus();

        // Resolve the pending promise
        if (this.wsOpenPromiseResolve) {
          this.wsOpenPromiseResolve();
          this.wsOpenPromiseResolve = null;
          this.wsOpenPromiseReject = null;
        }
        if (this.wsTimeoutId) {
          clearTimeout(this.wsTimeoutId);
          this.wsTimeoutId = null;
        }
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event);
      };

      this.ws.onerror = (err) => {
        console.error("[AudioStream] WebSocket error:", err);
      };

      this.ws.onclose = (event) => {
        console.log(`[AudioStream] WebSocket closed (code=${event.code}, reason=${event.reason})`);
        this._connected = false;
        this.emitStatus();

        // If the promise is still pending (connection never fully opened), reject it
        if (this.wsOpenPromiseReject) {
          this.wsOpenPromiseReject(new Error(`WebSocket closed during connect: code=${event.code}`));
          this.wsOpenPromiseResolve = null;
          this.wsOpenPromiseReject = null;
        }

        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          console.log(`[AudioStream] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => {
            if (this.shouldReconnect) {
              this.connectWebSocket().catch(() => {});
            }
          }, delay);
        }
      };

      // Timeout: reject if connection doesn't open within 10 seconds
      this.wsTimeoutId = setTimeout(() => {
        if (!this._connected) {
          console.error("[AudioStream] WebSocket connection timed out after 10s");
          if (this.wsOpenPromiseReject) {
            this.wsOpenPromiseReject(new Error("WebSocket connection timed out"));
            this.wsOpenPromiseResolve = null;
            this.wsOpenPromiseReject = null;
          }
        }
        this.wsTimeoutId = null;
      }, 10000);
    });
  }

  // ─── Private: Message Handling ──────────────────────────────────────

  private handleMessage(event: MessageEvent) {
    // Ignore binary frames (they're audio responses from Gemini Live)
    if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
      return;
    }

    try {
      const data = JSON.parse(event.data as string);
      console.log("[AudioStream] Received:", data.type, data.text ? `"${data.text.slice(0, 60)}..."` : "");
      
      switch (data.type) {
        case "AudioConnected":
          console.log("[AudioStream] Backend ready:", data.message);
          break;

        case "TranscriptChunk":
          if (data.text && !data.final) {
            const interimText = this.accumulatedText
              ? this.accumulatedText + " " + data.text
              : data.text;
            this.callbacks.onInterimTranscript?.(interimText);
          }
          if (data.text && data.final === true) {
            if (this.accumulatedText) {
              this.accumulatedText += " " + data.text;
            } else {
              this.accumulatedText = data.text;
            }
            this.callbacks.onFinalTranscript?.(this.accumulatedText);
          }
          break;

        case "TranscriptCompleted":
          if (data.text) {
            this.accumulatedText = data.text;
            this.callbacks.onFinalTranscript?.(this.accumulatedText);
          }
          break;

        default:
          break;
      }
    } catch (e) {
      console.warn("[AudioStream] Failed to parse message:", e);
    }
  }

  // ─── Private: Cleanup ───────────────────────────────────────────────

  private cleanup() {
    // Clear timeout
    if (this.wsTimeoutId) {
      clearTimeout(this.wsTimeoutId);
      this.wsTimeoutId = null;
    }
    this.wsOpenPromiseResolve = null;
    this.wsOpenPromiseReject = null;

    // Stop PCM capture
    this.stopPCMCapture();

    // Close AudioContext
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Stop media tracks
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        console.log(`[AudioStream] Stopping track: ${t.kind}`);
        t.stop();
      });
      this.stream = null;
    }

    // Close WebSocket
    if (this.ws) {
      const state = this.ws.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        console.log("[AudioStream] Closing WebSocket...");
        this.ws.close(1000, "Client disconnecting");
      }
      this.ws = null;
    }

    this._connected = false;
    this._listening = false;
    this.pcmBuffer = [];
  }

  private emitStatus() {
    this.callbacks.onStatusChange?.({
      connected: this._connected,
      listening: this._listening,
      error: null,
    });
  }
}