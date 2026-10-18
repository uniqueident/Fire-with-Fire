import { listModels, chat, type ChatRequest, type ChatResponse, type OllamaMessage } from './ollama';

const chat_history = new Map<string, OllamaMessage[]>();

/** Returns just the model names available locally, for user selection. */
export async function getModelNames(): Promise<string[]> {
  try {
    const data = await listModels();
    //Map turns the array of ModelInfo interfaces into an array of the model names.
    return data.models.map(m => m.name);
  } catch (err) {
    console.log('Error fetching model names from Ollama:', err);
    return ['Failed to get model names from Ollama:'];
  }
}

/** Multi-turn chat (streaming) text. */

export async function ChatMessages(user_message: string, selected_model: string): Promise<ChatResponse> {  
  //quick comments for readability: ...expands something like an array out into its elements, so we can append something else on.
  //the ?? basically just returns the right side if the left is null or undef.
  //So this is an array of all of the messages of the model previously plus the new input, which is the full context sent to Ollama for processing.
  const current_messages: OllamaMessage[] = [
    ...chat_history.get(selected_model) ?? [],
    { role: 'user', content: user_message }
  ];

  try {
    const response:ChatResponse = await chat({model: selected_model, messages: current_messages});
    //Only needed response to be added before saving, since we added user input earlier.
    //its also in the try catch in case Ollama fails over, we dont mess up our chat history, or cause any other problems.
    chat_history.set(selected_model, [...current_messages, response.message]);
    return response;
  } catch (err) {
    console.error('Error sending chat message to Ollama:', err);
    throw err;
  }
}