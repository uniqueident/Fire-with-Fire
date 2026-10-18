// Ollama API stubs — https://github.com/ollama/ollama/blob/main/docs/api.md
// All requests target the default local Ollama server.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OLLAMA_BASE = 'http://localhost:11434';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64-encoded images (multimodal models)
}

export interface OllamaOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_predict?: number;
  stop?: string[];
  [key: string]: unknown;
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  images?: string[];      // base64 for multimodal
  stream?: boolean;       // default true in Ollama; set false for one-shot
  options?: OllamaOptions;
}

export interface GenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason?: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface ChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: OllamaOptions;
}

export interface ChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface EmbeddingsRequest {
  model: string;
  prompt: string;
  options?: OllamaOptions;
}

export interface EmbeddingsResponse {
  embedding: number[];
}

export interface ModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface ListModelsResponse {
  models: ModelInfo[];
}

export interface ShowModelResponse {
  license?: string;
  modelfile?: string;
  parameters?: string;
  template?: string;
  details: ModelInfo['details'];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST a JSON body and return the parsed response. */
async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${OLLAMA_BASE}${path}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Ollama ${path} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}



// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Single-turn completion (streaming). */
export async function generate(req: GenerateRequest): Promise<GenerateResponse> {
  return postJSON<GenerateResponse>('/api/generate', { ...req, stream: false });
}

/** Multi-turn chat completion. */
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  return postJSON<ChatResponse>('/api/chat', { ...req, stream: false });
}

/** Generate an embedding vector for similarity search. */
export async function embeddings(req: EmbeddingsRequest): Promise<EmbeddingsResponse> {
  return postJSON<EmbeddingsResponse>('/api/embeddings', req);
}

/** List all models available locally. */
export async function listModels(): Promise<ListModelsResponse> {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`);

  if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<ListModelsResponse>;
}

/** Show metadata/details for a specific model. */
export async function showModel(model: string): Promise<ShowModelResponse> {
  return postJSON<ShowModelResponse>('/api/show', { model });
}