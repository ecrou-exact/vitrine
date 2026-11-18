/**
 * Site backdrop: two soft waves along the bottom of every page, drawn once and still.
 * Colors come from the site tokens and follow the theme; the drawing is redone when the
 * window is resized or the theme changes. Nothing moves.
 */
(() => {
  const root = document.documentElement;
  const canvas = document.createElement('canvas');
  canvas.className = 'backdrop';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const context = canvas.getContext('2d');
  if (!context) return;

  let accent = '20, 184, 166';
  let strength = 1;

  /** Reads an `rgb()` triplet from a CSS color. */
  function rgb(value, fallback) {
    const probe = document.createElement('span');
    probe.style.color = value;
    probe.style.display = 'none';
    document.body.append(probe);
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).color);
    probe.remove();
    return match ? `${match[1]}, ${match[2]}, ${match[3]}` : fallback;
  }

  function readColors() {
    const styles = getComputedStyle(root);
    const dark = styles.colorScheme.includes('dark');
    accent = rgb(styles.getPropertyValue(dark ? '--teal' : '--teal-deep').trim(), accent);
    // Light backgrounds need a little more ink for the same presence.
    strength = dark ? 1 : 0.85;
  }

  function draw() {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const base = height * 0.7;
    const series = [
      { amplitude: height * 0.13, alpha: 0.11, fill: true, shift: 0 },
      { amplitude: height * 0.08, alpha: 0.08, fill: false, shift: 1.7 },
    ];
    for (const [index, line] of series.entries()) {
      context.beginPath();
      for (let x = 0; x <= width + 8; x += 8) {
        const u = x / width;
        const y =
          base -
          index * height * 0.11 -
          line.amplitude *
            (0.55 * Math.sin(u * 5.2 + line.shift + index) +
              0.3 * Math.sin(u * 11.3 - line.shift * 0.6) +
              0.15 * Math.sin(u * 23.7 + line.shift * 1.3));
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = `rgba(${accent}, ${line.alpha * strength * 1.6})`;
      context.lineWidth = 1.25;
      context.stroke();
      if (line.fill) {
        context.lineTo(width, height);
        context.lineTo(0, height);
        context.closePath();
        const gradient = context.createLinearGradient(0, base - line.amplitude, 0, height);
        gradient.addColorStop(0, `rgba(${accent}, ${0.07 * strength})`);
        gradient.addColorStop(1, `rgba(${accent}, 0)`);
        context.fillStyle = gradient;
        context.fill();
      }
    }
  }

  const redraw = () => {
    readColors();
    draw();
  };
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 150);
  });
  // Theme changes: the site switch sets data-theme; the system can change too.
  new MutationObserver(redraw).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
  redraw();
})();
