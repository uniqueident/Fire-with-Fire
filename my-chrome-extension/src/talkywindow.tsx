import React from 'react'; 
import { ChatMessages, getModelNames } from './ollamawrap';
import type { ChatResponse } from './ollama';

export default function TalkyWindow() {
    const [text,setText] = React.useState('');
    const [selectedModel,setSelectedModel] = React.useState('');
    const [modelNames,setModelNames] = React.useState<string[]>([]);
  //this should be the talky.
    React.useEffect(() => {
        getModelNames().then(names => {
            setModelNames(names);
            if (names.length > 0) {
                setSelectedModel(names[0]);
            }
        });
    }, []);

    return (
    <div>
      <h3>Say Hi to Mente!</h3>
      <></>
        <input type = "text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
                    if (e.key === 'Enter') 
                    {
                        handleInput(text, selectedModel);
                        setText('')
                    }
                }
            }
        />
        <div></div>
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
function handleInput(current_text:string, selected_model:string) {
    console.log('Input to Ollama:', current_text);
    console.log('Selected Model:', selected_model);
    const response = ChatMessages(current_text, selected_model);

    response.then((output_text:ChatResponse) => {
        handleOutput(output_text);
    }).catch((err) => {
        console.error('Error handling output from Ollama:', err);
    });

}

// Output from Ollama
function handleOutput(output_text:ChatResponse) { 
    console.log('Output from Ollama:', output_text.message);
}