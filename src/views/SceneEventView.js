import { resourceText } from './ResourceIcons.js';
import { eventResolved } from '../models/DailyEventRules.js';
import { i18n } from '../services/I18n.js';
import { concurrentEvent } from '../models/ConcurrentEvents.js';
import { bubbleLayout } from './BubbleLayout.js';

const activeDescriptions = new WeakMap();
const bubbleGroups = new WeakMap();

function requestLayout(root) {
  const group=bubbleGroups.get(root);
  if(!group || group.pending)return;
  group.pending=true;
  requestAnimationFrame(()=>{
    group.pending=false;
    const views=[...group.views].filter(view=>view.eligible && view.anchor);
    const width=root.clientWidth,height=root.clientHeight;
    const items=views.map(view=>{
      view.node.hidden=false;
      view.node.style.maxWidth='';view.node.style.maxHeight='';view.node.style.overflowY='';
      const [x,y]=view.anchor,tipX=width*x/100,tipY=height*y/100;
      let w=view.node.offsetWidth,h=view.node.offsetHeight;
      let tail=view.node.dataset.kind==='sound'?0:view.node.dataset.kind==='thought'?46:28;
      if(h+2*tail>height-16) {
        view.node.style.maxWidth=`${Math.max(0,width-16)}px`;
        w=view.node.offsetWidth;h=view.node.offsetHeight;
      }
      if(h+2*tail>height-16)tail=0;
      if(h>height-16) {
        view.node.style.maxHeight=`${Math.max(24,height-16)}px`;view.node.style.overflowY='auto';
        h=view.node.offsetHeight;
      }
      return {x:tipX-w/2,y:tipY-h-2*tail,width:w,height:h+2*tail,tail,tipX,tipY};
    });
    const placements=bubbleLayout(items,width,height);
    views.forEach((view,index)=>{
      const rect=placements[index],item=items[index];
      view.node.hidden=!rect;
      if(!rect)return;
      const top=rect.y+item.tail;
      view.node.style.left=`${rect.x}px`;view.node.style.top=`${top}px`;
      view.node.style.setProperty('--bubble-tip',`${Math.max(14,Math.min(item.width-25,item.tipX-rect.x))}px`);
      view.node.dataset.tail=item.tail ? (item.tipY<top?'top':'bottom') : 'none';
    });
  });
}

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
    if(!bubbleGroups.has(root))bubbleGroups.set(root,{views:new Set(),pending:false});
    bubbleGroups.get(root).views.add(this);
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
    this.eligible = false;
    requestLayout(this.root);
    activeDescriptions.get(this.root)?.fadeDescription();
    this.clearDescription();
    this.description.innerHTML = resourceText(i18n.t(this.descriptionKey ?? `scene.description.${this.eventID}`));
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
    requestLayout(this.root);
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
        bubbleGroups.get(this.root)?.views.delete(view);
        this.extraViews.delete(id);
      }
    }
    const cue = event?.sceneCue;
    const identity = state && event ? `${state.sol}:${event.id}` : null;
    if (reset) this.dismissedIdentity = null;
    this.node.hidden = !state || !cue || Boolean(state.outcome) || eventResolved(state, event) || identity === this.dismissedIdentity;
    this.eligible = !this.node.hidden;
    if (this.node.hidden || identity !== this.identity) this.clearDescription();
    this.identity = identity;
    this.eventID = event?.id;
    this.descriptionKey = event?.descriptionKey;
    if (this.node.hidden) { this.position(); return; }
    this.node.dataset.kind = event.id === 'E14' ? 'thought' : cue.kind;
    const anchor = event.descriptionKey ? cue.anchor : eventAnchors[event.id] ?? cue.anchor;
    this.node.dataset.anchor = anchor;
    this.anchor = anchors[anchor] ?? anchors['crew-b'];
    this.node.innerHTML = resourceText(i18n.t(cue.text));
    this.node.setAttribute('aria-label', `${i18n.t(cue.text)}. ${i18n.t('scene.cue.review')}`);
    this.node.title = i18n.t('scene.cue.review');
    this.position();
  }
}
