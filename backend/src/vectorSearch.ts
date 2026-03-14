/**
 * vectorSearch.ts
 * Loads the FAISS index + metadata at startup.
 * Exports searchResumes(jd, question, topK) → relevant resume chunks.
 */

import * as fs from "fs";
import * as path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
// @ts-ignore
import { IndexFlatIP } from "faiss-node";

const DATA_DIR = path.join(__dirname, "..", "data");
const INDEX_PATH = path.join(DATA_DIR, "resumes.index");
const META_PATH = path.join(DATA_DIR, "resumes_meta.json");

interface ChunkMeta {
  id: number;
  source: string;
  chunkIndex: number;
  preview: string;
  text: string;
}

interface ResumeIndex {
  dim: number;
  totalChunks: number;
  files: string[];
  chunks: ChunkMeta[];
  indexedAt: string;
}

let faissIndex: InstanceType<typeof IndexFlatIP> | null = null;
let meta: ResumeIndex | null = null;
let embeddingModel: ReturnType<InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]> | null = null;

export function isIndexLoaded(): boolean {
  return faissIndex !== null && meta !== null;
}

export function loadIndex(genAI: GoogleGenerativeAI): boolean {
  if (!fs.existsSync(INDEX_PATH) || !fs.existsSync(META_PATH)) {
    return false;
  }

  try {
    meta = JSON.parse(fs.readFileSync(META_PATH, "utf-8")) as ResumeIndex;
    faissIndex = IndexFlatIP.read(INDEX_PATH);
    embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    console.log(`📚 FAISS index loaded: ${meta.totalChunks} chunks from ${meta.files.length} resumes`);
    console.log(`   Files: ${meta.files.join(", ")}`);
    return true;
  } catch (err) {
    console.error("⚠️  Failed to load FAISS index:", err);
    return false;
  }
}

async function embedQuery(text: string): Promise<number[]> {
  if (!embeddingModel) throw new Error("Embedding model not initialized");
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values;
}

function normalizeVec(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? vec.map((v) => v / norm) : vec;
}

export interface SearchResult {
  text: string;
  source: string;
  score: number;
}

/**
 * Search the FAISS index for resume chunks most relevant to the JD + question.
 * Returns deduplicated top-K chunks ranked by similarity.
 */
export async function searchResumes(
  jobDescription: string,
  question: string,
  topK: number = 8
): Promise<SearchResult[]> {
  if (!faissIndex || !meta) {
    throw new Error("FAISS index not loaded. Run: npm run index");
  }

  // Combine JD + question for richer query signal
  const queryText = `Job Description: ${jobDescription.slice(0, 1000)}\n\nInterview Question: ${question}`;
  const rawVec = await embedQuery(queryText);
  const queryVec = normalizeVec(rawVec);

  const k = Math.min(topK, meta.totalChunks);
  // faiss-node: search(queryVec, k) — vector first, k second
  const searchResult = faissIndex.search(queryVec, k);

  const results: SearchResult[] = [];
  const seenSources = new Map<string, number>(); // source → count, to diversify results

  for (let i = 0; i < searchResult.labels.length; i++) {
    const id = searchResult.labels[i];
    const score = searchResult.distances[i];

    if (id < 0 || id >= meta.chunks.length) continue;

    const chunk = meta.chunks[id];
    const sourceCount = seenSources.get(chunk.source) || 0;

    // Allow max 4 chunks per resume file to ensure diversity across resumes
    if (sourceCount >= 4) continue;

    seenSources.set(chunk.source, sourceCount + 1);
    results.push({ text: chunk.text, source: chunk.source, score });
  }

  return results;
}

export function getIndexInfo(): { files: string[]; totalChunks: number; indexedAt: string } | null {
  if (!meta) return null;
  return { files: meta.files, totalChunks: meta.totalChunks, indexedAt: meta.indexedAt };
}