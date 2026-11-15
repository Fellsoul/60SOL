import { buildSnapshot, buildLiveSnapshot, validSnapshot, snapshotFresh } from '../models/SpaceData.js';
import { checksum } from './DataChecksum.js';

export class SpaceSnapshotService {
  constructor(config, storage = null, {
    fetcher = (...args) => fetch(...args),
    now = () => Date.now(),
    schedule = (...args) => setTimeout(...args),
    cancel = id => clearTimeout(id)
  } = {}) {
    this.config = config;
    this.storage = storage;
    this.fetcher = fetcher;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.pending = null;
    this.current = null;
    this.cacheKey = 'outpost.space-data.v1';
    this.rejections = [];
  }

  historical(id = 'case-mars-impact') {
    const fixture = this.config.cases.find(item => item.id === id) ?? this.config.cases[0];
    return buildSnapshot(fixture.raw, {
      mode: 'historical',
      caseID: fixture.id,
      createdAtUTC: fixture.retainedAtUTC
    });
  }

  prepare() {
    if (this.pending) return this.pending;
    this.pending = this.acquire().then(snapshot => {
      this.current = snapshot;
      return snapshot;
    });
    return this.pending;
  }

  async acquire() {
    const controller = new AbortController();
    let timer;
    try {
      const task = (async () => {
        const response = await this.fetcher(this.config.currentEndpoint ?? '/api/space-data', {
          signal: controller.signal,
          credentials: 'same-origin',
          redirect: 'error'
        });
        const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (!response.ok || contentType !== 'application/json') throw new Error('UNAVAILABLE');

        const reader = response.body?.getReader();
        if (!reader) throw new Error('UNAVAILABLE');
        const decoder = new TextDecoder();
        let body = '';
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 131072) {
            await reader.cancel();
            throw new Error('REJECT_SIZE');
          }
          body += decoder.decode(part.value, { stream: true });
        }
        body += decoder.decode();
        if (controller.signal.aborted) throw new Error('UNAVAILABLE');

        const raw = JSON.parse(body);
        const snapshot = (raw.schemaVersion === 2 ? buildLiveSnapshot : buildSnapshot)(raw, {
          mode: 'current',
          caseID: 'current',
          createdAtUTC: new Date(this.now()).toISOString()
        });
        if (!snapshotFresh(snapshot, this.now())) throw new Error('STALE');
        try {
          this.storage?.setItem(this.cacheKey, JSON.stringify(snapshot));
        } catch {
          // A valid current snapshot remains usable when local storage is unavailable.
        }
        return snapshot;
      })();
      const timeout = new Promise((_, reject) => {
        timer = this.schedule(() => {
          controller.abort();
          reject(new Error('UNAVAILABLE'));
        }, 8000);
      });
      return await Promise.race([task, timeout]);
    } catch (error) {
      this.rejections.push(String(error.message).slice(0, 80));
      try {
        const cached = JSON.parse(this.storage?.getItem(this.cacheKey) ?? 'null');
        if (validSnapshot(cached) && cached.mode !== 'historical' && snapshotFresh(cached, this.now())) {
          return buildCached(cached, new Date(this.now()).toISOString());
        }
      } catch {
        // Unreadable caches fall through to the bundled historical case.
      }
      return null; // Offline is ordinary gameplay, never an unrequested hazardous replay.
    } finally {
      if (timer !== undefined) this.cancel(timer);
      controller.abort();
    }
  }

  async select(mode = 'current') {
    if (mode === 'current' && this.current && !snapshotFresh(this.current, this.now())) {
      this.pending = null;
      this.current = null;
    }
    const snapshot = mode === 'current' ? await this.prepare() : this.historical(mode);
    return structuredClone(snapshot);
  }
}

function buildCached(snapshot, createdAtUTC) {
  // A cache is a newly selected mission input, never a mutation of an active mission.
  const clone = structuredClone(snapshot);
  clone.mode = 'cached';
  clone.createdAtUTC = createdAtUTC;
  return sealCached(clone);
}

function sealCached(snapshot) {
  const { checksum: old, snapshotID, ...core } = snapshot;
  const hash = checksum(core);
  return { ...core, snapshotID: hash.slice(0, 24), checksum: hash };
}
