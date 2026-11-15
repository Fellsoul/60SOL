import { i18n } from '../services/I18n.js';

export function guideTarget(state) {
  if (!state || state.outcome || state.sol>3) return null;
  if (state.guide?.terminalSol!==state.sol) return 'terminal';
  return state.guide?.notebookSol!==state.sol ? 'notebook' : null;
}

export class DailyGuide {
  constructor() {
    this.node=document.createElement('div'); this.node.id='daily-guide';
    this.node.setAttribute('popover','manual'); this.node.setAttribute('role','status');
    this.node.innerHTML='<span aria-hidden="true">↓</span><span class="sr-only"></span>';
    document.body.append(this.node);
    this.update=()=>this.position();
    window.addEventListener('resize',this.update);
    this.observer=new MutationObserver(this.update);
    for (const id of ['main-menu','terminal','tasks','difficulty-picker','save-picker']) {
      this.observer.observe(document.getElementById(id),{attributes:true,attributeFilter:['hidden','open']});
    }
  }
  render(state) { this.target=guideTarget(state); this.position(); }
  hide() { this.target=null; this.position(); }
  position() {
    const notebook=document.querySelector('#tasks-toggle');
    const target=this.target==='terminal' ? document.querySelector('#terminal-toggle') : notebook;
    const visible=this.target && target && !target.disabled && !target.hidden && document.querySelector('#main-menu').hidden &&
      !document.querySelector('#tasks[open],#difficulty-picker[open],#save-picker[open]') &&
      !(this.target==='terminal' && document.querySelector('#terminal[open]'));
    notebook?.classList.toggle('is-guided',Boolean(visible && this.target==='notebook'));
    if (!visible) { if(this.node.matches(':popover-open'))this.node.hidePopover(); return; }
    this.node.dataset.target=this.target;
    this.node.querySelector('.sr-only').textContent=i18n.t(`guide.${this.target}`);
    const rect=target.getBoundingClientRect();
    this.node.style.left=`${Math.max(28,Math.min(innerWidth-28,rect.left+rect.width/2))}px`;
    this.node.style.top=`${Math.max(8,rect.top-76)}px`;
    if(!this.node.matches(':popover-open'))this.node.showPopover();
  }
}
