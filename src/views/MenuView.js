import { i18n } from '../services/I18n.js';
export class MenuView {
  constructor(config) {
    this.root = document.querySelector('#main-menu');
    this.saveDialog = document.querySelector('#save-picker');
    this.saveMessage = document.querySelector('#save-picker-message');
    this.difficultyDialog = document.querySelector('#difficulty-picker');
    document.querySelector('#difficulty-close').addEventListener('click',() => this.difficultyDialog.close());
    document.querySelector('#save-picker-close').addEventListener('click',() => this.closeSaves());
    for (const name of ['space','mars','meteors']) {
      const img = this.root.querySelector(`[data-menu-layer=${name}]`);
      img.src = config[name]; img.onerror = () => { img.hidden = true; };
    }
    this.root.addEventListener('pointermove',event => {
      if (document.querySelector('#reduce-motion').checked) return;
      this.root.style.setProperty('--mx',`${(event.clientX/innerWidth-.5)*28}px`);
      this.root.style.setProperty('--my',`${(event.clientY/innerHeight-.5)*20}px`);
    });
    this.root.addEventListener('pointerleave',() => { this.root.style.setProperty('--mx','0px'); this.root.style.setProperty('--my','0px'); });
  }
  show(hasSave) {
    this.root.hidden = false;
    document.querySelector('#scene-viewport').hidden = true;
    document.querySelector('#terminal-toggle').hidden = true;
    document.querySelector('#tasks-toggle').hidden = true;
    const veil = document.querySelector('#morning-veil'); veil.style.opacity = '0'; veil.style.pointerEvents = 'none';
    this.root.querySelector('[data-menu=continue]').hidden = !hasSave;
    this.root.querySelectorAll('[data-menu]').forEach(button => { button.textContent = i18n.t(`menu.${button.dataset.menu}`); });
  }
  showDifficulty() {
    i18n.translate(this.difficultyDialog);
    if (!this.difficultyDialog.open) this.difficultyDialog.showModal();
    this.difficultyDialog.querySelector('#difficulty-close').focus();
  }
  showSaves(saves,message = '') {
    const deleting = document.activeElement?.hasAttribute('data-save-delete');
    document.querySelector('#save-picker-title').textContent = i18n.t('menu.load');
    document.querySelector('#save-picker-description').textContent = i18n.t('save.choose');
    document.querySelector('#save-picker-close').textContent = i18n.t('save.back');
    this.saveMessage.textContent = [message ? i18n.t(message) : '',saves.length ? '' : i18n.t('save.empty')].filter(Boolean).join(' ');
    const list = document.querySelector('#save-list');
    list.replaceChildren();
    for (const [index,save] of saves.entries()) {
      const row = document.createElement('div'); row.className = 'save-row';
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'save-entry'; button.dataset.saveId = save.id; button.disabled = !save.state;
      const title = document.createElement('strong');
      title.textContent = `${i18n.t('save.slot')} ${index+1}${save.state ? ` · SOL ${String(save.state.sol).padStart(3,'0')}` : ''}`;
      const date = document.createElement('span');
      date.textContent = save.savedAt ? new Date(save.savedAt).toLocaleString(i18n.language) : i18n.t('save.unknownDate');
      const status = document.createElement('span');
      status.textContent = save.state ? i18n.t(`save.phase.${save.state.phase}`) : i18n.t('save.invalid');
      const label = document.createElement('span'); label.className = 'save-entry-action';
      label.textContent = i18n.t(save.state ? 'save.load' : 'save.cannotLoad');
      button.append(title,date,status,label);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'save-delete'; remove.dataset.saveDelete = save.id;
      remove.dataset.saveLabel = `${title.textContent}\n${date.textContent}`;
      remove.textContent = i18n.t('save.delete');
      remove.setAttribute('aria-label',`${i18n.t('save.delete')} ${title.textContent}`);
      row.append(button,remove); list.append(row);
    }
    if (!this.saveDialog.open) this.saveDialog.showModal();
    else if (deleting) (list.querySelector('[data-save-delete]') ?? document.querySelector('#save-picker-close')).focus();
  }
  closeSaves() { if (this.saveDialog.open) this.saveDialog.close(); }
  hide() { this.root.hidden = true; document.querySelector('#scene-viewport').hidden = false; document.querySelector('#terminal-toggle').hidden = false;
    document.querySelector('#tasks-toggle').hidden = false; }
}
