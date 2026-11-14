import { eventResolved } from '../models/DailyEventRules.js';
import { i18n } from '../services/I18n.js';
import { concurrentEvent } from '../models/ConcurrentEvents.js';

const activeDescriptions = new WeakMap();

// Percent coordinates measured against the shared 1672 × 940 artwork canvas.
const anchors = {
  'crew-a': [59.8, 39], 'crew-b': [39.5, 39],
  hatch: [16, 88], panels: [32, 46], antenna: [74.5, 37],
  vent: [47, 13.5], greenhouse: [88, 49], terminal: [74.5, 37],
  battery: [74.5, 37], samples: [46, 80], robot: [76, 65],
  light: [19, 10]
};
const eventAnchors = {
  E01: 'hatch', E02: 'panels', E03: 'battery', E04: 'greenhouse',
  E05: 'robot', E06: 'antenna', E07: 'vent', E08: 'vent',
  E09: 'greenhouse', E10: 'greenhouse', E11: 'greenhouse', E12: 'terminal',
  E13: 'robot', E14: 'crew-a', E15: 'samples', E16: 'terminal',
  E17: 'samples', E18: 'panels', E19: 'terminal', E20: 'panels'
};

// Bubbles share the room canvas so their anchors follow the artwork on resize.
export class SceneEventView {
  constructor(root) {
    this.node = document.createElement('button');
    this.node.type = 'button';
    this.node.className = 'scene-event-bubble';
    this.node.hidden = true;
    this.description = document.createElement('p');
    this.description.className = 'scene-event-description';
    this.description.hidden = true;
    this.description.setAttribute('role', 'status');
    this.description.setAttribute('aria-atomic', 'true');
    this.description.tabIndex = 0;
    this.description.addEventListener('click', () => this.fadeDescription());
    this.description.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.fadeDescription();
      }
    });
    this.node.addEventListener('click', () => this.describe());
    root.append(this.node, this.description);
    this.root = root;
    this.resize = new ResizeObserver(() => this.position());
    this.resize.observe(root);
  }

  clearDescription() {
    clearTimeout(this.descriptionTimer);
    clearTimeout(this.fadeTimer);
    if (this.descriptionAnimation) {
      this.descriptionAnimation.onfinish = null;
      this.descriptionAnimation.cancel();
      this.descriptionAnimation = null;
    }
    this.description.hidden = true;
    this.description.classList.remove('is-fading');
    this.description.textContent = '';
    if (activeDescriptions.get(this.root) === this) activeDescriptions.delete(this.root);
  }

  fadeDescription() {
    if (this.description.hidden || this.description.classList.contains('is-fading')) return;
    clearTimeout(this.descriptionTimer);
    if (this.descriptionAnimation) {
      this.descriptionAnimation.onfinish = null;
      this.descriptionAnimation.cancel();
    }
    this.description.classList.add('is-fading');
    this.descriptionAnimation = this.description.animate([{opacity: 1}, {opacity: 0}], {duration: 400, fill: 'forwards'});
    this.descriptionAnimation.onfinish = () => this.clearDescription();
    this.fadeTimer = setTimeout(() => this.clearDescription(), 400);
  }

  describe() {
    if (this.node.hidden || !this.eventID) return;
    this.dismissedIdentity = this.identity;
    this.node.hidden = true;
    activeDescriptions.get(this.root)?.fadeDescription();
    this.clearDescription();
    this.description.textContent = i18n.t(this.descriptionKey ?? `scene.description.${this.eventID}`);
    this.description.hidden = false;
    activeDescriptions.set(this.root, this);
    // Keep the lower-center panel visible for 3 seconds, then fade for 400 ms.
    this.descriptionAnimation = this.description.animate([
      {opacity: 1, offset: 0}, {opacity: 1, offset: 3000 / 3400}, {opacity: 0, offset: 1}
    ], {duration: 3400, fill: 'forwards'});
    this.descriptionAnimation.onfinish = () => this.clearDescription();
    this.descriptionTimer = setTimeout(() => this.fadeDescription(), 3000);
  }

  position() {
    if (this.node.hidden || !this.anchor) return;
    const [x, y] = this.anchor;
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const tipX = width * x / 100;
    const tipY = height * y / 100;
    const bubbleWidth = this.node.offsetWidth;
    const bubbleHeight = this.node.offsetHeight;
    const left = Math.max(8, Math.min(width - bubbleWidth - 8, tipX - bubbleWidth / 2));
    const sound = this.node.dataset.kind === 'sound';
    const tailLength = this.node.dataset.kind === 'thought' ? 46 : 28;
    const below = tipY < bubbleHeight + tailLength + 8;
    this.node.style.left = `${left}px`;
    const top = sound ? tipY - bubbleHeight / 2 : below ? tipY + tailLength : tipY - bubbleHeight - tailLength;
    this.node.style.top = `${Math.max(8, Math.min(height - bubbleHeight - 8, top))}px`;
    this.node.style.setProperty('--bubble-tip', `${Math.max(14, Math.min(bubbleWidth - 20, tipX - left))}px`);
    this.node.dataset.tail = below ? 'top' : 'bottom';
  }

  render(state, event, {reset = false} = {}) {
    if (this.events) {
      this.extraViews ??= new Map();
      const active = new Set();
      for (const instance of state?.concurrentEvents ?? []) {
        active.add(instance.id);
        let view = this.extraViews.get(instance.id);
        if (!view) { view = new SceneEventView(this.root); this.extraViews.set(instance.id,view); }
        const extra = concurrentEvent(instance, { get: id => this.events.find(item => item.id === id) });
        view.render({ ...state, choiceId: instance.choiceId, eventDone: Boolean(instance.choiceId) },extra,{reset});
      }
      for (const [id,view] of this.extraViews) {
        if (active.has(id)) continue;
        view.clearDescription(); view.resize.disconnect(); view.node.remove(); view.description.remove();
        this.extraViews.delete(id);
      }
    }
    const cue = event?.sceneCue;
    const identity = state && event ? `${state.sol}:${event.id}` : null;
    if (reset) this.dismissedIdentity = null;
    this.node.hidden = !state || !cue || Boolean(state.outcome) || eventResolved(state, event) || identity === this.dismissedIdentity;
    if (this.node.hidden || identity !== this.identity) this.clearDescription();
    this.identity = identity;
    this.eventID = event?.id;
    this.descriptionKey = event?.descriptionKey;
    if (this.node.hidden) return;
    this.node.dataset.kind = event.id === 'E14' ? 'thought' : cue.kind;
    const anchor = event.descriptionKey ? cue.anchor : eventAnchors[event.id] ?? cue.anchor;
    this.node.dataset.anchor = anchor;
    this.anchor = anchors[anchor] ?? anchors['crew-b'];
    this.node.textContent = i18n.t(cue.text);
    this.node.setAttribute('aria-label', `${i18n.t(cue.text)}. ${i18n.t('scene.cue.review')}`);
    this.node.title = i18n.t('scene.cue.review');
    this.position();
  }
}
