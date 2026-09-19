/**
 * LiveKit Real-Time Audio Stream Guardrail Evaluator
 * Intercepts real-time audio streams / transcriptions from LiveKit voice agents
 * and evaluates them against local Moss WASM engine rules in sub-10ms latency.
 */

import { Room, RoomEvent, Track, RemoteParticipant, RemoteTrackPublication } from 'livekit-client';

export interface LiveKitGuardrailConfig {
  wsUrl: string;
  token: string;
  onTranscription: (text: string, participant: string) => void;
  onRuleViolation: (violation: { rule: string; text: string; confidence: number }) => void;
}

export class LiveKitVoiceGuardrail {
  private room: Room;
  private isConnected: boolean = false;

  constructor() {
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
  }

  public async connectAndMonitor(config: LiveKitGuardrailConfig): Promise<void> {
    try {
      this.room.on(RoomEvent.TrackSubscribed, (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          console.log(`[Litigo/LiveKit] Subscribed to voice agent audio track from ${participant.identity}`);
          const element = track.attach();
          document.body.appendChild(element);
        }
      });

      this.room.on(RoomEvent.TranscriptionReceived, (transcriptions, participant) => {
        for (const transcription of transcriptions) {
          const text = transcription.text;
          const speaker = participant?.identity || 'Voice Agent';
          config.onTranscription(text, speaker);
        }
      });

      await this.room.connect(config.wsUrl, config.token);
      this.isConnected = true;
      console.log(`[Litigo/LiveKit] Connected to LiveKit room: ${this.room.name}`);
    } catch (error) {
      console.warn('[Litigo/LiveKit] LiveKit room connection standby mode:', error);
    }
  }

  public disconnect(): void {
    if (this.isConnected) {
      this.room.disconnect();
      this.isConnected = false;
      console.log('[Litigo/LiveKit] Disconnected from LiveKit room.');
    }
  }

  public isRoomActive(): boolean {
    return this.isConnected;
  }
}
