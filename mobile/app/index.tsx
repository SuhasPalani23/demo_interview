import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";

import { JobDescriptionInput } from "../src/components/JobDescriptionInput";
import { QuestionInput } from "../src/components/QuestionInput";
import { StreamingAnswer } from "../src/components/StreamingAnswer";
import { useInterviewWS } from "../src/hooks/useInterviewWS";

export default function InterviewScreen() {
  const [jobDescription, setJobDescription] = useState("");
  const [question, setQuestion] = useState("");

  const { answer, isStreaming, status, error, contextInfo, ask, reset } = useInterviewWS();

  const canSubmit =
    jobDescription.trim().length > 0 &&
    question.trim().length > 0;

  const handleAsk = useCallback(async () => {
    if (!canSubmit || isStreaming) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ask({ jobDescription, question });
  }, [canSubmit, isStreaming, ask, jobDescription, question]);

  const handleReset = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reset();
    setQuestion("");
  }, [reset]);

  const handleClearAll = useCallback(() => {
    Alert.alert("Clear All", "Reset all inputs and the current answer?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          reset();
          setJobDescription("");
          setQuestion("");
        },
      },
    ]);
  }, [reset]);

  const setupComplete = jobDescription.trim().length > 0;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#0a0a0a" }} edges={["top"]}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="px-5 pt-4 pb-6">
            <View className="flex-row items-start justify-between">
              <View>
                <Text
                  style={{ fontFamily: "SpaceMono", letterSpacing: 3 }}
                  className="text-text-muted text-xs uppercase mb-1"
                >
                  Interview
                </Text>
                <Text
                  className="text-text-primary text-2xl font-bold tracking-tight"
                  style={{ letterSpacing: -0.5 }}
                >
                  AI Assistant
                </Text>
              </View>

              <View className="flex-row items-center gap-3">
                {/* Status badge */}
                <View
                  className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                    isStreaming
                      ? "border-streaming-dim bg-streaming/10"
                      : status === "searching"
                      ? "border-accent-dim bg-surface-elevated"
                      : setupComplete
                      ? "border-border bg-surface-elevated"
                      : "border-border bg-surface-elevated"
                  }`}
                >
                  <View
                    className={`w-1.5 h-1.5 rounded-full ${
                      isStreaming
                        ? "bg-streaming"
                        : status === "searching"
                        ? "bg-accent-dim"
                        : setupComplete
                        ? "bg-accent-dim"
                        : "bg-text-muted"
                    }`}
                  />
                  <Text
                    style={{ fontFamily: "SpaceMono" }}
                    className={`text-xs ${
                      isStreaming
                        ? "text-streaming"
                        : status === "searching"
                        ? "text-accent-dim"
                        : setupComplete
                        ? "text-accent-dim"
                        : "text-text-muted"
                    }`}
                  >
                    {isStreaming
                      ? "answering"
                      : status === "searching"
                      ? "searching"
                      : setupComplete
                      ? "ready"
                      : "setup"}
                  </Text>
                </View>

                {/* Clear button */}
                {(jobDescription || question || answer) && (
                  <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7} className="p-2">
                    <Text className="text-text-muted text-xs">✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Setup progress bar — JD + question (2 bars) */}
            <View className="mt-4 flex-row gap-1.5">
              <View
                className={`h-0.5 flex-1 rounded-full ${
                  jobDescription.trim().length > 0 ? "bg-accent" : "bg-border"
                }`}
              />
              <View
                className={`h-0.5 flex-1 rounded-full ${
                  question.trim().length > 0 ? "bg-accent" : "bg-border"
                }`}
              />
            </View>
          </View>

          {/* Divider */}
          <View className="h-px bg-border mx-5 mb-6" />

          {/* Context Setup — JD only */}
          <View className="px-5">
            <Text
              style={{ fontFamily: "SpaceMono" }}
              className="text-text-muted text-xs uppercase tracking-widest mb-4"
            >
              01 · Job Description
            </Text>

            <JobDescriptionInput value={jobDescription} onChange={setJobDescription} />
          </View>

          {/* Divider */}
          <View className="h-px bg-border mx-5 my-5" />

          {/* Interview Session */}
          <View className="px-5">
            <Text
              style={{ fontFamily: "SpaceMono" }}
              className="text-text-muted text-xs uppercase tracking-widest mb-4"
            >
              02 · Interview Session
            </Text>

            <QuestionInput
              value={question}
              onChange={setQuestion}
              onSubmit={handleAsk}
              isStreaming={isStreaming}
              canSubmit={canSubmit}
              jobDescriptionFilled={setupComplete}
            />

            {/* New Question button */}
            {answer && !isStreaming && (
              <TouchableOpacity
                onPress={handleReset}
                activeOpacity={0.7}
                className="mb-5 py-3 rounded-xl border border-border flex-row items-center justify-center gap-2"
                style={{ backgroundColor: "#111111" }}
              >
                <Text
                  style={{ fontFamily: "SpaceMono" }}
                  className="text-text-secondary text-xs uppercase tracking-wider"
                >
                  New Question
                </Text>
              </TouchableOpacity>
            )}

            <StreamingAnswer
              answer={answer}
              isStreaming={isStreaming}
              error={error}
              status={status}
              contextInfo={contextInfo}
            />
          </View>

          {/* Footer tip */}
          {!setupComplete && (
            <View className="px-5 mt-4">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <Text className="text-text-muted text-xs leading-relaxed text-center">
                  Paste the job description, then speak or type your interview question.
                  {"\n\n"}Your resumes are pre-indexed — no need to paste them each time.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}