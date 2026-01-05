import { useState, useEffect } from 'react';
import { settingsStorage, statsStorage } from '@/lib/storage';
import type { Settings, AIProvider } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { Settings as SettingsIcon, Power, Keyboard, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasApiKey, setHasApiKey] = useState<Record<AIProvider, boolean>>({
    google: false,
    openai: false,
    anthropic: false,
  });
  const [stats, setStats] = useState({ checksPerformed: 0, errorsFound: 0, correctionsApplied: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const response = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response.success) {
        setSettings(response.settings);
        setHasApiKey(response.hasApiKey);
      }
      const loadedStats = await statsStorage.getValue();
      setStats(loadedStats);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    setLoading(false);
  }

  async function toggleEnabled() {
    const newSettings = { ...settings, enabled: !settings.enabled };
    setSettings(newSettings);
    await settingsStorage.setValue(newSettings);
  }

  async function toggleCheckMode() {
    const newMode = settings.checkMode === 'realtime' ? 'ondemand' : 'realtime';
    const newSettings = { ...settings, checkMode: newMode };
    setSettings(newSettings);
    await settingsStorage.setValue(newSettings);
  }

  function openOptions() {
    browser.runtime.openOptionsPage();
  }

  const hasAnyApiKey = hasApiKey.google || hasApiKey.openai || hasApiKey.anthropic;
  const providerName = settings.provider.charAt(0).toUpperCase() + settings.provider.slice(1);

  if (loading) {
    return (
      <div className="w-80 p-4 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="w-80 bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">✍️</span>
            <h1 className="font-semibold text-lg">TextChecker</h1>
          </div>
          <button
            onClick={openOptions}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title="Settings"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="text-blue-100 text-sm mt-1">AI-powered grammar assistant</p>
      </div>

      {/* Status */}
      <div className="p-4 border-b border-gray-100">
        {!hasAnyApiKey ? (
          <div className="flex items-start gap-3 bg-yellow-50 text-yellow-800 p-3 rounded-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Setup Required</p>
              <p className="text-sm">Add an API key to start checking grammar.</p>
              <button
                onClick={openOptions}
                className="text-sm text-yellow-900 underline mt-1"
              >
                Open Settings
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  settings.enabled ? 'bg-green-500' : 'bg-gray-300'
                }`}
              />
              <span className="font-medium">
                {settings.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>
            <span className="text-sm text-gray-500">
              Using {providerName}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      {hasAnyApiKey && (
        <div className="p-4 space-y-3">
          {/* Enable/Disable Toggle */}
          <button
            onClick={toggleEnabled}
            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
              settings.enabled
                ? 'border-green-200 bg-green-50 hover:bg-green-100'
                : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <Power className={`w-5 h-5 ${settings.enabled ? 'text-green-600' : 'text-gray-400'}`} />
              <span className={settings.enabled ? 'text-green-800' : 'text-gray-600'}>
                {settings.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div
              className={`w-10 h-6 rounded-full p-1 transition-colors ${
                settings.enabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.enabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </button>

          {/* Check Mode Toggle */}
          <button
            onClick={toggleCheckMode}
            className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              {settings.checkMode === 'realtime' ? (
                <Zap className="w-5 h-5 text-amber-500" />
              ) : (
                <Keyboard className="w-5 h-5 text-blue-500" />
              )}
              <div className="text-left">
                <div className="font-medium">
                  {settings.checkMode === 'realtime' ? 'Real-time' : 'On-demand'}
                </div>
                <div className="text-xs text-gray-500">
                  {settings.checkMode === 'realtime'
                    ? 'Checks as you type'
                    : 'Press Ctrl+Shift+G to check'}
                </div>
              </div>
            </div>
            <span className="text-xs text-gray-400">Click to switch</span>
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="p-4 bg-gray-50 border-t border-gray-100">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-semibold text-gray-900">{stats.checksPerformed}</div>
            <div className="text-xs text-gray-500">Checks</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-amber-600">{stats.errorsFound}</div>
            <div className="text-xs text-gray-500">Issues</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-green-600">{stats.correctionsApplied}</div>
            <div className="text-xs text-gray-500">Fixed</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
        <span>v1.0.0</span>
        <a
          href="https://github.com/textchecker/textchecker"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600"
        >
          Open Source
        </a>
      </div>
    </div>
  );
}
