import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Animated, ActivityIndicator } from "react-native";
import { RecordingState } from "../hooks/useAudioRecorder";

interface MicButtonProps {
  state: RecordingState;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  error: string | null;
}

export function MicButton({ state, onStart, onStop, onCancel, error }: MicButtonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (state === "recording") {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
    return () => pulseLoop.current?.stop();
  }, [state, pulseAnim]);

  const isRecording = state === "recording";
  const isProcessing = state === "processing";
  const isRequesting = state === "requesting";
  const isActive = isRecording || isProcessing || isRequesting;

  const handlePress = () => {
    if (isRecording) onStop();
    else if (isProcessing || isRequesting) onCancel();
    else onStart();
  };

  return (
    <View className="items-center">
      <View className="flex-row items-center gap-3 mb-2">
        {/* Pulse ring (only visible while recording) */}
        {isRecording && (
          <Animated.View
            style={{
              position: "absolute",
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: "#c4736b",
              opacity: 0.25,
              transform: [{ scale: pulseAnim }],
            }}
          />
        )}

        {/* Main mic button */}
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.8}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isRecording ? "#c4736b" : isProcessing ? "#2a2a2a" : "#1c1c1c",
            borderWidth: 1.5,
            borderColor: isRecording ? "#c4736b" : isProcessing ? "#404040" : "#2a2a2a",
          }}
        >
          {isProcessing || isRequesting ? (
            <ActivityIndicator size="small" color="#8a8278" />
          ) : (
            <Text style={{ fontSize: 20 }}>{isRecording ? "⏹" : "🎤"}</Text>
          )}
        </TouchableOpacity>

        {/* Status label */}
        <View>
          <Text
            style={{ fontFamily: "SpaceMono" }}
            className={`text-xs ${
              isRecording ? "text-danger" : isProcessing ? "text-text-secondary" : "text-text-muted"
            }`}
          >
            {isRecording
              ? "Recording… tap to stop"
              : isProcessing
              ? "Transcribing..."
              : isRequesting
              ? "Starting mic..."
              : "Tap mic to speak question"}
          </Text>
          {error && (
            <Text className="text-danger text-xs mt-0.5">{error}</Text>
          )}
        </View>
      </View>
    </View>
  );
}