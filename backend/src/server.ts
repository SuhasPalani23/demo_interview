import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = parseInt(process.env.PORT || "4000", 10);

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not set in .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are acting as ME during a live job interview.
Your job is to answer questions exactly as I would using:
1. My resume
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

BEHAVIORAL QUESTIONS:
- Follow the STAR framework internally (Situation, Task, Action, Result)
- But do NOT explicitly mention STAR.

TECHNICAL QUESTIONS:
- Explain clearly but practically: Concept → Example → Tradeoffs

SYSTEM DESIGN QUESTIONS:
- Focus on: scalability, reliability, maintainability, tradeoffs

ANSWER LENGTH:
- Simple questions: 2–3 sentences
- Technical questions: 4–6 sentences
- Behavioral: short storytelling

SPEECH OPTIMIZATION:
- Answers will later be converted to speech.
- Use natural spoken sentences.`;

interface InterviewMessage {
  resume: string;
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

fastify.register(fastifyCors, {
  origin: "*",
  methods: ["GET", "POST"],
});

fastify.register(fastifyWebsocket);

fastify.register(async function (fastify) {
  fastify.get("/interview", { websocket: true }, async (socket, req) => {
    fastify.log.info("🔌 Client connected");

    socket.on("message", async (rawMessage: Buffer | string) => {
      let parsed: InterviewMessage;

      try {
        parsed = JSON.parse(rawMessage.toString());
      } catch {
        socket.send(
          JSON.stringify({ type: "error", message: "Invalid JSON payload" })
        );
        return;
      }

      const { resume, jobDescription, question } = parsed;

      if (!resume || !jobDescription || !question) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Missing resume, jobDescription, or question",
          })
        );
        return;
      }

      fastify.log.info(`📨 Question received: "${question.slice(0, 80)}..."`);

      const userPrompt = `RESUME_CONTEXT:
${resume}

JOB_DESCRIPTION:
${jobDescription}

QUESTION: ${question}`;

      try {
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction: SYSTEM_PROMPT,
          generationConfig: {
            temperature: 0.8,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        });

        const streamResult = await model.generateContentStream(userPrompt);

        for await (const chunk of streamResult.stream) {
          const text = chunk.text();
          if (text) {
            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify({ type: "token", content: text }));
            }
          }
        }

        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "done" }));
        }

        fastify.log.info("✅ Stream complete");
      } catch (err: unknown) {
        fastify.log.error({ err }, "Gemini API error");
        const message =
          err instanceof Error ? err.message : "Gemini stream failed";
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "error", message }));
        }
      }
    });

    socket.on("close", () => {
      fastify.log.info("🔌 Client disconnected");
    });

    socket.on("error", (err: Error) => {
      fastify.log.error({ err }, "WebSocket error");
    });
  });
});

fastify.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

fastify.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`\n🚀 Interview Assistant Backend running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/interview`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health\n`);
});
