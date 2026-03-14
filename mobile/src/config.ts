// Update this to your machine's local IP address when running on a physical device
// For emulator/simulator, you can use localhost
// Example: "ws://192.168.1.42:4000/interview"

export const WS_URL =
  process.env.EXPO_PUBLIC_BACKEND_WS_URL || "ws://localhost:4000/interview";
