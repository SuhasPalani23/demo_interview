import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";

interface QuestionInputProps {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  isStreaming: boolean;
  canSubmit: boolean;
}

export function QuestionInput({
  value,
  onChange,
  onSubmit,
  isStreaming,
  canSubmit,
}: QuestionInputProps) {
  const [isFocused, setIsFocused] = useState(false);

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

      {/* Input + Button row */}
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
          placeholder='e.g. "Tell me about yourself" or "How do you handle system design?"'
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
              : "Type your question"}
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
          Please add your resume and job description first
        </Text>
      )}
    </View>
  );
}
