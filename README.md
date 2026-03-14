# AI Interview Assistant

A real-time AI interview coaching app. You paste your resume and job description, ask interview questions, and the AI answers **as you** — streaming tokens live via WebSocket.

Built with: React Native + Expo · Fastify + WebSocket · Gemini 2.5 Flash

---

## Architecture

```
Mobile App (Expo)
    │
    │  WebSocket (ws://)
    ▼
Backend (Fastify + @fastify/websocket)
    │
    │  Gemini Streaming API
    ▼
Gemini 2.5 Flash (Google AI)
```

**Flow:**
1. User fills Resume, Job Description, Question on the mobile app
2. App opens a WebSocket connection and sends JSON payload
3. Backend calls Gemini with streaming enabled
4. Each token from Gemini is immediately forwarded to the client
5. Mobile renders tokens progressively with a blinking cursor

---

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- Expo Go app installed on your phone (iOS or Android)
- A Gemini API key → https://aistudio.google.com/

---

## Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Run in development mode
npm run dev
```

Backend runs on `http://localhost:4000`  
WebSocket endpoint: `ws://localhost:4000/interview`  
Health check: `http://localhost:4000/health`

---

## Mobile App Setup

```bash
cd mobile

# Install dependencies
npm install

# Configure the WebSocket URL
cp .env.example .env
```

### Finding your local IP address

The mobile device needs to reach your backend. Use your machine's **local network IP**, not `localhost`.

| OS      | Command                    |
|---------|----------------------------|
| macOS   | `ipconfig getifaddr en0`   |
| Windows | `ipconfig`                 |
| Linux   | `hostname -I`              |

Edit `mobile/.env`:
```
EXPO_PUBLIC_BACKEND_WS_URL=ws://YOUR_LOCAL_IP:4000/interview
```

Or edit `mobile/src/config.ts` directly.

### Run the app

```bash
npm start
```

Scan the QR code with Expo Go on your phone.

> **Note:** Both your phone and computer must be on the **same Wi-Fi network**.

---

## Project Structure

```
interview-assistant/
├── backend/
│   ├── src/
│   │   └── server.ts          # Fastify server + WebSocket + Gemini streaming
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
└── mobile/
    ├── app/
    │   ├── _layout.tsx         # Root layout (expo-router)
    │   └── index.tsx           # Main interview screen
    ├── src/
    │   ├── components/
    │   │   ├── ResumeInput.tsx
    │   │   ├── JobDescriptionInput.tsx
    │   │   ├── QuestionInput.tsx
    │   │   └── StreamingAnswer.tsx
    │   ├── hooks/
    │   │   └── useInterviewWS.ts   # WebSocket + streaming logic
    │   └── config.ts               # WS_URL configuration
    ├── global.css
    ├── metro.config.js
    ├── tailwind.config.js
    ├── babel.config.js
    └── package.json
```

---

## WebSocket Message Protocol

**Client → Server**
```json
{
  "resume": "Full resume text...",
  "jobDescription": "Job description text...",
  "question": "Tell me about yourself"
}
```

**Server → Client (streaming)**
```json
{ "type": "token", "content": "Well, " }
{ "type": "token", "content": "I've been working " }
{ "type": "token", "content": "in software for..." }
{ "type": "done" }
```

**Server → Client (error)**
```json
{ "type": "error", "message": "Gemini API error description" }
```

---

## Features

| Feature | Description |
|---|---|
| **Resume Input** | Collapsible multiline text input with word count |
| **Job Description Input** | Collapsible multiline input, collapses after entry |
| **Question Input** | Question field with live submit button |
| **Streaming Answer** | Real-time token rendering with blinking cursor |
| **Copy to Clipboard** | One-tap copy of the full answer |
| **Setup Progress Bar** | Visual indicator of completion (resume / JD / question) |
| **Haptic Feedback** | Native haptics on submit and reset |
| **Word/Minute Estimate** | Reading aloud time estimate per answer |

---

## Environment Variables

### Backend (`backend/.env`)
```
GEMINI_API_KEY=your_google_gemini_api_key
PORT=4000
```

### Mobile (`mobile/.env`)
```
EXPO_PUBLIC_BACKEND_WS_URL=ws://192.168.1.X:4000/interview
```

---

## Troubleshooting

**"Connection failed. Is the backend running?"**  
→ Make sure `npm run dev` is running in the backend folder  
→ Confirm your IP address is correct in `mobile/src/config.ts`  
→ Ensure phone and computer are on the same Wi-Fi

**Gemini errors**  
→ Verify `GEMINI_API_KEY` is set in `backend/.env`  
→ Check the key is active at https://aistudio.google.com/

**Expo font warning**  
→ Make sure `assets/fonts/SpaceMono-Regular.ttf` exists (included in Expo templates)

---

## Build for Production

```bash
# Backend — compile TypeScript
cd backend && npm run build && npm start

# Mobile — create production build
cd mobile && npx expo build
```
