/*
 * The three things on this page that move: the score demo (real data from a real ride), the
 * before/after colour slider, and the format switcher. Everything else is CSS. Nothing here is
 * required to read the page — if this file never loads, the demo shows its picture, the slider sits
 * in the middle and the format buttons still say what they are.
 */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ header
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.setAttribute('data-scrolled', String(window.scrollY > 8));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // -------------------------------------------------------- the score demo
  // How picky? maps to a percentile of the score, exactly like the app's own slider.
  const LEVELS = [88, 82, 75, 66, 55];
  const canvas = document.getElementById('demo-canvas');
  const range = document.getElementById('demo-range');
  const readout = document.getElementById('demo-readout');

  /** the parts the app would cut at this threshold: over the line, merged, long enough */
  function partsOf(score, threshold, secondsPerSample) {
    const runs = [];
    let start = -1;
    score.forEach((v, i) => {
      if (v > threshold && start < 0) start = i;
      if (v <= threshold && start >= 0) {
        runs.push([start, i]);
        start = -1;
      }
    });
    if (start >= 0) runs.push([start, score.length - 1]);
    // merge what is less than four seconds apart, then drop what is under three seconds
    const merged = [];
    for (const run of runs) {
      const last = merged[merged.length - 1];
      if (last && (run[0] - last[1]) * secondsPerSample < 4) last[1] = run[1];
      else merged.push([...run]);
    }
    return merged.filter(([a, b]) => (b - a) * secondsPerSample >= 3);
  }

  function percentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(at);
    const hi = Math.ceil(at);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  }

  function drawDemo(data, level) {
    if (!canvas) return;
    const css = getComputedStyle(document.documentElement);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { score } = data;
    const secondsPerSample = data.durationS / score.length;
    const threshold = percentile(score, LEVELS[level]);
    const parts = partsOf(score, threshold, secondsPerSample);
    const peak = Math.max(...score) * 1.08;
    const x = (i) => (i / (score.length - 1)) * w;
    const y = (v) => h - 14 - (Math.min(v, peak) / peak) * (h - 30);

    // the parts, as blocks behind the curve, in the colour of what the sensor found there
    const dominant = ([a, b]) => {
      let corner = 0;
      let accel = 0;
      for (let i = a; i <= b; i++) {
        corner += data.corner?.[i] ?? 0;
        accel += data.accel?.[i] ?? 0;
      }
      return accel > corner ? '--brake' : '--corner';
    };
    parts.forEach((part) => {
      const [a, b] = part;
      const colour = css.getPropertyValue(dominant(part));
      ctx.fillStyle = `${colour.trim()}38`;
      ctx.strokeStyle = `${colour.trim()}cc`;
      ctx.lineWidth = 1;
      const left = x(a);
      const width = Math.max(2, x(b) - x(a));
      ctx.fillRect(left, 8, width, h - 16);
      ctx.beginPath();
      ctx.moveTo(left + 0.5, 8);
      ctx.lineTo(left + 0.5, h - 8);
      ctx.stroke();
    });

    // the "fun enough" line
    ctx.strokeStyle = css.getPropertyValue('--fg-3').trim();
    ctx.globalAlpha = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y(threshold));
    ctx.lineTo(w, y(threshold));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // the score itself
    ctx.beginPath();
    score.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = css.getPropertyValue('--fg').trim();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (readout) {
      const kept = parts.reduce((a, [s, e]) => a + (e - s) * secondsPerSample, 0);
      const mins = Math.floor(kept / 60);
      const secs = Math.round(kept % 60);
      readout.innerHTML = `<b>${parts.length}</b> parts · <b>${mins}:${String(secs).padStart(
        2,
        '0',
      )}</b> of ${Math.round(data.durationS / 60)} minutes kept`;
    }
  }

  if (canvas && range) {
    fetch('assets/data/score.json')
      .then((r) => r.json())
      .then((data) => {
        const paint = () => drawDemo(data, Number(range.value));
        paint();
        range.addEventListener('input', paint);
        let resizeTimer;
        window.addEventListener('resize', () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(paint, 120);
        });
      })
      .catch(() => {
        if (readout) readout.textContent = 'a 22 minute ride · 26 parts';
      });
  }

  // ------------------------------------------------------- before and after
  const compare = document.getElementById('compare');
  const compareRange = document.getElementById('compare-range');
  if (compare && compareRange) {
    const set = (pct) => compare.style.setProperty('--split', `${pct}%`);
    set(compareRange.value);
    compareRange.addEventListener('input', () => set(compareRange.value));
    const track = (e) => {
      const box = compare.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100));
      compareRange.value = String(pct);
      set(pct);
    };
    compare.addEventListener('dragstart', (e) => e.preventDefault());
    compare.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      compare.setPointerCapture(e.pointerId);
      compare.dataset.dragging = 'true';
      track(e);
    });
    compare.addEventListener('pointermove', (e) => {
      if (compare.dataset.dragging === 'true') track(e);
    });
    const release = (e) => {
      delete compare.dataset.dragging;
      if (e.pointerId !== undefined && compare.hasPointerCapture?.(e.pointerId)) {
        compare.releasePointerCapture(e.pointerId);
      }
    };
    compare.addEventListener('pointerup', release);
    compare.addEventListener('pointercancel', release);
  }

  // ---------------------------------------------------------------- formats
  const mask = document.getElementById('format-mask');
  const frame = document.getElementById('format-frame');
  const chips = document.querySelectorAll('.format-buttons .chip');
  if (mask && frame && chips.length) {
    const apply = (btn) => {
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
      for (const el of [mask, frame]) {
        el.style.setProperty('--w', `${btn.dataset.w}%`);
        el.style.setProperty('--h', `${btn.dataset.h}%`);
      }
    };
    chips.forEach((c) => c.addEventListener('click', () => apply(c)));
    apply(document.querySelector('.format-buttons .chip[aria-pressed="true"]') ?? chips[0]);
  }

  // the table of contents is a list on a desktop and a fold-out on a phone
  const toc = document.querySelector('.docs-toc');
  if (toc) {
    const wide = window.matchMedia('(min-width: 960px)');
    const sync = () => (wide.matches ? toc.setAttribute('open', '') : toc.removeAttribute('open'));
    sync();
    wide.addEventListener('change', sync);
    toc.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => {
        if (!wide.matches) toc.removeAttribute('open');
      }),
    );
  }

  // ------------------------------------------------------------- docs menu
  // which section of the documentation is on screen
  const links = document.querySelectorAll('.docs-nav a[href^="#"]');
  if (links.length && 'IntersectionObserver' in window) {
    const byId = new Map([...links].map((a) => [a.getAttribute('href').slice(1), a]));
    const seen = new Set();
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) seen.add(entry.target.id);
          else seen.delete(entry.target.id);
        }
        // sections are long, so several can touch the band at once: the one furthest
        // down the page is the one being read
        let current = null;
        for (const id of byId.keys()) if (seen.has(id)) current = id;
        byId.forEach((a, id) =>
          id === current
            ? a.setAttribute('aria-current', 'true')
            : a.removeAttribute('aria-current'),
        );
        // keep the marked entry in view when the menu is taller than the column
        const marked = current && byId.get(current);
        const menu = marked?.closest('.docs-nav');
        if (marked && menu && menu.scrollHeight > menu.clientHeight + 4) {
          // move the menu's own scrollport only: scrollIntoView would scroll the page too,
          // which cancels a jump to #a-section on load
          const item = marked.getBoundingClientRect();
          const box = menu.getBoundingClientRect();
          if (item.top < box.top + 8) menu.scrollTop -= box.top + 8 - item.top;
          else if (item.bottom > box.bottom - 8) menu.scrollTop += item.bottom - (box.bottom - 8);
        }
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    byId.forEach((_, id) => {
      const el = document.getElementById(id);
      if (el) spy.observe(el);
    });
  }

  // a page that was asked not to move, does not move
  if (reduced) document.querySelectorAll('.reveal').forEach((el) => el.classList.remove('reveal'));
})();
