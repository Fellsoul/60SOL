import { validateState, SAVE_VERSION, LIMITS } from '../models/state.js';
import { freshCrew } from '../models/ExpeditionRules.js';

export class SaveRepository {
  constructor(storage, { events, tools }, key = 'last-light-outpost.save.v1') {
    this.storage = storage; this.key = key; this.slotPrefix = `${key}.slot.`;
    this.eventIds = events.map(event => event.id); this.toolIds = tools.map(tool => tool.id);
    this.events = events;
  }
  list() {
    try {
      if (!this.storage) return { saves:[], message:'save.storageUnavailable' };
      const ids = new Set();
      if (this.storage.getItem(this.key) !== null) ids.add(this.key);
      for (let index = 0; index < this.storage.length; index++) {
        const id = this.storage.key(index);
        if (id?.startsWith(this.slotPrefix)) ids.add(id);
      }
      const saves = Array.from(ids,id => ({ id,...this.load(id) }));
      saves.sort((a,b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '') || a.id.localeCompare(b.id));
      return { saves, message:'' };
    } catch { return { saves:[], message:'save.storageUnavailable' }; }
  }
  load(id = this.key) {
    try {
      if (id !== this.key && !id?.startsWith(this.slotPrefix)) throw new Error('未知存档');
      const raw = this.storage?.getItem(id);
      if (!raw) return { state:null, message: this.storage ? '' : 'save.storageUnavailable' };
      const record = JSON.parse(raw);
      const state = record?.state ?? record;
      const savedAt = typeof record?.savedAt === 'string' && Number.isFinite(Date.parse(record.savedAt))
        ? new Date(record.savedAt).toISOString() : null;
      if (state?.version === 1) {
        state.version = 2;
        state.weather = 'clear'; state.lightsOn = true;
        state.plantStage = ['seed','sprout','growing'][state.growth];
        state.daySummary = []; state.previousDaySummary = [];
        state.summarySol = Math.max(0,state.sol-1);
        if (state.sol > 1) state.previousDaySummary.push('summary.legacyMissing');
        const event = this.events.find(item => item.id === state.currentEventId);
        const choice = event?.choices.find(item => item.id === state.choiceId);
        if (choice) state.daySummary.push(choice.summaryLine ?? event.summaryLine);
      }
      if (state?.version === 2 && Number.isInteger(state.energy) && state.energy >= 0 && state.energy <= 20) {
        state.energy = Math.min(state.energy,LIMITS.energy);
        state.version = 3;
      }
      if (state?.version === 3) {
        state.version = SAVE_VERSION;
        state.samples = []; state.crew = freshCrew(); state.expeditionPlan = null; state.robotSampleSol = null;
      }
      if (!validateState(state,this.eventIds,this.toolIds)) throw new Error('存档版本或内容无效');
      const event = this.events.find(item => item.id === state.currentEventId);
      if (state.choiceId !== null && !event.choices.some(choice => choice.id === state.choiceId)) throw new Error('事件选项无效');
      if ((state.phase === 'event') !== (state.choiceId === null)) throw new Error('阶段不一致');
      return { state, savedAt, message:'save.restored' };
    } catch { return { state:null, savedAt:null, message:'save.invalidPreserved' }; }
  }
  save(state,id = null) {
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      id ??= `${this.slotPrefix}${crypto.randomUUID()}`;
      if (id !== this.key && !id.startsWith(this.slotPrefix)) throw new Error('未知存档');
      this.storage.setItem(id,JSON.stringify({ savedAt:new Date().toISOString(),state }));
      return { ok:true, id, message:'save.saved' };
    } catch { return { ok:false, message:'save.autosaveFailed' }; }
  }
  delete(id) {
    try {
      if (!this.storage || typeof id !== 'string' || (id !== this.key && !id.startsWith(this.slotPrefix))) throw new Error('未知存档');
      this.storage.removeItem(id);
      return { ok:true, message:'save.deleted' };
    } catch { return { ok:false, message:'save.deleteFailed' }; }
  }
}
