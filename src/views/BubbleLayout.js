// Nearest free placement in the shared scene canvas. Null placements wait their turn.
export function bubbleLayout(items,width,height,{margin=8,gap=8}={}) {
  const occupied=[];
  return items.map(item => {
    const maxX=width-margin-item.width,maxY=height-margin-item.height;
    if(maxX<margin || maxY<margin)return null;
    const clampX=x=>Math.max(margin,Math.min(maxX,x));
    const clampY=y=>Math.max(margin,Math.min(maxY,y));
    const xs=[clampX(item.x),margin,maxX],ys=[clampY(item.y),margin,maxY];
    for(const rect of occupied) {
      xs.push(clampX(rect.x-item.width-gap),clampX(rect.x+rect.width+gap));
      ys.push(clampY(rect.y-item.height-gap),clampY(rect.y+rect.height+gap));
    }
    const candidates=[...new Set(xs)].flatMap(x=>[...new Set(ys)].map(y=>({x,y,width:item.width,height:item.height})));
    candidates.sort((a,b)=>(a.x-item.x)**2+(a.y-item.y)**2-((b.x-item.x)**2+(b.y-item.y)**2));
    const free=candidates.find(a=>occupied.every(b=>a.x+a.width+gap<=b.x || b.x+b.width+gap<=a.x || a.y+a.height+gap<=b.y || b.y+b.height+gap<=a.y));
    if(!free)return null;
    occupied.push(free);return free;
  });
}
