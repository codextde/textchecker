import { settingsStorage } from '@/lib/storage';
import { debounce, isEditableElement, getTextFromElement, setTextInElement, getSuggestionColor, getSuggestionLabel } from '@/lib/utils';
import type { GrammarSuggestion, GrammarCheckResult, Settings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',

  async main(ctx) {
    console.log('TextChecker content script loaded', window.location.href);

    let settings: Settings = DEFAULT_SETTINGS;
    let currentSuggestions: GrammarSuggestion[] = [];
    let activeElement: HTMLElement | null = null;
    let overlayContainer: HTMLDivElement | null = null;
    let statusButton: HTMLDivElement | null = null;
    let suggestionPanel: HTMLDivElement | null = null;
    let isChecking = false;
    let unwatchSettings: (() => void) | null = null;
    let popoverCloseTimeout: ReturnType<typeof setTimeout> | null = null;

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

    // Styles for Shadow DOM
    const STYLES = `
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
        transition: opacity 0.2s, height 0.1s;
      }

      .tc-underline:hover {
        height: 4px;
        opacity: 0.9;
      }

      /* Status Button - like LanguageTool */
      .tc-status-btn {
        position: fixed;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        cursor: pointer;
        pointer-events: auto;
        font-size: 13px;
        color: #374151;
        transition: all 0.2s;
        z-index: 2147483646;
      }

      .tc-status-btn:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border-color: #d1d5db;
      }

      .tc-status-btn.tc-loading {
        color: #6b7280;
      }

      .tc-status-btn.tc-has-errors {
        border-color: #fca5a5;
        background: #fef2f2;
      }

      .tc-status-btn.tc-no-errors {
        border-color: #86efac;
        background: #f0fdf4;
      }

      .tc-status-icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tc-status-icon svg {
        width: 16px;
        height: 16px;
      }

      .tc-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #e5e7eb;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: tc-spin 0.8s linear infinite;
      }

      @keyframes tc-spin {
        to { transform: rotate(360deg); }
      }

      .tc-error-count {
        background: #ef4444;
        color: white;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 10px;
        min-width: 20px;
        text-align: center;
      }

      /* Suggestion Panel */
      .tc-panel {
        position: fixed;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
        width: 360px;
        max-height: 400px;
        overflow: hidden;
        pointer-events: auto;
        animation: tc-slideUp 0.2s ease-out;
        z-index: 2147483647;
      }

      @keyframes tc-slideUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .tc-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #f3f4f6;
        background: #f9fafb;
      }

      .tc-panel-title {
        font-weight: 600;
        font-size: 14px;
        color: #111827;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .tc-panel-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        color: #6b7280;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tc-panel-close:hover {
        background: #e5e7eb;
        color: #374151;
      }

      .tc-panel-body {
        max-height: 340px;
        overflow-y: auto;
      }

      .tc-panel-empty {
        padding: 32px 16px;
        text-align: center;
        color: #6b7280;
      }

      .tc-panel-empty-icon {
        font-size: 32px;
        margin-bottom: 8px;
      }

      /* Individual suggestion card in panel */
      .tc-suggestion-card {
        padding: 12px 16px;
        border-bottom: 1px solid #f3f4f6;
        cursor: pointer;
        transition: background 0.15s;
      }

      .tc-suggestion-card:hover {
        background: #f9fafb;
      }

      .tc-suggestion-card:last-child {
        border-bottom: none;
      }

      .tc-suggestion-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }

      .tc-badge {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        color: white;
      }

      .tc-suggestion-text {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        flex-wrap: wrap;
      }

      .tc-original {
        color: #dc2626;
        text-decoration: line-through;
      }

      .tc-arrow {
        color: #9ca3af;
      }

      .tc-replacement {
        color: #16a34a;
        font-weight: 500;
      }

      .tc-explanation {
        color: #6b7280;
        font-size: 12px;
        margin-top: 4px;
        line-height: 1.4;
      }

      .tc-suggestion-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }

      .tc-btn {
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
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

      .tc-btn-sm {
        padding: 4px 8px;
        font-size: 11px;
      }

      /* Inline Popover (shown on underline click) */
      .tc-popover {
        position: fixed;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        padding: 12px;
        min-width: 280px;
        max-width: 380px;
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

      .tc-popover-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      .tc-popover-actions .tc-btn {
        flex: 1;
      }

      .tc-btn-text {
        background: none;
        color: #6b7280;
        padding: 6px 8px;
        flex: 0 !important;
      }

      .tc-btn-text:hover {
        color: #374151;
        background: #f3f4f6;
      }
    `;

    // Create Shadow DOM container
    function createOverlayContainer(): HTMLDivElement {
      if (overlayContainer && document.body.contains(overlayContainer)) {
        return overlayContainer;
      }

      overlayContainer = document.createElement('div');
      overlayContainer.id = 'textchecker-overlay';
      overlayContainer.style.cssText = 'position: absolute; top: 0; left: 0; pointer-events: none; z-index: 2147483647;';

      const shadow = overlayContainer.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = STYLES;
      shadow.appendChild(style);
      document.body.appendChild(overlayContainer);

      return overlayContainer;
    }

    function cleanup() {
      currentSuggestions = [];
      hideStatusButton();
      hideSuggestionPanel();
      hidePopover();
      if (overlayContainer) {
        overlayContainer.remove();
        overlayContainer = null;
      }
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

    // SVG Icons
    const ICONS = {
      check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
      alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
      close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
      pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    };

    // Show/update status button near the active element
    function showStatusButton(state: 'loading' | 'errors' | 'clean', errorCount = 0) {
      if (!activeElement) return;

      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

      // Remove existing button
      shadow.querySelectorAll('.tc-status-btn').forEach(el => el.remove());

      const rect = activeElement.getBoundingClientRect();
      statusButton = document.createElement('div');
      statusButton.className = `tc-status-btn ${state === 'loading' ? 'tc-loading' : state === 'errors' ? 'tc-has-errors' : 'tc-no-errors'}`;

      // Position at bottom-right of the element
      const btnLeft = Math.min(rect.right - 80, window.innerWidth - 90);
      const btnTop = Math.min(rect.bottom - 32, window.innerHeight - 40);

      statusButton.style.cssText = `left: ${btnLeft}px; top: ${btnTop}px;`;

      if (state === 'loading') {
        statusButton.innerHTML = `
          <div class="tc-status-icon"><div class="tc-spinner"></div></div>
          <span>Checking...</span>
        `;
      } else if (state === 'errors') {
        statusButton.innerHTML = `
          <div class="tc-status-icon" style="color: #ef4444;">${ICONS.alert}</div>
          <span class="tc-error-count">${errorCount}</span>
        `;
        statusButton.title = `${errorCount} issue${errorCount > 1 ? 's' : ''} found. Click to see details.`;
      } else {
        statusButton.innerHTML = `
          <div class="tc-status-icon" style="color: #22c55e;">${ICONS.check}</div>
          <span style="color: #16a34a;">All good!</span>
        `;
      }

      // Prevent mousedown from triggering outside-click handlers
      statusButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      statusButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state === 'errors' && currentSuggestions.length > 0) {
          toggleSuggestionPanel();
        }
      });

      shadow.appendChild(statusButton);
    }

    function hideStatusButton() {
      if (overlayContainer?.shadowRoot) {
        overlayContainer.shadowRoot.querySelectorAll('.tc-status-btn').forEach(el => el.remove());
      }
      statusButton = null;
    }

    // Suggestion Panel (shows all suggestions)
    function toggleSuggestionPanel() {
      if (suggestionPanel) {
        hideSuggestionPanel();
      } else {
        showSuggestionPanel();
      }
    }

    function showSuggestionPanel() {
      if (!activeElement || currentSuggestions.length === 0) return;

      hideSuggestionPanel();
      hidePopover();

      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

      const rect = activeElement.getBoundingClientRect();
      suggestionPanel = document.createElement('div');
      suggestionPanel.className = 'tc-panel';

      // Position panel
      let left = rect.right - 370;
      let top = rect.bottom + 8;

      if (left < 10) left = 10;
      if (top + 400 > window.innerHeight) {
        top = rect.top - 410;
        if (top < 10) top = 10;
      }

      suggestionPanel.style.cssText = `left: ${left}px; top: ${top}px;`;

      const errorCount = currentSuggestions.length;
      suggestionPanel.innerHTML = `
        <div class="tc-panel-header">
          <div class="tc-panel-title">
            ${ICONS.pencil}
            <span>${errorCount} issue${errorCount > 1 ? 's' : ''} found</span>
          </div>
          <button class="tc-panel-close" data-action="close-panel">${ICONS.close}</button>
        </div>
        <div class="tc-panel-body">
          ${currentSuggestions.map((s, i) => `
            <div class="tc-suggestion-card" data-index="${i}">
              <div class="tc-suggestion-header">
                <span class="tc-badge" style="background: ${getSuggestionColor(s.type)}">${getSuggestionLabel(s.type)}</span>
              </div>
              <div class="tc-suggestion-text">
                <span class="tc-original">${escapeHtml(s.original)}</span>
                <span class="tc-arrow">→</span>
                <span class="tc-replacement">${escapeHtml(s.replacement)}</span>
              </div>
              <div class="tc-explanation">${escapeHtml(s.explanation)}</div>
              <div class="tc-suggestion-actions">
                <button class="tc-btn tc-btn-primary tc-btn-sm" data-action="apply" data-index="${i}">Apply</button>
                <button class="tc-btn tc-btn-secondary tc-btn-sm" data-action="ignore" data-index="${i}">Ignore</button>
                ${s.type === 'spelling' ? `<button class="tc-btn tc-btn-text tc-btn-sm" data-action="dictionary" data-index="${i}">Add to dictionary</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // Event delegation for panel actions
      suggestionPanel.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const action = target.dataset.action;
        const indexStr = target.dataset.index;

        e.preventDefault();
        e.stopPropagation();

        if (action === 'close-panel') {
          hideSuggestionPanel();
          return;
        }

        if (!indexStr) return;
        const index = parseInt(indexStr, 10);
        const suggestion = currentSuggestions[index];
        if (!suggestion) return;

        if (action === 'apply') {
          applySuggestion(suggestion);
          updatePanelAfterChange();
        } else if (action === 'ignore') {
          ignoreSuggestion(suggestion);
          updatePanelAfterChange();
        } else if (action === 'dictionary') {
          await addToDictionary(suggestion.original);
          ignoreSuggestion(suggestion);
          updatePanelAfterChange();
        }
      });

      // Highlight text when hovering over suggestion card
      suggestionPanel.addEventListener('mouseover', (e) => {
        const card = (e.target as HTMLElement).closest('.tc-suggestion-card') as HTMLElement;
        if (card) {
          const index = parseInt(card.dataset.index || '0', 10);
          highlightSuggestion(index);
        }
      });

      shadow.appendChild(suggestionPanel);

      // Close panel when clicking outside
      setTimeout(() => {
        document.addEventListener('mousedown', handlePanelOutsideClick, true);
      }, 10);
    }

    function handlePanelOutsideClick(e: MouseEvent) {
      // Use composedPath to properly detect clicks inside shadow DOM
      const path = e.composedPath();
      const clickedInPanel = suggestionPanel && path.includes(suggestionPanel);
      const clickedOnStatusBtn = statusButton && path.includes(statusButton);

      if (!clickedInPanel && !clickedOnStatusBtn) {
        hideSuggestionPanel();
        document.removeEventListener('mousedown', handlePanelOutsideClick, true);
      }
    }

    function hideSuggestionPanel() {
      if (suggestionPanel?.parentNode) {
        suggestionPanel.remove();
      }
      suggestionPanel = null;
      document.removeEventListener('mousedown', handlePanelOutsideClick, true);
    }

    function updatePanelAfterChange() {
      if (currentSuggestions.length === 0) {
        hideSuggestionPanel();
        showStatusButton('clean');
      } else {
        // Re-render panel
        hideSuggestionPanel();
        showSuggestionPanel();
        showStatusButton('errors', currentSuggestions.length);
      }
      renderUnderlines();
    }

    function highlightSuggestion(index: number) {
      const suggestion = currentSuggestions[index];
      if (!suggestion || !activeElement) return;

      // Scroll the text into view if needed
      if (activeElement.tagName.toLowerCase() === 'textarea') {
        // Could implement scroll to position for textarea
      }
    }

    // Get character position rectangles
    function getCharacterRects(element: HTMLElement, startIndex: number, endIndex: number): DOMRect[] {
      const tagName = element.tagName.toLowerCase();

      if (tagName === 'textarea' || tagName === 'input') {
        return getTextareaCharacterRects(element as HTMLTextAreaElement | HTMLInputElement, startIndex, endIndex);
      }

      // For contenteditable
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

    function getTextareaCharacterRects(element: HTMLTextAreaElement | HTMLInputElement, startIndex: number, endIndex: number): DOMRect[] {
      const text = element.value;
      const computedStyle = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

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

      const relativeTop = markedRect.top - mirrorRect.top;
      const relativeLeft = markedRect.left - mirrorRect.left;

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

    // Inline popover (shown on underline click)
    let currentPopover: HTMLDivElement | null = null;

    function showPopover(suggestion: GrammarSuggestion, anchorRect: DOMRect) {
      hidePopover();
      hideSuggestionPanel();

      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

      currentPopover = document.createElement('div');
      currentPopover.className = 'tc-popover';

      // Position
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const spaceBelow = viewportHeight - anchorRect.bottom;
      const showAbove = spaceBelow < 180;

      let left = anchorRect.left;
      if (left + 300 > viewportWidth) left = viewportWidth - 310;
      if (left < 10) left = 10;

      currentPopover.style.left = `${left}px`;
      if (showAbove) {
        currentPopover.style.bottom = `${viewportHeight - anchorRect.top + 8}px`;
      } else {
        currentPopover.style.top = `${anchorRect.bottom + 8}px`;
      }

      const color = getSuggestionColor(suggestion.type);
      const label = getSuggestionLabel(suggestion.type);

      currentPopover.innerHTML = `
        <div class="tc-popover-header">
          <span class="tc-badge" style="background: ${color}">${label}</span>
          <span class="tc-original">${escapeHtml(suggestion.original)}</span>
          <span class="tc-arrow">→</span>
          <span class="tc-replacement">${escapeHtml(suggestion.replacement)}</span>
        </div>
        <div class="tc-explanation">${escapeHtml(suggestion.explanation)}</div>
        <div class="tc-popover-actions">
          <button class="tc-btn tc-btn-primary" data-action="apply">Apply</button>
          <button class="tc-btn tc-btn-secondary" data-action="ignore">Ignore</button>
          ${suggestion.type === 'spelling' ? '<button class="tc-btn tc-btn-text" data-action="dictionary">+Dict</button>' : ''}
        </div>
      `;

      currentPopover.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      currentPopover.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const target = e.target as HTMLElement;
        const action = target.dataset.action;

        if (action === 'apply') {
          applySuggestion(suggestion);
          hidePopover();
          updateStatusAfterChange();
        } else if (action === 'ignore') {
          ignoreSuggestion(suggestion);
          hidePopover();
          updateStatusAfterChange();
        } else if (action === 'dictionary') {
          await addToDictionary(suggestion.original);
          ignoreSuggestion(suggestion);
          hidePopover();
          updateStatusAfterChange();
        }
      });

      shadow.appendChild(currentPopover);

      // Close on outside click - with delay to prevent immediate close
      if (popoverCloseTimeout) clearTimeout(popoverCloseTimeout);
      popoverCloseTimeout = setTimeout(() => {
        document.addEventListener('mousedown', handlePopoverOutsideClick, true);
      }, 100);
    }

    function handlePopoverOutsideClick(e: MouseEvent) {
      // Use composedPath to properly detect clicks inside shadow DOM
      const path = e.composedPath();

      // Check if click is inside popover
      if (currentPopover && path.includes(currentPopover)) {
        return;
      }

      // Check if click is on an underline (will open new popover)
      const shadow = overlayContainer?.shadowRoot;
      if (shadow) {
        const underlines = shadow.querySelectorAll('.tc-underline');
        for (const underline of underlines) {
          if (path.includes(underline)) {
            return;
          }
        }
      }

      hidePopover();
    }

    function hidePopover() {
      if (popoverCloseTimeout) {
        clearTimeout(popoverCloseTimeout);
        popoverCloseTimeout = null;
      }
      document.removeEventListener('mousedown', handlePopoverOutsideClick, true);

      if (currentPopover?.parentNode) {
        currentPopover.remove();
      }
      currentPopover = null;
    }

    function updateStatusAfterChange() {
      if (currentSuggestions.length === 0) {
        showStatusButton('clean');
      } else {
        showStatusButton('errors', currentSuggestions.length);
      }
      renderUnderlines();
    }

    function escapeHtml(text: string): string {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function applySuggestion(suggestion: GrammarSuggestion) {
      if (!activeElement) return;

      const text = getTextFromElement(activeElement);
      const newText = text.substring(0, suggestion.startIndex) + suggestion.replacement + text.substring(suggestion.endIndex);
      setTextInElement(activeElement, newText);

      const lengthDiff = suggestion.replacement.length - suggestion.original.length;
      currentSuggestions = currentSuggestions
        .filter((s) => s.id !== suggestion.id)
        .map((s) => {
          if (s.startIndex > suggestion.endIndex) {
            return { ...s, startIndex: s.startIndex + lengthDiff, endIndex: s.endIndex + lengthDiff };
          }
          return s;
        });

      browser.runtime.sendMessage({ type: 'CORRECTION_APPLIED' }).catch(() => {});
    }

    function ignoreSuggestion(suggestion: GrammarSuggestion) {
      currentSuggestions = currentSuggestions.filter((s) => s.id !== suggestion.id);
    }

    async function addToDictionary(word: string) {
      try {
        await browser.runtime.sendMessage({ type: 'ADD_TO_DICTIONARY', payload: { word } });
      } catch (error) {
        console.error('Failed to add to dictionary:', error);
      }
    }

    function renderUnderlines() {
      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

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

          underline.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
          });

          underline.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showPopover(suggestion, rect);
          });

          shadow.appendChild(underline);
        });
      });
    }

    // Event handlers
    function handleFocus(element: HTMLElement) {
      if (!settings.enabled || !isEditableElement(element)) return;

      activeElement = element;

      if (settings.checkMode === 'realtime') {
        const text = getTextFromElement(element);
        if (text.length > 10) {
          debouncedCheck(text);
        }
      }
    }

    function handleBlur() {
      setTimeout(() => {
        if (document.activeElement !== activeElement) {
          cleanup();
          activeElement = null;
        }
      }, 300);
    }

    function handleInput(element: HTMLElement) {
      if (!settings.enabled || !isEditableElement(element)) return;

      activeElement = element;
      hideSuggestionPanel();
      hidePopover();

      if (settings.checkMode === 'realtime') {
        const text = getTextFromElement(element);
        if (text.length > 10) {
          debouncedCheck(text);
        } else {
          cleanup();
        }
      }
    }

    const debouncedCheck = debounce(async (text: string) => {
      if (isChecking || !activeElement) return;
      isChecking = true;

      showStatusButton('loading');

      try {
        const result = await checkGrammarRequest(text);
        if (result && activeElement) {
          currentSuggestions = result.suggestions;
          renderUnderlines();

          if (currentSuggestions.length > 0) {
            showStatusButton('errors', currentSuggestions.length);
          } else {
            showStatusButton('clean');
          }
        }
      } catch (error) {
        console.error('Grammar check error:', error);
        hideStatusButton();
      } finally {
        isChecking = false;
      }
    }, settings.realtimeDelay);

    // Message listener for keyboard shortcut
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'TRIGGER_CHECK' && activeElement) {
        const text = getTextFromElement(activeElement);
        if (text.length > 3) {
          showStatusButton('loading');
          checkGrammarRequest(text, true).then((result) => {
            if (result) {
              currentSuggestions = result.suggestions;
              renderUnderlines();
              if (currentSuggestions.length > 0) {
                showStatusButton('errors', currentSuggestions.length);
              } else {
                showStatusButton('clean');
              }
            }
          }).catch(() => {
            hideStatusButton();
          });
        }
      }
    });

    // Setup event listeners
    document.addEventListener('focusin', (e) => {
      if (e.target instanceof HTMLElement) handleFocus(e.target);
    }, true);

    document.addEventListener('focusout', () => handleBlur(), true);

    document.addEventListener('input', (e) => {
      if (e.target instanceof HTMLElement) handleInput(e.target);
    }, true);

    const handleScroll = debounce(() => {
      if (activeElement && currentSuggestions.length > 0) {
        renderUnderlines();
        // Update status button position
        if (statusButton && activeElement) {
          const rect = activeElement.getBoundingClientRect();
          const btnLeft = Math.min(rect.right - 80, window.innerWidth - 90);
          const btnTop = Math.min(rect.bottom - 32, window.innerHeight - 40);
          statusButton.style.left = `${btnLeft}px`;
          statusButton.style.top = `${btnTop}px`;
        }
      }
    }, 50);

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });

    window.addEventListener('resize', () => {
      if (activeElement && currentSuggestions.length > 0) {
        renderUnderlines();
      }
    }, { passive: true });

    ctx.onInvalidated(() => {
      cleanup();
      if (unwatchSettings) unwatchSettings();
    });
  },
});
