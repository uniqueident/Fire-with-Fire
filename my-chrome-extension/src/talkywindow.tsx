import React from 'react';
import menteLogo from './assets/Mente Logo.png';
import { chat } from './ollama';
import { getModelNames } from './ollamawrap';

const greetings = [
    'Ready to learn?',
    'What are we studying today?',
    'it\'s thinking time!',
    'Come do a thinker with a stinker!',
    'What\'s on your mind?',
    'Consider the following:',
    'How can I help?',
    'let\'s brainstorm.'
];

export default function TalkyWindow() {
    const [greeting] = React.useState(() => greetings[Math.floor(Math.random() * greetings.length)]);
    const [text, setText] = React.useState('');
    const [selectedModel, setSelectedModel] = React.useState('');
    const [modelNames, setModelNames] = React.useState<string[]>([]);
    const [response, setResponse] = React.useState('');
    const [error, setError] = React.useState('');
    const [isResponding, setIsResponding] = React.useState(false);

    React.useEffect(() => {
        getModelNames().then(setModelNames);
    }, []);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const prompt = text.trim();
        if (!prompt || !selectedModel || isResponding) return;

        setText('');
        setResponse('');
        setError('');
        setIsResponding(true);

        try {
            const result = await chat({
                model: selectedModel,
                messages: [{ role: 'user', content: prompt }],
            });
            setResponse(result.message.content);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get a response from Ollama.');
        } finally {
            setIsResponding(false);
        }
    }

    return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h2 style={headingStyle}>{greeting}</h2>
        <img src={menteLogo} alt="Mente logo" style={logoStyle} />
      </header>
        <form onSubmit={handleSubmit}>
          <label htmlFor="talky-prompt">Your message</label>
          <input
            id="talky-prompt"
            style={controlStyle}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            style={controlStyle}
            type="submit"
            disabled={!text.trim() || !selectedModel || isResponding}
          >
            {isResponding ? 'Thinking…' : 'Send'}
          </button>
        </form>
        <h3>Selected Model: {selectedModel}</h3>
        <select
          style={controlStyle}
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          aria-label="Select AI model"
        >
          <option value="">Select a model</option>
          {modelNames.map(model => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        {isResponding && <p role="status">Waiting for a response…</p>}
        {error && <p role="alert">{error}</p>}
        {response && (
          <section aria-live="polite" style={responseStyle}>
            <h3>AI Response</h3>
            <p style={responseTextStyle}>{response}</p>
          </section>
        )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  width: '300px',
  margin: '0 auto',
  padding: '16px',
  textAlign: 'center',
  boxSizing: 'border-box',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  marginBottom: '16px',
};

const headingStyle: React.CSSProperties = {
  flex: 1,
  margin: 0,
  fontSize: '18px',
};

const logoStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  objectFit: 'contain',
};

const controlStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  margin: '8px auto',
  boxSizing: 'border-box',
};

const responseStyle: React.CSSProperties = {
  marginTop: '16px',
  textAlign: 'left',
};

const responseTextStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};