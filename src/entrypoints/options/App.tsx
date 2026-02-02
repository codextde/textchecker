import { useState, useEffect } from 'react';
import { settingsStorage, apiKeysStorage, dictionaryStorage, statsStorage } from '@/lib/storage';
import type { Settings, APIKeys, AIProvider } from '@/types';
import { DEFAULT_SETTINGS, AVAILABLE_MODELS, SUPPORTED_LANGUAGES } from '@/types';
import { Key, Settings as SettingsIcon, Book, BarChart3, Eye, EyeOff, Trash2, Save, CheckCircle } from 'lucide-react';

type TabType = 'api-keys' | 'settings' | 'dictionary' | 'stats';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('api-keys');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [apiKeys, setApiKeys] = useState<APIKeys>({});
  const [dictionary, setDictionary] = useState<string[]>([]);
  const [stats, setStats] = useState({ checksPerformed: 0, errorsFound: 0, correctionsApplied: 0 });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [loadedSettings, loadedKeys, loadedDictionary, loadedStats] = await Promise.all([
      settingsStorage.getValue(),
      apiKeysStorage.getValue(),
      dictionaryStorage.getValue(),
      statsStorage.getValue(),
    ]);
    setSettings(loadedSettings);
    setApiKeys(loadedKeys);
    setDictionary(loadedDictionary);
    setStats(loadedStats);
  }

  async function saveSettings(newSettings: Settings) {
    setSettings(newSettings);
    setSaveStatus('saving');
    await settingsStorage.setValue(newSettings);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  }

  async function saveApiKey(provider: AIProvider, key: string) {
    const newKeys = { ...apiKeys, [provider]: key };
    setApiKeys(newKeys);
    setSaveStatus('saving');
    await apiKeysStorage.setValue(newKeys);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  }

  async function removeFromDictionary(word: string) {
    const newDictionary = dictionary.filter((w) => w !== word);
    setDictionary(newDictionary);
    await dictionaryStorage.setValue(newDictionary);
  }

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'api-keys', label: 'API Keys', icon: <Key className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="w-4 h-4" /> },
    { id: 'dictionary', label: 'Dictionary', icon: <Book className="w-4 h-4" /> },
    { id: 'stats', label: 'Statistics', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <span className="text-2xl">✍️</span>
            TextChecker Settings
          </h1>
          <p className="text-gray-600 mt-2">
            Configure your AI-powered grammar assistant
          </p>
        </header>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
           {/* Tab navigation */}
           <div className="border-b border-gray-200">
             <nav className="flex flex-col sm:flex-row gap-1 p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                   className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors w-full sm:w-auto ${
                     activeTab === tab.id
                       ? 'bg-blue-100 text-blue-700'
                       : 'text-gray-600 hover:bg-gray-100'
                   }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          <div className="p-6">
            {activeTab === 'api-keys' && (
              <APIKeysTab
                apiKeys={apiKeys}
                showKeys={showKeys}
                setShowKeys={setShowKeys}
                saveApiKey={saveApiKey}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsTab settings={settings} saveSettings={saveSettings} apiKeys={apiKeys} />
            )}
            {activeTab === 'dictionary' && (
              <DictionaryTab dictionary={dictionary} removeFromDictionary={removeFromDictionary} />
            )}
            {activeTab === 'stats' && <StatsTab stats={stats} />}
          </div>
        </div>

        {/* Save status indicator */}
        {saveStatus !== 'idle' && (
          <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-lg shadow-lg">
            {saveStatus === 'saving' ? (
              <>
                <Save className="w-4 h-4 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Saved!
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function APIKeysTab({
  apiKeys,
  showKeys,
  setShowKeys,
  saveApiKey,
}: {
  apiKeys: APIKeys;
  showKeys: Record<string, boolean>;
  setShowKeys: (keys: Record<string, boolean>) => void;
  saveApiKey: (provider: AIProvider, key: string) => void;
}) {
  const providers: { id: AIProvider; name: string; url: string }[] = [
    { id: 'google', name: 'Google AI (Gemini)', url: 'https://aistudio.google.com/apikey' },
    { id: 'openai', name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
    { id: 'anthropic', name: 'Anthropic (Claude)', url: 'https://console.anthropic.com/settings/keys' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">How to get API keys</h3>
        <p className="text-sm text-blue-800">
          You need at least one API key to use TextChecker. Your keys are stored securely in your browser
          and synced across your devices. They are never sent to any server except the AI provider.
        </p>
      </div>

      {providers.map((provider) => (
        <div key={provider.id} className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="font-medium text-gray-900">{provider.name}</label>
            <a
              href={provider.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              Get API key &rarr;
            </a>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKeys[provider.id] ? 'text' : 'password'}
                value={apiKeys[provider.id] || ''}
                onChange={(e) => saveApiKey(provider.id, e.target.value)}
                placeholder={`Enter your ${provider.name} API key`}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowKeys({ ...showKeys, [provider.id]: !showKeys[provider.id] })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showKeys[provider.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {apiKeys[provider.id] && (
            <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              API key configured
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function SettingsTab({
  settings,
  saveSettings,
  apiKeys,
}: {
  settings: Settings;
  saveSettings: (settings: Settings) => void;
  apiKeys: APIKeys;
}) {
  const providers: AIProvider[] = ['google', 'openai', 'anthropic'];
  const availableProviders = providers.filter((p) => apiKeys[p]);

  return (
    <div className="space-y-6">
      {availableProviders.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">
            Please add at least one API key in the "API Keys" tab to use TextChecker.
          </p>
        </div>
      )}

      <div>
        <label className="block font-medium text-gray-900 mb-2">AI Provider</label>
        <select
          value={settings.provider}
          onChange={(e) => {
            const provider = e.target.value as AIProvider;
            const defaultModel = AVAILABLE_MODELS[provider][0].id;
            saveSettings({ ...settings, provider, model: defaultModel });
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {providers.map((p) => (
            <option key={p} value={p} disabled={!apiKeys[p]}>
              {p.charAt(0).toUpperCase() + p.slice(1)} {!apiKeys[p] && '(no API key)'}
            </option>
          ))}
        </select>
      </div>

       <div>
         <label className="block font-medium text-gray-900 mb-2">Model</label>
         <select
           value={settings.model}
           onChange={(e) => {
             const model = e.target.value;
             if (model === 'custom') {
               saveSettings({ ...settings, model: 'custom' });
             } else {
               saveSettings({ ...settings, model, customModel: undefined });
             }
           }}
           className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
         >
           {AVAILABLE_MODELS[settings.provider].map((model) => (
             <option key={model.id} value={model.id}>
               {model.name}
             </option>
           ))}
           <option value="custom">Use custom model...</option>
         </select>
       </div>

       {settings.model === 'custom' && (
         <div className="mt-3">
           <label className="block font-medium text-gray-900 mb-2">Custom Model ID</label>
           <input
             type="text"
             value={settings.customModel || ''}
             onChange={(e) => saveSettings({ ...settings, customModel: e.target.value })}
             placeholder="e.g., gpt-4-turbo-preview"
             className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
           />
           <p className="text-sm text-gray-500 mt-1">
             Enter the exact model ID from your AI provider
           </p>
         </div>
       )}

      <div>
        <label className="block font-medium text-gray-900 mb-2">Check Mode</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="checkMode"
              value="realtime"
              checked={settings.checkMode === 'realtime'}
              onChange={() => saveSettings({ ...settings, checkMode: 'realtime' })}
              className="w-4 h-4 text-blue-600"
            />
            <span>Real-time (check as you type)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="checkMode"
              value="ondemand"
              checked={settings.checkMode === 'ondemand'}
              onChange={() => saveSettings({ ...settings, checkMode: 'ondemand' })}
              className="w-4 h-4 text-blue-600"
            />
            <span>On-demand (Ctrl/Cmd + Shift + G)</span>
          </label>
        </div>
      </div>

      {settings.checkMode === 'realtime' && (
        <div>
          <label className="block font-medium text-gray-900 mb-2">
            Delay before checking (ms): {settings.realtimeDelay}
          </label>
          <input
            type="range"
            min="200"
            max="2000"
            step="100"
            value={settings.realtimeDelay}
            onChange={(e) => saveSettings({ ...settings, realtimeDelay: Number(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-sm text-gray-500">
            <span>200ms (faster)</span>
            <span>2000ms (less API calls)</span>
          </div>
        </div>
      )}

      <div>
        <label className="block font-medium text-gray-900 mb-2">Language</label>
        <select
          value={settings.language}
          onChange={(e) => saveSettings({ ...settings, language: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => saveSettings({ ...settings, enabled: e.target.checked })}
            className="w-4 h-4 text-blue-600 rounded"
          />
          <span className="font-medium text-gray-900">Enable TextChecker</span>
        </label>
        <p className="text-sm text-gray-500 mt-1">
          When disabled, TextChecker won't check any text fields.
        </p>
      </div>
    </div>
  );
}

function DictionaryTab({
  dictionary,
  removeFromDictionary,
}: {
  dictionary: string[];
  removeFromDictionary: (word: string) => void;
}) {
  return (
    <div>
      <p className="text-gray-600 mb-4">
        Words in your personal dictionary will not be flagged as spelling errors.
        Click the trash icon to remove a word.
      </p>

      {dictionary.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Book className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Your dictionary is empty.</p>
          <p className="text-sm">Add words by clicking "Add to dictionary" on spelling suggestions.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {dictionary.sort().map((word) => (
            <div
              key={word}
              className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full"
            >
              <span>{word}</span>
              <button
                onClick={() => removeFromDictionary(word)}
                className="text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsTab({ stats }: { stats: { checksPerformed: number; errorsFound: number; correctionsApplied: number } }) {
   return (
     <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <div className="bg-blue-50 rounded-lg p-6 text-center">
        <div className="text-3xl font-bold text-blue-600">{stats.checksPerformed}</div>
        <div className="text-sm text-blue-800 mt-1">Checks Performed</div>
      </div>
      <div className="bg-amber-50 rounded-lg p-6 text-center">
        <div className="text-3xl font-bold text-amber-600">{stats.errorsFound}</div>
        <div className="text-sm text-amber-800 mt-1">Issues Found</div>
      </div>
      <div className="bg-green-50 rounded-lg p-6 text-center">
        <div className="text-3xl font-bold text-green-600">{stats.correctionsApplied}</div>
        <div className="text-sm text-green-800 mt-1">Corrections Applied</div>
      </div>
    </div>
  );
}
