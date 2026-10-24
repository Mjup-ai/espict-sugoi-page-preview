/* ESPICT SCHOOL — interactions
   No dependencies. Every effect respects the motion switch (html[data-motion="off"]). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mqDesktop = matchMedia('(min-width: 1000px)');
  // sticky story / pinned gallery: wide screens, but not tall portrait tablets (1024×1366 etc.)
  const mqWideLayout = matchMedia('(min-width: 1200px), (min-width: 1000px) and (orientation: landscape)');
  const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
  const motionOn = () => root.dataset.motion !== 'off';

  /* ---------- Japanese line breaks at phrase boundaries (BudouX) ----------
     Breaks only between phrases, and keeps the last two phrases of each line-group together,
     so no lone characters end up on the last line — in every browser, including older Safari
     without `text-wrap: pretty`. Text that JS rewrites later, and the per-character hero title, are left alone. */
  let phraseBreak = () => {};
  if (typeof window.budouxJa === 'function') {
    const parser = window.budouxJa({ className: 'bdx', separator: document.createElement('wbr') });
    const SKIP = '[data-split], .belt, .bg-word, .wordmark, .sr-only, .sticker, [aria-live], [data-stage-title], [data-stage-caption], .deals__range, .film__time, [data-count], [data-stats], script, style, svg';
    const JA = /[\u3040-\u30ff\u3400-\u9fff]/;
    const blockOf = (node) => {
      for (let a = node.parentElement; a; a = a.parentElement) {
        const d = getComputedStyle(a).display;
        if (d !== 'inline' && d !== 'contents') return a;
      }
      return null;
    };
    const blocks = new Set();
    for (const root of $$('main, footer, .menu')) {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = w.nextNode())) {
        if (!JA.test(t.nodeValue) || !t.parentElement || t.parentElement.closest(SKIP)) continue;
        const b = blockOf(t);
        if (b && !b.matches(SKIP)) blocks.add(b);
      }
    }
    const outermost = [...blocks].filter((el) => { for (let a = el.parentElement; a; a = a.parentElement) if (blocks.has(a)) return false; return true; });
    outermost.forEach((el) => {
      try { parser.applyToElement(el); } catch (e) { /* leave this block as is */ }
      // BudouX only marks text it actually split; mark the rest too, so short titles get the same rules
      el.classList.add('bdx');
    });

    // ---- phrase fix-ups on top of BudouX ----
    // The block's text and its <wbr>/<br> marks, in reading order (nested .bdx blocks are their own unit).
    const scan = (block) => {
      const items = [];
      const w = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.nodeType === 1 && n !== block && n.classList.contains('bdx') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      let n;
      while ((n = w.nextNode())) {
        if (n.nodeType === 3) items.push({ text: n });
        else if (n.tagName === 'WBR' || n.tagName === 'BR') items.push({ mark: n });
      }
      return items;
    };
    const visible = (s) => s.replace(/[\s​]/g, '');
    // text between two marks (or the segment start/end)
    const around = (items, i) => {
      let before = ''; let after = '';
      for (let k = i - 1; k >= 0 && !items[k].mark; k--) before = items[k].text.nodeValue + before;
      for (let k = i + 1; k < items.length && !items[k].mark; k++) after += items[k].text.nodeValue;
      return { before: visible(before), after: visible(after) };
    };
    const KATA = /[゠-ヺー-ヿ]/; // katakana (incl. ー), without the middle dot 「・」
    const KANJI = /[㐀-鿿々]/;
    const LATIN = /[A-Za-z]/;
    const OPEN = /[「『（(【〈《［]/;
    const CLOSE = /^[、。，．,.」』）)】〉》］！？!?…・ーぁぃぅぇぉっゃゅょゎ\/／]/;
    const PUNCT_ONLY = /[\s​、。，．,.」』）)】〉》！？!?…・「『（(【〈《\/／]/g;
    const script = (ch) => (KATA.test(ch) ? 'k' : KANJI.test(ch) ? 'c' : LATIN.test(ch) ? 'l' : '');

    // words of this page that never break inside (app terms and set phrases)
    const KEEP = ['できたチェック', '少しずつ', '届きました', '課題の提出'];
    const kanjiTail = (s) => (s.match(/[\u3400-\u9fff\u3005]+$/) || [''])[0].length;
    const kanjiHead = (s) => (s.match(/^[\u3400-\u9fff\u3005]+/) || [''])[0].length;
    // 1) remove poor break points
    const prune = (block) => {
      const items = scan(block);
      items.forEach((it, i) => {
        if (!it.mark || it.mark.tagName !== 'WBR') return;
        const { before, after } = around(items, i);
        const a = before.slice(-1); const b = after.slice(0, 1);
        const sa = script(a); const sb = script(b);
        const remove =
          (KATA.test(a) && KATA.test(b)) ||                         // inside a katakana word (ショー|ト)
          (sa && sb && sa !== sb) ||                                // inside a compound (福祉|サービス, アプリ|画面); see 5)
          a === '・' ||                                             // inside a list (制作・|発信); see 5)
          (a === 'と' && after.startsWith('して')) ||                // と|して
          (a === 'の' && b === '方') ||                              // 利用者の|方
          (/(^|[^㐀-鿿])[㐀-鿿][りけきしいちみ]$/.test(before) && KANJI.test(b)) || // 取り|組み, 振り|返り
          (kanjiTail(before) && kanjiHead(after) && kanjiTail(before) + kanjiHead(after) <= 4) ||   // short kanji compounds: 質問|対応, 紹介|動画
          OPEN.test(a) ||                                            // right after an opening bracket
          CLOSE.test(after) ||                                       // right before closing punctuation or a slash
          KEEP.some((w) => [...w].some((_, k) => k > 0 && before.endsWith(w.slice(0, k)) && after.startsWith(w.slice(k)))); // fixed terms
        if (remove) it.mark.remove();
      });
    };

    // 2) short bracketed groups never break inside: （1分32秒）, 「できる」を (older Safari breaks right after 「 and （)
    const BR = /[「『（(【][^「『（(【」』）)】]{1,14}[」』）)】][をがはにのともへで]?/g;
    // numbers with separators (20:00〜, 2026.10.01, ○/○) never break inside — WebKit treats the colon as a break point
    const NUM = /[0-9０-９○]+(?:[:：.．,，\/／][0-9０-９○]+)+[〜~]?/g;
    const groupNumbers = (block) => {
      scan(block).forEach((it) => {
        if (!it.text || it.text.parentElement.closest('.nb, .nw')) return;
        NUM.lastIndex = 0;
        if (!NUM.test(it.text.nodeValue)) return;
        NUM.lastIndex = 0;
        const t = it.text; const v = t.nodeValue; const frag = document.createDocumentFragment();
        let last = 0; let m;
        while ((m = NUM.exec(v))) {
          if (m.index > last) frag.append(v.slice(last, m.index));
          const span = document.createElement('span'); span.className = 'nb'; span.textContent = m[0];
          frag.append(span); last = m.index + m[0].length;
        }
        if (last < v.length) frag.append(v.slice(last));
        t.replaceWith(frag);
      });
    };
    const groupBrackets = (block) => {
      groupNumbers(block);
      scan(block).forEach((it) => {
        if (!it.text || it.text.parentElement.closest('.nb, .nw')) return;
        BR.lastIndex = 0;
        if (!BR.test(it.text.nodeValue)) return;
        BR.lastIndex = 0;
        const t = it.text; const v = t.nodeValue; const frag = document.createDocumentFragment();
        let last = 0; let m;
        while ((m = BR.exec(v))) {
          if (m.index > last) frag.append(v.slice(last, m.index));
          const span = document.createElement('span'); span.className = 'nb'; span.textContent = m[0];
          frag.append(span); last = m.index + m[0].length;
        }
        if (last < v.length) frag.append(v.slice(last));
        t.replaceWith(frag);
      });
      // a particle in the next text node (<strong>「できる」</strong>を): wrap the element and the particle together
      const texts = scan(block).filter((it) => it.text);
      for (let k = 1; k < texts.length; k++) {
        const a = texts[k - 1].text; const b = texts[k].text;
        if (!/[」』）)】]$/.test(a.nodeValue) || !/^[をがはにのともへで]/.test(b.nodeValue)) continue;
        let el = a.parentElement;
        while (el && el !== block && el.parentElement !== b.parentElement) el = el.parentElement;
        if (!el || el === block || el.nextSibling !== b) continue;
        const span = document.createElement('span'); span.className = 'nb';
        el.before(span); span.append(el);
        b.splitText(1); span.append(b);
      }
    };

    // 3) a break point at the start or end of an inline element moves outside it
    //    (otherwise a highlighted phrase leaves a sliver of its background at the end of the previous line)
    const meaningful = (n) => n && (n.nodeType === 1 ? n.tagName !== 'WBR' : /[^\s​]/.test(n.nodeValue));
    const hoist = (block) => {
      block.querySelectorAll('wbr').forEach((w) => {
        if (w.closest('.bdx') !== block) return;
        for (let guard = 0; guard < 8; guard++) {
          const p = w.parentElement;
          if (!p || p === block || getComputedStyle(p).display !== 'inline') break;
          let prev = w.previousSibling; while (prev && !meaningful(prev)) prev = prev.previousSibling;
          if (!prev) { p.before(w); continue; }
          let next = w.nextSibling; while (next && !meaningful(next)) next = next.nextSibling;
          if (!next) { p.after(w); continue; }
          break;
        }
      });
    };

    // 4) glue a short last phrase (1–3 characters, like 「ある。」) to the phrase before it
    const glueLast = (block) => {
      const items = scan(block);
      let seg = [];
      const flushSeg = () => {
        const marks = seg.map((it, i) => (it.mark ? i : -1)).filter((i) => i >= 0);
        if (marks.length) {
          const i = marks[marks.length - 1];
          const lastText = visible(seg.slice(i + 1).map((it) => (it.text ? it.text.nodeValue : '')).join('')).replace(PUNCT_ONLY, '');
          const prevStart = marks.length > 1 ? marks[marks.length - 2] + 1 : 0;
          const prevText = visible(seg.slice(prevStart, i).map((it) => (it.text ? it.text.nodeValue : '')).join(''));
          if (lastText.length <= 3 && lastText.length + prevText.length <= 9) seg[i].mark.remove();
        }
        seg = [];
      };
      items.forEach((it) => { if (it.mark && it.mark.tagName === 'BR') flushSeg(); else seg.push(it); });
      flushSeg();
    };

    // 5) emergency break points, only for phrases wider than their box — at the edges of words
    //    (where the script changes, after 「・」, around brackets). Redone whenever the box width changes.
    const ctx = document.createElement('canvas').getContext('2d');
    const widthOf = (t) => {
      const s = getComputedStyle(t.parentElement);
      ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const v = t.nodeValue.replace(/​/g, '');
      return ctx.measureText(v).width + (parseFloat(s.letterSpacing) || 0) * v.length;
    };
    const kind = (ch) => (/[0-9０-９]/.test(ch) ? 'd' : /[぀-ゟ]/.test(ch) ? 'h' : KATA.test(ch) ? 'k' : KANJI.test(ch) ? 'c' : LATIN.test(ch) ? 'l' : 'p');
    const CLOSE_BR = /[」』）)】〉》］]/;
    const emergency = (block) => {
      block.querySelectorAll('wbr[data-e]').forEach((w) => { if (w.closest('.bdx') === block) w.remove(); });
      const cs = getComputedStyle(block);
      // a little safety margin: canvas measurements run slightly narrower than the laid-out text
      const W = block.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.fontSize) * 0.6;
      if (!(W > 0)) return;
      block.querySelectorAll('.nbx').forEach((s) => {
        if (s.closest('.bdx') !== block) return;
        const wSpan = [...s.childNodes].reduce((acc, n) => acc + (n.nodeType === 3 ? widthOf(n) : 0), 0);
        // short phrases (企業・商品の) stay whole; long lists may break after 「・」 like normal text
        s.classList.toggle('open', wSpan > W * 0.5);
      });
      let run = [];
      const flush = () => {
        const total = run.reduce((s, t) => s + widthOf(t), 0);
        if (total > W) {
          // the phrase as one string, mapped back to (text node, offset) — break points often sit between nodes
          const map = []; let str = '';
          run.forEach((t) => { for (let o = 0; o < t.nodeValue.length; o++) { const ch = t.nodeValue[o]; if (/[\s​]/.test(ch)) continue; map.push([t, o]); str += ch; } });
          // strong break points first (after 「・」, around brackets); word-edge points (where the script
          // changes) only inside pieces that still don't fit — so 投稿スケジュール stays whole when it can
          const strong = []; const weak = [];
          for (let i = 2; i <= str.length - 2; i++) {
            const c0 = str[i - 1]; const c1 = str[i];
            const g1 = map[i][0].parentElement.closest('.nb, .nw, .nbx:not(.open)');
            if (g1 && g1 === map[i - 1][0].parentElement.closest('.nb, .nw, .nbx:not(.open)')) continue;
            const k0 = kind(c0); const k1 = kind(c1);
            const rest = str.slice(i);
            const beforeOpen = OPEN.test(c1) && !OPEN.test(c0);
            const afterClose = CLOSE_BR.test(c0) && !CLOSE.test(rest) && !OPEN.test(c1) && k1 !== 'h';
            const plain = !CLOSE.test(rest) && !OPEN.test(c0) && k1 !== 'h' && k0 !== 'd' && k1 !== 'd';
            if (beforeOpen || afterClose || (plain && c0 === '・' && k1 !== 'p')) strong.push(i);
            else if (plain && k0 !== k1 && k0 !== 'p' && k1 !== 'p') weak.push(i);
          }
          const perChar = total / str.length;
          const bounds = [0, ...strong, str.length];
          const chosen = [...strong];
          for (let b = 1; b < bounds.length; b++) {
            const from = bounds[b - 1]; const to = bounds[b];
            if ((to - from) * perChar > W) weak.filter((i) => i > from && i < to).forEach((i) => chosen.push(i));
          }
          const cuts = chosen.sort((x, y) => x - y).map((i) => map[i]);
          // insert from the end so earlier offsets stay valid
          cuts.reverse().forEach(([t, o]) => {
            const w = document.createElement('wbr'); w.dataset.e = '1';
            if (o === 0) t.before(w); else t.splitText(o).before(w);
          });
        }
        run = [];
      };
      scan(block).forEach((it) => { if (it.mark) flush(); else run.push(it.text); });
      flush();
    };

    // 4b) browsers always allow a break after 「・」 (even with keep-all): keep phrases like 企業・商品の together
    //     with a no-wrap span; 5) opens it again (class .open) only when the phrase is wider than its box
    const TERMS = ['課題の提出'];
    const guardDots = (block) => {
      let run = [];
      const flush = (mark) => {
        const str = run.map((t) => t.nodeValue).join('');
        const parent = run.length && run[0].parentElement;
        if (/・(?!\s*$)/.test(str) && run.every((t) => t.parentElement === parent) && !parent.closest('.nb, .nw, .nbx')) {
          const span = document.createElement('span'); span.className = 'nbx';
          run[0].before(span); run.forEach((t) => span.append(t));
          // a fixed term of this page whose second half starts the next phrase (出席・学習時間・課題の｜提出を):
          // keep the term in one piece, together with the particle and punctuation after it
          const next = mark && mark.tagName === 'WBR' && mark.previousSibling === span ? mark.nextSibling : null;
          const term = next && next.nodeType === 3 && TERMS.find((w) => [...w].some((_, k) => k > 0 && str.endsWith(w.slice(0, k)) && next.nodeValue.startsWith(w.slice(k))));
          if (term) {
            const k = [...term].findIndex((_, i) => i > 0 && str.endsWith(term.slice(0, i)) && next.nodeValue.startsWith(term.slice(i)));
            const m = term.slice(k) + (/^[をにがはでと]?[、。，．）」]*/.exec(next.nodeValue.slice(term.length - k)) || [''])[0];
            span.append(m); next.nodeValue = next.nodeValue.slice(m.length); mark.remove();
            if (next.nodeValue) span.after(document.createElement('wbr'));
          }
        }
        run = [];
      };
      scan(block).forEach((it) => { if (it.mark) flush(it.mark); else run.push(it.text); });
      flush(null);
    };
    const fixBlock = (block) => { prune(block); groupBrackets(block); hoist(block); glueLast(block); guardDots(block); };
    $$('.bdx').forEach(fixBlock);
    // emergency points depend on the box width: (re)done when it changes. The work runs in the next frame,
    // outside the observer callback, and each block remembers the width it settled at — so our own changes
    // (wrapping a guarded phrase can resize a shrink-to-fit box) never start a resize loop.
    const lastW = new WeakMap();
    const innerW = (el) => { const s = getComputedStyle(el); return Math.round(el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)); };
    const pending = new Set();
    let frame = 0;
    const settle = () => {
      frame = 0;
      const els = [...pending]; pending.clear();
      els.forEach((el) => {
        const w = innerW(el);
        if (!w || lastW.get(el) === w) return;
        emergency(el);
        lastW.set(el, innerW(el));
      });
    };
    const ro = 'ResizeObserver' in window ? new ResizeObserver((entries) => {
      entries.forEach((e) => { if (Math.round(e.contentRect.width) !== lastW.get(e.target)) pending.add(e.target); });
      if (pending.size && !frame) frame = requestAnimationFrame(settle);
    }) : null;
    const watch = (el) => { if (ro) ro.observe(el); else emergency(el); };
    $$('.bdx').forEach(watch);
    // measurements change once the web fonts have arrived
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => $$('.bdx').forEach((b) => { if (lastW.has(b)) { emergency(b); lastW.set(b, innerW(b)); } }));
    phraseBreak = (el) => {
      el.classList.remove('bdx');
      try { parser.applyToElement(el); } catch (e) { return; }
      el.classList.add('bdx');
      fixBlock(el);
      emergency(el);
      lastW.set(el, innerW(el));
      watch(el);
    };
  }

  /* ---------- shared scroll / resize loop ---------- */
  const onScrollFns = [];
  const onResizeFns = [];
  let scrollQueued = false;
  const runScroll = () => {
    scrollQueued = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    for (const fn of onScrollFns) fn(y, vh);
  };
  const requestScroll = () => {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(runScroll); }
  };
  // height of the fixed header: effects that follow the reading position keep below it, even while it is shown
  const siteHeader = $('.site-header');
  let headerHeight = siteHeader ? siteHeader.offsetHeight : 0;
  const headerH = () => headerHeight;
  // where the screen below the header starts right now (the header slides away while reading down)
  const headerBottom = () => (siteHeader ? Math.max(0, siteHeader.getBoundingClientRect().bottom) : 0);
  onResizeFns.push(() => { headerHeight = siteHeader ? siteHeader.offsetHeight : 0; });
  const runResize = () => { for (const fn of onResizeFns) fn(); requestScroll(); };
  let resizeTimer;
  addEventListener('scroll', requestScroll, { passive: true });
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(runResize, 120); });
  // layout shifts once fonts and lazy images settle
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(runResize);
  addEventListener('load', runResize);
  // cached section positions go stale when content above them changes height (e.g. switching case tabs)
  if ('ResizeObserver' in window) {
    let lastMainH = 0;
    new ResizeObserver(([entry]) => {
      const h = Math.round(entry.contentRect.height);
      if (Math.abs(h - lastMainH) < 2) return;
      lastMainH = h;
      clearTimeout(resizeTimer); resizeTimer = setTimeout(runResize, 120);
    }).observe(document.querySelector('main'));
  }

  /* ---------- motion switch ---------- */
  const motionBtns = $$('[data-motion-toggle]');
  const syncMotionLabel = () => {
    const label = motionOn() ? '動きを止める' : '動きを再開する';
    $$('[data-motion-label]').forEach((el) => { el.textContent = label; });
    motionBtns.forEach((b) => b.setAttribute('title', label));
  };
  syncMotionLabel();
  motionBtns.forEach((btn) => btn.addEventListener('click', () => {
    if (motionOn()) root.dataset.motion = 'off'; else delete root.dataset.motion;
    try { localStorage.setItem('espict-motion', motionOn() ? 'on' : 'off'); } catch (e) { /* private mode */ }
    syncMotionLabel();
    document.dispatchEvent(new CustomEvent('motionchange'));
    runResize();
  }));

  /* ---------- header: hide on scroll down, show on scroll up ---------- */
  const header = $('[data-header]');
  let lastY = window.scrollY;
  onScrollFns.push((y) => {
    header.classList.toggle('is-scrolled', y > 8);
    const goingDown = y > lastY + 4;
    const goingUp = y < lastY - 4;
    if (goingDown && y > 480 && !header.contains(document.activeElement)) header.classList.add('is-hidden');
    else if (goingUp || y < 200) header.classList.remove('is-hidden');
    lastY = y;
  });
  header.addEventListener('focusin', () => header.classList.remove('is-hidden'));

  /* ---------- reading progress ---------- */
  const progress = $('.progress');
  onScrollFns.push((y, vh) => {
    const max = document.documentElement.scrollHeight - vh;
    progress.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : 0);
  });

  /* ---------- scrollspy for the header nav ---------- */
  const navLinks = $$('.gnav a');
  const spyTargets = navLinks.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && spyTargets.length) {
    const visible = new Map();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => visible.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
      let best = null; let bestRatio = 0;
      visible.forEach((ratio, el) => { if (ratio > bestRatio) { best = el; bestRatio = ratio; } });
      navLinks.forEach((a) => a.classList.toggle('is-current', !!best && a.getAttribute('href') === '#' + best.id));
    }, { rootMargin: '-35% 0px -55% 0px', threshold: [0, .01, .5, 1] });
    spyTargets.forEach((t) => spy.observe(t));
  }

  /* ---------- mobile menu ---------- */
  const menu = $('#menu');
  const menuOpenBtn = $('[data-menu-open]');
  const closeMenu = (returnFocus = true) => {
    if (menu.hidden) return;
    menu.hidden = true;
    root.classList.remove('is-locked');
    menuOpenBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) menuOpenBtn.focus();
  };
  menuOpenBtn.addEventListener('click', () => {
    menu.hidden = false;
    root.classList.add('is-locked');
    menuOpenBtn.setAttribute('aria-expanded', 'true');
    $('[data-menu-close]', menu).focus();
  });
  $('[data-menu-close]', menu).addEventListener('click', () => closeMenu());
  menu.addEventListener('click', (e) => { if (e.target.closest('a') && !e.target.closest('a[href^="#"]')) closeMenu(false); });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const id = a.getAttribute('href');
    const target = id.length > 1 ? document.getElementById(id.slice(1)) : null;
    if (!target) return;
    e.preventDefault();
    if (!menu.hidden) closeMenu(false);
    requestAnimationFrame(() => {
      const pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
      const y = Math.max(0, target.getBoundingClientRect().top + window.scrollY - pad);
      window.scrollTo({ top: y, behavior: motionOn() ? 'smooth' : 'auto' });
      if (location.hash !== id) history.pushState(null, '', id);
      // move keyboard focus along without scrolling again
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key !== 'Tab') return;
    const items = $$('a, button', menu);
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  addEventListener('resize', () => { if (innerWidth >= 1300) closeMenu(false); });

  /* ---------- reveal on scroll ---------- */
  const reveals = $$('[data-reveal]');
  // small stagger for siblings revealed together
  const groups = new Map();
  reveals.forEach((el) => {
    const g = groups.get(el.parentElement) || [];
    g.push(el); groups.set(el.parentElement, g);
  });
  groups.forEach((list) => list.forEach((el, i) => el.style.setProperty('--d', `${Math.min(i, 6) * 0.09}s`)));
  if ('IntersectionObserver' in window) {
    // shown once a fair part of it is on screen: 60px of a tall block, or 40% of a short heading
    // (a fixed margin at the bottom of the screen left short headings blank at the edge of low landscape screens)
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.intersectionRect.height >= Math.min(60, e.boundingClientRect.height * 0.4)) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: [0, 0.05, 0.1, 0.15, 0.25, 0.4, 0.6] });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- background words drift ---------- */
  const drifters = $$('[data-drift]');
  let driftData = [];
  const measureDrift = () => {
    driftData = drifters.map((el) => {
      const sec = el.parentElement;
      const r = sec.getBoundingClientRect();
      return { el, top: r.top + scrollY, h: r.height };
    });
  };
  onResizeFns.push(measureDrift);
  measureDrift();
  onScrollFns.push((y, vh) => {
    if (!motionOn()) { driftData.forEach((d) => d.el.style.setProperty('--drift', '0px')); return; }
    for (const d of driftData) {
      const p = (y + vh - d.top) / (d.h + vh); // 0 → 1 while the section crosses the screen
      if (p < -0.1 || p > 1.1) continue;
      d.el.style.setProperty('--drift', `${(0.5 - p) * 22}vw`);
    }
  });

  /* =========================================================
     HERO
     ========================================================= */
  const hero = $('.hero');

  // split headline into characters
  let charIndex = 0;
  $$('[data-split]', hero).forEach((line) => {
    const text = line.textContent;
    line.textContent = '';
    for (const ch of text) {
      const span = document.createElement('span');
      span.className = 'ch';
      span.textContent = ch;
      span.style.setProperty('--i', charIndex++);
      line.appendChild(span);
    }
  });
  requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add('is-ready')));

  // pixel field
  const canvas = $('.hero__pixels');
  const ctx = canvas.getContext('2d');
  const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
  const ripples = [];
  let cells = [];
  let cw = 0; let ch = 0; let gap = 28;
  let heroVisible = true;
  let rafId = 0;
  const PALETTE = { base: '#bfe9f8', wave: '#00bffb', near: '#00bffb', pink: '#ff3d8b', yellow: '#ffd83d', ink: '#0a1a2f' };

  const sizeCanvas = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gap = cw < 700 ? 22 : 28;
    cells = [];
    for (let y = gap / 2; y < ch; y += gap) {
      for (let x = gap / 2; x < cw; x += gap) cells.push({ x, y, r: Math.random() });
    }
  };

  const drawPixels = (now) => {
    const t = now / 1000;
    pointer.x = lerp(pointer.x, pointer.tx, 0.14);
    pointer.y = lerp(pointer.y, pointer.ty, 0.14);
    ctx.clearRect(0, 0, cw, ch);
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 9; rp.a *= 0.965;
      if (rp.a < 0.03) ripples.splice(i, 1);
    }
    const sigma2 = 2 * 120 * 120;
    for (const c of cells) {
      const phase = (c.x * 0.8 + c.y) * 0.0065 - t * 1.15;
      let w = Math.sin(phase);
      w = w > 0 ? w ** 14 : 0;
      const dx = c.x - pointer.x; const dy = c.y - pointer.y;
      const near = Math.exp(-(dx * dx + dy * dy) / sigma2);
      let ring = 0;
      for (const rp of ripples) {
        const d = Math.hypot(c.x - rp.x, c.y - rp.y) - rp.r;
        ring += Math.exp(-(d * d) / 900) * rp.a;
      }
      const s = 2.2 + w * 3.4 + near * 9 + ring * 9;
      let color = PALETTE.base; let alpha = 0.55;
      if (near > 0.22 || ring > 0.3) {
        color = c.r < 0.12 ? PALETTE.pink : c.r < 0.22 ? PALETTE.yellow : c.r < 0.27 ? PALETTE.ink : PALETTE.near;
        alpha = 0.55 + Math.min(0.45, near + ring);
      } else if (w > 0.25) {
        color = PALETTE.wave; alpha = 0.25 + w * 0.6;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(c.x - s / 2, c.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  };

  const loop = (now) => {
    rafId = 0;
    if (!heroVisible || !motionOn() || document.hidden) return;
    drawPixels(now);
    tickParallax();
    rafId = requestAnimationFrame(loop);
  };
  const startLoop = () => { if (!rafId && heroVisible && motionOn() && !document.hidden) rafId = requestAnimationFrame(loop); };
  const drawStatic = () => { pointer.tx = pointer.ty = pointer.x = pointer.y = -9999; drawPixels(2200); };

  sizeCanvas();
  if (motionOn()) startLoop(); else drawStatic();
  onResizeFns.push(() => { sizeCanvas(); if (!motionOn()) drawStatic(); });
  document.addEventListener('visibilitychange', startLoop);
  document.addEventListener('motionchange', () => {
    if (motionOn()) startLoop();
    else { drawStatic(); resetParallax(); }
  });
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; startLoop(); }).observe(hero);

  hero.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = e.clientX - r.left; pointer.ty = e.clientY - r.top;
    if (pointer.x < -999) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
    par.tx = (e.clientX / innerWidth - 0.5) * 2;
    par.ty = (e.clientY / innerHeight - 0.5) * 2;
  });
  hero.addEventListener('pointerleave', () => { pointer.tx = pointer.ty = -9999; par.tx = par.ty = 0; });
  hero.addEventListener('pointerdown', (e) => {
    if (!motionOn()) return;
    const r = canvas.getBoundingClientRect();
    ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, r: 0, a: 1 });
  });

  // pointer parallax for slabs, Jappu and stickers
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const depthEls = $$('[data-depth]', hero).map((el) => ({ el, d: parseFloat(el.dataset.depth) || 1 }));
  const tickParallax = () => {
    par.x = lerp(par.x, par.tx, 0.08);
    par.y = lerp(par.y, par.ty, 0.08);
    for (const { el, d } of depthEls) {
      el.style.setProperty('--px', `${(-par.x * d * 7).toFixed(2)}px`);
      el.style.setProperty('--py', `${(-par.y * d * 5).toFixed(2)}px`);
    }
  };
  const resetParallax = () => depthEls.forEach(({ el }) => { el.style.removeProperty('--px'); el.style.removeProperty('--py'); });

  // Jappu-chan talks when tapped (lines taken from the existing brand visuals)
  const jappu = $('[data-jappu]');
  const bubble = $('[data-bubble]');
  const phrases = ['やってみよう！', '好きで、つくる。', 'つくる。届ける。つながる。', '字幕を入れてみよう'];
  let phraseIndex = 0;
  jappu.addEventListener('click', (e) => {
    phraseIndex = (phraseIndex + 1) % phrases.length;
    bubble.firstElementChild.textContent = phrases[phraseIndex];
    if (!motionOn()) return;
    jappu.classList.remove('is-boing'); bubble.classList.remove('is-pop');
    void jappu.offsetWidth;
    jappu.classList.add('is-boing'); bubble.classList.add('is-pop');
    const r = canvas.getBoundingClientRect();
    const x = e.clientX || (jappu.getBoundingClientRect().left + 120);
    const y = e.clientY || (jappu.getBoundingClientRect().top + 200);
    ripples.push({ x: x - r.left, y: y - r.top, r: 0, a: 1.2 });
  });

  /* ---------- marquee belts: duplicate content for a seamless loop ---------- */
  $$('.belt__track').forEach((track) => { track.innerHTML += track.innerHTML; });

  /* =========================================================
     FILM
     ========================================================= */
  const player = $('[data-player]');
  if (player) {
    const video = $('video', player);
    $('[data-player-start]', player).addEventListener('click', () => {
      player.classList.add('is-playing');
      video.controls = true;
      video.play().catch(() => {});
      video.focus();
    });
  }

  /* =========================================================
     CASE TABS
     ========================================================= */
  const tabsRoot = $('[data-tabs]');
  if (tabsRoot) {
    const tabs = $$('[role="tab"]', tabsRoot);
    const panels = tabs.map((t) => $('#' + t.getAttribute('aria-controls')));
    const ink = $('.case-tabs__ink', tabsRoot);
    const moveInk = () => {
      const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
      if (!active) return;
      const list = active.parentElement;
      if (getComputedStyle(list).gridTemplateColumns.split(' ').length === 1) {
        ink.style.width = '';
        ink.style.height = `${active.offsetHeight}px`;
        ink.style.top = '0';
        ink.style.bottom = 'auto';
        ink.style.transform = `translateY(${active.offsetTop}px)`;
      } else {
        ink.style.height = ''; ink.style.top = ''; ink.style.bottom = '';
        ink.style.width = `${active.offsetWidth}px`;
        ink.style.transform = `translateX(${active.offsetLeft}px)`;
      }
    };
    // the two cards of a case slide in when it is shown; a card that is below the screen at that moment
    // (phones and tablets stack them) slides in when it comes into view, instead of off screen
    const cards = panels.map((p) => $$('.case-before, .case-after', p));
    const enterIo = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting || e.intersectionRect.height < Math.min(60, e.boundingClientRect.height * 0.4)) return;
        e.target.classList.remove('is-pending'); e.target.classList.add('is-entering'); enterIo.unobserve(e.target);
      });
    }, { threshold: [0, 0.05, 0.1, 0.15, 0.25, 0.4] }) : null;
    const enter = (list) => list.forEach((c) => {
      c.classList.remove('is-entering', 'is-pending'); if (enterIo) enterIo.unobserve(c);
      if (!motionOn()) return;
      const r = c.getBoundingClientRect(); const seen = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, headerH()));
      void c.offsetWidth;
      if (!enterIo || seen >= Math.min(60, r.height * 0.4)) c.classList.add('is-entering');
      else { c.classList.add('is-pending'); enterIo.observe(c); }
    });
    const select = (tab, focus) => {
      tabs.forEach((t, i) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
      if (focus) tab.focus({ preventScroll: true });
      moveInk();
      enter(cards[tabs.indexOf(tab)]);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t, false));
      t.addEventListener('keydown', (e) => {
        let n = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') n = 0;
        if (e.key === 'End') n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); select(tabs[n], true); }
      });
    });
    // "次のケース" buttons at the end of each panel
    const hint = $('.case-tabs__hint', tabsRoot);
    $$('[data-case-go]', tabsRoot).forEach((btn) => btn.addEventListener('click', () => {
      const tab = tabs[parseInt(btn.dataset.caseGo, 10) - 1];
      if (!tab) return;
      (hint || tab).scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
      select(tab, true);
    }));
    onResizeFns.push(moveInk);
    moveInk();
  }

  /* =========================================================
     APP STORY (sticky device + pixel wipe)
     ========================================================= */
  const story = $('[data-story]');
  if (story) {
    const chapters = $$('[data-chapter]', story);
    const stage = $('[data-stage]', story);
    const stageImgs = $$('img', stage);
    const stageTitle = $('[data-stage-title]', story);
    const stageCaption = $('[data-stage-caption]', story);
    const dots = $$('.story__dots li', story);
    const titles = ['01 教材とライブ授業', '02 エスピクトAI「ぴくと」', '03 出席・取り組みの記録'];
    const captions = chapters.map((c) => $('.chapter__caption', c)?.textContent || '');
    let active = 0; let busy = false; let queued = null;

    // load stage images a little before they are needed
    new IntersectionObserver(([e], obs) => {
      if (e.isIntersecting) { stageImgs.forEach((img) => { img.loading = 'eager'; }); obs.disconnect(); }
    }, { rootMargin: '120% 0px' }).observe(story);

    const wipeTo = async (next) => {
      if (busy) { queued = next; return; }
      if (next === active) return;
      busy = true;
      const img = stageImgs[next];
      stageTitle.textContent = titles[next];
      stageCaption.textContent = captions[next];
      phraseBreak(stageCaption);
      dots.forEach((d, i) => d.classList.toggle('is-active', i === next));
      if (motionOn()) {
        try { await img.decode(); } catch (e) { /* show anyway */ }
        const cols = 10; const rows = 7; const step = queued !== null ? 0 : 14;
        const grid = document.createElement('div');
        grid.className = 'wipe';
        grid.style.setProperty('--cols', cols); grid.style.setProperty('--rows', rows);
        const src = img.currentSrc || img.src;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cell = document.createElement('i');
            cell.style.backgroundImage = `url("${src}")`;
            cell.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
            cell.style.backgroundPosition = `${(c / (cols - 1)) * 100}% ${(r / (rows - 1)) * 100}%`;
            cell.style.animationDelay = `${(next > active ? c + r : (cols - 1 - c) + (rows - 1 - r)) * step}ms`;
            grid.appendChild(cell);
          }
        }
        stage.appendChild(grid);
        await new Promise((res) => setTimeout(res, (cols + rows) * step + 380));
        stageImgs.forEach((im, i) => im.classList.toggle('is-active', i === next));
        grid.remove();
      } else {
        stageImgs.forEach((im, i) => im.classList.toggle('is-active', i === next));
      }
      active = next;
      busy = false;
      if (queued !== null) { const q = queued; queued = null; if (q !== active) wipeTo(q); }
    };

    // Room before the first chapter and after the last one, so the sticky screen is fully in view for the whole
    // time the chapters are read: it has come up completely by the time the first chapter reaches the middle of the
    // screen, and the end of the column does not push it off the top while the last lines are still being read.
    const sticky = $('.story__sticky', story);
    const device = $('.device', story);
    const fitRoom = () => {
      if (!mqWideLayout.matches || !sticky.offsetHeight) { story.style.removeProperty('--story-tail'); story.style.removeProperty('--story-head'); return; }
      const hb = headerH(); const band = innerHeight - hb;
      story.style.setProperty('--story-head', `${Math.max(0, Math.round(device.offsetHeight + 8 - (innerHeight - (hb + band * 0.55))))}px`);
      // the screen may rise to the header; it does so only once the last chapter has moved up past the top quarter
      story.style.setProperty('--story-tail', `${Math.max(0, Math.round(sticky.offsetHeight - band * 0.25 + 6))}px`);
    };
    onResizeFns.push(fitRoom);
    fitRoom();

    onScrollFns.push((y, vh) => {
      if (!mqWideLayout.matches) return;
      // the screen shows the chapter whose start has reached the reading line (a little below the middle of the
      // screen under the header)
      const line = headerH() + (vh - headerH()) * 0.55;
      let idx = 0;
      chapters.forEach((c, i) => { if (c.getBoundingClientRect().top < line) idx = i; });
      if (idx !== active || busy) wipeTo(idx);
      else queued = null;
    });
  }

  /* ---------- real app screenshots (dialog) ---------- */
  const shotDialog = $('[data-shot-dialog]');
  const SHOTS = {
    home: { name: '今日の取り組み', src: 'assets/img/real-home.webp', w: 938, h: 626, role: '利用者画面' },
    lessons: { name: '教材ライブラリ・動画編集の基礎編', src: 'assets/img/real-materials.webp', w: 938, h: 576, role: '利用者画面' },
    ai: { name: 'ぴくとに相談', src: 'assets/img/real-consult.webp', w: 972, h: 586, role: 'AI回答の実例' },
    records: { name: '取り組み記録（記録のない月の表示）', src: 'assets/img/real-records.webp', w: 958, h: 220, role: '利用者側の記録画面' },
  };
  if (shotDialog && typeof shotDialog.showModal === 'function') {
    const img = $('[data-shot-img]', shotDialog);
    let opener = null;
    const close = () => shotDialog.close();
    $$('[data-shot]').forEach((btn) => btn.addEventListener('click', () => {
      const s = SHOTS[btn.dataset.shot];
      if (!s) return;
      opener = btn;
      $('[data-shot-meta]', shotDialog).textContent = `${s.role}\u00a0/ 実際のアプリ\u00a0/ 2026.10.01 撮影・一部抜粋`;
      $('[data-shot-title]', shotDialog).textContent = s.name;
      phraseBreak($('[data-shot-meta]', shotDialog));
      phraseBreak($('[data-shot-title]', shotDialog));
      img.src = s.src; img.width = s.w; img.height = s.h;
      img.alt = `エスピクトスクール専用アプリの${s.name}。2026.10.01撮影の実画面から一部抜粋`;
      shotDialog.showModal();
      root.classList.add('is-locked');
      $('[data-shot-close]', shotDialog).focus();
    }));
    $('[data-shot-close]', shotDialog).addEventListener('click', close);
    shotDialog.addEventListener('click', (e) => { if (e.target === shotDialog) close(); });
    shotDialog.addEventListener('close', () => { root.classList.remove('is-locked'); opener?.focus(); });
  } else {
    // very old browsers: open the image itself
    $$('[data-shot]').forEach((btn) => btn.addEventListener('click', () => {
      const s = SHOTS[btn.dataset.shot]; if (s) window.open(s.src, '_blank', 'noopener');
    }));
  }

  /* =========================================================
     WORKS (pinned horizontal scroll on desktop)
     ========================================================= */
  const works = $('[data-works]');
  if (works) {
    const section = works.closest('.works');
    const rail = $('[data-works-rail]', works);
    const track = $('[data-works-track]', works);
    const items = $$('.job, .works__end', track);
    const jobs = $$('.job', track);
    const bar = $('.works__bar', works);
    const current = $('[data-works-current]', works);
    const prevBtn = $('[data-works-prev]', works);
    const nextBtn = $('[data-works-next]', works);
    let pinned = false; let top = 0; let dist = 0; let index = 0; let centers = [];

    // cards are positioned relative to the rail (offsetParent), the same box that gets translated
    const centerOf = (el) => el.offsetLeft + el.offsetWidth / 2;
    const measure = () => {
      pinned = mqWideLayout.matches && motionOn() && innerHeight >= 560;
      section.classList.toggle('is-pinned', pinned);
      // the track is only a scroll container (worth focusing) in carousel mode
      if (pinned) track.removeAttribute('tabindex'); else track.tabIndex = 0;
      rail.style.transform = '';
      if (!pinned) { works.style.height = ''; return; }
      dist = Math.max(0, rail.scrollWidth - innerWidth);
      works.style.height = `${dist + innerHeight}px`;
      top = works.getBoundingClientRect().top + scrollY;
      centers = items.map(centerOf);
    };
    // aria-disabled (not disabled) so a keyboard user's focus stays on the button at either end
    const setEdges = (atStart, atEnd) => {
      prevBtn.setAttribute('aria-disabled', String(atStart));
      nextBtn.setAttribute('aria-disabled', String(atEnd));
    };
    const setIndex = (i) => {
      index = i;
      current.textContent = String(Math.min(i, jobs.length - 1) + 1).padStart(2, '0');
    };
    // pinned rail: the first card whose left edge is inside the screen (the last card once the rail has ended)
    const railGutter = () => parseFloat(getComputedStyle(rail).paddingLeft) || 0;
    const firstVisible = (x) => {
      const g = railGutter();
      const i = jobs.findIndex((c) => c.offsetLeft - x >= g - 4);
      return i < 0 ? jobs.length - 1 : i;
    };
    const railX = () => clamp(window.scrollY - top, 0, dist);
    const update = (y) => {
      let p = 0;
      if (pinned) {
        p = clamp((y - top) / (dist || 1), 0, 1);
        const x = p * dist;
        rail.style.transform = `translate3d(${-x.toFixed(1)}px, 0, 0)`;
        setIndex(x >= dist - 2 ? jobs.length - 1 : firstVisible(x));
        setEdges(x <= 1, x >= dist - 1);
      }
      bar.style.setProperty('--works-p', p.toFixed(4));
    };
    const onTrackScroll = () => {
      if (pinned) return;
      const max = track.scrollWidth - track.clientWidth;
      const p = max > 0 ? track.scrollLeft / max : 0;
      bar.style.setProperty('--works-p', p.toFixed(4));
      const viewCenter = track.scrollLeft + track.clientWidth / 2;
      let best = 0; let bestD = Infinity;
      items.forEach((el, i) => { const d = Math.abs(el.offsetLeft - track.offsetLeft + el.offsetWidth / 2 - viewCenter); if (d < bestD) { bestD = d; best = i; } });
      setIndex(best);
      setEdges(track.scrollLeft <= 2, track.scrollLeft >= max - 2);
    };
    const goTo = (i) => {
      i = clamp(i, 0, items.length - 1);
      const el = items[i];
      const behavior = motionOn() ? 'smooth' : 'auto';
      track.scrollTo({ left: el.offsetLeft - track.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft), behavior });
    };
    // pinned: align the next/previous card with the left edge (the head panel comes first)
    const step = (dir) => {
      const behavior = motionOn() ? 'smooth' : 'auto';
      const x = railX();
      const i = x >= dist - 2 ? jobs.length - 1 : firstVisible(x);
      let target;
      if (dir > 0) target = items[Math.min(i + 1, items.length - 1)].offsetLeft - railGutter();
      else target = i <= 0 ? 0 : jobs[i - 1].offsetLeft - railGutter();
      if (dir > 0 && target <= x + 2) target = x + (jobs[1].offsetLeft - jobs[0].offsetLeft);
      window.scrollTo({ top: top + clamp(target, 0, dist), behavior });
    };
    prevBtn.addEventListener('click', () => { if (prevBtn.getAttribute('aria-disabled') === 'true') return; if (pinned) step(-1); else goTo(index - 1); });
    nextBtn.addEventListener('click', () => { if (nextBtn.getAttribute('aria-disabled') === 'true') return; if (pinned) step(1); else goTo(index + 1); });
    track.addEventListener('scroll', onTrackScroll, { passive: true });
    // keyboard users: bring the focused card into view inside the pinned rail
    track.addEventListener('focusin', (e) => {
      if (!pinned) return;
      const el = e.target.closest('.job, .works__end');
      if (!el) return;
      const x = clamp(centerOf(el) - innerWidth / 2, 0, dist);
      window.scrollTo({ top: top + x, behavior: 'auto' });
    });
    onResizeFns.push(() => { measure(); onTrackScroll(); });
    onScrollFns.push(update);
    measure(); setIndex(0); setEdges(true, false);
  }

  /* =========================================================
     ROLES BUILDER
     ========================================================= */
  const board = $('[data-board]');
  if (board) {
    const btns = $$('[data-role]');
    const status = $('[data-board-status]');
    const meter = $('[data-board-meter]');
    const meterMini = $('[data-board-meter-mini]');
    const peek = $('[data-board-peek]');
    const NAMES = { research: 'A 調べる・整理する', make: 'B つくる・整える', check: 'C 確かめる・仕上げる' };
    const state = { research: false, make: false, check: false };
    let holdStamp = false; // a build keeps the stamp back until the checklist has played and the stamp can be seen
    const render = (announce = true) => {
      btns.forEach((b) => b.setAttribute('aria-pressed', String(state[b.dataset.role])));
      Object.keys(state).forEach((k) => board.classList.toggle(`has-${k}`, state[k]));
      const on = Object.keys(state).filter((k) => state[k]);
      board.classList.toggle('is-empty', on.length === 0);
      // the 「完成！」 stamp: straight after the third role when chosen by hand; in a build, once it can be seen
      board.classList.toggle('is-complete', on.length === 3 && !holdStamp);
      meter.style.transform = `scaleX(${on.length / 3})`;
      if (meterMini) meterMini.style.transform = `scaleX(${on.length / 3})`;
      if (peek) { peek.textContent = on.length === 3 ? '3つの役割がそろいました。下の制作ボードで完成形を確認できます' : on.length ? `制作ボードに反映中（${on.length}/3）` : '役割を選ぶと、下の制作ボードが組み上がります'; phraseBreak(peek); }
      let msg = '役割を選んでください。';
      if (on.length === 3) msg = '3つの役割がそろい、告知画像と投稿文が仕上がりました。';
      else if (on.length) msg = `「${on.map((k) => NAMES[k]).join('」「')}」を担当中。ほかの役割が加わると、制作が進みます。`;
      status.setAttribute('aria-live', announce ? 'polite' : 'off');
      status.textContent = msg;
      phraseBreak(status);
    };
    /* Building the board part by part. Each part is added only while it can be seen, and a beat after the
       previous one, so nothing assembles off screen (on a jump through the page, a quick flick, or below the buttons
       on phones). It pauses while the board is out of view and carries on when it comes back. */
    const ORDER = ['research', 'make', 'check'];
    // a part every 0.6s on its own (quick enough to finish while the board is in view at a reading pace);
    // slower, every 1.2s, when the visitor asks to watch it with 「順番に見る」
    const STEP_MS = 600; const STEP_MS_PLAY = 1200;
    const partEls = { research: $('.board__memo', board), make: $('.board__post', board), check: $('.board__check', board) };
    let build = null; // { announce, gap, last } while a build is running
    let autoState = 'waiting'; // first visit: waiting → done (taken over by the visitor, or built once)
    let ticker = 0; let calmTimer = 0; let boardInView = false; let lastScroll = 0; let lastFast = 0; let tickY = scrollY; const trail = [];
    // when the page last moved, and when it last moved fast (over 1px per ms: a link jump, a flick, a big step) –
    // frame by frame, and across the last 0.15s so the slow start and end of such a move count too
    onScrollFns.push((y) => {
      const now = performance.now();
      const prev = trail[trail.length - 1];
      trail.push([now, y]); while (trail.length > 2 && now - trail[1][0] > 150) trail.shift();
      const [t0, y0] = trail[0];
      const step = prev ? Math.abs(y - prev[1]) / Math.min(50, Math.max(8, now - prev[0])) : 0;
      if (step > 1 || Math.abs(y - y0) / Math.max(50, Math.min(150, now - t0)) > 1) lastFast = now;
      lastScroll = now;
      // look again as soon as a move has calmed down, rather than at the next round
      if (ticker) { clearTimeout(calmTimer); calmTimer = setTimeout(tick, 160); }
    });
    const shownShare = (el) => {
      // share of the element inside the screen below the header; parts taller than that count by the screen they fill
      const r = el.getBoundingClientRect(); const hb = headerBottom();
      const h = Math.min(r.height, innerHeight - hb);
      return h > 0 ? Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, hb)) / h : 0;
    };
    const stopTicker = () => { clearInterval(ticker); ticker = 0; };
    const tick = () => {
      const now = performance.now();
      // nothing starts or is added while the page is moving fast (also caught here, between frames)
      if (Math.abs(scrollY - tickY) > 40) lastFast = now;
      tickY = scrollY;
      if (now - lastFast < 150) return;
      if (!build) {
        if (autoState !== 'waiting') { stopTicker(); return; }
        // the first time the board is in view while the page is calm (not flying past), show the idea once;
        // the first part comes in this same step
        if (shownShare(board) < 0.55) return;
        autoState = 'done';
        if (ORDER.some((k) => state[k])) return;
        startBuild(false);
        return;
      }
      const next = ORDER.find((k) => !state[k]);
      // a part already in the upper half of the screen will soon be scrolled away: do not keep it waiting
      const leaving = (el) => el.getBoundingClientRect().top < headerBottom() + (innerHeight - headerBottom()) * 0.45;
      if (!next) {
        // last, the stamp: once the first checks have ticked (0.6s) and the page is still for a moment (the visitor
        // is looking), or straight away if the checklist is about to be scrolled away; always while it is in view
        const ready = leaving(partEls.check) ? now - build.last >= 200 : now - build.last >= 600 && now - lastScroll >= 150;
        if (ready && shownShare(partEls.check) >= 0.8) { holdStamp = false; board.style.setProperty('--stamp-delay', '.1s'); render(build.announce); build = null; stopTicker(); }
        return;
      }
      const gap = leaving(partEls[next]) ? Math.min(200, build.gap) : build.gap;
      if (now - build.last >= gap && shownShare(partEls[next]) >= 0.7) { state[next] = true; build.last = now; render(build.announce); }
    };
    const startTicker = () => { if (!ticker && boardInView) ticker = setInterval(tick, 50); };
    const finishAll = (announce) => { build = null; holdStamp = false; ORDER.forEach((k) => { state[k] = true; }); render(announce); };
    const startBuild = (announce) => {
      ORDER.forEach((k) => { state[k] = false; });
      holdStamp = true; board.style.removeProperty('--stamp-delay');
      render(announce);
      if (!motionOn()) { finishAll(announce); return; }
      const gap = announce ? STEP_MS_PLAY : STEP_MS;
      // the first part comes straight away (the board has just been seen), the next ones a beat apart
      build = { announce, gap, last: performance.now() - gap };
      startTicker();
      tick();
    };
    const takeOver = () => { autoState = 'done'; build = null; holdStamp = false; board.style.removeProperty('--stamp-delay'); };
    btns.forEach((b) => b.addEventListener('click', () => {
      takeOver();
      state[b.dataset.role] = !state[b.dataset.role];
      render();
    }));
    $('[data-roles-play]').addEventListener('click', () => {
      takeOver();
      // bring the whole board into view first (phones and tablets: it is below the buttons; a board taller than the
      // screen is lined up with its top, and the rest is built as it comes into view)
      const r = board.getBoundingClientRect(); const hb = headerH(); const band = innerHeight - hb;
      let dy = 0;
      if (r.height > band - 24 || r.top < hb + 8) dy = r.top - (hb + 12);
      else if (r.bottom > innerHeight - 8) dy = r.bottom - (innerHeight - 12);
      if (Math.abs(dy) > 4) window.scrollTo({ top: scrollY + dy, behavior: motionOn() ? 'smooth' : 'auto' });
      startBuild(true);
    });
    $('[data-roles-reset]').addEventListener('click', () => {
      takeOver();
      ORDER.forEach((k) => { state[k] = false; });
      render();
    });
    // with motion off the board starts complete, so its content is there to read without pressing anything
    if (!motionOn()) { ORDER.forEach((k) => { state[k] = true; }); autoState = 'done'; }
    render(false);
    document.addEventListener('motionchange', () => {
      if (!motionOn() && (build || autoState === 'waiting')) { autoState = 'done'; finishAll(false); }
    });
    new IntersectionObserver((entries) => {
      boardInView = entries[entries.length - 1].isIntersecting;
      if (boardInView && (build || autoState === 'waiting')) startTicker();
      else if (!boardInView) stopTicker();
    }).observe(board);
  }

  /* =========================================================
     SCHEME — pattern B: loop (∞) diagram
     Path order: hub → office → hub → company → hub.
     Segments 0/2 leave the hub (届ける), 1/3 come back (集まる).
     ========================================================= */
  const loopEl = $('[data-loop]');
  if (loopEl) {
    const svg = $('.loop__svg', loopEl);
    const track = $('.loop__track', loopEl);
    const flow = $('.loop__flow', loopEl);
    const dotsG = $('.loop__dots', loopEl);
    const labels = $$('[data-loop-label]', loopEl);
    const nodeEl = (k) => $(`[data-loop-node="${k}"]`, loopEl);
    const NS = 'http://www.w3.org/2000/svg';
    const dots = Array.from({ length: 6 }, () => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', '7');
      dotsG.appendChild(c);
      return c;
    });
    let len = 0; let marks = []; let visible = false; let raf = 0;

    const drawDots = (now) => {
      if (!len) return;
      dots.forEach((c, i) => {
        const at = ((now / 1000) * 120 + (i * len) / dots.length) % len;
        const p = flow.getPointAtLength(at);
        c.setAttribute('cx', p.x.toFixed(1));
        c.setAttribute('cy', p.y.toFixed(1));
        const seg = at < marks[1] ? 0 : at < marks[2] ? 1 : at < marks[3] ? 2 : 3;
        c.setAttribute('fill', seg % 2 === 0 ? '#ffd83d' : '#00bffb');
      });
    };
    const measure = () => {
      if (!loopEl.getClientRects().length) return; // pattern not shown
      const box = loopEl.getBoundingClientRect();
      const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top]; };
      const H = center(nodeEl('hub')); const O = center(nodeEl('office')); const K = center(nodeEl('company'));
      const horizontal = Math.abs(K[0] - O[0]) > Math.abs(K[1] - O[1]);
      const dir = (q) => { const dx = q[0] - H[0]; const dy = q[1] - H[1]; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l, l]; };
      const [ux, uy, dO] = dir(O); const [vx, vy, dK] = dir(K);
      const n = horizontal ? [0, 1] : [1, 0]; // outgoing arcs below (wide) / right (narrow)
      // labels sit at the middle of each arc (≈ 0.75 r from the centre line); keep the pair inside the box
      // (wide: the arcs bow 0.75 r above and below the row, so keep them inside the box as well)
      const r = horizontal ? Math.min(210, Math.max(dO, dK) * 0.52, (box.height / 2 - 22) / 0.75) : Math.min(box.width * 0.33, 150);
      const at = (p, d, s, t) => [p[0] + d[0] * s + n[0] * t, p[1] + d[1] * s + n[1] * t];
      const f = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
      const u = [ux, uy]; const v = [vx, vy];
      const segs = [
        `C ${f(at(H, u, dO * 0.34, r))} ${f(at(O, u, -dO * 0.3, r))} ${f(O)}`,
        `C ${f(at(O, u, -dO * 0.3, -r))} ${f(at(H, u, dO * 0.34, -r))} ${f(H)}`,
        `C ${f(at(H, v, dK * 0.34, r))} ${f(at(K, v, -dK * 0.3, r))} ${f(K)}`,
        `C ${f(at(K, v, -dK * 0.3, -r))} ${f(at(H, v, dK * 0.34, -r))} ${f(H)}`,
      ];
      svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}`);
      let d = `M ${f(H)}`;
      marks = [0];
      segs.forEach((s) => { d += ` ${s}`; track.setAttribute('d', d); marks.push(track.getTotalLength()); });
      flow.setAttribute('d', d);
      len = marks[4];
      // each label sits on the middle of its arc; its arrow follows the direction of travel
      labels.forEach((lab, i) => {
        const mid = (marks[i] + marks[i + 1]) / 2;
        const p = flow.getPointAtLength(mid);
        const a = flow.getPointAtLength(Math.max(0, mid - 3)); const b = flow.getPointAtLength(Math.min(len, mid + 3));
        lab.style.left = `${p.x.toFixed(1)}px`;
        lab.style.top = `${p.y.toFixed(1)}px`;
        lab.style.setProperty('--angle', `${(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI).toFixed(1)}deg`);
      });
      loopEl.classList.add('is-ready');
      drawDots(motionOn() ? performance.now() : 0);
    };
    const tick = (now) => {
      raf = 0;
      if (!visible || !motionOn() || document.hidden || !len) return;
      drawDots(now);
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf && visible && motionOn() && !document.hidden) raf = requestAnimationFrame(tick); };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !len) measure(); start(); }).observe(loopEl);
    document.addEventListener('visibilitychange', start);
    document.addEventListener('motionchange', () => { if (motionOn()) start(); else drawDots(0); });
    document.addEventListener('schemechange', () => { measure(); start(); });
    onResizeFns.push(measure);
  }

  /* ---------- comparison switch for the diagram patterns (A/B/C) ---------- */
  const schemeVariants = $('[data-scheme-variants]');
  if (schemeVariants) {
    const variants = $$('[data-variant]', schemeVariants);
    const switchBtns = $$('[data-scheme-btn]');
    const show = (key, remember) => {
      if (!variants.some((v) => v.dataset.variant === key)) key = 'a';
      variants.forEach((v) => {
        const on = v.dataset.variant === key;
        if (on && v.hidden && motionOn()) { v.classList.remove('is-entering'); void v.offsetWidth; v.classList.add('is-entering'); }
        v.hidden = !on;
      });
      switchBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.schemeBtn === key)));
      if (remember) {
        // keep the choice in the URL so a pattern can be shared (?scheme=b#support)
        try {
          const url = new URL(location.href);
          if (key === 'a') url.searchParams.delete('scheme'); else url.searchParams.set('scheme', key);
          history.replaceState(null, '', url);
        } catch (e) { /* some browsers block this on file:// */ }
      }
      document.dispatchEvent(new CustomEvent('schemechange'));
    };
    switchBtns.forEach((b) => b.addEventListener('click', () => show(b.dataset.schemeBtn, true)));
    show(new URLSearchParams(location.search).get('scheme') || 'a', false);
  }

  /* =========================================================
     COUNTERS
     ========================================================= */
  // count up once the numbers have been fully in view for a moment, not while the page jumps or flicks past them;
  // if they leave the screen before the end, show the final value and count again the next time they are seen
  const countWhenSeen = (box, nums) => {
    const ease = (t) => 1 - Math.pow(2, -10 * t);
    const final = () => nums.forEach((el) => { el.textContent = el.dataset.count; });
    let state = 'waiting'; let seenSince = 0; let poll = 0;
    const inView = () => {
      const r = box.getBoundingClientRect(); const hb = headerBottom();
      return r.height > 0 && Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, hb)) / r.height >= 0.9;
    };
    const stopPoll = () => { clearInterval(poll); poll = 0; };
    const count = () => {
      state = 'counting';
      const start = performance.now(); const dur = 1400;
      const step = (now) => {
        if (!inView()) { final(); state = 'waiting'; seenSince = 0; return; }
        const t = clamp((now - start) / dur, 0, 1);
        nums.forEach((el) => { el.textContent = Math.round(parseInt(el.dataset.count, 10) * ease(t)); });
        if (t < 1) requestAnimationFrame(step); else { state = 'done'; stopPoll(); }
      };
      nums.forEach((el) => { el.textContent = '0'; });
      requestAnimationFrame(step);
    };
    const check = () => {
      if (state !== 'waiting') return;
      if (!motionOn()) { final(); state = 'done'; stopPoll(); return; }
      if (inView()) { if (!seenSince) seenSince = performance.now(); else if (performance.now() - seenSince >= 350) count(); }
      else seenSince = 0;
    };
    new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e.isIntersecting && state !== 'done') { if (!poll) poll = setInterval(check, 80); }
      else if (!e.isIntersecting) { stopPoll(); seenSince = 0; }
    }).observe(box);
  };
  const dealNums = $$('.deals__range [data-count]');
  if (dealNums.length) countWhenSeen(dealNums[0].parentElement, dealNums);

  /* ---------- this month's numbers: from data/stats.json, only the figures it gives (nothing is made up) ---------- */
  const statsEl = $('[data-stats]');
  if (statsEl && 'fetch' in window) {
    fetch('data/stats.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d || typeof d !== 'object') return;
      const shown = $$('[data-stat]', statsEl).filter((el) => {
        const v = d[el.dataset.stat];
        const ok = typeof v === 'number' && Number.isFinite(v) && v >= 0;
        el.hidden = !ok;
        if (ok) { const num = $('[data-stat-num]', el); num.dataset.count = String(Math.round(v)); num.textContent = num.dataset.count; }
        return ok;
      });
      if (!shown.length) return;
      const label = $('[data-stats-label]', statsEl);
      if (typeof d.label === 'string' && d.label.trim()) label.textContent = d.label.trim();
      const note = $('[data-stats-note]', statsEl);
      if (typeof d.note === 'string' && d.note.trim()) { note.textContent = d.note.trim(); note.hidden = false; }
      statsEl.hidden = false;
      phraseBreak(label); if (!note.hidden) phraseBreak(note);
      runResize();
      countWhenSeen($('.stats__list', statsEl), shown.map((el) => $('[data-stat-num]', el)));
    }).catch(() => { /* no file (e.g. opened from disk): the block stays hidden */ });
  }

  /* =========================================================
     SENT: the checks, the 「届きました」 and the notifications pop as each one passes the reading line
     (a little below the middle of the screen), so every one of them pops where it can be seen
     ========================================================= */
  const sentEl = $('[data-sent]');
  if (sentEl) {
    const steps = $$('[data-sent-step]', sentEl);
    const banner = $('.phone__sent', sentEl);
    let ys = [];
    // page position of an element, without the pop-in offset (offsetTop ignores transforms and translate)
    const docTop = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
    const measure = () => {
      // beside the phone (wide layouts): the notifications start at the 「届きました」, so they pop after it
      const cs = getComputedStyle(sentEl);
      const side = cs.display === 'block' || cs.gridTemplateColumns.split(' ').length > 1;
      const bannerBottom = docTop(banner) - docTop(sentEl) + banner.offsetHeight;
      sentEl.style.setProperty('--toasts-top', side ? `${Math.round(bannerBottom + (cs.display === 'block' ? 0 : 12))}px` : '0px');
      ys = steps.map((s) => docTop(s) + s.offsetHeight / 2);
    };
    onResizeFns.push(measure);
    measure();
    onScrollFns.push((y, vh) => {
      const all = !motionOn();
      const line = y + headerH() + (vh - headerH()) * 0.6;
      steps.forEach((s, i) => s.classList.toggle('is-on', all || ys[i] <= line));
    });
  }

  /* =========================================================
     PIPELINE (flow)
     ========================================================= */
  const pipe = $('[data-pipeline]');
  if (pipe) {
    const steps = $$('.pstep', pipe);
    const rail = $('.pipeline__rail', pipe);
    const icons = steps.map((s) => $('.pstep__icon', s));
    let mode = 'row'; let railTop = 0; let railH = 0; let iconY = []; let thresholds = [];
    const measure = () => {
      const rr = rail.getBoundingClientRect();
      mode = !rr.width && !rr.height ? 'grid' : rr.height > rr.width ? 'column' : 'row';
      railTop = rr.top + scrollY; railH = rr.height;
      iconY = icons.map((ic) => { const r = ic.getBoundingClientRect(); return r.top + r.height / 2 + scrollY; });
      thresholds = icons.map((ic) => {
        const ir = ic.getBoundingClientRect();
        const pos = mode === 'column' ? (ir.top + ir.height / 2 - rr.top) / rr.height : (ir.left + ir.width / 2 - rr.left) / rr.width;
        // the first step lights up when the document sets off (on screen), not from the start
        return Math.max(0.002, clamp(pos, 0, 1) - 0.02);
      });
    };
    onResizeFns.push(measure);
    measure();
    onScrollFns.push((y, vh) => {
      if (!motionOn()) { pipe.style.setProperty('--p', '1'); steps.forEach((s) => s.classList.add('is-active')); return; }
      const hb = headerH(); const band = vh - hb;
      if (mode === 'grid') {
        // two by two (no rail): each step lights up as its icon passes the reading line
        steps.forEach((s, i) => s.classList.toggle('is-active', iconY[i] - y <= hb + band * 0.55));
        return;
      }
      let p;
      if (mode === 'column') {
        // phones: the document sits on the reading line while it travels down the rail
        p = clamp((y + hb + band * 0.5 - railTop) / railH, 0, 1);
      } else {
        // a row across the screen: the document crosses while the rail moves from low on the screen to the upper part,
        // so the rail (and the document on it) is in view for the whole trip
        const r0 = railTop - (hb + band * 0.85); const r1 = railTop - (hb + band * 0.2);
        p = clamp((y - r0) / (r1 - r0), 0, 1);
      }
      pipe.style.setProperty('--p', p.toFixed(4));
      steps.forEach((s, i) => s.classList.toggle('is-active', p >= thresholds[i]));
    });
  }

  /* =========================================================
     STAGES (start): the character follows the reading line
     A path runs through the four pins. While the section is read, the character sits on the path exactly at the
     reading line (half way down the screen), so it is always on screen while it moves; pins and cards light up as
     it passes them. Before the first pin it waits there, after the last pin it stays at the end.
     ========================================================= */
  const stagesEl = $('[data-stages]');
  if (stagesEl) {
    const svg = $('.stages__path', stagesEl);
    const base = $('.stages__path-base', stagesEl);
    const fill = $('.stages__path-fill', stagesEl);
    const avatar = $('.stages__avatar', stagesEl);
    const list = $('.stages__list', stagesEl);
    const stages = $$('.stage', stagesEl);
    const pins = stages.map((s) => $('.stage__pin', s));
    const READ = 0.5;
    let len = 0; let sTop = 0; let marks = []; let table = [];
    const zigzag = () => getComputedStyle(list).display === 'flex';
    // zigzag (wide screens): each card rises next to the previous one; keep a clear gap between cards in the same column
    const setOverlap = () => {
      if (!zigzag()) { stagesEl.style.removeProperty('--stage-overlap'); return; }
      const hs = stages.map((s) => s.offsetHeight);
      stagesEl.style.setProperty('--stage-overlap', `${Math.round(Math.max(60, Math.min(150, Math.min(...hs) * 0.42)))}px`);
    };
    const measure = () => {
      setOverlap();
      const box = stagesEl.getBoundingClientRect();
      const pts = pins.map((p) => {
        // take off the card's current slide-in offset (also part way through it) so the path matches the settled layout
        const r = p.getBoundingClientRect();
        const tr = getComputedStyle(p.parentElement).translate;
        const dy = tr && tr !== 'none' ? parseFloat(tr.split(' ')[1] || 0) : 0;
        return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top - dy];
      });
      const sway = zigzag() ? 22 : 0;
      let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      const segs = [];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; const dy = y1 - y0;
        const s = i % 2 ? sway : -sway; // a gentle S-curve between the pins
        segs.push(` C ${(x0 + s).toFixed(1)} ${(y0 + dy * 0.35).toFixed(1)}, ${(x1 + s).toFixed(1)} ${(y1 - dy * 0.35).toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`);
      }
      svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}`);
      // cumulative lengths so each pin lights up exactly when the character arrives
      marks = [0];
      let acc = d;
      segs.forEach((seg) => { acc += seg; base.setAttribute('d', acc); marks.push(base.getTotalLength()); });
      fill.setAttribute('d', acc);
      len = fill.getTotalLength();
      fill.style.strokeDasharray = `${len} ${len}`;
      // length ↔ position table (the path only ever goes down, so the height maps to one point)
      table = [];
      for (let i = 0; i <= 240; i++) { const l = (len * i) / 240; const pt = fill.getPointAtLength(l); table.push([l, pt.x, pt.y]); }
      sTop = box.top + scrollY;
    };
    const update = (y, vh) => {
      if (!len) return;
      const hb = headerH();
      const local = y + hb + (vh - hb) * READ - sTop; // the reading line, in the block's own coordinates
      let k = 0; let f = 0;
      if (!motionOn() || local >= table[table.length - 1][2]) { k = table.length - 2; f = 1; }
      else if (local > table[0][2]) {
        let lo = 0; let hi = table.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (table[mid][2] <= local) lo = mid; else hi = mid; }
        k = lo; f = (local - table[lo][2]) / Math.max(0.001, table[hi][2] - table[lo][2]);
      }
      const a = table[k]; const b = table[k + 1];
      const at = a[0] + (b[0] - a[0]) * f;
      const x = a[1] + (b[1] - a[1]) * f; const yy = a[2] + (b[2] - a[2]) * f;
      fill.style.strokeDashoffset = (len - at).toFixed(1);
      avatar.style.transform = `translate(${x.toFixed(1)}px, ${yy.toFixed(1)}px) translate(-50%, -50%)`;
      stages.forEach((s, i) => s.classList.toggle('is-reached', at >= marks[i] - 2));
    };
    onResizeFns.push(measure);
    onScrollFns.push(update);
    measure();
  }

  /* ---------- section labels: drop the separator bar when the Japanese part wraps to its own line ---------- */
  const kickers = $$('.kicker').map((k) => ({ k, ja: $('.kicker__ja', k), first: k.firstElementChild })).filter((x) => x.ja && x.first && x.first !== x.ja);
  const syncKickers = () => kickers.forEach(({ k, ja, first }) => {
    k.classList.remove('is-stacked');
    if (ja.offsetTop > first.offsetTop + first.offsetHeight / 2) k.classList.add('is-stacked');
  });
  onResizeFns.push(syncKickers);
  syncKickers();
  // labels can wrap or unwrap whenever fonts or line-break processing settle: re-check when their size changes
  if ('ResizeObserver' in window) {
    let kFrame = 0;
    const kro = new ResizeObserver(() => { if (!kFrame) kFrame = requestAnimationFrame(() => { kFrame = 0; syncKickers(); }); });
    kickers.forEach(({ k }) => kro.observe(k));
  }

  /* ---------- floating LINE button stays out of the way ----------
     Hidden while the hero or the closing buttons are on screen (they already offer the same actions),
     tucked away while scrolling down to read, and shown again when scrolling up. */
  const dock = $('[data-dock]');
  if (dock) {
    const visibleCtas = new Set();
    const ctaIo = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) visibleCtas.add(e.target); else visibleCtas.delete(e.target); });
      dock.classList.toggle('is-quiet', visibleCtas.size > 0);
    }, { threshold: 0 });
    $$('.hero, .finale__ctas').forEach((el) => ctaIo.observe(el));
    let dockY = window.scrollY;
    onScrollFns.push((y) => {
      if (y > dockY + 6) dock.classList.add('is-tucked');
      else if (y < dockY - 6) dock.classList.remove('is-tucked');
      dockY = y;
    });
    dock.addEventListener('focusin', () => dock.classList.remove('is-tucked', 'is-quiet'));
  }

  /* =========================================================
     MAGNETIC BUTTONS
     ========================================================= */
  if (mqFine.matches) {
    $$('[data-magnetic]').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        if (!motionOn()) return;
        const r = btn.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        btn.style.translate = `${(x * 0.16).toFixed(1)}px ${(y * 0.3).toFixed(1)}px`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
    });
  }

  /* =========================================================
     FOOTER WORDMARK
     ========================================================= */
  const wordmark = $('[data-wordmark]');
  if (wordmark) {
    const text = wordmark.textContent;
    wordmark.textContent = '';
    const letters = [...text].map((c) => {
      const s = document.createElement('span');
      s.textContent = c === ' ' ? '\u00a0' : c;
      wordmark.appendChild(s);
      return s;
    });
    wordmark.addEventListener('pointermove', (e) => {
      if (!motionOn()) return;
      for (const s of letters) {
        const r = s.getBoundingClientRect();
        const d = Math.abs(e.clientX - (r.left + r.width / 2));
        const k = Math.max(0, 1 - d / 220);
        s.style.setProperty('--lift', `${(-k * 16).toFixed(1)}%`);
        s.classList.toggle('is-hot', k > 0.55);
      }
    });
    wordmark.addEventListener('pointerleave', () => letters.forEach((s) => { s.style.removeProperty('--lift'); s.classList.remove('is-hot'); }));
    // fit the wordmark edge to edge
    const fitWordmark = () => {
      wordmark.style.fontSize = '';
      const cs = getComputedStyle(wordmark);
      const size = parseFloat(cs.fontSize);
      const avail = wordmark.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const natural = letters.reduce((w, s) => w + s.getBoundingClientRect().width, 0);
      if (natural > 0) wordmark.style.fontSize = `${((size * avail) / natural * 0.99).toFixed(1)}px`;
    };
    onResizeFns.push(fitWordmark);
    fitWordmark();
  }

  runResize();
})();
