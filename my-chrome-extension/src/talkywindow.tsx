import React from 'react';
import { ChatMessages, getModelNames } from './ollamawrap';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function TalkyWindow() {
  const [text, setText] = React.useState('');
  const [selectedModel, setSelectedModel] = React.useState('');
  const [modelNames, setModelNames] = React.useState<string[]>([]);
  const [messages, setMessages] = React.useState<ConversationMessage[]>([]);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    getModelNames()
      .then((names) => {
        setModelNames(names);
        if (names.length > 0) {
          setSelectedModel(names[0]);
        }
      })
      .catch((err: unknown) => {
        setError(getErrorMessage(err));
      });
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = text.trim();
    if (!prompt || !selectedModel || isSending) return;

    setText('');
    setError('');
    setMessages((current) => [...current, { role: 'user', content: prompt }]);
    setIsSending(true);

    try {
      const response = await ChatMessages(prompt, selectedModel);
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response.message.content },
      ]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="chat-window" aria-label="Chat with Mente">
      <div className="chat-heading">
        <h1>Say hi to Mente</h1>
        <label className="model-picker">
          <span>Model</span>
          <select
            aria-label="AI model"
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            disabled={modelNames.length === 0 || isSending}
          >
            {modelNames.length === 0 && <option value="">No models available</option>}
            {modelNames.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chat-messages" aria-live="polite" aria-relevant="additions">
        <p className="ai-disclaimer" role="note">
          AI can make mistakes. Use caution with sensitive information and verify advice
          that could affect your safety or well-being.
        </p>
        {messages.length === 0 && (
          <p className="chat-empty">Your conversation with Mente will appear here.</p>
        )}
        {messages.map((message, index) => (
          <article className={`chat-message ${message.role}`} key={`${index}-${message.role}`}>
            <span className="message-role">{message.role === 'user' ? 'You' : 'Mente'}</span>
            <p>{message.content}</p>
          </article>
        ))}
        {isSending && <p className="chat-status" role="status">Mente is responding…</p>}
      </div>

      {error && <p className="chat-error" role="alert">{error}</p>}

      <form className="prompt-form" onSubmit={handleSubmit}>
        <label className="prompt-label" htmlFor="user-prompt">Your prompt</label>
        <textarea
          id="user-prompt"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask Mente something..."
          rows={3}
          disabled={isSending || !selectedModel}
        />
        <button type="submit" disabled={isSending || !selectedModel || !text.trim()}>
          {isSending ? 'Sending…' : 'Send prompt'}
        </button>
      </form>
    </section>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}