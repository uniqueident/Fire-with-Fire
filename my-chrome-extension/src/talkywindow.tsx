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
    <div>
      <h2>Talky Window</h2>
        <input type = "text"
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
        <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
          {modelNames.map(model => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
    </div>
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