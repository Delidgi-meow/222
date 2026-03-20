/**
 * Chronicle v0.3.0 — card sims, thoughts, SVG map, enhanced cycle
 */
import { renderExtensionTemplateAsync, getContext, extension_settings } from '/scripts/extensions.js';
import { getSlideToggleOptions, saveSettingsDebounced, eventSource, event_types } from '/script.js';
import { slideToggle } from '/lib.js';

const EXT_NAME='chronicle',VERSION='0.3.0';
const _su=import.meta.url,_em=_su.match(/\/scripts\/extensions\/(third-party\/[^/]+)\//);
const EXT_FOLDER=_em?_em[1]:'third-party/chronicle';
const TEMPLATE_PATH=`${EXT_FOLDER}/assets/templates`;

// ── Navbar ──
let doNavbarIconClick=null;
async function initNavbarFunction(){try{const m=await import('/script.js');if(m.doNavbarIconClick)doNavbarIconClick=m.doNavbarIconClick;}catch(_){}}
function openDrawerLegacy(){const ic=$('#chronicle_drawer_icon'),co=$('#chronicle_drawer_content');if(ic.hasClass('closedIcon')){$('.openDrawer').not('#chronicle_drawer_content').not('.pinnedOpen').addClass('resizing').each((_,el)=>{slideToggle(el,{...getSlideToggleOptions(),onAnimationEnd:e=>e.closest('.drawer-content')?.classList.remove('resizing')});});$('.openIcon').not('#chronicle_drawer_icon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');$('.openDrawer').not('#chronicle_drawer_content').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');ic.toggleClass('closedIcon openIcon');co.toggleClass('closedDrawer openDrawer');co.addClass('resizing').each((_,el)=>{slideToggle(el,{...getSlideToggleOptions(),onAnimationEnd:e=>e.closest('.drawer-content')?.classList.remove('resizing')});});}else{ic.toggleClass('openIcon closedIcon');co.toggleClass('openDrawer closedDrawer');co.addClass('resizing').each((_,el)=>{slideToggle(el,{...getSlideToggleOptions(),onAnimationEnd:e=>e.closest('.drawer-content')?.classList.remove('resizing')});});}}
async function initDrawer(){const t=$('#chronicle_drawer .drawer-toggle');if(typeof doNavbarIconClick==='function')t.on('click',doNavbarIconClick);else{$('#chronicle_drawer_content').attr('data-slide-toggle','hidden').css('display','none');t.on('click',openDrawerLegacy);}}

// ── Settings ──
const DEFS={enabled:true,autoParse:true,injectContext:true,sendSims:true,sendHealth:true,sendCycle:false,sendWallet:true,sendDiary:true,userBirthday:'',botBirthday:'',customSystemPrompt:''};
let settings={};
function loadSettings(){settings=extension_settings[EXT_NAME]?{...DEFS,...extension_settings[EXT_NAME]}:{...DEFS};extension_settings[EXT_NAME]=settings;}
function saveS(){extension_settings[EXT_NAME]=settings;saveSettingsDebounced();}
function syncSettingsUI(){$('#chr-set-sims').prop('checked',settings.sendSims);$('#chr-set-health').prop('checked',settings.sendHealth);$('#chr-set-cycle').prop('checked',settings.sendCycle);$('#chr-set-wallet').prop('checked',settings.sendWallet);$('#chr-set-diary').prop('checked',settings.sendDiary);$('#chr-set-user-bday').val(settings.userBirthday||'');$('#chr-set-bot-bday').val(settings.botBirthday||'');$('#chr-set-system-prompt').val(settings.customSystemPrompt||'');}
function initSettingsEvents(){const b=(s,k)=>$(document).on('change',s,function(){settings[k]=$(this).prop('checked');saveS();});b('#chr-set-sims','sendSims');b('#chr-set-health','sendHealth');b('#chr-set-cycle','sendCycle');b('#chr-set-wallet','sendWallet');b('#chr-set-diary','sendDiary');$(document).on('change','#chr-set-user-bday',function(){settings.userBirthday=$(this).val().trim();saveS();});$(document).on('change','#chr-set-bot-bday',function(){settings.botBirthday=$(this).val().trim();saveS();});$(document).on('change','#chr-set-system-prompt',function(){settings.customSystemPrompt=$(this).val();saveS();});$(document).on('click','#chr-set-reset-prompt',()=>{settings.customSystemPrompt='';$('#chr-set-system-prompt').val('');saveS();});}

// ── Regex ──
const TAGS=[{id:'chr_world',p:'<world>[\\s\\S]*?</world>'},{id:'chr_event',p:'<event>[\\s\\S]*?</event>'},{id:'chr_sims',p:'<sims>[\\s\\S]*?</sims>'},{id:'chr_health',p:'<health>[\\s\\S]*?</health>'},{id:'chr_cycle',p:'<cycle>[\\s\\S]*?</cycle>'},{id:'chr_diary',p:'<diary>[\\s\\S]*?</diary>'},{id:'chr_wallet',p:'<wallet>[\\s\\S]*?</wallet>'},{id:'chr_npc',p:'<npc>[\\s\\S]*?</npc>'},{id:'chr_agenda',p:'<agenda-?>[\\s\\S]*?</agenda-?>'},{id:'chr_thoughts',p:'<thoughts>[\\s\\S]*?</thoughts>'},{id:'chr_location',p:'<location>[\\s\\S]*?</location>'},{id:'chr_affect',p:'<affection>[\\s\\S]*?</affection>'}];
function ensureRegex(){try{const s=getContext()?.extensionSettings?.regex;if(!s||!Array.isArray(s))return;const ex=new Set(s.map(r=>r.id));for(const t of TAGS){if(ex.has(t.id))continue;s.push({id:t.id,scriptName:`Chronicle — ${t.id}`,findRegex:`/${t.p}/gim`,replaceString:'',trimStrings:[],placement:[2],disabled:false,markdownOnly:true,promptOnly:true,runOnEdit:true,substituteRegex:0,minDepth:null,maxDepth:null});}}catch(_){}}

// ══ SYSTEM PROMPT ══
const SYS_PROMPT=`[Chronicle — World Memory]
At END of EVERY reply, append ALL tags below. They are invisible to reader.

MANDATORY:
<world>
time:exact date+time (2025/06/12 03:05)
location:Place·Room
weather:short
atmosphere:short
characters:all present, comma-separated
costume:Name=outfit (one line per char, including {{user}})
</world>
<event>
level|description 20-50 words
</event>
Levels: обычное/важное/ключевое
<sims>
CharName.hunger:0-100|reason
CharName.hygiene:0-100
CharName.sleep:0-100|reason
CharName.arousal:0-100
</sims>
Write for EVERY character present. Use real names.
<thoughts>
CharName|emotion|What this character is thinking/feeling right now. Inner monologue, 2-3 sentences. Include physical sensations, desires, fears, plans.
</thoughts>
Write <thoughts> for {{char}} and NPCs present. Do NOT write thoughts for {{user}} — their inner world is private.

OPTIONAL (only on change):
<health>
CharName.hp:0-100
CharName.intoxication:0-100|what
CharName.injury:desc|severity(лёгкий/средний/тяжёлый)
CharName.habit:name|details
</health>
<cycle>
day:number
phase:name
fertile:yes/no
mood:mood description
physical:physical symptoms
libido:low/normal/high
</cycle>
<diary>
CharName|Detailed personal diary entry, 3-5 sentences. Deep thoughts, reflections, secrets. Write for {{char}} and important NPCs. Do NOT write diary for {{user}}.
</diary>
<wallet>
CharName.balance:amount₽
CharName.spend:category|amount₽|what
CharName.income:amount₽|source
</wallet>
<npc>
Name|внешность=desc|характер=traits|отношение=relation|пол:m/f|возраст:N|birthday:YYYY/M/D
</npc>
<affection>
Name=+/-N|reason
</affection>
<location>
Place·Room|описание=physical description|связь=Place·Room2,Place·Room3
</location>
<agenda>
YYYY/M/D|task text
</agenda>
<agenda->
completed task text
</agenda->

RULES:
- Tags at END after story
- Sims/health/wallet for ALL chars with name prefix
- Diary: ONLY {{char}} and NPCs, NOT {{user}}. 3-5 sentences minimum.
- Thoughts: ALL chars present, include emotion tag
- Location: write when entering new place`;

// ══ PARSING ══
function hasCD(msg){return msg?/<(?:world|event|sims|health|cycle|diary|wallet|npc|agenda|thoughts|location|affection)>/i.test(msg):false;}
function pl(c){return c.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));}
function kvp(l){const i=l.indexOf(':');return i>0?{k:l.substring(0,i).trim().toLowerCase(),v:l.substring(i+1).trim()}:null;}
function scf(raw){const d=raw.indexOf('.');return d>0?{c:raw.substring(0,d).trim(),f:raw.substring(d+1).trim().toLowerCase()}:{c:'_default',f:raw.toLowerCase()};}

function parseMessage(msg){
    if(!msg)return null;
    const R={world:null,events:[],sims:{},health:{},cycle:null,diary:[],wallet:{},npcs:{},agenda:[],agendaDel:[],affection:{},thoughts:[],locations:[]};
    let has=false,m;

    // <world>
    const wR=/<world>([\s\S]*?)<\/world>/gi;while((m=wR.exec(msg))){const w={time:'',location:'',weather:'',atmosphere:'',characters:[],costumes:{}};for(const l of pl(m[1])){const p=kvp(l);if(!p)continue;if(p.k==='time')w.time=p.v;else if(p.k==='location')w.location=p.v;else if(p.k==='weather')w.weather=p.v;else if(p.k==='atmosphere')w.atmosphere=p.v;else if(p.k==='characters')w.characters=p.v.split(/[,，]/).map(c=>c.trim()).filter(Boolean);else if(p.k==='costume'){const eq=p.v.indexOf('=');if(eq>0)w.costumes[p.v.substring(0,eq).trim()]=p.v.substring(eq+1).trim();}}R.world=w;has=true;}

    // <event>
    const eR=/<event>([\s\S]*?)<\/event>/gi;while((m=eR.exec(msg))){for(const l of pl(m[1])){const pp=l.indexOf('|');R.events.push(pp>0?{level:l.substring(0,pp).trim(),summary:l.substring(pp+1).trim()}:{level:'обычное',summary:l});}has=true;}

    // <thoughts>
    const tR=/<thoughts>([\s\S]*?)<\/thoughts>/gi;while((m=tR.exec(msg))){for(const l of pl(m[1])){const pts=l.split('|');if(pts.length>=3)R.thoughts.push({name:pts[0].trim(),emotion:pts[1].trim(),text:pts.slice(2).join('|').trim()});else if(pts.length===2)R.thoughts.push({name:pts[0].trim(),emotion:'',text:pts[1].trim()});}has=true;}

    // <sims>
    const sR=/<sims>([\s\S]*?)<\/sims>/gi;while((m=sR.exec(msg))){for(const l of pl(m[1])){const p=kvp(l);if(!p)continue;const{c,f}=scf(p.k);const ST=['hunger','hygiene','sleep','arousal'];if(!ST.includes(f))continue;const pp=p.v.indexOf('|');const vs=pp>0?p.v.substring(0,pp).trim():p.v;const reason=pp>0?p.v.substring(pp+1).trim():'';const n=parseFloat(vs);if(!isNaN(n)){if(!R.sims[c])R.sims[c]={};R.sims[c][f]={value:Math.max(0,Math.min(100,Math.round(n))),reason};}}has=true;}

    // <health>
    const hR=/<health>([\s\S]*?)<\/health>/gi;while((m=hR.exec(msg))){for(const l of pl(m[1])){const p=kvp(l);if(!p)continue;const{c,f}=scf(p.k);if(!R.health[c])R.health[c]={hp:null,intoxication:null,injuries:[],habits:[]};const h=R.health[c];if(f==='hp'){const n=parseFloat(p.v);if(!isNaN(n))h.hp=Math.max(0,Math.min(100,Math.round(n)));}else if(f==='intoxication'){const pp=p.v.indexOf('|');const vs=pp>0?p.v.substring(0,pp).trim():p.v;const n=parseFloat(vs);if(!isNaN(n))h.intoxication={value:Math.max(0,Math.min(100,Math.round(n))),reason:pp>0?p.v.substring(pp+1).trim():''};}else if(f==='injury'){const pts=p.v.split('|').map(x=>x.trim());if(pts[0])h.injuries.push({name:pts[0],severity:pts[1]||'лёгкий'});}else if(f==='habit'){const pts=p.v.split('|').map(x=>x.trim());if(pts[0])h.habits.push({name:pts[0],detail:pts[1]||''});}}has=true;}

    // <cycle>
    const cR=/<cycle>([\s\S]*?)<\/cycle>/gi;while((m=cR.exec(msg))){const c={day:null,phase:'',symptoms:'',fertile:'',mood:'',physical:'',libido:''};for(const l of pl(m[1])){const p=kvp(l);if(!p)continue;if(p.k==='day'){const n=parseInt(p.v);if(!isNaN(n))c.day=n;}else if(p.k==='phase')c.phase=p.v;else if(p.k==='symptoms')c.symptoms=p.v;else if(p.k==='fertile')c.fertile=p.v;else if(p.k==='mood')c.mood=p.v;else if(p.k==='physical')c.physical=p.v;else if(p.k==='libido')c.libido=p.v;}R.cycle=c;has=true;}

    // <diary>
    const dR=/<diary>([\s\S]*?)<\/diary>/gi;while((m=dR.exec(msg))){for(const l of pl(m[1])){const pp=l.indexOf('|');if(pp>0)R.diary.push({author:l.substring(0,pp).trim(),text:l.substring(pp+1).trim()});}has=true;}

    // <wallet>
    const wlR=/<wallet>([\s\S]*?)<\/wallet>/gi;while((m=wlR.exec(msg))){for(const l of pl(m[1])){const p=kvp(l);if(!p)continue;const{c,f}=scf(p.k);if(!R.wallet[c])R.wallet[c]={balance:null,transactions:[]};const w=R.wallet[c];if(f==='balance'){const mt=p.v.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(.*)/);if(mt)w.balance={amount:parseFloat(mt[1].replace(',','.')),currency:mt[2]||'₽'};}else if(f==='spend'){const pts=p.v.split('|').map(x=>x.trim());if(pts.length>=2){const mt=pts[1].match(/^(\d+(?:\.\d+)?)\s*(.*)/);if(mt)w.transactions.push({type:'spend',category:pts[0],amount:parseFloat(mt[1]),currency:mt[2]||'₽',note:pts[2]||''});}}else if(f==='income'){const pts=p.v.split('|').map(x=>x.trim());const mt=pts[0].match(/^(\d+(?:\.\d+)?)\s*(.*)/);if(mt)w.transactions.push({type:'income',category:'доход',amount:parseFloat(mt[1]),currency:mt[2]||'₽',note:pts[1]||''});}}has=true;}

    // <npc>
    const nR=/<npc>([\s\S]*?)<\/npc>/gi;while((m=nR.exec(msg))){for(const l of pl(m[1])){const pts=l.split('|').map(x=>x.trim());if(pts.length<2)continue;const name=pts[0],info={};for(let i=1;i<pts.length;i++){const eq=pts[i].indexOf('='),col=pts[i].indexOf(':');let k,v;if(eq>0&&(col<0||eq<col)){k=pts[i].substring(0,eq).trim().toLowerCase();v=pts[i].substring(eq+1).trim();}else if(col>0){k=pts[i].substring(0,col).trim().toLowerCase();v=pts[i].substring(col+1).trim();}else continue;if(k==='внешность'||k==='appearance')info.appearance=v;else if(k==='характер'||k==='personality')info.personality=v;else if(k==='отношение'||k==='relation')info.relation=v;else if(k==='пол'||k==='gender')info.gender=v;else if(k==='возраст'||k==='age'){const n=parseInt(v);if(!isNaN(n))info.age=n;}else if(k==='день_рождения'||k==='birthday'||k==='др')info.birthday=v;else info[k]=v;}R.npcs[name]=info;has=true;}}

    // <affection>
    const aR=/<affection>([\s\S]*?)<\/affection>/gi;while((m=aR.exec(msg))){for(const l of pl(m[1])){const eq=l.indexOf('=');if(eq<=0)continue;const name=l.substring(0,eq).trim(),rest=l.substring(eq+1).trim();const pp=rest.indexOf('|');const vs=pp>0?rest.substring(0,pp).trim():rest;const reason=pp>0?rest.substring(pp+1).trim():'';const n=parseFloat(vs);if(!isNaN(n))R.affection[name]={type:vs.startsWith('+')||vs.startsWith('-')?'relative':'absolute',value:n,reason};}has=true;}

    // <location>
    const lR=/<location>([\s\S]*?)<\/location>/gi;while((m=lR.exec(msg))){for(const l of pl(m[1])){const pts=l.split('|').map(x=>x.trim());if(!pts[0])continue;const loc={name:pts[0],desc:'',connections:[]};for(let i=1;i<pts.length;i++){const eq=pts[i].indexOf('=');if(eq<=0)continue;const k=pts[i].substring(0,eq).trim().toLowerCase(),v=pts[i].substring(eq+1).trim();if(k==='описание'||k==='desc')loc.desc=v;else if(k==='связь'||k==='связи'||k==='connection')loc.connections=v.split(/[,，]/).map(x=>x.trim()).filter(Boolean);}R.locations.push(loc);}has=true;}

    // <agenda>/<agenda->
    const agR=/<agenda>([\s\S]*?)<\/agenda>/gi;while((m=agR.exec(msg))){for(const l of pl(m[1])){const pp=l.indexOf('|');R.agenda.push(pp>0?{date:l.substring(0,pp).trim(),text:l.substring(pp+1).trim()}:{date:'',text:l});}has=true;}
    const agdR=/<agenda->([\s\S]*?)<\/agenda->/gi;while((m=agdR.exec(msg))){for(const l of pl(m[1]))if(l)R.agendaDel.push(l);has=true;}

    return has?R:null;
}

// ══ STATE ══
function createState(){return{time:'',location:'',weather:'',atmosphere:'',characters:[],costumes:{},events:[],sims:{},health:{},cycle:{day:null,phase:'',symptoms:'',fertile:'',mood:'',physical:'',libido:''},diary:[],wallets:{},npcs:{},affection:{},agenda:[],thoughts:[],locationMap:{nodes:{},edges:[]}};}
let lastState=createState(),calYear=2026,calMonth=3;

function aggregateState(){
    const chat=getContext()?.chat||[],S=createState();
    for(let i=0;i<chat.length;i++){
        const M=chat[i].chronicle_meta;if(!M)continue;
        if(M.world){if(M.world.time)S.time=M.world.time;if(M.world.location)S.location=M.world.location;if(M.world.weather)S.weather=M.world.weather;if(M.world.atmosphere)S.atmosphere=M.world.atmosphere;if(M.world.characters?.length)S.characters=[...M.world.characters];if(M.world.costumes)Object.assign(S.costumes,M.world.costumes);}
        if(M.events?.length)for(const ev of M.events)S.events.push({...ev,time:M.world?.time||'',msgId:i});
        if(M.thoughts?.length)S.thoughts=M.thoughts; // последние мысли
        if(M.sims)for(const[cn,stats]of Object.entries(M.sims)){if(!S.sims[cn])S.sims[cn]={hunger:70,hygiene:70,sleep:70,arousal:15};for(const[k,v]of Object.entries(stats))S.sims[cn][k]=v.value;}
        if(M.health)for(const[cn,h]of Object.entries(M.health)){if(!S.health[cn])S.health[cn]={hp:100,intoxication:{value:0,reason:''},injuries:[],habits:[]};const sh=S.health[cn];if(h.hp!==null)sh.hp=h.hp;if(h.intoxication)sh.intoxication=h.intoxication;for(const inj of h.injuries){const ex=sh.injuries.find(x=>x.name.toLowerCase()===inj.name.toLowerCase());if(ex)ex.severity=inj.severity;else sh.injuries.push({...inj});}for(const hab of h.habits){const ex=sh.habits.find(x=>x.name.toLowerCase()===hab.name.toLowerCase());if(ex)ex.detail=hab.detail;else sh.habits.push({...hab});}}
        if(M.cycle){if(M.cycle.day!==null)S.cycle.day=M.cycle.day;for(const k of['phase','symptoms','fertile','mood','physical','libido'])if(M.cycle[k])S.cycle[k]=M.cycle[k];}
        if(M.diary?.length)for(const d of M.diary)S.diary.push({...d,time:M.world?.time||'',msgId:i});
        if(M.wallet)for(const[cn,w]of Object.entries(M.wallet)){if(!S.wallets[cn])S.wallets[cn]={balance:0,currency:'₽',transactions:[]};if(w.balance)S.wallets[cn].balance=w.balance.amount;for(const tx of(w.transactions||[]))S.wallets[cn].transactions.push({...tx,date:M.world?.time||''});}
        if(M.npcs)for(const[n,info]of Object.entries(M.npcs)){if(!S.npcs[n])S.npcs[n]={};for(const[k,v]of Object.entries(info))if(v!==undefined&&v!=='')S.npcs[n][k]=v;}
        if(M.affection)for(const[n,d]of Object.entries(M.affection)){if(!S.affection[n])S.affection[n]={value:0,reason:''};if(d.type==='absolute')S.affection[n].value=d.value;else S.affection[n].value+=d.value;if(d.reason)S.affection[n].reason=d.reason;}
        if(M.agendaDel?.length)for(const del of M.agendaDel)S.agenda=S.agenda.filter(a=>!a.text.toLowerCase().includes(del.toLowerCase()));
        if(M.agenda?.length)for(const a of M.agenda)if(!S.agenda.some(x=>x.text===a.text))S.agenda.push({...a,done:false});
        // Locations → map nodes
        if(M.locations?.length)for(const loc of M.locations){const id=loc.name.toLowerCase().replace(/[·\s>/\\]/g,'_').replace(/[^a-zа-яё0-9_]/gi,'');if(!S.locationMap.nodes[id])S.locationMap.nodes[id]={name:loc.name,desc:loc.desc,x:50+Object.keys(S.locationMap.nodes).length%4*120,y:40+Math.floor(Object.keys(S.locationMap.nodes).length/4)*80};else if(loc.desc)S.locationMap.nodes[id].desc=loc.desc;for(const cn of loc.connections){const cid=cn.toLowerCase().replace(/[·\s>/\\]/g,'_').replace(/[^a-zа-яё0-9_]/gi,'');if(!S.locationMap.nodes[cid])S.locationMap.nodes[cid]={name:cn,desc:'',x:S.locationMap.nodes[id].x+130,y:S.locationMap.nodes[id].y+40};if(!S.locationMap.edges.some(e=>(e.from===id&&e.to===cid)||(e.from===cid&&e.to===id)))S.locationMap.edges.push({from:id,to:cid});}}
    }
    if(S.time){const mt=S.time.match(/(\d{4})\D+(\d{1,2})/);if(mt){calYear=parseInt(mt[1]);calMonth=parseInt(mt[2]);}}
    return S;
}

// ══ PROMPT INJECTION ══
function buildCtxPrompt(S){
    const L=[];
    if(S.time)L.push(`[Время:${S.time} | Место:${S.location} | Погода:${S.weather}]`);
    for(const[cn,s]of Object.entries(S.sims)){const n=cn==='_default'?(getContext()?.name2||'Bot'):cn;L.push(`[${n}: голод=${s.hunger},гигиена=${s.hygiene},сон=${s.sleep},возб=${s.arousal}]`);}
    for(const[cn,h]of Object.entries(S.health)){const n=cn==='_default'?(getContext()?.name2||'Bot'):cn;const p=[];if(h.hp<100)p.push(`HP:${h.hp}`);if(h.intoxication?.value>0)p.push(`Алкоголь:${h.intoxication.value}`);for(const inj of h.injuries)p.push(`Травма:${inj.name}`);for(const hab of h.habits)p.push(`Привычка:${hab.name}`);if(p.length)L.push(`[${n} здоровье: ${p.join(', ')}]`);}
    const bd=[];if(settings.userBirthday)bd.push(`${getContext()?.name1||'User'}:${settings.userBirthday}`);if(settings.botBirthday)bd.push(`${getContext()?.name2||'Bot'}:${settings.botBirthday}`);for(const[n,npc]of Object.entries(S.npcs))if(npc.birthday)bd.push(`${n}:${npc.birthday}`);if(bd.length)L.push(`[ДР: ${bd.join('; ')}]`);
    const up=S.agenda.filter(a=>!a.done).slice(0,5);if(up.length)L.push(`[Планы: ${up.map(a=>(a.date?a.date+' ':'')+ a.text).join('; ')}]`);
    return L.join('\n');
}
function onPromptReady(ed){if(!settings.enabled||!settings.injectContext)return;const S=aggregateState();const sys=settings.customSystemPrompt||SYS_PROMPT;const ctx=buildCtxPrompt(S);if(ed?.chat){ed.chat.unshift({role:'system',content:sys});if(ctx){let idx=ed.chat.length-1;for(let i=ed.chat.length-1;i>=0;i--)if(ed.chat[i].role==='user'){idx=i;break;}ed.chat.splice(idx,0,{role:'system',content:ctx});}}}

// ══ EVENTS ══
function onMsg(idx){if(!settings.enabled)return;const chat=getContext()?.chat;if(!chat||idx<0||idx>=chat.length)return;if(!hasCD(chat[idx].mes))return;const p=parseMessage(chat[idx].mes);if(p){chat[idx].chronicle_meta=p;console.log(`[Chronicle] Parsed #${idx}`);}lastState=aggregateState();refreshAll();getContext().saveChat?.();}
function onChat(){if(!settings.enabled)return;const chat=getContext()?.chat||[];for(let i=0;i<chat.length;i++)if(!chat[i].chronicle_meta&&chat[i].mes&&hasCD(chat[i].mes)){const p=parseMessage(chat[i].mes);if(p)chat[i].chronicle_meta=p;}lastState=aggregateState();refreshAll();}

// ══ UI ══
const SC={hunger:{name:'Голод',icon:'fa-utensils',color:'#e8d4a0'},hygiene:{name:'Гигиена',icon:'fa-shower',color:'#a0b8d4'},sleep:{name:'Сон',icon:'fa-bed',color:'#c4b0d8'},arousal:{name:'Возбуждение',icon:'fa-fire',color:'#d4a0b8'}};
const MO=['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function rn(cn){return cn==='_default'?(getContext()?.name2||'Персонаж'):cn;}
function statColor(val,baseColor){return val<20?'#d4a0a0':val<40?'#e8d4a0':baseColor;}

function refreshAll(){rStatus();rSims();rHealth();rTimeline();rChars();rItems();rCal();rMap();}

function rStatus(){
    $('#chr-current-date').text(lastState.time||'--/--');$('#chr-current-weather').text(lastState.weather||'');
    $('#chr-current-location').text(lastState.location||'Не задано');$('#chr-current-atmosphere').text(lastState.atmosphere||'');
    // Thoughts
    const $t=$('#chr-thoughts-list').empty();
    // Фильтруем мысли юзера — показываем только бота и NPC
    const userName=(getContext()?.name1||'').toLowerCase();
    const botThoughts=lastState.thoughts.filter(th=>th.name.toLowerCase()!==userName&&th.name.toLowerCase()!=='{{user}}');
    if(botThoughts.length){for(const th of botThoughts){$t.append(`<div class="chr-thought-card chr-glass-card"><div class="chr-thought-card__name">${esc(th.name)}</div>${th.emotion?`<div class="chr-thought-card__emotion"><i class="fa-solid fa-face-meh"></i> ${esc(th.emotion)}</div>`:''}<div class="chr-thought-card__text">${esc(th.text)}</div></div>`);}}
    else $t.append('<div class="chr-empty"><i class="fa-solid fa-brain"></i>AI ещё не описал мысли</div>');
    // Costumes
    const $c=$('#chr-costumes-quick').empty();const ce=Object.entries(lastState.costumes);
    if(ce.length)for(const[c,d]of ce)$c.append(`<div style="margin-bottom:4px;"><span style="color:var(--chr-accent);font-weight:600;font-size:12px;">${esc(c)}:</span> <span style="font-size:11px;color:var(--chr-text-muted);">${esc(d)}</span></div>`);
    else $c.append('<div class="chr-empty">Нет данных</div>');
}

function rSims(){
    const $c=$('#chr-sims-chars').empty();const names=Object.keys(lastState.sims);
    if(!names.length){$c.append('<div class="chr-empty"><i class="fa-solid fa-heart-pulse"></i>Нет данных</div>');return;}
    for(const cn of names){const stats=lastState.sims[cn];const dn=rn(cn);
        let cards='';for(const[key,cfg]of Object.entries(SC)){const val=stats[key]??70;const col=statColor(val,cfg.color);
            cards+=`<div class="chr-sim-card chr-glass-card ${val<20?'critical':''}"><i class="chr-sim-card__icon fa-solid ${cfg.icon}" style="color:${col};"></i><div class="chr-sim-card__value" style="color:${col};">${val}</div><div class="chr-sim-card__label">${cfg.name}</div><div class="chr-sim-card__reason">${esc(stats[key+'_reason']||'')}</div><div class="chr-sim-card__bar" style="width:${val}%;background:${col};"></div></div>`;}
        $c.append(`<div style="margin-bottom:12px;"><div style="font-family:var(--chr-font-display);font-size:13px;font-weight:600;color:var(--chr-accent);margin-bottom:8px;padding:0 4px;"><i class="fa-solid fa-user"></i> ${esc(dn)}</div><div class="chr-sims-grid">${cards}</div></div>`);
    }
}

function rHealth(){
    const $c=$('#chr-health-chars').empty();const names=Object.keys(lastState.health);
    if(!names.length){$c.append('<div class="chr-empty"><i class="fa-solid fa-heart-pulse"></i>Нет данных</div>');return;}
    for(const cn of names){const h=lastState.health[cn];const dn=rn(cn);let html=`<div style="font-family:var(--chr-font-display);font-size:13px;font-weight:600;color:var(--chr-accent);margin-bottom:8px;"><i class="fa-solid fa-user"></i> ${esc(dn)}</div>`;
        // Stats as tags
        html+=`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">`;
        html+=`<span class="chr-tag ${h.hp<50?'chr-tag--danger':'chr-tag--success'}"><i class="fa-solid fa-heart"></i> HP ${h.hp}</span>`;
        if(h.intoxication?.value>0)html+=`<span class="chr-tag chr-tag--warning"><i class="fa-solid fa-wine-glass"></i> ${h.intoxication.value}% ${h.intoxication.reason?'— '+esc(h.intoxication.reason):''}</span>`;
        html+=`</div>`;
        if(h.injuries.length){for(const inj of h.injuries){const cls=inj.severity==='тяжёлый'?'danger':inj.severity==='средний'?'warning':'info';html+=`<div class="chr-injury-item"><div class="chr-injury-item__dot ${cls==='danger'?'severe':cls==='warning'?'medium':'light'}"></div><span style="color:var(--chr-text);font-size:12px;">${esc(inj.name)}</span><span class="chr-tag chr-tag--${cls}">${esc(inj.severity)}</span></div>`;}}
        if(h.habits.length){for(const hab of h.habits)html+=`<div class="chr-habit-item"><i class="fa-solid fa-smoking"></i><span>${esc(hab.name)}</span><span style="color:var(--chr-text-dim);">${esc(hab.detail)}</span></div>`;}
        $c.append(`<div class="chr-glass-card" style="padding:10px 12px;margin-bottom:8px;">${html}</div>`);
    }
    // Cycle
    const cy=lastState.cycle;
    if(cy.day!==null){$('#chr-cycle-display').show();const $cc=$('#chr-cycle-content').empty();
        let html=`<div style="display:flex;gap:12px;align-items:flex-start;"><span style="font-size:28px;font-weight:700;color:var(--chr-accent);font-family:var(--chr-font-display);">День ${cy.day}</span><div style="flex:1;">`;
        if(cy.phase)html+=`<div style="font-size:13px;font-weight:600;color:var(--chr-text);">${esc(cy.phase)}</div>`;
        const tags=[];
        if(cy.fertile)tags.push(`<span class="chr-tag ${cy.fertile.toLowerCase()==='yes'||cy.fertile==='да'?'chr-tag--danger':'chr-tag--success'}"><i class="fa-solid fa-seedling"></i> Фертильность: ${esc(cy.fertile)}</span>`);
        if(cy.libido)tags.push(`<span class="chr-tag chr-tag--accent"><i class="fa-solid fa-fire"></i> Либидо: ${esc(cy.libido)}</span>`);
        if(tags.length)html+=`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${tags.join('')}</div>`;
        if(cy.mood)html+=`<div style="font-size:11px;color:var(--chr-text-muted);margin-top:4px;"><i class="fa-solid fa-face-meh"></i> ${esc(cy.mood)}</div>`;
        if(cy.physical)html+=`<div style="font-size:11px;color:var(--chr-text-muted);margin-top:2px;"><i class="fa-solid fa-notes-medical"></i> ${esc(cy.physical)}</div>`;
        if(cy.symptoms)html+=`<div style="font-size:11px;color:var(--chr-text-dim);margin-top:2px;">${esc(cy.symptoms)}</div>`;
        html+=`</div></div>`;$cc.append(html);
    }else $('#chr-cycle-display').hide();
}

function rTimeline(){const $t=$('#chr-timeline-list').empty();if(lastState.events.length)for(const ev of lastState.events.slice(-50).reverse())$t.append(`<div class="chr-timeline-item chr-glass-card" data-level="${esc(ev.level)}"><div class="chr-timeline-item__time">${esc(ev.time)}</div><div class="chr-timeline-item__text">${esc(ev.summary)}</div></div>`);else $t.append('<div class="chr-empty"><i class="fa-solid fa-timeline"></i>Событий нет</div>');}

function rChars(){
    const $d=$('#chr-diary-list').empty();if(lastState.diary.length)for(const d of lastState.diary.slice(-30).reverse())$d.append(`<div class="chr-diary-entry chr-glass-card"><div class="chr-diary-entry__author"><i class="fa-solid fa-feather"></i> ${esc(d.author)}</div><div class="chr-diary-entry__text">${esc(d.text)}</div><div class="chr-diary-entry__time">${esc(d.time)}</div></div>`);else $d.append('<div class="chr-empty"><i class="fa-solid fa-book"></i>Записей нет</div>');
    const $n=$('#chr-characters-list').empty();const ctx=getContext();
    if(settings.userBirthday)$n.append(`<div class="chr-glass-card" style="padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-cake-candles" style="color:var(--chr-accent);"></i><span style="font-size:12px;color:var(--chr-text);font-weight:600;">${esc(ctx?.name1||'User')}</span><span class="chr-tag chr-tag--accent">${esc(settings.userBirthday)}</span></div>`);
    if(settings.botBirthday)$n.append(`<div class="chr-glass-card" style="padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-cake-candles" style="color:var(--chr-accent);"></i><span style="font-size:12px;color:var(--chr-text);font-weight:600;">${esc(ctx?.name2||'Bot')}</span><span class="chr-tag chr-tag--accent">${esc(settings.botBirthday)}</span></div>`);
    for(const name of Object.keys(lastState.npcs)){const npc=lastState.npcs[name];const aff=lastState.affection[name];const pr=lastState.characters.includes(name);let tags='';if(npc.gender)tags+=`<span class="chr-tag">${esc(npc.gender)}</span>`;if(npc.age)tags+=`<span class="chr-tag">${npc.age} лет</span>`;if(npc.relation)tags+=`<span class="chr-tag chr-tag--primary">${esc(npc.relation)}</span>`;if(aff){const cls=aff.value>=0?'success':'danger';tags+=`<span class="chr-tag chr-tag--${cls}">♥ ${aff.value>0?'+':''}${aff.value}</span>`;}if(pr)tags+='<span class="chr-tag chr-tag--accent">в сцене</span>';
        $n.append(`<div class="chr-npc-card chr-glass-card">${npc.birthday?`<div class="chr-npc-card__birthday"><i class="fa-solid fa-cake-candles"></i> ${esc(npc.birthday)}</div>`:''}<div class="chr-npc-card__header"><div class="chr-npc-card__avatar">${name.charAt(0).toUpperCase()}</div><div><div class="chr-npc-card__name">${esc(name)}</div>${npc.appearance?`<div style="font-size:11px;color:var(--chr-text-muted);">${esc(npc.appearance)}</div>`:''}</div></div><div class="chr-npc-card__tags">${tags}</div></div>`);}
}

function rItems(){
    const $w=$('#chr-wallets-container').empty();const wn=Object.keys(lastState.wallets);
    if(wn.length)for(const cn of wn){const w=lastState.wallets[cn];let tx='';for(const t of w.transactions.slice(-6).reverse()){const sp=t.type==='spend';tx+=`<div class="chr-wallet-tx"><div class="chr-wallet-tx__icon ${t.type}"><i class="fa-solid ${sp?'fa-arrow-down':'fa-arrow-up'}"></i></div><div class="chr-wallet-tx__info"><div class="chr-wallet-tx__category">${esc(t.category)}</div><div class="chr-wallet-tx__note">${esc(t.note)}</div></div><div class="chr-wallet-tx__amount ${t.type}">${sp?'-':'+'}${t.amount}${t.currency||'₽'}</div></div>`;}
        $w.append(`<div class="chr-glass-card" style="padding:12px;margin-bottom:8px;"><div style="text-align:center;margin-bottom:8px;"><div style="font-size:11px;color:var(--chr-text-dim);">${esc(rn(cn))}</div><div style="font-family:var(--chr-font-display);font-size:24px;font-weight:700;color:var(--chr-text);">${w.balance.toLocaleString('ru-RU')}<span style="font-size:14px;color:var(--chr-text-muted);">${w.currency}</span></div></div>${tx}</div>`);}
    else $w.append('<div class="chr-empty"><i class="fa-solid fa-wallet"></i>Нет данных</div>');
}

function rCal(){
    $('#chr-cal-month').text(`${MO[calMonth]||''} ${calYear}`);const $g=$('#chr-cal-grid').empty();
    const first=new Date(calYear,calMonth-1,1),days=new Date(calYear,calMonth,0).getDate();let sw=first.getDay()-1;if(sw<0)sw=6;
    const evD=new Set(),bdD=new Set(),agD=new Set();
    for(const ev of lastState.events){const d=ev.time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(d&&+d[1]===calYear&&+d[2]===calMonth)evD.add(+d[3]);}
    const bds=[...Object.values(lastState.npcs).map(n=>n.birthday).filter(Boolean)];if(settings.userBirthday)bds.push(settings.userBirthday);if(settings.botBirthday)bds.push(settings.botBirthday);
    for(const bd of bds){const d=bd.match(/(?:\d{4}\D+)?(\d{1,2})\D+(\d{1,2})$/);if(d&&+d[1]===calMonth)bdD.add(+d[2]);}
    for(const a of lastState.agenda){const d=a.date?.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(d&&+d[1]===calYear&&+d[2]===calMonth)agD.add(+d[3]);}
    let sd=0;const sm=lastState.time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(sm&&+sm[1]===calYear&&+sm[2]===calMonth)sd=+sm[3];
    for(let i=0;i<sw;i++)$g.append('<div class="chr-calendar__day other-month"></div>');
    for(let d=1;d<=days;d++){let cls='chr-calendar__day';if(d===sd)cls+=' today';let dots='';if(evD.has(d))dots+='<span style="width:4px;height:4px;border-radius:50%;background:var(--chr-warning);display:inline-block;"></span>';if(bdD.has(d))dots+='<span style="width:4px;height:4px;border-radius:50%;background:var(--chr-accent);display:inline-block;"></span>';if(agD.has(d))dots+='<span style="width:4px;height:4px;border-radius:50%;background:var(--chr-info);display:inline-block;"></span>';$g.append(`<div class="${cls}"><span>${d}</span><div style="display:flex;gap:2px;justify-content:center;margin-top:1px;">${dots}</div></div>`);}
    const $a=$('#chr-agenda-list').empty();if(lastState.agenda.length)for(const a of lastState.agenda)$a.append(`<div class="chr-glass-card" style="padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-circle-check" style="color:var(--chr-info);"></i><div style="flex:1;"><div style="font-size:12px;color:var(--chr-text);">${esc(a.text)}</div>${a.date?`<div style="font-size:10px;color:var(--chr-text-dim);">${esc(a.date)}</div>`:''}</div></div>`);else $a.append('<div class="chr-empty"><i class="fa-solid fa-list-check"></i>Нет задач</div>');
}

// ── SVG Map ──
function rMap(){
    const svg=$('#chr-map-svg')[0];if(!svg)return;while(svg.firstChild)svg.removeChild(svg.firstChild);
    const nodes=lastState.locationMap.nodes,edges=lastState.locationMap.edges;
    const nodeIds=Object.keys(nodes);
    if(!nodeIds.length){$('#chr-map-empty').show();return;}$('#chr-map-empty').hide();
    // Current location id
    const curId=lastState.location.toLowerCase().replace(/[·\s>/\\]/g,'_').replace(/[^a-zа-яё0-9_]/gi,'');
    // Draw edges
    for(const e of edges){const a=nodes[e.from],b=nodes[e.to];if(!a||!b)continue;const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a.x+55);line.setAttribute('y1',a.y+20);line.setAttribute('x2',b.x+55);line.setAttribute('y2',b.y+20);line.classList.add('chr-map-edge');svg.appendChild(line);}
    // Draw nodes
    for(const[id,node]of Object.entries(nodes)){
        const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.classList.add('chr-map-node');if(id===curId)g.classList.add('current');g.setAttribute('transform',`translate(${node.x},${node.y})`);
        const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('width','110');rect.setAttribute('height','40');g.appendChild(rect);
        // Short name
        const shortName=node.name.includes('·')?node.name.split('·').pop():node.name;
        const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x','55');text.setAttribute('y','20');text.textContent=shortName.length>14?shortName.substring(0,12)+'…':shortName;g.appendChild(text);
        // Drag
        let drag=false,ox,oy;
        g.addEventListener('pointerdown',(ev)=>{drag=true;ox=ev.clientX-node.x;oy=ev.clientY-node.y;g.setPointerCapture(ev.pointerId);});
        g.addEventListener('pointermove',(ev)=>{if(!drag)return;const svgRect=svg.getBoundingClientRect();const scale=500/svgRect.width;node.x=Math.max(0,Math.min(390,(ev.clientX-ox)));node.y=Math.max(0,Math.min(310,(ev.clientY-oy)));rMap();});
        g.addEventListener('pointerup',()=>{drag=false;});
        svg.appendChild(g);
    }
    // Fit viewBox
    let maxX=500,maxY=350;for(const n of Object.values(nodes)){if(n.x+120>maxX)maxX=n.x+130;if(n.y+50>maxY)maxY=n.y+60;}
    svg.setAttribute('viewBox',`0 0 ${maxX} ${maxY}`);
}

// ── Tabs/Buttons ──
function initTabs(){$(document).on('click','.chr-tab',function(){const t=$(this).data('tab');if(!t)return;$('.chr-tab').removeClass('active');$(this).addClass('active');$('.chr-tab-content').removeClass('active');$(`#chr-tab-${t}`).addClass('active');});}
function initButtons(){
    $(document).on('click','#chr-btn-refresh',()=>{onChat();if(window.toastr)toastr.success('Обновлено','Chronicle');});
    $(document).on('click','#chr-cal-prev',()=>{calMonth--;if(calMonth<1){calMonth=12;calYear--;}rCal();});
    $(document).on('click','#chr-cal-next',()=>{calMonth++;if(calMonth>12){calMonth=1;calYear++;}rCal();});
    $(document).on('click','#chr-agenda-add',()=>{const text=prompt('Задача:');if(!text)return;const date=prompt('Дата (ГГГГ/М/Д):')||'';lastState.agenda.push({date,text,done:false});rCal();});
    $(document).on('click','#chr-map-add-room',()=>{const name=prompt('Название (напр. Дом·Кухня):');if(!name)return;const id=name.toLowerCase().replace(/[·\s>/\\]/g,'_').replace(/[^a-zа-яё0-9_]/gi,'');if(!lastState.locationMap.nodes[id])lastState.locationMap.nodes[id]={name,desc:'',x:50+Object.keys(lastState.locationMap.nodes).length%4*120,y:40};rMap();});
}
async function getTemplate(n){try{return await renderExtensionTemplateAsync(TEMPLATE_PATH,n);}catch(e){return '';}}

// ══ INIT ══
jQuery(async()=>{
    console.log(`[Chronicle] Loading v${VERSION}...`);
    try{
        await initNavbarFunction();loadSettings();ensureRegex();
        const html=await getTemplate('drawer');if(!html){console.error('[Chronicle] No drawer');return;}
        $('#extensions-settings-button').after(html);
        await initDrawer();initTabs();initButtons();initSettingsEvents();
        if(event_types.CHARACTER_MESSAGE_RENDERED)eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED,onMsg);
        if(event_types.CHAT_CHANGED)eventSource.on(event_types.CHAT_CHANGED,onChat);
        if(event_types.CHAT_COMPLETION_PROMPT_READY)eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY,onPromptReady);
        if(event_types.MESSAGE_SWIPED)eventSource.on(event_types.MESSAGE_SWIPED,()=>{lastState=aggregateState();refreshAll();});
        if(event_types.MESSAGE_DELETED)eventSource.on(event_types.MESSAGE_DELETED,()=>{lastState=aggregateState();refreshAll();});
        onChat();syncSettingsUI();
        console.log(`[Chronicle] v${VERSION} loaded! ✓`);
    }catch(err){console.error('[Chronicle] Init failed:',err);}
});
