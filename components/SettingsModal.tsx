
import React, { useState, useEffect } from 'react';
import { CloseIcon, TrashIcon, AddIcon } from './Icons';
import type { ApiSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiSettings: ApiSettings;
  setApiSettings: (settings: ApiSettings) => void;
}

const maskApiKey = (key: string) => {
    if (key.length < 10) return key;
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, apiSettings, setApiSettings }) => {
  const [localSettings, setLocalSettings] = useState<ApiSettings>(apiSettings);
  const [newApiKey, setNewApiKey] = useState('');

  useEffect(() => {
    setLocalSettings(apiSettings);
  }, [apiSettings, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSave = () => {
    setApiSettings(localSettings);
    onClose();
  };

  const handleAddKey = () => {
    if (newApiKey && !localSettings.keys.includes(newApiKey)) {
        const newKeys = [...localSettings.keys, newApiKey];
        setLocalSettings({
            keys: newKeys,
            activeKey: localSettings.activeKey ?? newApiKey,
        });
        setNewApiKey('');
    }
  };

  const handleDeleteKey = (keyToDelete: string) => {
    const newKeys = localSettings.keys.filter(k => k !== keyToDelete);
    const newActiveKey = localSettings.activeKey === keyToDelete ? (newKeys[0] || null) : localSettings.activeKey;
    setLocalSettings({
        keys: newKeys,
        activeKey: newActiveKey,
    });
  };

  const handleSetActiveKey = (key: string) => {
    setLocalSettings(prev => ({ ...prev, activeKey: key }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-lg rounded-lg shadow-xl p-6 relative animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
          <CloseIcon className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-white">Settings</h2>
        
        <div className="space-y-6">
            <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-2">
                    YouTube Data API v3 Key
                </label>
                <div className="flex gap-2">
                    <input
                    id="apiKey"
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="Enter new API key"
                    className="flex-grow w-full bg-gray-800 border border-gray-600 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                    <button onClick={handleAddKey} className="p-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"><AddIcon className="w-6 h-6"/></button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Your API keys are stored only in your browser and are required to fetch data from YouTube.</p>
            </div>

            {localSettings.keys.length > 0 && (
                <div className="space-y-2">
                     <h3 className="text-md font-semibold text-gray-200">Your Keys</h3>
                     <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                        {localSettings.keys.map(key => (
                            <div key={key} className="flex items-center justify-between bg-gray-800 p-2 rounded-md">
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="radio" 
                                        name="activeApiKey" 
                                        id={`key-${key}`} 
                                        checked={localSettings.activeKey === key}
                                        onChange={() => handleSetActiveKey(key)}
                                        className="form-radio h-4 w-4 text-gray-400 bg-gray-900 border-gray-600 focus:ring-gray-500"
                                    />
                                    <label htmlFor={`key-${key}`} className="text-sm font-mono text-gray-300">{maskApiKey(key)}</label>
                                </div>
                                <button onClick={() => handleDeleteKey(key)} className="text-gray-500 hover:text-red-400">
                                    <TrashIcon className="w-5 h-5"/>
                                </button>
                            </div>
                        ))}
                     </div>
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
                >
                Cancel
                </button>
                <button
                onClick={handleSave}
                className="px-4 py-2 bg-white text-black font-semibold rounded-md hover:bg-gray-300 transition-colors"
                >
                Save & Close
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
