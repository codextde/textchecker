import type { GrammarSuggestion } from '@/types';

type LocatedSuggestion = Omit<GrammarSuggestion, 'id'>;
const MAX_DIFF_CELLS = 100_000;
const WORD_WITH_PUNCTUATION = /^([^\p{L}\p{M}\p{N}\s]*)([\p{L}\p{M}\p{N}]+)([^\p{L}\p{M}\p{N}\s]*)$/u;

function tokenize(text: string) {
  return [...text.matchAll(/[\p{L}\p{M}\p{N}]+|\s+|[^\p{L}\p{M}\p{N}\s]/gu)];
}

export function splitSuggestion(suggestion: LocatedSuggestion): LocatedSuggestion[] {
  const { original, replacement, startIndex } = suggestion;
  const before = tokenize(original);
  const after = tokenize(replacement);
  let start = 0;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (start < beforeEnd && start < afterEnd && before[start][0] === after[start][0]) {
    start++;
  }
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1][0] === after[afterEnd - 1][0]) {
    beforeEnd--;
    afterEnd--;
  }

  const edits: LocatedSuggestion[] = [];
  let beforeStart = start;
  let afterStart = start;
  function addFragment(left: number, oldText: string, newText: string) {
    if (oldText === newText) return;
    edits.push({
      ...suggestion,
      original: oldText,
      replacement: newText,
      startIndex: startIndex + left,
      endIndex: startIndex + left + oldText.length,
    });
  }

  function addEdit(beforeStop: number, afterStop: number) {
    if (beforeStart === beforeStop && afterStart === afterStop) return;
    const left = before[beforeStart]?.index ?? original.length;
    const right = before[beforeStop]?.index ?? original.length;
    const replacementStart = after[afterStart]?.index ?? replacement.length;
    const replacementEnd = after[afterStop]?.index ?? replacement.length;

    const oldText = original.slice(left, right);
    const newText = replacement.slice(replacementStart, replacementEnd);
    const oldParts = WORD_WITH_PUNCTUATION.exec(oldText);
    const newParts = WORD_WITH_PUNCTUATION.exec(newText);

    if (oldParts && newParts) {
      // Keep an adjacent punctuation change separate from a word replacement.
      addFragment(left, oldParts[1], newParts[1]);
      addFragment(left + oldParts[1].length, oldParts[2], newParts[2]);
      addFragment(left + oldParts[1].length + oldParts[2].length, oldParts[3], newParts[3]);
    } else {
      addFragment(left, oldText, newText);
    }
  }

  const rows = beforeEnd - start + 1;
  const columns = afterEnd - start + 1;
  if (rows * columns <= MAX_DIFF_CELLS) {
    // Unchanged tokens separate independently applicable edits.
    const lengths = new Uint32Array(rows * columns);
    for (let row = rows - 2; row >= 0; row--) {
      for (let column = columns - 2; column >= 0; column--) {
        const index = row * columns + column;
        lengths[index] = before[start + row][0] === after[start + column][0]
          ? 1 + lengths[index + columns + 1]
          : Math.max(lengths[index + columns], lengths[index + 1]);
      }
    }

    let row = 0;
    let column = 0;
    while (row < rows - 1 && column < columns - 1) {
      const index = row * columns + column;
      if (before[start + row][0] === after[start + column][0]) {
        addEdit(start + row, start + column);
        beforeStart = start + ++row;
        afterStart = start + ++column;
      } else if (lengths[index + columns] >= lengths[index + 1]) {
        row++;
      } else {
        column++;
      }
    }
  }
  addEdit(beforeEnd, afterEnd);
  return edits;
}
