/**
 * Site backdrop: a quiet, living graph behind every page.
 *
 * - Nodes drift slowly and link to their neighbors; pulses of "data" travel along the
 *   links from node to node.
 * - Two soft chart lines move along the bottom of the screen, like live metrics.
 * - Near the pointer, nodes reach out to it.
 *
 * Colors come from the site tokens and follow the theme. The animation pauses when the
 * tab is hidden, and is drawn once, still, when reduced motion is requested.
 */
(() => {
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  canvas.className = 'backdrop';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const context = canvas.getContext('2d');
  if (!context) return;

  /** Distance under which two nodes are linked (CSS pixels). */
  const LINK = 150;
  /** Pointer reach (CSS pixels). */
  const REACH = 180;
  const MAX_PULSES = 7;

  let width = 0;
  let height = 0;
  let ratio = 1;
  /** @type {{ x: number, y: number, vx: number, vy: number, r: number }[]} */
  let nodes = [];
  /** @type {{ from: number, to: number, t: number, hops: number }[]} */
  let pulses = [];
  let colors = { accent: '20, 184, 166', ink: '17, 21, 28', strength: 1 };
  const pointer = { x: -1e4, y: -1e4, active: false };
  let frame = 0;
  let last = 0;
  let spawnIn = 0;
  let phase = 0;

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
    colors = {
      accent: rgb(styles.getPropertyValue(dark ? '--teal' : '--teal-deep').trim(), colors.accent),
      ink: rgb(styles.getPropertyValue('--site-fg').trim(), colors.ink),
      // Light backgrounds need a little more ink for the same presence.
      strength: dark ? 1 : 0.85,
    };
  }

  function resize() {
    ratio = Math.min(2, window.devicePixelRatio || 1);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // About one node per 21,000 px², within bounds that stay light on any screen.
    const count = Math.max(22, Math.min(88, Math.round((width * height) / 21000)));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      r: 1.1 + Math.random() * 1.3,
    }));
    pulses = [];
    draw(0);
  }

  /** Nearest linked neighbor of a node that is not `except`, or -1. */
  function neighbor(index, except = -1) {
    const a = nodes[index];
    let best = -1;
    let bestDistance = LINK;
    for (let i = 0; i < nodes.length; i += 1) {
      if (i === index || i === except) continue;
      const d = Math.hypot(nodes[i].x - a.x, nodes[i].y - a.y);
      // A little randomness so pulses do not always take the same road.
      const score = d * (0.7 + Math.random() * 0.6);
      if (score < bestDistance) {
        bestDistance = score;
        best = i;
      }
    }
    return best;
  }

  function spawnPulse() {
    const from = Math.floor(Math.random() * nodes.length);
    const to = neighbor(from);
    if (to >= 0) pulses.push({ from, to, t: 0, hops: 2 + Math.floor(Math.random() * 4) });
  }

  /** Two soft chart lines along the bottom, sliding slowly. */
  function drawCharts() {
    const base = height * 0.86;
    const series = [
      { amplitude: height * 0.06, speed: 1, alpha: 0.11, fill: true },
      { amplitude: height * 0.035, speed: 1.7, alpha: 0.08, fill: false },
    ];
    for (const [index, line] of series.entries()) {
      context.beginPath();
      for (let x = 0; x <= width + 8; x += 8) {
        const u = x / width;
        const y =
          base -
          index * height * 0.05 -
          line.amplitude *
            (0.55 * Math.sin(u * 5.2 + phase * line.speed + index) +
              0.3 * Math.sin(u * 11.3 - phase * 0.6 * line.speed) +
              0.15 * Math.sin(u * 23.7 + phase * 1.3));
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = `rgba(${colors.accent}, ${line.alpha * colors.strength * 1.6})`;
      context.lineWidth = 1.25;
      context.stroke();
      if (line.fill) {
        context.lineTo(width, height);
        context.lineTo(0, height);
        context.closePath();
        const gradient = context.createLinearGradient(0, base - line.amplitude, 0, height);
        gradient.addColorStop(0, `rgba(${colors.accent}, ${0.07 * colors.strength})`);
        gradient.addColorStop(1, `rgba(${colors.accent}, 0)`);
        context.fillStyle = gradient;
        context.fill();
      }
    }
  }

  function draw(dt) {
    context.clearRect(0, 0, width, height);
    drawCharts();

    // Move nodes, wrapping around the edges.
    for (const node of nodes) {
      node.x += node.vx * dt;
      node.y += node.vy * dt;
      if (node.x < -20) node.x = width + 20;
      else if (node.x > width + 20) node.x = -20;
      if (node.y < -20) node.y = height + 20;
      else if (node.y > height + 20) node.y = -20;
    }

    // Links.
    context.lineWidth = 1;
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.abs(dx) > LINK || Math.abs(dy) > LINK) continue;
        const d = Math.hypot(dx, dy);
        if (d >= LINK) continue;
        context.strokeStyle = `rgba(${colors.accent}, ${(1 - d / LINK) * 0.22 * colors.strength})`;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }

    // The pointer reaches the nodes around it.
    if (pointer.active) {
      for (const node of nodes) {
        const d = Math.hypot(node.x - pointer.x, node.y - pointer.y);
        if (d >= REACH) continue;
        context.strokeStyle = `rgba(${colors.accent}, ${(1 - d / REACH) * 0.35 * colors.strength})`;
        context.beginPath();
        context.moveTo(pointer.x, pointer.y);
        context.lineTo(node.x, node.y);
        context.stroke();
      }
    }

    // Nodes.
    for (const node of nodes) {
      context.fillStyle = `rgba(${colors.accent}, ${0.45 * colors.strength})`;
      context.beginPath();
      context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      context.fill();
    }

    // Pulses travel along a link, then hop to the next one.
    const next = [];
    for (const pulse of pulses) {
      pulse.t += dt / 95;
      const a = nodes[pulse.from];
      const b = nodes[pulse.to];
      if (!a || !b) continue;
      if (pulse.t >= 1) {
        if (pulse.hops > 0) {
          const following = neighbor(pulse.to, pulse.from);
          if (following >= 0)
            next.push({ from: pulse.to, to: following, t: 0, hops: pulse.hops - 1 });
        }
        continue;
      }
      const x = a.x + (b.x - a.x) * pulse.t;
      const y = a.y + (b.y - a.y) * pulse.t;
      const glow = context.createRadialGradient(x, y, 0, x, y, 9);
      glow.addColorStop(0, `rgba(${colors.accent}, ${0.55 * colors.strength})`);
      glow.addColorStop(1, `rgba(${colors.accent}, 0)`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = `rgba(${colors.accent}, ${0.9 * colors.strength})`;
      context.beginPath();
      context.arc(x, y, 1.8, 0, Math.PI * 2);
      context.fill();
      next.push(pulse);
    }
    pulses = next;
  }

  function tick(now) {
    // Elapsed time in 60 fps frames, capped so a stalled tab does not jump.
    const dt = last ? Math.min(3, (now - last) / 16.67) : 1;
    last = now;
    phase += dt * 0.0045;
    spawnIn -= dt;
    if (spawnIn <= 0 && pulses.length < MAX_PULSES) {
      spawnPulse();
      spawnIn = 28 + Math.random() * 40;
    }
    draw(dt);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    stop();
    if (still.matches || document.hidden) {
      draw(0);
      return;
    }
    last = 0;
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => (pointer.active = false));
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  still.addEventListener('change', start);
  // Theme changes: the site switch sets data-theme; the system can change too.
  new MutationObserver(() => {
    readColors();
    if (!frame) draw(0);
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readColors();
    if (!frame) draw(0);
  });

  readColors();
  resize();
  start();
})();
