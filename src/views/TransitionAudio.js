// Audio is presentation only. Missing files/autoplay denial never block a turn.
export class TransitionAudio {
  constructor(config) { this.config = config; this.audio = new Audio(); this.audio.preload = 'auto'; this.generation = 0; this.frame = null; }
  start(src) {
    this.stop(); const generation = this.generation;
    this.audio.src = src; this.audio.volume = 0; this.audio.loop = false;
    this.audio.play().then(() => {
      if (generation === this.generation) void this.ramp(this.config.volume,this.config.audioFadeInMs);
    }).catch(() => {});
  }
  ramp(target,duration) {
    this.cancelRamp?.();
    const start = performance.now(), from = this.audio.volume;
    return new Promise(resolve => {
      this.cancelRamp = () => { cancelAnimationFrame(this.frame); this.cancelRamp = null; resolve(); };
      const tick = now => {
        const ratio = Math.min(1,(now-start)/Math.max(1,duration));
        this.audio.volume = Math.max(0,Math.min(1,from+(target-from)*ratio));
        if (ratio < 1) this.frame = requestAnimationFrame(tick);
        else { this.cancelRamp = null; resolve(); }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }
  async finish() { const generation = this.generation; await this.ramp(0,this.config.audioFadeOutMs); if (generation === this.generation) this.stop(); }
  stop() { this.generation++; this.cancelRamp?.(); this.audio.pause(); this.audio.volume = 0; }
}
