import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneEventView } from '../src/views/SceneEventView.js';

test('lower-center descriptions expire, dismiss early, and keep the next message alive', () => {
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  let now = 0, next = 0;
  const timers = new Map();
  globalThis.setTimeout = (fn, ms) => { const id = ++next; timers.set(id, {fn, at: now + ms}); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const advance = ms => {
    const end = now + ms;
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].fn();
    }
    now = end;
  };
  const root = {};
  const makeView = () => {
    const classes = new Set();
    const view = Object.create(SceneEventView.prototype);
    view.root = root; view.eventID = 'E01'; view.identity = '1:E01'; view.node = {hidden: false};
    view.description = {hidden: true, textContent: '', classList: {
      add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key)
    }, animate: () => ({onfinish: null, cancel() {}})};
    return view;
  };
  try {
    const first = makeView(); first.describe();
    advance(2999); assert.equal(first.description.hidden, false);
    advance(1); assert.ok(first.description.classList.contains('is-fading'));
    advance(400); assert.equal(first.description.hidden, true);
    const second = makeView(); second.describe(); advance(100);
    second.fadeDescription(); advance(400); assert.equal(second.description.hidden, true);
    const third = makeView(); third.describe(); advance(100);
    const fourth = makeView(); fourth.describe();
    assert.ok(third.description.classList.contains('is-fading'));
    advance(400); assert.equal(third.description.hidden, true);
    assert.equal(fourth.description.hidden, false);
    advance(3000); assert.equal(fourth.description.hidden, true);
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
  }
});
