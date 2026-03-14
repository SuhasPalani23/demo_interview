import { useState, useRef, useCallback, useEffect } from "react";
import { WS_URL } from "../config";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error" | "disconnected";

export interface InterviewPayload {
  resume: string;
  jobDescription: string;
  question: string;
}

export function useInterviewWS() {
  const [answer, setAnswer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingPayloadRef = useRef<InterviewPayload | null>(null);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const ask = useCallback(
    (payload: InterviewPayload) => {
      cleanup();
      setAnswer("");
      setError(null);
      setIsStreaming(false);
      setStatus("connecting");
      pendingPayloadRef.current = payload;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        setIsStreaming(true);
        if (pendingPayloadRef.current) {
          ws.send(JSON.stringify(pendingPayloadRef.current));
          pendingPayloadRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "token") {
            setAnswer((prev) => prev + msg.content);
          } else if (msg.type === "done") {
            setIsStreaming(false);
            setStatus("disconnected");
            cleanup();
          } else if (msg.type === "error") {
            setError(msg.message || "Unknown error from server");
            setIsStreaming(false);
            setStatus("error");
            cleanup();
          }
        } catch {
          // ignore parse errors for partial messages
        }
      };

      ws.onerror = () => {
        setError("Connection failed. Is the backend running?");
        setIsStreaming(false);
        setStatus("error");
      };

      ws.onclose = () => {
        setIsStreaming(false);
        wsRef.current = null;
      };
    },
    [cleanup, status]
  );

  const reset = useCallback(() => {
    cleanup();
    setAnswer("");
    setError(null);
    setIsStreaming(false);
    setStatus("idle");
  }, [cleanup]);

  return { answer, isStreaming, status, error, ask, reset };
}
