import { settingsStorage } from '@/lib/storage';
import { debounce, isEditableElement, getTextFromElement, setTextInElement, getSuggestionColor, getSuggestionLabel } from '@/lib/utils';
import type { GrammarSuggestion, GrammarCheckResult, Settings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true, // Enable for iframes
  runAt: 'document_idle',

  async main(ctx) {
    console.log('TextChecker content script loaded', window.location.href);

    let settings: Settings = DEFAULT_SETTINGS;
    let currentSuggestions: GrammarSuggestion[] = [];
    let activeElement: HTMLElement | null = null;
    let overlayContainer: HTMLDivElement | null = null;
    let popoverElement: HTMLDivElement | null = null;
    let isChecking = false;
    let unwatchSettings: (() => void) | null = null;

    // Load initial settings
    try {
      settings = await settingsStorage.getValue();
    } catch (error) {
      console.error('Failed to load settings:', error);
    }

    // Watch for settings changes
    try {
      unwatchSettings = settingsStorage.watch((newSettings) => {
        if (newSettings) {
          settings = newSettings;
          if (!settings.enabled) {
            cleanup();
          }
        }
      });
    } catch (error) {
      console.error('Failed to watch settings:', error);
    }

    // Create Shadow DOM container for isolated styles
    function createOverlayContainer(): HTMLDivElement {
      if (overlayContainer && document.body.contains(overlayContainer)) {
        return overlayContainer;
      }

      overlayContainer = document.createElement('div');
      overlayContainer.id = 'textchecker-overlay';
      overlayContainer.style.cssText = 'position: absolute; top: 0; left: 0; pointer-events: none; z-index: 2147483647;';

      const shadow = overlayContainer.attachShadow({ mode: 'open' });

      // Add styles to shadow DOM
      const style = document.createElement('style');
      style.textContent = `
        * {
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .tc-underline {
          position: fixed;
          height: 3px;
          border-radius: 1px;
          pointer-events: auto;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .tc-underline:hover {
          opacity: 0.8;
        }

        .tc-popover {
          position: fixed;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
          padding: 12px;
          min-width: 280px;
          max-width: 400px;
          z-index: 2147483647;
          pointer-events: auto;
          animation: tc-fadeIn 0.15s ease-out;
        }

        @keyframes tc-fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .tc-popover-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          flex-wrap: wrap;
        }

        .tc-badge {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 4px;
          color: white;
        }

        .tc-original {
          color: #dc2626;
          text-decoration: line-through;
          font-size: 14px;
        }

        .tc-arrow {
          color: #9ca3af;
          font-size: 14px;
        }

        .tc-replacement {
          color: #16a34a;
          font-weight: 500;
          font-size: 14px;
        }

        .tc-explanation {
          color: #6b7280;
          font-size: 13px;
          margin-top: 8px;
          line-height: 1.4;
        }

        .tc-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .tc-btn {
          flex: 1;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.15s;
        }

        .tc-btn-primary {
          background: #2563eb;
          color: white;
        }

        .tc-btn-primary:hover {
          background: #1d4ed8;
        }

        .tc-btn-secondary {
          background: #f3f4f6;
          color: #374151;
        }

        .tc-btn-secondary:hover {
          background: #e5e7eb;
        }

        .tc-btn-text {
          background: none;
          color: #6b7280;
          padding: 8px;
          flex: 0;
        }

        .tc-btn-text:hover {
          color: #374151;
        }

        .tc-loading {
          position: fixed;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: white;
          border-radius: 6px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          color: #6b7280;
          font-size: 13px;
          pointer-events: auto;
        }

        .tc-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: tc-spin 0.8s linear infinite;
        }

        @keyframes tc-spin {
          to { transform: rotate(360deg); }
        }
      `;

      shadow.appendChild(style);
      document.body.appendChild(overlayContainer);

      return overlayContainer;
    }

    function cleanup() {
      currentSuggestions = [];
      if (overlayContainer) {
        overlayContainer.remove();
        overlayContainer = null;
      }
      hidePopover();
    }

    // Check grammar via background script
    async function checkGrammarRequest(text: string, forceCheck = false): Promise<GrammarCheckResult | null> {
      if (!text.trim() || text.length < 3) return null;

      try {
        const response = await browser.runtime.sendMessage({
          type: 'CHECK_GRAMMAR',
          payload: { text, forceCheck },
        });

        if (response.success) {
          return response.result as GrammarCheckResult;
        } else {
          console.error('Grammar check failed:', response.error);
          return null;
        }
      } catch (error) {
        console.error('Failed to check grammar:', error);
        return null;
      }
    }

    // Get character position rectangles in a text element
    function getCharacterRects(
      element: HTMLElement,
      startIndex: number,
      endIndex: number
    ): DOMRect[] {
      const tagName = element.tagName.toLowerCase();

      if (tagName === 'textarea' || tagName === 'input') {
        return getTextareaCharacterRects(element as HTMLTextAreaElement | HTMLInputElement, startIndex, endIndex);
      }

      // For contenteditable, use Range API
      const range = document.createRange();

      let currentIndex = 0;
      let startNode: Text | null = null;
      let startOffset = 0;
      let endNode: Text | null = null;
      let endOffset = 0;

      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node: Text | null;

      while ((node = walker.nextNode() as Text)) {
        const nodeLength = node.length;

        if (!startNode && currentIndex + nodeLength > startIndex) {
          startNode = node;
          startOffset = startIndex - currentIndex;
        }

        if (!endNode && currentIndex + nodeLength >= endIndex) {
          endNode = node;
          endOffset = endIndex - currentIndex;
          break;
        }

        currentIndex += nodeLength;
      }

      if (!startNode || !endNode) return [];

      try {
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return Array.from(range.getClientRects());
      } catch {
        return [];
      }
    }

    // Create mirror element for textarea/input character position calculation
    function getTextareaCharacterRects(
      element: HTMLTextAreaElement | HTMLInputElement,
      startIndex: number,
      endIndex: number
    ): DOMRect[] {
      const text = element.value;
      const computedStyle = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      // Create mirror div
      const mirror = document.createElement('div');
      mirror.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: hidden;
        visibility: hidden;
        font-family: ${computedStyle.fontFamily};
        font-size: ${computedStyle.fontSize};
        font-weight: ${computedStyle.fontWeight};
        line-height: ${computedStyle.lineHeight};
        letter-spacing: ${computedStyle.letterSpacing};
        padding: ${computedStyle.padding};
        border: ${computedStyle.border};
        width: ${element.offsetWidth}px;
      `;

      // Create spans for measurement
      const before = document.createElement('span');
      before.textContent = text.substring(0, startIndex);

      const marked = document.createElement('span');
      marked.textContent = text.substring(startIndex, endIndex);

      const after = document.createElement('span');
      after.textContent = text.substring(endIndex);

      mirror.appendChild(before);
      mirror.appendChild(marked);
      mirror.appendChild(after);
      document.body.appendChild(mirror);

      const markedRect = marked.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();

      // Calculate position relative to the original element
      const relativeTop = markedRect.top - mirrorRect.top;
      const relativeLeft = markedRect.left - mirrorRect.left;

      // Account for scrolling in the textarea
      const scrollTop = element.scrollTop || 0;
      const scrollLeft = element.scrollLeft || 0;

      const finalRect = new DOMRect(
        rect.left + relativeLeft - scrollLeft,
        rect.top + relativeTop - scrollTop,
        markedRect.width,
        markedRect.height
      );

      document.body.removeChild(mirror);

      return [finalRect];
    }

    // Show suggestion popover
    function showPopover(suggestion: GrammarSuggestion, anchorRect: DOMRect) {
      hidePopover();

      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

      popoverElement = document.createElement('div');
      popoverElement.className = 'tc-popover';

      // Position the popover
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const spaceBelow = viewportHeight - anchorRect.bottom;
      const showAbove = spaceBelow < 200;

      let left = anchorRect.left;
      if (left + 300 > viewportWidth) {
        left = viewportWidth - 310;
      }
      if (left < 10) {
        left = 10;
      }

      popoverElement.style.left = `${left}px`;
      if (showAbove) {
        popoverElement.style.bottom = `${viewportHeight - anchorRect.top + 8}px`;
      } else {
        popoverElement.style.top = `${anchorRect.bottom + 8}px`;
      }

      const color = getSuggestionColor(suggestion.type);
      const label = getSuggestionLabel(suggestion.type);

      popoverElement.innerHTML = `
        <div class="tc-popover-header">
          <span class="tc-badge" style="background: ${color}">${label}</span>
          <span class="tc-original">${escapeHtml(suggestion.original)}</span>
          <span class="tc-arrow">&rarr;</span>
          <span class="tc-replacement">${escapeHtml(suggestion.replacement)}</span>
        </div>
        <div class="tc-explanation">${escapeHtml(suggestion.explanation)}</div>
        <div class="tc-actions">
          <button class="tc-btn tc-btn-primary" data-action="apply">Apply</button>
          <button class="tc-btn tc-btn-secondary" data-action="ignore">Ignore</button>
          ${suggestion.type === 'spelling' ? '<button class="tc-btn tc-btn-text" data-action="dictionary" title="Add to dictionary">+Dict</button>' : ''}
        </div>
      `;

      // Add event listeners
      popoverElement.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const action = target.dataset.action;

        if (action === 'apply') {
          applySuggestion(suggestion);
          hidePopover();
        } else if (action === 'ignore') {
          ignoreSuggestion(suggestion);
          hidePopover();
        } else if (action === 'dictionary') {
          await addToDictionary(suggestion.original);
          ignoreSuggestion(suggestion);
          hidePopover();
        }
      });

      shadow.appendChild(popoverElement);

      // Close on click outside
      const closeHandler = (e: MouseEvent) => {
        if (popoverElement && !popoverElement.contains(e.target as Node)) {
          hidePopover();
          document.removeEventListener('click', closeHandler, true);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler, true), 10);
    }

    function hidePopover() {
      if (popoverElement && popoverElement.parentNode) {
        popoverElement.remove();
      }
      popoverElement = null;
    }

    function escapeHtml(text: string): string {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Apply a suggestion
    function applySuggestion(suggestion: GrammarSuggestion) {
      if (!activeElement) return;

      const text = getTextFromElement(activeElement);
      const newText =
        text.substring(0, suggestion.startIndex) +
        suggestion.replacement +
        text.substring(suggestion.endIndex);

      setTextInElement(activeElement, newText);

      // Update remaining suggestions positions
      const lengthDiff = suggestion.replacement.length - suggestion.original.length;
      currentSuggestions = currentSuggestions
        .filter((s) => s.id !== suggestion.id)
        .map((s) => {
          if (s.startIndex > suggestion.endIndex) {
            return {
              ...s,
              startIndex: s.startIndex + lengthDiff,
              endIndex: s.endIndex + lengthDiff,
            };
          }
          return s;
        });

      renderUnderlines();

      // Notify background script
      browser.runtime.sendMessage({ type: 'CORRECTION_APPLIED' }).catch(() => {});
    }

    // Ignore a suggestion
    function ignoreSuggestion(suggestion: GrammarSuggestion) {
      currentSuggestions = currentSuggestions.filter((s) => s.id !== suggestion.id);
      renderUnderlines();
    }

    // Add word to dictionary
    async function addToDictionary(word: string) {
      try {
        await browser.runtime.sendMessage({
          type: 'ADD_TO_DICTIONARY',
          payload: { word },
        });
      } catch (error) {
        console.error('Failed to add to dictionary:', error);
      }
    }

    // Render underlines for all suggestions
    function renderUnderlines() {
      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

      // Remove existing underlines
      shadow.querySelectorAll('.tc-underline').forEach((el) => el.remove());

      if (!activeElement || currentSuggestions.length === 0) return;

      currentSuggestions.forEach((suggestion) => {
        const rects = getCharacterRects(activeElement!, suggestion.startIndex, suggestion.endIndex);

        rects.forEach((rect) => {
          if (rect.width <= 0 || rect.height <= 0) return;

          const underline = document.createElement('div');
          underline.className = 'tc-underline';
          underline.style.cssText = `
            left: ${rect.left}px;
            top: ${rect.bottom - 2}px;
            width: ${Math.max(rect.width, 4)}px;
            background: ${getSuggestionColor(suggestion.type)};
          `;

          underline.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showPopover(suggestion, rect);
          });

          shadow.appendChild(underline);
        });
      });
    }

    // Show loading indicator
    function showLoading(element: HTMLElement) {
      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

      // Remove existing loading
      shadow.querySelectorAll('.tc-loading').forEach((el) => el.remove());

      const rect = element.getBoundingClientRect();
      const loading = document.createElement('div');
      loading.className = 'tc-loading';
      loading.style.cssText = `
        left: ${rect.right - 100}px;
        top: ${rect.top - 30}px;
      `;
      loading.innerHTML = '<div class="tc-spinner"></div> Checking...';
      shadow.appendChild(loading);
    }

    // Hide loading indicator
    function hideLoading() {
      if (overlayContainer && overlayContainer.shadowRoot) {
        overlayContainer.shadowRoot.querySelectorAll('.tc-loading').forEach((el) => el.remove());
      }
    }

    // Handle text field focus
    function handleFocus(element: HTMLElement) {
      if (!settings.enabled || !isEditableElement(element)) return;

      activeElement = element;
      console.log('TextChecker: focused on element', element.tagName);

      if (settings.checkMode === 'realtime') {
        const text = getTextFromElement(element);
        if (text.length > 10) {
          debouncedCheck(text);
        }
      }
    }

    // Handle text field blur
    function handleBlur() {
      // Keep suggestions visible for a bit in case user clicks on them
      setTimeout(() => {
        if (document.activeElement !== activeElement) {
          cleanup();
          activeElement = null;
        }
      }, 300);
    }

    // Handle input in text fields
    function handleInput(element: HTMLElement) {
      if (!settings.enabled || !isEditableElement(element)) return;

      activeElement = element;

      if (settings.checkMode === 'realtime') {
        const text = getTextFromElement(element);
        if (text.length > 10) {
          debouncedCheck(text);
        } else {
          cleanup();
        }
      }
    }

    // Debounced grammar check
    const debouncedCheck = debounce(async (text: string) => {
      if (isChecking || !activeElement) return;
      isChecking = true;

      showLoading(activeElement);

      try {
        const result = await checkGrammarRequest(text);
        if (result && activeElement) {
          currentSuggestions = result.suggestions;
          renderUnderlines();
        }
      } catch (error) {
        console.error('Grammar check error:', error);
      } finally {
        hideLoading();
        isChecking = false;
      }
    }, settings.realtimeDelay);

    // Handle keyboard shortcut trigger from background
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'TRIGGER_CHECK') {
        if (activeElement) {
          const text = getTextFromElement(activeElement);
          if (text.length > 3) {
            showLoading(activeElement);
            checkGrammarRequest(text, true).then((result) => {
              hideLoading();
              if (result) {
                currentSuggestions = result.suggestions;
                renderUnderlines();
              }
            }).catch(() => {
              hideLoading();
            });
          }
        }
      }
    });

    // Set up event listeners
    document.addEventListener('focusin', (e) => {
      if (e.target instanceof HTMLElement) {
        handleFocus(e.target);
      }
    }, true);

    document.addEventListener('focusout', () => {
      handleBlur();
    }, true);

    document.addEventListener('input', (e) => {
      if (e.target instanceof HTMLElement) {
        handleInput(e.target);
      }
    }, true);

    // Handle scroll to update underline positions
    const handleScroll = debounce(() => {
      if (activeElement && currentSuggestions.length > 0) {
        renderUnderlines();
      }
    }, 50);

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });

    // Handle resize
    window.addEventListener('resize', () => {
      if (activeElement && currentSuggestions.length > 0) {
        renderUnderlines();
      }
    }, { passive: true });

    // Clean up on context invalidation
    ctx.onInvalidated(() => {
      cleanup();
      if (unwatchSettings) {
        unwatchSettings();
      }
    });
  },
});
