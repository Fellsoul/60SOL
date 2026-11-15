// Music is independent of game state: pausing a Sol never seeks or reloads a track.
export class BackgroundMusic {
  constructor(config,{audioFactory=()=>new Audio(),now=()=>performance.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),frame=fn=>requestAnimationFrame(fn),cancelFrame=id=>cancelAnimationFrame(id)}={}) {
    this.config=config;this.now=now;this.schedule=schedule;this.cancel=cancel;this.frame=frame;this.cancelFrame=cancelFrame;
    this.mode='black';this.index=0;this.gapRemaining=null;this.gapTimer=null;this.epoch=0;
    this.menu=audioFactory();this.game=audioFactory();this.storm=audioFactory();
    this.menu.src=config.music.menu;this.menu.loop=true;
    this.game.src=config.music.game[0];this.game.loop=false;
    if(config.music.storm)this.storm.src=config.music.storm;
    this.storm.loop=true;
    this.channels=[this.menu,this.game,this.storm];
    for(const audio of this.channels) { audio.preload='auto';audio.volume=0; }
    this.game.addEventListener('ended',()=>this.ended());
    this.retry=()=>this.resume();
    document.addEventListener('pointerdown',this.retry);
    document.addEventListener('keydown',this.retry);
  }
  play(audio) { try { return Promise.resolve(audio.play()).catch(()=>{}); } catch { return Promise.resolve(); } }
  ramp(audio,target,duration) {
    audio.cancelMusicRamp?.();
    const from=audio.volume,start=this.now();
    return new Promise(resolve=>{
      let handle;
      audio.cancelMusicRamp=()=>{this.cancelFrame(handle);audio.cancelMusicRamp=null;resolve();};
      const tick=()=>{
        const progress=duration<=0?1:Math.min(1,(this.now()-start)/duration);
        audio.volume=Math.max(0,Math.min(1,from+(target-from)*progress));
        if(progress<1)handle=this.frame(tick);
        else {audio.cancelMusicRamp=null;resolve();}
      };
      tick();
    });
  }
  freezeGap() {
    if(this.gapTimer!==null) {
      this.cancel(this.gapTimer);this.gapTimer=null;
      this.gapRemaining=Math.max(0,this.gapDeadline-this.now());
    }
  }
  startGap() {
    if(this.mode!=='game'||this.gapRemaining===null||this.gapTimer!==null)return;
    this.gapDeadline=this.now()+this.gapRemaining;
    this.gapTimer=this.schedule(()=>{
      this.gapTimer=null;this.gapRemaining=null;
      this.index=(this.index+1)%this.config.music.game.length;
      this.game.src=this.config.music.game[this.index];
      if(this.mode==='game') {this.game.volume=this.config.volume;void this.play(this.game);}
    },this.gapRemaining);
  }
  ended() {
    if(this.gapRemaining!==null)return;
    this.gapRemaining=this.config.music.gapMs ?? 2000;
    this.startGap();
  }
  resume() {
    if(this.mode==='menu' && this.menu.paused)void this.play(this.menu);
    if(this.mode==='storm' && this.storm.paused)void this.play(this.storm);
    if(this.mode==='game') {
      if(this.gapRemaining!==null)this.startGap();
      else if(this.game.paused)void this.play(this.game);
    }
  }
  async setMode(mode,duration=this.config.music.fadeMs ?? 1200) {
    if(mode==='storm'&&!this.config.music.storm)mode='game';
    if(this.mode===mode) {this.resume();return;}
    this.mode=mode;const epoch=++this.epoch;
    if(mode!=='game')this.freezeGap();
    const selected=mode==='menu'?this.menu:mode==='game'?this.game:mode==='storm'?this.storm:null;
    this.resume();
    await Promise.all(this.channels.map(async audio=>{
      await this.ramp(audio,audio===selected?this.config.volume:0,duration);
      if(epoch===this.epoch && audio!==selected)audio.pause();
    }));
  }
  setVolume(value) {
    this.config.volume=value;
    const selected=this.mode==='menu'?this.menu:this.mode==='game'?this.game:this.mode==='storm'?this.storm:null;
    if(selected)void this.ramp(selected,value,150);
  }
  stop() {
    this.epoch++;this.mode='black';this.freezeGap();
    for(const audio of this.channels) {audio.cancelMusicRamp?.();audio.pause();audio.volume=0;}
  }
  dispose() {this.stop();document.removeEventListener('pointerdown',this.retry);document.removeEventListener('keydown',this.retry);}
}
