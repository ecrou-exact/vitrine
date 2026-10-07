// @ts-check
/**
 * User actions: copy to clipboard and download as a file.
 * Both must only be called from a user gesture (click, key press).
 *
 * @module core/actions
 */

/**
 * Copies text to the clipboard.
 *
 * Uses the async Clipboard API, with a fallback for insecure contexts (plain `http:`)
 * where `navigator.clipboard` is unavailable.
 *
 * @param {string} text
 * @param {ShadowRoot | Document} [root] - Where to place the temporary fallback element.
 * @returns {Promise<boolean>} Whether the copy succeeded.
 */
export async function copyText(text, root = document) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or document not focused: try the fallback below.
    }
  }
  return legacyCopy(text, root);
}

/**
 * @param {string} text
 * @param {ShadowRoot | Document} root
 * @returns {boolean}
 */
function legacyCopy(text, root) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  const parent = root instanceof Document ? root.body : root;
  parent.appendChild(area);
  try {
    area.select();
    // execCommand is deprecated but remains the only option outside secure contexts.
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Offers text as a file download.
 *
 * @param {string} text
 * @param {string} fileName - Already sanitized file name.
 * @param {string} [mimeType="text/plain"]
 */
export function downloadText(text, fileName, mimeType = 'text/plain') {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
