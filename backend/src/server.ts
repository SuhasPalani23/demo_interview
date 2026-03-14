import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadIndex, searchResumes, isIndexLoaded, getIndexInfo } from "./vectorSearch";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY not set in .env");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || "4000", 10);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Load FAISS index at startup
const indexLoaded = loadIndex(genAI);
if (indexLoaded) {
  const info = getIndexInfo();
  console.log(`✅ Resume index ready: ${info?.totalChunks} chunks from ${info?.files.length} files`);
} else {
  console.log("⚠️  No FAISS index found. Run: npm run index");
  console.log("   Will fall back to direct resume text if provided.");
}

// ─── Human-tone system prompt ─────────────────────────────────────────────────
function buildSystemPrompt(resumeContext: string, jobDescription: string): string {
  return `You are helping someone ace a job interview by answering questions exactly as they would — in their own voice, naturally and confidently.

RESUME / BACKGROUND:
${resumeContext}

JOB DESCRIPTION:
${jobDescription}

HOW TO RESPOND:
- Answer as if YOU are the candidate speaking out loud in a real interview
- Sound like a real human talking, not an AI writing an essay
- Use natural speech patterns: start with "So...", "Yeah,", "Honestly,", "I mean,", "Right so—" where it fits
- Include natural thinking sounds and fillers sparingly: "uh", "you know", "kind of", "basically" — but don't overdo it
- Use contractions: "I've", "I'd", "that's", "it's", "we'd", "they're"
- Vary sentence length — mix short punchy sentences with longer ones
- Show genuine enthusiasm when talking about things you're proud of
- Be confident but not robotic — real humans are a little imperfect in speech
- Reference specific things from the resume naturally, like you're recalling them
- Keep answers focused: 2-4 minutes when spoken aloud (roughly 250-500 words)
- End with something that connects your experience to THIS specific role

TONE EXAMPLES:
❌ "I possess extensive experience in software development with proficiency in multiple programming languages."
✅ "So I've been doing software development for about five years now — mainly backend stuff, but I've gotten pretty comfortable with the full stack over time."

❌ "My greatest strength is my ability to collaborate effectively with cross-functional teams."
✅ "Honestly? I think it's how I work with people. Like, I genuinely enjoy the back-and-forth of figuring out a problem with a team rather than just heads-down solo work."

Speak naturally. Be real. Sound like a person.`;
}

// ─── Fastify setup ─────────────────────────────────────────────────────────────
const fastify = Fastify({
  logger: { transport: { target: "pino-pretty" } },
});

fastify.register(fastifyCors, { origin: "*" });
fastify.register(fastifyWebsocket);
fastify.register(fastifyMultipart, {
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// ─── Health check ──────────────────────────────────────────────────────────────
fastify.get("/health", async () => ({
  status: "ok",
  indexLoaded,
  indexInfo: getIndexInfo(),
}));

// ─── WebSocket interview endpoint ──────────────────────────────────────────────
fastify.register(async (fastify) => {
  fastify.get("/interview", { websocket: true }, (socket) => {
    socket.on("message", async (raw: Buffer | string) => {
      let payload: {
        jobDescription?: string;
        question?: string;
        resume?: string;
      };

      try {
        payload = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid JSON payload" }));
        return;
      }

      const { jobDescription = "", question = "", resume: fallbackResume = "" } = payload;

      if (!question.trim()) {
        socket.send(JSON.stringify({ type: "error", message: "Question is required" }));
        return;
      }

      let resumeContext = "";
      let sources: string[] = [];
      let chunks = 0;

      // Try FAISS vector search first
      if (isIndexLoaded()) {
        try {
          socket.send(JSON.stringify({ type: "searching" }));
          const results = await searchResumes(jobDescription, question, 8);
          if (results.length > 0) {
            resumeContext = results.map((r) => r.text).join("\n\n---\n\n");
            sources = [...new Set(results.map((r) => r.source))];
            chunks = results.length;
            socket.send(JSON.stringify({ type: "context", sources, chunks }));
          }
        } catch (err) {
          console.error("Vector search error:", err);
        }
      }

      // Fall back to provided resume text
      if (!resumeContext && fallbackResume.trim()) {
        resumeContext = fallbackResume.trim();
      }

      if (!resumeContext) {
        resumeContext = "No resume provided — answer based on the job description context only.";
      }

      // Build prompt and stream
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const systemPrompt = buildSystemPrompt(resumeContext, jobDescription);

      try {
        const result = await model.generateContentStream({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\nINTERVIEW QUESTION: ${question}` }],
            },
          ],
          generationConfig: {
            temperature: 1.0,
            topP: 0.95,
            maxOutputTokens: 8192,
          },
        });

        // Stream tokens as they arrive
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text && socket.readyState === 1 /* OPEN */) {
            socket.send(JSON.stringify({ type: "token", content: text }));
          }
        }

        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "done" }));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gemini API error";
        console.error("Gemini error:", err);
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "error", message: msg }));
        }
      }
    });

    socket.on("error", (err: Error) => {
      console.error("WebSocket error:", err);
    });
  });
});

// ─── Transcription endpoint ────────────────────────────────────────────────────
fastify.post("/transcribe", async (request, reply) => {
  let tempPath: string | null = null;

  try {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No audio file provided" });
    }

    const ext = path.extname(data.filename || "recording.m4a") || ".m4a";
    tempPath = path.join(os.tmpdir(), `interview_audio_${Date.now()}${ext}`);
    const buffer = await data.toBuffer();
    fs.writeFileSync(tempPath, buffer);

    const audioData = fs.readFileSync(tempPath);
    const base64Audio = audioData.toString("base64");

    // Try models in order — fall back if quota hit
    const transcriptionModels = ["gemini-2.5-flash", "gemini-2.5-pro"];
    let transcription = "";
    let lastError: Error | null = null;

    for (const modelName of transcriptionModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: "audio/mp4",
              data: base64Audio,
            },
          },
          {
            text: "Transcribe this audio recording of an interview question. Return only the transcribed text, nothing else. If the audio is unclear or empty, return an empty string.",
          },
        ]);
        transcription = result.response.text().trim();
        console.log(`✅ Transcribed with ${modelName}`);
        break;
      } catch (err) {
        const e = err as { status?: number };
        if (e.status === 429) {
          console.warn(`⚠️  ${modelName} quota hit, trying next model...`);
          lastError = err as Error;
          continue;
        }
        throw err; // non-quota error, rethrow
      }
    }

    if (!transcription && lastError) {
      throw lastError;
    }

    return reply.send({ transcription });
  } catch (err) {
    console.error("Transcription error:", err);
    const e = err as { status?: number };
    if (e.status === 429) {
      return reply.status(429).send({
        error: "Gemini quota exceeded. Check https://aistudio.google.com/ — make sure your API key is on a PAID project with billing enabled, not the free tier.",
      });
    }
    const msg = err instanceof Error ? err.message : "Transcription failed";
    return reply.status(500).send({ error: msg });
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`\n🚀 Interview Assistant backend running on port ${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}/interview`);
    console.log(`   Transcribe: http://localhost:${PORT}/transcribe`);
    console.log(`   Health:    http://localhost:${PORT}/health\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();