import { checksum } from '../services/DataChecksum.js';

const RULE_VERSION='space-v1';
const ALLOWED_HOSTS=['ccmc.gsfc.nasa.gov','ssd.jpl.nasa.gov','science.nasa.gov'];
export function sourceURL(url) {
  try { const value=new URL(url);return value.protocol==='https:' && ALLOWED_HOSTS.includes(value.hostname) && !value.username && !value.password && !value.search ? value.href : null; }
  catch { return null; }
}
function requireField(value,condition,message) { if(!condition)throw new Error(message);return value; }
const bounded=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
function utc(value) { return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,16)===value.slice(0,16); }
function observation(source,raw,fields) {
  requireField(source,Boolean(sourceURL(fields.url)),'REJECT_TARGET');
  requireField(source,utc(fields.observedAtUTC),'REJECT_SCHEMA');
  return {sourceID:source,parserVersion:1,rawChecksum:checksum(raw),qualityFlags:[],...fields};
}
export function adaptDONKI(raw) {
  requireField(raw,raw&&raw.messageType==='CME'&&typeof raw.messageBody==='string'&&raw.messageBody.length<=32000&&typeof raw.messageID==='string'&&raw.messageID.length<100,'REJECT_SCHEMA');
  const body=raw.messageBody;
  // Office names and generic solar activity do not establish a Mars impact.
  requireField(raw,/\b(?:impact|reach)\s+(?:[^.\n]{0,100}?\band\s+)?Mars\b/i.test(body),'REJECT_TARGET');
  const glancing=/Mars\s*\(glancing blow\)/i.test(body);
  return observation('donki',raw,{observationID:raw.messageID,sourceRecordID:raw.messageID,organization:'NASA CCMC',dataset:'DONKI research notification',dataClass:'advisory',parameter:'mars-advisory',value:glancing?'caution':'restricted',unit:'tier',target:'Mars',observedAtUTC:raw.messageIssueTime,url:raw.messageURL,qualityFlags:['research-analysis','not-a-dose','not-a-habitat-forecast']});
}
export function adaptHorizons(raw) {
  requireField(raw,raw&&typeof raw.result==='string'&&raw.result.length<=32000,'REJECT_SCHEMA');
  const text=raw.result;
  requireField(raw,/Target body name:\s*Mars \(499\)/.test(text)&&/Center body name:\s*Earth \(399\)/.test(text),'REJECT_TARGET');
  requireField(raw,text.includes('1-way_down_LT')&&/Units: MINUTES/.test(text),'REJECT_UNIT');
  const row=text.split('$$SOE')[1]?.split('$$EOE')[0]?.trim().split('\n')[0]?.split(',');
  const value=Number(row?.[3]?.trim());
  requireField(raw,Boolean(row?.[3]?.trim())&&bounded(value,2,30),'REJECT_RANGE');
  const stamp=row[0].trim().match(/^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}:\d{2})$/);
  const month=stamp?['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(stamp[2])+1:0;
  requireField(raw,month>0,'REJECT_SCHEMA');
  const time=`${stamp[1]}-${String(month).padStart(2,'0')}-${stamp[3]}T${stamp[4]}:00Z`;
  return observation('horizons',raw,{observationID:`horizons-499-399-${time}`,sourceRecordID:`499/500@399/Q21/${time}`,organization:'NASA/JPL SSD',dataset:'Horizons observer ephemeris',dataClass:'computed',parameter:'one-way-light-time',value,unit:'min',target:'Mars to Earth geocentre',observedAtUTC:time,url:'https://ssd.jpl.nasa.gov/horizons/manual.html',qualityFlags:['calculated','one-way-downleg','not-network-availability']});
}
export function adaptREMS(raw) {
  requireField(raw,raw&&raw.source==='NASA-REMS-report-v1'&&raw.target==='Mars / Gale crater','REJECT_TARGET');
  requireField(raw,raw.unit==='degC'&&raw.parameter==='daily-maximum-air-temperature','REJECT_UNIT');
  requireField(raw,bounded(raw.value,-150,50)&&Number.isInteger(raw.sol)&&raw.sol>=0,'REJECT_RANGE');
  return observation('rems-report',raw,{observationID:`rems-sol-${raw.sol}`,sourceRecordID:`REMS/Sol-${raw.sol}/NASA-mission-report`,organization:'NASA / Curiosity REMS',dataset:'REMS value reported by NASA mission blog',dataClass:'measured-report',parameter:raw.parameter,value:raw.value,unit:'degC',target:raw.target,observedAtUTC:raw.observedAtUTC,timePrecision:'day',timeMeaning:'report-date; exact observation UTC not supplied',missionSol:raw.sol,url:raw.url,qualityFlags:['reported-measurement','rover-site-only','not-an-outpost-forecast']});
}
export function mapping(observations) {
  const solar=observations.find(o=>o.sourceID==='donki'),light=observations.find(o=>o.sourceID==='horizons'),temp=observations.find(o=>o.sourceID==='rems-report');
  requireField(null,solar&&light&&temp,'REJECT_SCHEMA');
  return {version:RULE_VERSION,advisory:solar.value,advisorySols:[3,8],heating:temp.value<=-20?'cold':'milder',heatingExtra:temp.value<=-20?1:0,heatingSols:[4,9],replySols:Math.max(1,Math.min(2,Math.ceil(2*light.value/30)))};
}
export function buildSnapshot(raw,{mode='historical',caseID='case-mars-impact',createdAtUTC=new Date().toISOString()}={}) {
  requireField(raw,['current','cached','historical'].includes(mode)&&utc(createdAtUTC),'REJECT_SCHEMA');
  const observations=[adaptDONKI(raw.donki),adaptHorizons(raw.horizons),adaptREMS(raw.rems)].map(record=>({...record,fetchedAtUTC:createdAtUTC}));
  const core={schemaVersion:1,caseID,mode,createdAtUTC,seed:20261113,observations,rules:mapping(observations)};
  return {...core,snapshotID:checksum(core).slice(0,24),checksum:checksum(core)};
}
export function snapshotFresh(snapshot,now=Date.now()) {
  const maxHours={donki:72,horizons:36,'rems-report':24*30};
  return snapshot.observations.every(o=>{const age=now-Date.parse(o.observedAtUTC);return age>=-300000&&age<=maxHours[o.sourceID]*3600000;});
}
export function validSnapshot(snapshot) {
  try {
    if(!snapshot||snapshot.schemaVersion!==1||!['current','cached','historical'].includes(snapshot.mode)||!utc(snapshot.createdAtUTC)||snapshot.seed!==20261113)return false;
    if(typeof snapshot.caseID!=='string'||snapshot.caseID.length>100||!Array.isArray(snapshot.observations)||snapshot.observations.length!==3)return false;
    const [solar,light,temp]=snapshot.observations;
    if(solar.sourceID!=='donki'||light.sourceID!=='horizons'||temp.sourceID!=='rems-report')return false;
    if(solar.target!=='Mars'||solar.unit!=='tier'||!['caution','restricted'].includes(solar.value))return false;
    if(light.target!=='Mars to Earth geocentre'||light.unit!=='min'||!bounded(light.value,2,30))return false;
    if(temp.target!=='Mars / Gale crater'||temp.unit!=='degC'||!bounded(temp.value,-150,50))return false;
    if(!snapshot.observations.every(o=>utc(o.observedAtUTC)&&utc(o.fetchedAtUTC)&&sourceURL(o.url)&&typeof o.rawChecksum==='string'&&/^[0-9a-f]{64}$/.test(o.rawChecksum)&&typeof o.sourceRecordID==='string'&&o.sourceRecordID.length<200&&o.parserVersion===1&&[o.observationID,o.organization,o.dataset,o.dataClass,o.parameter].every(value=>typeof value==='string'&&value.length>0&&value.length<200)&&Array.isArray(o.qualityFlags)&&o.qualityFlags.length<20&&o.qualityFlags.every(flag=>typeof flag==='string'&&flag.length<100)))return false;
    if(JSON.stringify(snapshot.rules)!==JSON.stringify(mapping(snapshot.observations)))return false;
    const {snapshotID,checksum:hash,...core}=snapshot;
    return checksum(core)===hash&&snapshotID===hash.slice(0,24);
  } catch {return false;}
}
export function advisoryActive(state) { return Boolean(state.missionSnapshot?.rules.advisorySols.includes(state.sol)); }
export function outsideBlocked(state) {return advisoryActive(state)&&state.missionSnapshot.rules.advisory==='restricted';}
export function spaceEnergyCost(state,energy,outside=false) {return energy+(outside&&advisoryActive(state)&&state.missionSnapshot.rules.advisory==='caution'?1:0);}
export function spaceHeating(state,systems) {const rules=state.missionSnapshot?.rules;return rules?.heatingSols.includes(state.sol)&&state.sol>=systems.labUntil ? rules.heatingExtra : 0;}
export function recordSpaceDecision(state,choice,energy) {
  if(!state.missionSnapshot)return;
  (state.spaceTrace??=[]).push({sol:state.sol,eventID:state.currentEventId,snapshotID:state.missionSnapshot.snapshotID,ruleVersion:state.missionSnapshot.rules.version,advisory:state.missionSnapshot.rules.advisory,heating:state.missionSnapshot.rules.heating,replySols:state.missionSnapshot.rules.replySols,choice,costE:energy,outcome:'deterministic'});
}
