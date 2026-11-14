import { eventResolved } from '../models/DailyEventRules.js';
import { i18n } from '../services/I18n.js';

// Bubbles share the room canvas so their anchors follow the artwork on resize.
export class SceneEventView {
  constructor(root, onOpenTasks) {
    this.node = document.createElement('button');
    this.node.type = 'button';
    this.node.className = 'scene-event-bubble';
    this.node.hidden = true;
    this.node.setAttribute('aria-haspopup', 'dialog');
    this.node.setAttribute('aria-controls', 'tasks');
    this.node.addEventListener('click', onOpenTasks);
    root.append(this.node);
  }

  render(state, event) {
    const cue = event?.sceneCue;
    this.node.hidden = !state || !cue || Boolean(state.outcome) || eventResolved(state, event);
    if (this.node.hidden) return;
    this.node.dataset.kind = cue.kind;
    this.node.dataset.anchor = cue.anchor;
    this.node.textContent = i18n.t(cue.text);
    this.node.setAttribute('aria-label', `${i18n.t(cue.text)}. ${i18n.t('scene.cue.review')}`);
    this.node.title = i18n.t('scene.cue.review');
  }
}
