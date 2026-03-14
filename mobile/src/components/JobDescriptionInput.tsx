import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";

interface JobDescriptionInputProps {
  value: string;
  onChange: (text: string) => void;
}

export function JobDescriptionInput({ value, onChange }: JobDescriptionInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const preview = value.slice(0, 120).trim();
  const hasContent = value.trim().length > 0;

  return (
    <View className="mb-5">
      {/* Header */}
      <TouchableOpacity
        onPress={() => hasContent && setIsCollapsed(!isCollapsed)}
        activeOpacity={hasContent ? 0.7 : 1}
        className="flex-row items-center justify-between mb-3"
      >
        <View className="flex-row items-center gap-2">
          <View className="w-1.5 h-1.5 rounded-full bg-accent-dim" />
          <Text
            style={{ fontFamily: "SpaceMono" }}
            className="text-text-secondary text-xs tracking-widest uppercase"
          >
            Job Description
          </Text>
          {hasContent && (
            <View className="bg-surface-elevated px-2 py-0.5 rounded-full">
              <Text className="text-streaming text-xs">
                {value.split(/\s+/).filter(Boolean).length} words
              </Text>
            </View>
          )}
        </View>
        {hasContent && (
          <Text className="text-text-muted text-xs">
            {isCollapsed ? "expand" : "collapse"}
          </Text>
        )}
      </TouchableOpacity>

      {/* Input or collapsed preview */}
      {isCollapsed && hasContent ? (
        <TouchableOpacity
          onPress={() => setIsCollapsed(false)}
          className="bg-surface-elevated rounded-xl p-4 border border-border"
        >
          <Text className="text-text-secondary text-sm leading-relaxed" numberOfLines={3}>
            {preview}
            {value.length > 120 ? "..." : ""}
          </Text>
        </TouchableOpacity>
      ) : (
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
            placeholder="Paste the job description — role, responsibilities, requirements, tech stack..."
            placeholderTextColor="#4a4642"
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            className="text-text-primary text-sm leading-relaxed p-4"
            style={{ minHeight: 160, fontFamily: "SpaceMono", fontSize: 12 }}
            scrollEnabled={true}
          />
          <View
            className={`h-px ${isFocused ? "bg-accent-dim" : "bg-transparent"}`}
          />
        </View>
      )}
    </View>
  );
}
