import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MicButton } from "./MicButton";
import { useAudioRecorder } from "../hooks/useAudioRecorder";

interface QuestionInputProps {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  isStreaming: boolean;
  canSubmit: boolean;
  jobDescriptionFilled: boolean;
}

export function QuestionInput({
  value,
  onChange,
  onSubmit,
  isStreaming,
  canSubmit,
  jobDescriptionFilled,
}: QuestionInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const { state: micState, error: micError, startRecording, stopAndTranscribe, cancelRecording } = useAudioRecorder();

  const handleStopAndTranscribe = async () => {
    const text = await stopAndTranscribe();
    if (text) {
      onChange(text);
      // Auto-submit after transcription — jobDescription is already filled if canSubmit was close
      // We check it directly: if JD exists + we just got a question, fire immediately
      if (jobDescriptionFilled && !isStreaming) {
        setTimeout(() => onSubmit(), 80);
      }
    }
  };

  const handleSubmit = () => {
    if (canSubmit && !isStreaming) {
      onSubmit();
    }
  };

  return (
    <View className="mb-5">
      {/* Header */}
      <View className="flex-row items-center gap-2 mb-3">
        <View className="w-1.5 h-1.5 rounded-full bg-text-secondary" />
        <Text
          style={{ fontFamily: "SpaceMono" }}
          className="text-text-secondary text-xs tracking-widest uppercase"
        >
          Interview Question
        </Text>
      </View>

      {/* Mic section */}
      <View className="mb-3 bg-surface rounded-xl border border-border p-4">
        <MicButton
          state={micState}
          onStart={startRecording}
          onStop={handleStopAndTranscribe}
          onCancel={cancelRecording}
          error={micError}
        />
      </View>

      {/* Text input */}
      <View
        className={`rounded-xl border overflow-hidden ${
          isFocused ? "border-border-focus" : "border-border"
        }`}
        style={{ backgroundColor: "#111111" }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onSubmitEditing={handleSubmit}
          placeholder='e.g. "Tell me about yourself" or type after speaking...'
          placeholderTextColor="#4a4642"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          returnKeyType="send"
          blurOnSubmit={false}
          className="text-text-primary text-sm leading-relaxed p-4 pb-2"
          style={{ minHeight: 80, fontSize: 14 }}
        />

        {/* Bottom action bar */}
        <View className="flex-row items-center justify-between px-4 py-3 border-t border-border">
          <Text className="text-text-muted text-xs">
            {value.trim().length > 0
              ? `${value.trim().length} chars`
              : "Speak or type your question"}
          </Text>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit || isStreaming}
            activeOpacity={0.7}
            className={`flex-row items-center gap-2 px-4 py-2 rounded-lg ${
              canSubmit && !isStreaming
                ? "bg-accent"
                : "bg-surface-elevated opacity-50"
            }`}
          >
            {isStreaming ? (
              <>
                <ActivityIndicator size="small" color="#0a0a0a" />
                <Text
                  style={{ fontFamily: "SpaceMono" }}
                  className="text-background text-xs font-bold"
                >
                  Answering...
                </Text>
              </>
            ) : (
              <Text
                style={{ fontFamily: "SpaceMono" }}
                className={`text-xs font-bold ${
                  canSubmit ? "text-background" : "text-text-muted"
                }`}
              >
                Ask →
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Validation hints */}
      {!canSubmit && value.trim().length > 0 && (
        <Text className="text-danger text-xs mt-2 ml-1">
          Please add the job description first
        </Text>
      )}
    </View>
  );
}