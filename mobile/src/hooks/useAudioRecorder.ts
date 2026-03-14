/**
 * useAudioRecorder.ts
 * Tap to start recording → tap to stop → sends audio to /transcribe → returns text
 * Uses expo-audio (replaces deprecated expo-av)
 */

import { useState, useRef, useCallback } from "react";
import { useAudioRecorder as useExpoAudioRecorder, AudioModule, RecordingPresets } from "expo-audio";
import { API_BASE } from "../config";

export type RecordingState = "idle" | "requesting" | "recording" | "processing" | "error";

export interface AudioRecorderResult {
  state: RecordingState;
  error: string | null;
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  cancelRecording: () => Promise<void>;
}

export function useAudioRecorder(): AudioRecorderResult {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useExpoAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isRecordingRef = useRef(false);

  const startRecording = useCallback(async () => {
    setError(null);
    setState("requesting");

    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setError("Microphone permission denied");
        setState("error");
        return;
      }

      await recorder.prepareToRecordAsync();
      recorder.record();
      isRecordingRef.current = true;
      setState("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start recording";
      setError(msg);
      setState("error");
    }
  }, [recorder]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (!isRecordingRef.current) {
      setState("idle");
      return null;
    }

    setState("processing");
    isRecordingRef.current = false;

    try {
      await recorder.stop();
      const uri = recorder.uri;

      if (!uri) {
        throw new Error("No audio URI after recording");
      }

      // Build multipart form data
      const formData = new FormData();
      formData.append("audio", {
        uri,
        name: "recording.m4a",
        type: "audio/m4a",
      } as unknown as Blob);

      const response = await fetch(`${API_BASE}/transcribe`, {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const transcription = (data.transcription || "");

      setState("idle");
      return transcription || null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
      setError(msg);
      setState("error");
      return null;
    }
  }, [recorder]);

  const cancelRecording = useCallback(async () => {
    if (isRecordingRef.current) {
      try {
        await recorder.stop();
      } catch {
        // ignore
      }
      isRecordingRef.current = false;
    }
    setState("idle");
    setError(null);
  }, [recorder]);

  return { state, error, startRecording, stopAndTranscribe, cancelRecording };
}