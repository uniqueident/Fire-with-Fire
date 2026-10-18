import React from 'react'; 
import { getModelNames } from './ollamawrap';
export default function TalkyWindow() {
    const [text,setText] = React.useState('');
    const [selectedModel,setSelectedModel] = React.useState('');
    const [modelNames,setModelNames] = React.useState<string[]>([]);

    React.useEffect(() => {
        getModelNames().then(setModelNames);
    }, []);
    return (
    <main className="talky-panel">
      <header className="talky-header">
        <h2 className="talky-title">Talky Window</h2>
      </header>
      <div className="talky-fields">
        <label className="talky-field">
          <span className="talky-label">Message</span>
          <input
            className="talky-control"
            type="text"
            value={text}
            placeholder="Type a message..."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleInput(text);
                setText('');
              }
            }}
          />
        </label>
        <label className="talky-field">
          <span className="talky-label">Selected model</span>
          <select
            className="talky-control"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option value="" disabled>
              Choose a model
            </option>
          {modelNames.map(model => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
          </select>
        </label>
      </div>
    </main>
  );
}

// Input to Ollama
function handleInput(current_text:string) {
    console.log('Input to Ollama:', current_text);
}
/*
// Output from Ollama
function handleOutput(output_text:string) { 
    console.log('Output from Ollama:', output_text);
}
    */