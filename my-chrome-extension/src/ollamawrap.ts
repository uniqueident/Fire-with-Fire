import { listModels } from './ollama';

/** Returns just the model names available locally, for user selection. */
export async function getModelNames(): Promise<string[]> {
  try {
    const data = await listModels();
    return data.models.map(m => m.name);
  } catch (err) {
    console.error('Failed to get model names from Ollama:', err);
    return [];
  }
}