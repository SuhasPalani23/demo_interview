/**
 * useAudioRecorder.ts
 * Tap to start recording → tap to stop → sends audio to /transcribe → returns text
 */

import { useState, useRef, useCallback } from "react";
import { Audio } from "expo-av";
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
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);
    setState("requesting");

    try {
      // Request microphone permission
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setError("Microphone permission denied");
        setState("error");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Use high-quality preset for better transcription
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setState("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start recording";
      setError(msg);
      setState("error");
    }
  }, []);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (!recordingRef.current) {
      setState("idle");
      return null;
    }

    setState("processing");

    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

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
      const transcription = (data.transcription || "").trim();

      setState("idle");
      return transcription || null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
      setError(msg);
      setState("error");
      recordingRef.current = null;
      return null;
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {
        // ignore
      }
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    setState("idle");
    setError(null);
  }, []);

  return { state, error, startRecording, stopAndTranscribe, cancelRecording };
}