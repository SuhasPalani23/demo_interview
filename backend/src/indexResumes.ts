/**
 * indexResumes.ts
 * Run once (or whenever your resumes change): npm run index
 *
 * Reads every file in ./resumes/ (PDF, TXT, DOCX)
 * Chunks each into ~500-word segments
 * Embeds each chunk with Gemini text-embedding-004
 * Saves FAISS index + metadata to ./data/
 */

import dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
// @ts-ignore - faiss-node types are loose
import { IndexFlatIP } from "faiss-node";
import fsExtra from "fs-extra";

// Dynamic imports for optional parsers
async function parsePdf(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require("pdf-parse");
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDocx(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

function parseTxt(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

// ─── Config ────────────────────────────────────────────────────────────────
const RESUMES_DIR = path.join(__dirname, "..", "resumes");
const DATA_DIR = path.join(__dirname, "..", "data");
const INDEX_PATH = path.join(DATA_DIR, "resumes.index");
const META_PATH = path.join(DATA_DIR, "resumes_meta.json");
const CHUNK_WORDS = 500;
const CHUNK_OVERLAP_WORDS = 80;
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM || "3072", 10);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY not set");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

// ─── Chunker ───────────────────────────────────────────────────────────────
function chunkText(text: string, sourceFile: string): Array<{ text: string; source: string; chunkIndex: number }> {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: Array<{ text: string; source: string; chunkIndex: number }> = [];
  let i = 0;
  let chunkIndex = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + CHUNK_WORDS).join(" ");
    if (slice.trim().length > 30) {
      chunks.push({ text: slice, source: path.basename(sourceFile), chunkIndex });
      chunkIndex++;
    }
    i += CHUNK_WORDS - CHUNK_OVERLAP_WORDS;
  }
  return chunks;
}

// ─── Embedder ──────────────────────────────────────────────────────────────
async function embedText(text: string): Promise<number[]> {
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values;
}

// Rate limit helper - Gemini free tier allows ~1500 req/min but batch carefully
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  await fsExtra.ensureDir(RESUMES_DIR);
  await fsExtra.ensureDir(DATA_DIR);

  const files = fs.readdirSync(RESUMES_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return [".pdf", ".txt", ".docx", ".md"].includes(ext);
  });

  if (files.length === 0) {
    console.error(`❌ No resume files found in ${RESUMES_DIR}`);
    console.log("   Add .pdf, .txt, or .docx files to the resumes/ folder and run again.");
    process.exit(1);
  }

  console.log(`📂 Found ${files.length} resume files: ${files.join(", ")}`);

  // ── Parse all files ──
  const allChunks: Array<{ text: string; source: string; chunkIndex: number }> = [];

  for (const file of files) {
    const filePath = path.join(RESUMES_DIR, file);
    const ext = path.extname(file).toLowerCase();
    let text = "";

    try {
      if (ext === ".pdf") text = await parsePdf(filePath);
      else if (ext === ".docx") text = await parseDocx(filePath);
      else text = parseTxt(filePath);

      const chunks = chunkText(text, file);
      console.log(`  ✅ ${file} → ${chunks.length} chunks`);
      allChunks.push(...chunks);
    } catch (err) {
      console.error(`  ⚠️  Failed to parse ${file}:`, err);
    }
  }

  console.log(`\n📊 Total chunks to embed: ${allChunks.length}`);

  // ── Embed all chunks ──
  const vectors: number[][] = [];
  console.log("🔢 Embedding chunks (this may take a minute)...");

  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    try {
      const vec = await embedText(chunk.text);
      vectors.push(vec);
      process.stdout.write(`\r   ${i + 1}/${allChunks.length} embedded`);
      // Small delay to avoid rate limiting
      if ((i + 1) % 10 === 0) await sleep(500);
    } catch (err) {
      console.error(`\n  ⚠️  Failed to embed chunk ${i}:`, err);
      // Push zero vector as placeholder to keep indices aligned
      vectors.push(new Array(EMBEDDING_DIM).fill(0));
    }
  }
  console.log("\n");

  if (vectors.length === 0) {
    console.error("❌ No vectors generated");
    process.exit(1);
  }

  // Verify all vectors have the correct dimension
  const actualDim = vectors.find((v) => v.length > 0)?.length || EMBEDDING_DIM;
  if (actualDim !== EMBEDDING_DIM) {
    console.log(`ℹ️  Detected embedding dimension: ${actualDim} (updating config)`);
  }

  // ── Build FAISS index ──
  console.log(`🗄️  Building FAISS IndexFlatIP (dim=${actualDim}, vectors=${vectors.length})...`);
  const index = new IndexFlatIP(actualDim);

  // Normalize each vector for cosine similarity, add one at a time
  for (const vec of vectors) {
    const norm = Math.sqrt(vec.reduce((sum: number, v: number) => sum + v * v, 0));
    const normalized = norm > 0 ? vec.map((v: number) => v / norm) : vec;
    // faiss-node add() takes a single flat number[]
    index.add(normalized);
  }
  index.write(INDEX_PATH);

  // ── Save metadata ──
  const meta = {
    dim: actualDim,
    totalChunks: allChunks.length,
    files,
    chunks: allChunks.map((c, i) => ({
      id: i,
      source: c.source,
      chunkIndex: c.chunkIndex,
      preview: c.text.slice(0, 100),
      text: c.text,
    })),
    indexedAt: new Date().toISOString(),
  };

  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));

  console.log(`✅ FAISS index saved → ${INDEX_PATH}`);
  console.log(`✅ Metadata saved   → ${META_PATH}`);
  console.log(`\n🎉 Indexing complete! ${allChunks.length} chunks from ${files.length} resumes.`);
  console.log(`   Start your backend and the index will be loaded automatically.\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});