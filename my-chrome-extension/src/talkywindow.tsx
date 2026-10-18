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
    <div style={containerStyle}>
      <h2>Talky Window</h2>
        <input style={controlStyle} type = "text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
                    if (e.key === 'Enter') 
                    {
                        handleInput(text)
                        setText('')
                    }
                }
            }
        />
        <h3>Selected Model: {selectedModel}</h3>
        <select style={controlStyle} value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
          {modelNames.map(model => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
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

const controlStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  margin: '8px auto',
  boxSizing: 'border-box',
};

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