import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import * as Clipboard from "expo-clipboard";

interface StreamingAnswerProps {
  answer: string;
  isStreaming: boolean;
  error: string | null;
  status: string;
}

export function StreamingAnswer({ answer, isStreaming, error, status }: StreamingAnswerProps) {
  const [cursorVisible, setCursorVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!isStreaming) { setCursorVisible(false); return; }
    const interval = setInterval(() => setCursorVisible((v) => !v), 500);
    return () => clearInterval(interval);
  }, [isStreaming]);

  useEffect(() => {
    if (answer && scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: true });
    }
  }, [answer]);

  const handleCopy = async () => {
    if (answer) {
      await Clipboard.setStringAsync(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasAnswer = answer.length > 0;
  const isEmpty = !hasAnswer && !isStreaming && !error;

  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <View className={`w-1.5 h-1.5 rounded-full ${isStreaming ? "bg-streaming" : hasAnswer ? "bg-streaming-dim" : "bg-text-muted"}`} />
          <Text style={{ fontFamily: "SpaceMono" }} className="text-text-secondary text-xs tracking-widest uppercase">
            AI Answer
          </Text>
          {isStreaming && (
            <Text style={{ fontFamily: "SpaceMono" }} className="text-streaming text-xs">● live</Text>
          )}
        </View>
        {hasAnswer && !isStreaming && (
          <TouchableOpacity onPress={handleCopy} activeOpacity={0.7}
            className="bg-surface-elevated px-3 py-1.5 rounded-lg border border-border">
            <Text style={{ fontFamily: "SpaceMono" }} className={`text-xs ${copied ? "text-streaming" : "text-text-secondary"}`}>
              {copied ? "copied ✓" : "copy"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View className={`rounded-xl border min-h-32 ${isStreaming ? "border-streaming-dim" : "border-border"}`}
        style={{ backgroundColor: "#0d0d0d" }}>
        {isEmpty && (
          <View className="flex-1 items-center justify-center p-8 min-h-32">
            <Text className="text-text-muted text-center text-sm leading-relaxed">
              Your interview answer will{"\n"}appear here in real-time
            </Text>
          </View>
        )}

        {error && (
          <View className="p-5">
            <Text className="text-danger text-sm font-semibold mb-2">Connection Error</Text>
            <Text className="text-danger text-sm opacity-80 leading-relaxed">{error}</Text>
            <Text className="text-text-muted text-xs mt-3">
              Make sure your backend is running and WS_URL is set correctly in src/config.ts
            </Text>
          </View>
        )}

        {(hasAnswer || isStreaming) && !error && (
          <ScrollView ref={scrollRef} className="p-5" showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
            <Text className="text-text-primary text-base leading-loose" style={{ letterSpacing: 0.2 }}>
              {answer}
              {isStreaming && (
                <Text style={{ opacity: cursorVisible ? 1 : 0, color: "#a3c4a8" }}>▋</Text>
              )}
            </Text>
            {!isStreaming && hasAnswer && (
              <View className="mt-4 pt-4 border-t border-border">
                <Text style={{ fontFamily: "SpaceMono" }} className="text-text-muted text-xs">
                  {answer.split(/\s+/).filter(Boolean).length} words ·{" "}
                  {Math.ceil(answer.split(/\s+/).filter(Boolean).length / 130)} min read aloud
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}