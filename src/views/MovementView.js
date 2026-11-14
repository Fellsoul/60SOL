import { MovementDirector } from './MovementDirector.js';
import { i18n } from '../services/I18n.js';

export class MovementView {
  constructor(config={},scene=null) {
    this.scene=scene;this.queued=null;this.queuedReduced=false;
    this.config=config;this.lastFrame=null;this.assetReady=false;this.disposed=false;
    const roots=[document.querySelector('#app'),document.querySelector('#terminal'),document.querySelector('#tasks .clipboard-paper')];
    this.cards=roots.map((root,index)=> {
      const node=document.createElement('section');
      node.className=`motion-card ${index===0 ? 'motion-stage' : index===1 ? 'motion-console' : 'motion-inline'}`;
      node.hidden=true;
      node.innerHTML='<div class="motion-art" aria-hidden="true"></div><div class="motion-copy"><strong class="motion-task"></strong><span class="motion-destination"></span><span class="motion-cost"></span><p class="motion-status" role="status" aria-live="polite" aria-atomic="true"></p><small class="motion-explanation"></small></div><button type="button" class="motion-skip"></button>';
      const before=index===2 ? root.querySelector('#tasks-content') : null;
      root.insertBefore(node,before);
      node.querySelector('.motion-skip').addEventListener('click',()=>this.skip());
      return {node,root,art:node.querySelector('.motion-art'),task:node.querySelector('.motion-task'),destination:node.querySelector('.motion-destination'),cost:node.querySelector('.motion-cost'),status:node.querySelector('.motion-status'),explanation:node.querySelector('.motion-explanation'),skip:node.querySelector('.motion-skip')};
    });
    this.director=new MovementDirector({onFrame:frame=>{this.lastFrame=frame;this.scene?.crewMotion.react(frame);this.paint();},onComplete:()=>this.paint()});
    this.visibility=()=>{if(document.hidden)this.skip();};
    document.addEventListener('visibilitychange',this.visibility);
    this.observer=new MutationObserver(()=>{this.playQueued();this.paint();});
    for(const dialog of document.querySelectorAll('#terminal,#tasks'))this.observer.observe(dialog,{attributes:true,attributeFilter:['open']});

  }
  present(plan,reducedMotion) {
    if(document.querySelector('#tasks[open],#terminal[open]') && !reducedMotion) {
      this.queued=plan;this.queuedReduced=reducedMotion;
      this.lastFrame={plan,key:'awaitingView',state:{outfit:'indoor'}};
      this.paint();return;
    }
    this.queued=null;
    try { this.director.present(plan,{reducedMotion,hidden:document.hidden}); }
    catch { this.director.restore(plan); }
  }
  playQueued() {
    if(this.queued && !document.querySelector('#tasks[open],#terminal[open]')) {
      const plan=this.queued;this.queued=null;this.present(plan,this.queuedReduced);
    }
  }

  paint() {
    const frame=this.lastFrame;
    const modal=document.querySelector('#tasks[open],#terminal[open]');
    for(const card of this.cards) {
      const visible=Boolean(frame) && (modal ? modal.contains(card.node) : card.node.classList.contains('motion-stage'));
      card.node.hidden=!visible;
      if(!frame)continue;
      const {plan,state,key}=frame;
      card.task.textContent=i18n.t(plan.label);
      card.destination.textContent=i18n.t(`motion.station.${plan.station}`);
      card.cost.textContent=`${plan.cost.energy} E · ${plan.cost.work} ${i18n.t('motion.workCost')}${plan.cost.condition ? ` · ${plan.cost.condition} H` : ''}${plan.cost.spares ? ` · ${plan.cost.spares} Q` : ''}`;
      card.status.textContent=i18n.t(`motion.step.${key}`);
      card.explanation.textContent=i18n.t(plan.mode==='eva' ? 'motion.evaExplanation' : 'motion.cutExplanation');
      card.skip.textContent=i18n.t('motion.skip');card.skip.hidden=!this.director.active && !this.queued;
      card.art.hidden=true;
      card.node.dataset.checkpoint=key;card.node.dataset.mode=plan.mode;
    }
  }
  skip() { if(this.queued){const plan=this.queued;this.queued=null;this.director.present(plan,{reducedMotion:true});}this.director.skip();this.paint(); }
  restore(plan) { this.queued=null;this.director.restore(plan);if(!plan)this.lastFrame=null;this.paint(); }
  clear() { this.queued=null;this.scene?.crewMotion.stopReaction();this.director.clear();this.lastFrame=null;this.paint(); }
  dispose() {
    this.disposed=true;this.director.dispose();this.observer.disconnect();
    document.removeEventListener('visibilitychange',this.visibility);
    if(this.image){this.image.onload=null;this.image.onerror=null;}
    this.cards.forEach(card=>card.node.remove());
  }
}
