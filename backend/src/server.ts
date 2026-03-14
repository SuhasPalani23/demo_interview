import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";
import { loadIndex, searchResumes, isIndexLoaded, getIndexInfo } from "./vectorSearch";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = parseInt(process.env.PORT || "4000", 10);

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not set in .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ── Load FAISS index at startup ──
const indexLoaded = loadIndex(genAI);
if (!indexLoaded) {
  console.warn("\n⚠️  No FAISS index found. Run: npm run index");
  console.warn("   Falling back to manual resume input mode.\n");
}

// ── System Prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are acting as ME during a live job interview.
Your job is to answer questions exactly as I would using:
1. My resume context (retrieved relevant sections)
2. The job description
3. Strong software engineering knowledge

You must sound like a real candidate speaking naturally during an interview.

IDENTITY RULES:
- You are NOT an AI assistant. You are the job candidate.
- Never say: "based on the resume", "according to the document", "as an AI"
- Always speak in first person.
- Examples: "I worked on...", "In my previous role...", "I built...", "My approach was..."

ANSWER STYLE:
- Responses must sound like natural spoken answers.
- Do NOT use bullet points. Do NOT use markdown formatting.
- Use conversational spoken language.
- Structure: Short answer → Explanation → Quick example
- There is NO word limit. Give complete, thorough answers.

BEHAVIORAL QUESTIONS:
- Follow the STAR framework internally (Situation, Task, Action, Result)
- But do NOT explicitly mention STAR.
- Be detailed and specific. Use real-sounding stories from the resume context.

TECHNICAL QUESTIONS:
- Explain clearly but practically: Concept → Example → Tradeoffs
- Be thorough. Don't truncate explanations.

SYSTEM DESIGN QUESTIONS:
- Focus on: scalability, reliability, maintainability, tradeoffs
- Go deep on architecture decisions

ANSWER LENGTH:
- Simple questions: 3–5 sentences
- Technical questions: full thorough explanation, no artificial limit
- Behavioral: complete story with context, action, and measurable result
- Never cut off mid-thought. Always complete the answer fully.

SPEECH OPTIMIZATION:
- Answers will later be converted to speech.
- Use natural spoken sentences. Avoid symbols, asterisks, or formatting characters.`;

interface InterviewMessage {
  resume?: string;
  jobDescription: string;
  question: string;
}

const fastify = Fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  },
});

fastify.register(fastifyCors, { origin: "*", methods: ["GET", "POST"] });
fastify.register(fastifyWebsocket);
fastify.register(fastifyMultipart, {
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB for audio
});

// ── Audio Transcription Endpoint ───────────────────────────────────────────
// Receives audio file (webm/mp4/wav/m4a), returns transcription via Gemini
fastify.post("/transcribe", async (req, reply) => {
  try {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: "No audio file provided" });
    }

    const audioBuffer = await data.toBuffer();
    const mimeType = (data.mimetype || "audio/webm") as string;

    // Convert buffer to base64
    const base64Audio = audioBuffer.toString("base64");

    // Use Gemini Flash for transcription
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64Audio,
        },
      },
      {
        text: "Transcribe the speech in this audio exactly as spoken. Return only the transcribed text, nothing else. If no speech is detected, return an empty string.",
      },
    ]);

    const transcription = result.response.text().trim();
    fastify.log.info(`🎤 Transcribed: "${transcription.slice(0, 80)}"`);

    return reply.send({ transcription });
  } catch (err: unknown) {
    fastify.log.error({ err }, "Transcription error");
    const message = err instanceof Error ? err.message : "Transcription failed";
    return reply.status(500).send({ error: message });
  }
});

// ── WebSocket Interview Endpoint ───────────────────────────────────────────
fastify.register(async function (fastify) {
  fastify.get("/interview", { websocket: true }, async (socket, req) => {
    fastify.log.info("🔌 Client connected");

    socket.on("message", async (rawMessage: Buffer | string) => {
      let parsed: InterviewMessage;

      try {
        parsed = JSON.parse(rawMessage.toString());
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid JSON payload" }));
        return;
      }

      const { resume: manualResume, jobDescription, question } = parsed;

      if (!jobDescription || !question) {
        socket.send(JSON.stringify({ type: "error", message: "Missing jobDescription or question" }));
        return;
      }

      fastify.log.info(`📨 Question: "${question.slice(0, 80)}"`);

      // ── Build resume context ──
      let resumeContext = "";

      if (isIndexLoaded()) {
        try {
          // Send status to client
          socket.send(JSON.stringify({ type: "searching", message: "Searching resume index..." }));

          const results = await searchResumes(jobDescription, question, 8);
          const uniqueSources = [...new Set(results.map((r) => r.source))];
          fastify.log.info(`🔍 Vector search: ${results.length} chunks from [${uniqueSources.join(", ")}]`);

          resumeContext = results
            .map((r, i) => `[Resume Section ${i + 1} from ${r.source}]\n${r.text}`)
            .join("\n\n---\n\n");

          // Notify client which resume files were used
          socket.send(
            JSON.stringify({
              type: "context",
              sources: uniqueSources,
              chunks: results.length,
            })
          );
        } catch (err) {
          fastify.log.warn({ err }, "Vector search failed, using manual resume");
          resumeContext = manualResume || "";
        }
      } else {
        // Fallback: use manually provided resume
        resumeContext = manualResume || "";
      }

      if (!resumeContext.trim()) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: isIndexLoaded()
              ? "Vector search returned no results"
              : "No resume provided and no index found. Run: npm run index",
          })
        );
        return;
      }

      const userPrompt = `RESUME_CONTEXT (most relevant sections for this question):
${resumeContext}

JOB_DESCRIPTION:
${jobDescription}

INTERVIEW QUESTION: ${question}

Answer this question fully and naturally as if you are the candidate speaking in a live interview. Do not cut off. Complete the full answer.`;

      try {
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction: SYSTEM_PROMPT,
          generationConfig: {
            temperature: 0.85,
            topP: 0.95,
            // No maxOutputTokens — unlimited streaming
          },
        });

        const streamResult = await model.generateContentStream(userPrompt);

        for await (const chunk of streamResult.stream) {
          const text = chunk.text();
          if (text && socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ type: "token", content: text }));
          }
        }

        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "done" }));
        }

        fastify.log.info("✅ Stream complete");
      } catch (err: unknown) {
        fastify.log.error({ err }, "Gemini API error");
        const message = err instanceof Error ? err.message : "Gemini stream failed";
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "error", message }));
        }
      }
    });

    socket.on("close", () => fastify.log.info("🔌 Client disconnected"));
    socket.on("error", (err: Error) => fastify.log.error({ err }, "WebSocket error"));
  });
});

// ── Health + Index Info ────────────────────────────────────────────────────
fastify.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
  indexLoaded: isIndexLoaded(),
  indexInfo: getIndexInfo(),
}));

fastify.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`\n🚀 Interview Assistant Backend v2 running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/interview`);
  console.log(`🎤 Transcribe: http://localhost:${PORT}/transcribe`);
  console.log(`❤️  Health:    http://localhost:${PORT}/health\n`);
});