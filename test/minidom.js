/* ------------------------------------------------------------------
   minidom.js — enough of a document to press a button in.

   The game's own harness stubs a browser away, deliberately: the
   session, the agendas and the transports have no DOM in them and a
   test that needed one would be a test of the wrong layer. The touch
   controls are the other case entirely. There is nothing to assert
   about them except *what a finger lands on and what happens next*, so
   the only way to test them without a browser is to build a document
   small enough to reason about and dispatch real events into it.

   Small means: elements, ids, classes, a querySelector that walks
   children, and listeners that bubble. No layout, no paint, no
   cascade — none of which the wiring under test consults.

   The tree itself is read out of `index.html` rather than written here
   twice. That is the whole point: a test that builds its own copy of
   the markup passes for ever after somebody renames `.kick-pad`, and
   renaming `.kick-pad` is exactly how the Dive loses its controls.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

class El {
  constructor(tag, id, cls) {
    this.tagName = String(tag).toUpperCase();
    this.id = id || '';
    this._cls = new Set(String(cls || '').split(/\s+/).filter(Boolean));
    this.children = [];
    this.parent = null;
    this.style = {};
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this._L = new Map();
    this._captured = new Set();
    const self = this;
    this.classList = {
      add: (...c) => c.forEach(x => self._cls.add(x)),
      remove: (...c) => c.forEach(x => self._cls.delete(x)),
      contains: (c) => self._cls.has(c),
      toggle: (c, on) => {
        const v = on === undefined ? !self._cls.has(c) : !!on;
        if (v) self._cls.add(c); else self._cls.delete(c);
        return v;
      },
    };
  }

  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  addEventListener(type, fn) {
    if (!this._L.has(type)) this._L.set(type, []);
    this._L.get(type).push(fn);
  }
  setPointerCapture(id) { this._captured.add(id); }
  releasePointerCapture(id) { this._captured.delete(id); }

  matches(sel) {
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    if (sel.startsWith('.')) return this._cls.has(sel.slice(1));
    return this.tagName === sel.toUpperCase();
  }
  querySelector(sel) {
    for (const c of this.children) {
      if (c.matches(sel)) return c;
      const deep = c.querySelector(sel);
      if (deep) return deep;
    }
    return null;
  }
  /* Only ever asked with a single simple selector, which is all the
     code under test asks with. */
  closest(sel) {
    const parts = sel.split(',').map(s => s.trim()).filter(Boolean);
    let n = this;
    while (n) {
      if (parts.some(p => n.matches(p))) return n;
      n = n.parent;
    }
    return null;
  }

  /* Dispatch, and bubble it. `defaultPrevented` is readable afterwards
     because half of what these guards do is refuse an event. */
  fire(type, props) {
    const ev = Object.assign({
      type, target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
    }, props || {});
    let n = this;
    while (n) {
      for (const fn of (n._L.get(type) || []).slice()) fn(ev);
      n = n.parent;
    }
    return ev;
  }
}

/* -------- the markup --------
   A tag soup reader that understands exactly what the touch overlays
   and the task chip are made of: divs and buttons, an id, a class, and
   comments in between. Anything richer than that in the block it is
   pointed at is a sign the block has outgrown this. */
function parseBlock(html, rootId) {
  const open = new RegExp('<(div|button|section)\\b[^>]*\\bid="' + rootId + '"[^>]*>');
  const m = open.exec(html);
  if (!m) throw new Error('minidom: no element with id "' + rootId + '" in index.html');

  const src = html.slice(m.index).replace(/<!--[\s\S]*?-->/g, '');
  const TAG = /<(\/?)(div|button|section|span|i|b|kbd)\b([^>]*)>/g;
  const attr = (s, name) => {
    const a = new RegExp(name + '="([^"]*)"').exec(s);
    return a ? a[1] : '';
  };

  const root = new El(m[1], rootId, attr(m[0], 'class'));
  const stack = [root];
  TAG.lastIndex = m[0].length ? src.indexOf('>') + 1 : 0;

  let t;
  while ((t = TAG.exec(src))) {
    if (t[1] === '/') {
      stack.pop();
      if (!stack.length) break;                   // the root closed: done
      continue;
    }
    const el = new El(t[2], attr(t[3], 'id'), attr(t[3], 'class'));
    if (/\bhidden\b/.test(t[3])) el.hidden = true;
    stack[stack.length - 1].appendChild(el);
    if (!/\/>$/.test(t[0])) stack.push(el);
  }
  return root;
}

/* A document with the given blocks of index.html in it, plus whatever
   bare elements the caller asks for by id (the canvas, mostly). */
function build(blockIds, extraIds = []) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const body = new El('body');
  for (const id of blockIds) body.appendChild(parseBlock(html, id));
  for (const id of extraIds) body.appendChild(new El('div', id));

  const byId = new Map();
  (function walk(n) { if (n.id) byId.set(n.id, n); n.children.forEach(walk); })(body);

  const listeners = new Map();
  const doc = {
    body, documentElement: body, activeElement: null, pointerLockElement: null,
    getElementById: (id) => byId.get(id) || null,
    querySelector: (sel) => (body.matches(sel) ? body : body.querySelector(sel)),
    createElement: (tag) => new El(tag),
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    fire(type, ev) {
      const e = Object.assign({ type, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; } }, ev || {});
      for (const fn of listeners.get(type) || []) fn(e);
      return e;
    },
  };
  return { body, byId, doc, El, el: (id) => byId.get(id) || null };
}

module.exports = { El, build, parseBlock, ROOT };
