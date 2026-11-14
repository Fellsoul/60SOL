const EPS=1e-9;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const point=p=>Array.isArray(p) && p.length===2 && p.every(Number.isFinite);
const polygon=p=>Array.isArray(p) && p.length>=3 && p.every(point);
const edges=p=>p.map((a,index)=>[a,p[(index+1)%p.length]]);

export function projectFloorPoint(camera,position) {
  if (!Array.isArray(position) || position.length!==3 || !position.every(Number.isFinite)) return null;
  if (!Array.isArray(camera?.P) || camera.P.length!==3 || !camera.P.every(row=>Array.isArray(row)&&row.length===4&&row.every(Number.isFinite))) return null;
  if (!Number.isFinite(camera.nearClip) || camera.nearClip<=0) return null;
  const v=[...position,1];
  const q=camera.P.map(row=>row.reduce((sum,value,index)=>sum+value*v[index],0));
  if (q[2]<=camera.nearClip) return null;
  return {x:q[0]/q[2],y:q[1]/q[2],depth:q[2]};
}

export function projectUpright(camera,feet,width,height) {
  const right=camera?.billboardRight;
  if (!point(feet) || !point(right) || Math.abs(Math.hypot(...right)-1)>1e-6 || !(width>0) || !(height>0)) return null;
  const side=direction=>[feet[0]+direction*width*right[0]/2,feet[1]+direction*width*right[1]/2];
  const corners=[...[-1,1].map(sign=>[...side(sign),0]),...[1,-1].map(sign=>[...side(sign),height])].map(p=>projectFloorPoint(camera,p));
  return corners.every(Boolean) ? corners : null;
}

function inside(p,shape) {
  let result=false;
  for (const [a,b] of edges(shape)) {
    if ((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) result=!result;
  }
  return result;
}
function pointSegmentDistance(p,a,b) {
  const length=(b[0]-a[0])**2+(b[1]-a[1])**2;
  if (length<EPS) return distance(p,a);
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/length));
  return distance(p,[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);
}
function onSegment(p,a,b) { return Math.abs(cross(a,b,p))<EPS && pointSegmentDistance(p,a,b)<EPS; }
function intersects(a,b,c,d) {
  if (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return true;
  return onSegment(a,c,d)||onSegment(b,c,d)||onSegment(c,a,b)||onSegment(d,a,b);
}
function segmentDistance(a,b,c,d) {
  return intersects(a,b,c,d) ? 0 : Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}

export function validateRoute(route,scene) {
  if (scene?.status!=='validated' || route?.approved!==true) return {ok:false,reason:'unapproved'};
  const path=route.waypoints;
  if (!Array.isArray(path)||path.length<2||!path.every(point)||!polygon(scene.walkablePolygon)) return {ok:false,reason:'geometry'};
  const envelope=route.envelope;
  if (!envelope || !Number.isFinite(envelope.radius) || envelope.radius<=0 || !Number.isFinite(envelope.height) || envelope.height<=0 || !Number.isFinite(envelope.margin) || envelope.margin<0) return {ok:false,reason:'envelope'};
  const radius=envelope.radius+envelope.margin;
  const obstacles=scene.obstacleEnvelopes ?? scene.obstacles;
  if (!Array.isArray(obstacles)||!obstacles.every(obstacle=>polygon(obstacle.polygon)&&Number.isFinite(obstacle.minHeight)&&obstacle.minHeight>=0)) return {ok:false,reason:'obstacles'};
  for (let index=1;index<path.length;index++) {
    const a=path[index-1],b=path[index];
    if (![a,b].every(p=>inside(p,scene.walkablePolygon))) return {ok:false,reason:'outside'};
    if (edges(scene.walkablePolygon).some(([c,d])=>segmentDistance(a,b,c,d)<=radius+EPS)) return {ok:false,reason:'floor-clearance'};
    for (const obstacle of obstacles) {
      if (obstacle.minHeight>envelope.height) continue;
      if (inside(a,obstacle.polygon)||inside(b,obstacle.polygon)||edges(obstacle.polygon).some(([c,d])=>segmentDistance(a,b,c,d)<=radius+EPS)) return {ok:false,reason:'obstacle-clearance'};
    }
    for (const p of [a,b]) if (!projectUpright(scene.camera,p,envelope.radius*2,envelope.height)) return {ok:false,reason:'projection'};
  }
  return {ok:true};
}

export function sampleRoute(path,travelled,stride=1) {
  if (!Array.isArray(path)||path.length<2||!path.every(point)||!Number.isFinite(travelled)||travelled<0||!Number.isFinite(stride)||stride<=0) return null;
  let remaining=travelled;
  let total=0;
  for (let index=1;index<path.length;index++) {
    const a=path[index-1],b=path[index],length=distance(a,b);
    total+=length;
    if (remaining<=length && length>EPS) {
      const t=remaining/length;
      return {position:[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],facing:[b[0]-a[0],b[1]-a[1]],stepPhase:(travelled/stride)%1};
    }
    remaining-=length;
  }
  return {position:[...path.at(-1)],facing:[0,0],stepPhase:(total/stride)%1};
}

export class RouteReservations {
  constructor() { this.locks=new Map(); }
  reserve(actor,version,segments) {
    if (segments.some(id=>this.locks.has(id)&&this.locks.get(id).actor!==actor)) return false;
    this.release(actor);
    segments.forEach(id=>this.locks.set(id,{actor,version}));
    return true;
  }
  release(actor,version=null) {
    for (const [id,lock] of this.locks) if(lock.actor===actor && (version===null||lock.version===version)) this.locks.delete(id);
  }
}
