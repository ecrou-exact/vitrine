import { describe, expect, it, vi } from 'vitest';
import { sanitizeHighlight, sanitizeHtml, sanitizerWorks } from '../../src/core/security.js';

// happy-dom breaks DOMPurify silently (it reports itself supported but keeps dangerous markup).
// This is the real-world "broken environment" case the runtime self-test must catch.
describe('sanitizer self-test in a broken environment', () => {
  it('detects that the sanitizer does not work here', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(sanitizerWorks()).toBe(false);
    warn.mockRestore();
  });
  it('returns inert text instead of trusting the input', () => {
    for (const sanitize of [sanitizeHtml, sanitizeHighlight]) {
      const fragment = sanitize('<img src=x onerror=alert(1)><script>alert(2)</script>');
      expect(fragment.childNodes.length).toBe(1);
      expect(fragment.firstChild.nodeType).toBe(Node.TEXT_NODE);
      expect(fragment.textContent).toBe('<img src=x onerror=alert(1)><script>alert(2)</script>');
    }
  });
});
