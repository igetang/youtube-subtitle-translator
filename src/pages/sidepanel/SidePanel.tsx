import React, { useState, useEffect } from 'react';
// Assuming types might be defined elsewhere or simplified for now
// import { OpenAIModel } from '../../types';
import './SidePanel.css'; // Assuming some CSS exists

// Define a simple enum/type for models if not imported
enum OpenAIModel {
  GPT3_5_TURBO = 'gpt-3.5-turbo',
  GPT4 = 'gpt-4',
  // Add other relevant models if needed
}

const SidePanel: React.FC = () => {
  // Default to gpt-3.5-turbo, or load from storage
  const [selectedModel, setSelectedModel] = useState<OpenAIModel>(OpenAIModel.GPT3_5_TURBO);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Added loading state

  // Load saved model from storage on component mount
  useEffect(() => {
    setIsLoading(true);
    chrome.storage.sync.get(['openaiModel'], (result) => {
      if (result.openaiModel && Object.values(OpenAIModel).includes(result.openaiModel)) {
        setSelectedModel(result.openaiModel as OpenAIModel);
      }
      // If no model saved or invalid, default is already set via useState
      setIsLoading(false); // Finish loading
    });
  }, []);

  /**
   * 处理 OpenAI 模型更改事件的回调函数。
   * Saves the selected model to chrome.storage.sync.
   *
   * @param {React.ChangeEvent<HTMLSelectElement>} event - The change event object from the select element.
   */
  const handleOpenAIModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = event.target.value as OpenAIModel;
    setSelectedModel(newModel);
    chrome.storage.sync.set({ openaiModel: newModel }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving OpenAI Model:', chrome.runtime.lastError);
      } else {
        console.log('OpenAI Model saved:', newModel); // Log successful save
      }
    });
  };

  if (isLoading) {
    return <div className="sidepanel-container">加载中...</div>; // Show loading indicator
  }

  return (
    <div className="sidepanel-container">
      <h2>设置</h2>
      <div className="setting-item">
        <label htmlFor="openai-model-select">选择 OpenAI 模型:</label>
        <select
          id="openai-model-select"
          value={selectedModel}
          onChange={handleOpenAIModelChange}
          disabled={isLoading} // Disable while loading
        >
          {/* Iterate over enum values to create options */}
          {Object.values(OpenAIModel).map((model) => (
            <option key={model} value={model}>
              {model} {/* Display model name */}
            </option>
          ))}
        </select>
      </div>
      {/* Future settings can be added here */}
    </div>
  );
};

export default SidePanel; 