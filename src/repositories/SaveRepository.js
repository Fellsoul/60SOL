import { validateState, SAVE_VERSION } from '../models/state.js';

export class SaveRepository {
  constructor(storage, { events, tools }, key = 'last-light-outpost.save.v1') {
    this.storage = storage; this.key = key; this.slotPrefix = `${key}.slot.`;
    this.eventIds = events.map(event => event.id); this.toolIds = tools.map(tool => tool.id);
    this.events = events;
  }
  list() {
    try {
      if (!this.storage) return { saves:[], message:'本地存储不可用，本局无法自动保存。' };
      const ids = new Set();
      if (this.storage.getItem(this.key) !== null) ids.add(this.key);
      for (let index = 0; index < this.storage.length; index++) {
        const id = this.storage.key(index);
        if (id?.startsWith(this.slotPrefix)) ids.add(id);
      }
      const saves = Array.from(ids,id => ({ id,...this.load(id) }));
      saves.sort((a,b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '') || a.id.localeCompare(b.id));
      return { saves, message:'' };
    } catch { return { saves:[], message:'本地存储不可用，本局无法自动保存。' }; }
  }
  load(id = this.key) {
    try {
      if (id !== this.key && !id?.startsWith(this.slotPrefix)) throw new Error('未知存档');
      const raw = this.storage?.getItem(id);
      if (!raw) return { state:null, message: this.storage ? '' : '本地存储不可用，本局无法自动保存。' };
      const record = JSON.parse(raw);
      const state = record?.state ?? record;
      const savedAt = typeof record?.savedAt === 'string' && Number.isFinite(Date.parse(record.savedAt))
        ? new Date(record.savedAt).toISOString() : null;
      if (state?.version === 1) {
        state.version = SAVE_VERSION;
        state.weather = 'clear'; state.lightsOn = true;
        state.plantStage = ['seed','sprout','growing'][state.growth];
        state.daySummary = []; state.previousDaySummary = [];
        state.summarySol = Math.max(0,state.sol-1);
        if (state.sol > 1) state.previousDaySummary.push('这份早期存档没有记录昨日的叙事简报。');
        const event = this.events.find(item => item.id === state.currentEventId);
        const choice = event?.choices.find(item => item.id === state.choiceId);
        if (choice) state.daySummary.push(choice.summaryLine ?? event.summaryLine);
      }
      if (!validateState(state,this.eventIds,this.toolIds)) throw new Error('存档版本或内容无效');
      const event = this.events.find(item => item.id === state.currentEventId);
      if (state.choiceId !== null && !event.choices.some(choice => choice.id === state.choiceId)) throw new Error('事件选项无效');
      if ((state.phase === 'event') !== (state.choiceId === null)) throw new Error('阶段不一致');
      return { state, savedAt, message:'已恢复上次任务。' };
    } catch { return { state:null, savedAt:null, message:'存档无法读取或版本不兼容，原存档已保留。' }; }
  }
  save(state,id = null) {
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      id ??= `${this.slotPrefix}${crypto.randomUUID()}`;
      if (id !== this.key && !id.startsWith(this.slotPrefix)) throw new Error('未知存档');
      this.storage.setItem(id,JSON.stringify({ savedAt:new Date().toISOString(),state }));
      return { ok:true, id, message:'已自动保存到此浏览器。' };
    } catch { return { ok:false, message:'无法自动保存；你仍可继续当局，刷新可能丢失进度。' }; }
  }
}
