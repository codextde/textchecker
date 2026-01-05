# TextChecker - AI-Powered Grammar Assistant

An open-source Chrome extension that provides grammar, spelling, and style checking using AI models. A free alternative to LanguageTool, powered by your own API keys.

## Features

- **Multi-provider AI support**: Google Gemini, OpenAI GPT, and Anthropic Claude
- **Real-time checking**: Grammar checked as you type (configurable)
- **On-demand checking**: Use keyboard shortcut (Ctrl/Cmd + Shift + G)
- **Inline suggestions**: Underlines errors with click-to-fix popovers
- **Personal dictionary**: Add words to ignore
- **Statistics tracking**: Track your writing improvements
- **Privacy-first**: Your API keys are stored locally and synced via Chrome, never sent to third-party servers

## Supported Checks

- Spelling errors
- Grammar mistakes
- Punctuation issues
- Style improvements

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/textchecker.git
   cd textchecker
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build the extension:
   ```bash
   pnpm build
   ```

4. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `.output/chrome-mv3` folder

## Configuration

1. Click the TextChecker icon in your browser toolbar
2. Click the settings icon to open the options page
3. Add your API key for at least one provider:
   - [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)
   - [OpenAI Platform](https://platform.openai.com/api-keys)
   - [Anthropic Console](https://console.anthropic.com/settings/keys)
4. Choose your preferred provider and model
5. Select check mode (real-time or on-demand)

## Development

```bash
# Start development server with hot reload
pnpm dev

# Build for production
pnpm build

# Build for Firefox
pnpm build:firefox

# Create distribution zip
pnpm zip
```

## Tech Stack

- [WXT](https://wxt.dev/) - Chrome Extension Framework
- [React](https://react.dev/) - UI Library
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Vercel AI SDK](https://ai-sdk.dev/) - Multi-provider AI Integration
- TypeScript - Type Safety

## Supported Languages

TextChecker supports grammar checking in multiple languages including:
- English
- German
- Spanish
- French
- Portuguese
- And many more (auto-detected)

## Privacy

- Your API keys are stored in Chrome's sync storage and are never sent anywhere except directly to the AI provider you choose
- Text is only sent to the AI provider when checking grammar
- No analytics or tracking
- Fully open source - audit the code yourself

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by [LanguageTool](https://languagetool.org/)
- Built with [WXT](https://wxt.dev/)
- Powered by [Vercel AI SDK](https://ai-sdk.dev/)
