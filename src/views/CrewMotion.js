// Animate the existing isolated crew layers, with feet fixed at their painted anchors.
export class CrewMotion {
  constructor(root) { this.root=root;this.actors=new Map();this.reduced=false; }
  sync(reduced=false) {
    this.reduced=reduced;
    for(const [id,x,offset] of [['astronaut-a',60,0],['astronaut-b',39.5,1700]]) {
      const node=this.root.querySelector(`[data-layer="${id}"]`),image=node?.querySelector('img');
      let actor=this.actors.get(id);
      if(actor?.image!==image) {
        actor?.idle?.cancel();actor?.reaction?.cancel();
        if(!image) { this.actors.delete(id);continue; }
        image.style.transformOrigin=`${x}% 92.5%`;
        node.style.transformOrigin=`${x}% 92.5%`;
        actor={node,image,idle:null,reaction:null};this.actors.set(id,actor);
      }
      if(!actor)continue;
      if(reduced || node.dataset?.state === 'sleep') { actor.idle?.cancel();actor.reaction?.cancel();actor.idle=null;actor.reaction=null;continue; }
      if(!actor.idle) actor.idle=image.animate([
        {transform:'scaleY(1) rotate(0deg)'},
        {transform:'scaleY(1.012) rotate(.2deg)'},
        {transform:'scaleY(1) rotate(0deg)'}
      ],{duration:5200+offset,delay:offset,iterations:Infinity,easing:'ease-in-out'});
      for(const animation of [actor.idle,actor.reaction]) {
        if(!animation)continue;
        if(document.hidden)animation.pause();else if(animation.playState==='paused')animation.play();
      }
    }
  }
  react(frame) {
    if(this.reduced || frame.skipped || frame.key==='complete') { this.stopReaction();return; }
    if(!['accepted','foregroundCut','working'].includes(frame.key))return;
    const actor=this.actors.get(frame.plan.actorId);if(!actor)return;
    if(actor.node.dataset?.state === 'sleep')return;
    actor.reaction?.cancel();
    actor.reaction=actor.node.animate([
      {transform:'rotate(0deg)'},{transform:'rotate(-1deg)',offset:.35},
      {transform:'rotate(.7deg)',offset:.7},{transform:'rotate(0deg)'}
    ],{duration:1200,easing:'ease-in-out'});
  }
  stopReaction() { for(const actor of this.actors.values()){actor.reaction?.cancel();actor.reaction=null;} }
  dispose() { for(const actor of this.actors.values()){actor.idle?.cancel();actor.reaction?.cancel();}this.actors.clear(); }
}
