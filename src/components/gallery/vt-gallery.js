// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import galleryCss from '../../styles/gallery.css?raw';
import { parseEnum, parseInteger } from '../../core/attributes.js';
import { firstText, isObject, parseList, safeImage, safeLink, text } from '../../core/data.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { iconButton } from '../../core/ui.js';
import { isSameOrigin } from '../../core/urls.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/**
 * @typedef {object} GalleryImage
 * @property {string} src
 * @property {string} thumb
 * @property {string} alt
 * @property {string} caption
 * @property {string | null} href
 * @property {number | null} width
 * @property {number | null} height
 */

const ASPECTS = /** @type {const} */ (['square', 'wide', 'photo', 'natural']);
const POLICIES = /** @type {const} */ (['allow', 'same-origin']);

/**
 * Reads images from a list of addresses, or of objects.
 *
 * @param {string} source
 * @param {'allow' | 'same-origin'} [policy]
 * @returns {{ ok: true, images: GalleryImage[] } | { ok: false, error: 'json' | 'shape', message: string }}
 */
export function parseGallery(source, policy = 'allow') {
  /** @type {string} */
  let json = source;
  try {
    const value = JSON.parse(source);
    const list = Array.isArray(value)
      ? value
      : isObject(value)
        ? (value.images ?? value.items)
        : null;
    // A plain list of addresses is a list of images.
    if (Array.isArray(list))
      json = JSON.stringify(list.map((item) => (typeof item === 'string' ? { src: item } : item)));
  } catch {
    // parseList reports it.
  }
  const result = parseList(json, ['images', 'items', 'photos']);
  if (!result.ok) return result;
  /** @type {GalleryImage[]} */
  const images = [];
  for (const item of result.items) {
    const src = safeImage(item.src ?? item.url ?? item.image);
    if (!src || (policy === 'same-origin' && !isSameOrigin(src))) continue;
    const thumb = safeImage(item.thumb ?? item.thumbnail);
    const width = Number(item.width);
    const height = Number(item.height);
    images.push({
      src,
      thumb: thumb && (policy !== 'same-origin' || isSameOrigin(thumb)) ? thumb : src,
      alt: firstText(item, ['alt', 'title'], 500),
      caption: text(item.caption ?? item.description, 1000),
      href: safeLink(item.href ?? item.link),
      width: width > 0 && width < 1e5 ? width : null,
      height: height > 0 && height < 1e5 ? height : null,
    });
  }
  return { ok: true, images };
}

/**
 * Displays images as a grid that opens a viewer with keyboard navigation.
 *
 * Addresses keep safe schemes only (SVG `data:` addresses are refused), and images load lazily
 * without a referrer. Captions are rendered with DOM text APIs.
 *
 * @element vt-gallery
 * @since 0.11.0
 *
 * @attr {number} columns - Fixed number of columns. Default: as many as fit.
 * @attr {"square"|"wide"|"photo"|"natural"} aspect - Shape of the thumbnails (default `photo`, 4:3).
 * @attr {boolean} viewer - Opens a viewer when an image is pressed. Default: on.
 * @attr {boolean} captions - Captions under the thumbnails. Default: on.
 * @attr {"allow"|"same-origin"} images - Images from any origin (default), or only this one.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The images, as a value.
 * @prop {GalleryImage[]} images - The images read (read-only).
 *
 * @fires vt-ready - Gallery rendered. Detail: `{ type: "gallery" }`.
 * @fires vt-select - An image was opened or the viewer moved. Detail: `{ index, src, alt }`.
 * @fires vt-toggle - The viewer was opened or closed. Detail: `{ expanded }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart grid - The list of thumbnails.
 * @csspart item - A thumbnail and its caption.
 * @csspart thumbnail - A thumbnail image.
 * @csspart caption - A caption.
 * @csspart viewer - The viewer.
 * @csspart image - The image in the viewer.
 *
 * @example
 * <vt-gallery json='["/a.jpg","/b.jpg"]'></vt-gallery>
 */
export class VtGallery extends VtDataElement {
  static type = 'gallery';

  static componentAttributes = Object.freeze(['columns', 'aspect', 'viewer', 'captions', 'images']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, galleryCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {HTMLDialogElement | null} The viewer on screen. */
    this.viewer = null;
    /** @type {number | null} Image shown in the viewer. */
    this.current = null;
  }

  /** @returns {'allow' | 'same-origin'} */
  get policy() {
    return parseEnum(this.getAttribute('images'), POLICIES, 'allow');
  }

  /** @type {GalleryImage[]} */
  get images() {
    const result = parseGallery(this.text ?? '', this.policy);
    return result.ok ? result.images : [];
  }

  contentChanged() {
    this.current = null;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const result = parseGallery(this.text ?? '', this.policy);
    const body = h('div', { class: 'body data-body gallery-body', part: 'body' });
    if (!result.ok) body.append(this.dataNotice(result));
    else if (!result.images.length)
      body.append(h('p', { class: 'data-none', text: this.t('galleryEmpty') }));
    else body.append(this.grid(result.images));
    this.frameWith(frame, body, this.panelId, { file: 'gallery.json' });
    if (result.ok && this.current !== null && this.current < result.images.length)
      this.openViewer(frame, result.images);
  }

  /**
   * @param {GalleryImage[]} images
   * @returns {HTMLElement}
   */
  grid(images) {
    const columns = parseInteger(this.getAttribute('columns'), { min: 1, max: 12, fallback: 0 });
    const aspect = parseEnum(this.getAttribute('aspect'), ASPECTS, 'photo');
    const list = h(
      'ul',
      { class: `gallery-grid aspect-${aspect}`, part: 'grid' },
      ...images.map((image, index) => this.item(image, index, images.length)),
    );
    if (columns) list.style.setProperty('--_columns', String(columns));
    return list;
  }

  /**
   * @param {GalleryImage} image
   * @param {number} index
   * @param {number} total
   * @returns {HTMLElement}
   */
  item(image, index, total) {
    const t = this.t;
    const picture = this.picture(image.thumb, image, 'thumbnail');
    const name = image.alt || image.caption || t('galleryImage', { n: index + 1 });
    const wrap = this.flag('viewer')
      ? h(
          'button',
          {
            class: 'gallery-open',
            attrs: {
              type: 'button',
              'aria-label': t('galleryOpen', { n: index + 1, total, name }),
              'data-focus-key': `image-${index}`,
            },
            on: { click: () => this.show(index) },
          },
          picture,
        )
      : h('div', { class: 'gallery-open static' }, picture);
    return h(
      'li',
      { class: 'gallery-item', part: 'item' },
      wrap,
      image.caption && this.flag('captions')
        ? h('p', { class: 'gallery-caption', part: 'caption', text: image.caption })
        : null,
    );
  }

  /**
   * @param {string} src - Already checked.
   * @param {GalleryImage} image
   * @param {string} part
   * @returns {HTMLImageElement}
   */
  picture(src, image, part) {
    const element = h('img', {
      part,
      attrs: {
        src,
        alt: image.alt,
        loading: 'lazy',
        decoding: 'async',
        referrerpolicy: 'no-referrer',
        width: image.width,
        height: image.height,
      },
      on: {
        error: () => {
          element.classList.add('failed');
          element.setAttribute('alt', this.t('galleryFailed'));
        },
      },
    });
    return element;
  }

  /**
   * Opens the viewer on an image.
   *
   * @param {number} index
   */
  show(index) {
    const images = this.images;
    if (!images[index]) return;
    const wasOpen = this.current !== null;
    this.current = index;
    this.render();
    const image = images[index];
    emit(this, EVENTS.SELECT, { index, src: image.src, alt: image.alt });
    if (!wasOpen) emit(this, EVENTS.TOGGLE, { expanded: true });
  }

  /**
   * @param {HTMLElement} frame
   * @param {GalleryImage[]} images
   */
  openViewer(frame, images) {
    const t = this.t;
    const index = /** @type {number} */ (this.current);
    const image = images[index];
    const total = images.length;
    /** @param {number} step */
    const move = (step) => this.show((index + step + total) % total);
    const dialog = h(
      'dialog',
      {
        class: 'gallery-viewer',
        part: 'viewer',
        attrs: { 'aria-label': t('galleryViewer') },
        on: {
          keydown: (event) => {
            const { key } = /** @type {KeyboardEvent} */ (event);
            if (key === 'ArrowLeft') move(-1);
            else if (key === 'ArrowRight') move(1);
            else if (key === 'Home') this.show(0);
            else if (key === 'End') this.show(total - 1);
          },
          // A press on the backdrop targets the dialog itself.
          click: (event) => {
            if (event.target === dialog) dialog.close();
          },
          close: () => dialog === this.viewer && this.closeViewer(index),
        },
      },
      h(
        'div',
        { class: 'gallery-stage' },
        this.picture(image.src, { ...image, width: null, height: null }, 'image'),
      ),
      h(
        'div',
        { class: 'gallery-bar' },
        h('span', {
          class: 'gallery-position',
          text: t('galleryPosition', { n: index + 1, total }),
          attrs: { 'aria-live': 'polite' },
        }),
        h(
          'div',
          { class: 'gallery-text' },
          image.caption || image.alt ? h('p', { text: image.caption || image.alt }) : null,
          image.href
            ? h('a', {
                text: t('galleryLink'),
                attrs: { href: image.href, rel: 'noopener noreferrer' },
              })
            : null,
        ),
        total > 1
          ? iconButton({
              icon: 'chevron-left',
              label: t('galleryPrevious'),
              key: 'viewer-previous',
              onClick: () => move(-1),
            })
          : null,
        total > 1
          ? iconButton({
              icon: 'chevron-right',
              label: t('galleryNext'),
              key: 'viewer-next',
              onClick: () => move(1),
            })
          : null,
        iconButton({
          icon: 'close',
          label: t('galleryClose'),
          key: 'viewer-close',
          onClick: () => dialog.close(),
        }),
      ),
    );
    this.viewer = dialog;
    frame.append(dialog);
    const focused = this.root.activeElement;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    // Moving with the buttons keeps the focus on them across the render.
    const key = focused instanceof HTMLElement ? focused.dataset.focusKey : null;
    if (key?.startsWith('viewer-'))
      /** @type {HTMLElement | null} */ (
        dialog.querySelector(`[data-focus-key="${key}"]`)
      )?.focus();
  }

  /**
   * @param {number} index - The image shown when the viewer closed.
   */
  closeViewer(index) {
    if (this.current === null) return;
    this.current = null;
    this.viewer = null;
    this.render();
    /** @type {HTMLElement | null} */ (
      this.root.querySelector(`[data-focus-key="image-${index}"]`)
    )?.focus();
    emit(this, EVENTS.TOGGLE, { expanded: false });
  }
}
