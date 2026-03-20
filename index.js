/**
 * Chronicle v0.4.0 — Gray glass, pastel cards, bot+user sims, strong diary
 */
import{renderExtensionTemplateAsync,getContext,extension_settings}from'/scripts/extensions.js';
import{getSlideToggleOptions,saveSettingsDebounced,eventSource,event_types}from'/script.js';
import{slideToggle}from'/lib.js';

const EN='chronicle',VER='0.4.0';
const _u=import.meta.url,_m=_u.match(/\/scripts\/extensions\/(third-party\/[^/]+)\//);
const EF=_m?_m[1]:'third-party/chronicle',TP=`${EF}/assets/templates`;

// ── Navbar ──
let doNav=null;
async function initNav(){try{const m=await import('/script.js');if(m.doNavbarIconClick)doNav=m.doNavbarIconClick;}catch(_){}}
function legacyDraw(){const ic=$('#chronicle_drawer_icon'),co=$('#chronicle_drawer_content');if(ic.hasClass('closedIcon')){$('.openDrawer').not('#chronicle_drawer_content').not('.pinnedOpen').addClass('resizing').each((_,el)=>{slideToggle(el,{...getSlideToggleOptions(),onAnimationEnd:e=>e.closest('.drawer-content')?.classList.remove('resizing')});});$('.openIcon').not('#chronicle_drawer_icon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');$('.openDrawer').not('#chronicle_drawer_content').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');ic.toggleClass('closedIcon openIcon');co.toggleClass('closedDrawer openDrawer');co.addClass('resizing').each((_,el)=>{slideToggle(el,{...getSlideToggleOptions(),onAnimationEnd:e=>e.closest('.drawer-content')?.classList.remove('resizing')});});}else{ic.toggleClass('openIcon closedIcon');co.toggleClass('openDrawer closedDrawer');co.addClass('resizing').each((_,el)=>{slideToggle(el,{...getSlideToggleOptions(),onAnimationEnd:e=>e.closest('.drawer-content')?.classList.remove('resizing')});});}}
async function initDrawer(){const t=$('#chronicle_drawer .drawer-toggle');if(typeof doNav==='function')t.on('click',doNav);else{$('#chronicle_drawer_content').attr('data-slide-toggle','hidden').css('display','none');t.on('click',legacyDraw);}}

// ── Settings ──
const DF={enabled:1,autoParse:1,injectContext:1,sendSims:1,sendHealth:1,sendCycle:0,sendWallet:1,sendDiary:1,userBday:'',botBday:'',customPrompt:''};
let S={};
function loadS(){S=extension_settings[EN]?{...DF,...extension_settings[EN]}:{...DF};extension_settings[EN]=S;}
function saveS(){extension_settings[EN]=S;saveSettingsDebounced();}
function syncUI(){$('#s-sims').prop('checked',S.sendSims);$('#s-health').prop('checked',S.sendHealth);$('#s-cycle').prop('checked',S.sendCycle);$('#s-wallet').prop('checked',S.sendWallet);$('#s-diary').prop('checked',S.sendDiary);$('#s-ubday').val(S.userBday||'');$('#s-bbday').val(S.botBday||'');$('#s-prompt').val(S.customPrompt||'');}
function initSE(){const b=(s,k)=>$(document).on('change',s,function(){S[k]=$(this).prop('checked');saveS();});b('#s-sims','sendSims');b('#s-health','sendHealth');b('#s-cycle','sendCycle');b('#s-wallet','sendWallet');b('#s-diary','sendDiary');$(document).on('change','#s-ubday',function(){S.userBday=$(this).val().trim();saveS();});$(document).on('change','#s-bbday',function(){S.botBday=$(this).val().trim();saveS();});$(document).on('change','#s-prompt',function(){S.customPrompt=$(this).val();saveS();});$(document).on('click','#s-reset',()=>{S.customPrompt='';$('#s-prompt').val('');saveS();});}

// ── Regex ──
const RX=[{i:'chr_world',p:'<world>[\\s\\S]*?</world>'},{i:'chr_event',p:'<event>[\\s\\S]*?</event>'},{i:'chr_sims',p:'<sims>[\\s\\S]*?</sims>'},{i:'chr_health',p:'<health>[\\s\\S]*?</health>'},{i:'chr_cycle',p:'<cycle>[\\s\\S]*?</cycle>'},{i:'chr_diary',p:'<diary>[\\s\\S]*?</diary>'},{i:'chr_wallet',p:'<wallet>[\\s\\S]*?</wallet>'},{i:'chr_npc',p:'<npc>[\\s\\S]*?</npc>'},{i:'chr_agenda',p:'<agenda-?>[\\s\\S]*?</agenda-?>'},{i:'chr_thoughts',p:'<thoughts>[\\s\\S]*?</thoughts>'},{i:'chr_location',p:'<location>[\\s\\S]*?</location>'},{i:'chr_affect',p:'<affection>[\\s\\S]*?</affection>'}];
function ensureRx(){try{const s=getContext()?.extensionSettings?.regex;if(!s||!Array.isArray(s))return;const ex=new Set(s.map(r=>r.id));for(const t of RX){if(ex.has(t.i))continue;s.push({id:t.i,scriptName:`Chronicle — ${t.i}`,findRegex:`/${t.p}/gim`,replaceString:'',trimStrings:[],placement:[2],disabled:false,markdownOnly:true,promptOnly:true,runOnEdit:true,substituteRegex:0,minDepth:null,maxDepth:null});}}catch(_){}}

// ══ SYSTEM PROMPT ══
const SYS=`[Chronicle — World Memory]
At END of EVERY reply, append ALL mandatory tags. They're invisible.

MANDATORY every turn:
<world>
time:exact date+time (2025/06/15 12:05)
location:Place·Room
weather:short
atmosphere:short
characters:all present
costume:Name=outfit
costume:Name2=outfit
</world>
IMPORTANT: Write ONE separate "costume:" line per character. Do NOT merge multiple characters into one line.
<event>level|summary 20-50 words</event>
Levels: обычное/важное/ключевое
<sims>
CharName.hunger:0-100|reason
CharName.hygiene:0-100
CharName.sleep:0-100
CharName.arousal:0-100
</sims>
Write sims ONLY for {{char}} and {{user}}. Use real names. Not for NPCs.
<thoughts>
CharName|emotion|Inner monologue 2-3 sentences. Physical sensations, desires, fears.
</thoughts>
Write thoughts ONLY for {{char}} and NPCs. Do NOT write thoughts for {{user}}.
<location>Place·Room|chars=Name1,Name2|связь=Place·Room2,Place·Room3</location>
List ALL rooms/areas that exist in the current setting. Include every room even if no one is there (omit chars= then).
Example:
<location>Дом·Гостиная|chars=Даниил,Татьяна|связь=Дом·Кухня,Дом·Коридор</location>
<location>Дом·Кухня|связь=Дом·Гостиная</location>
<location>Дом·Спальня|связь=Дом·Коридор</location>

OPTIONAL (only on change):
<health>
CharName.hp:0-100
CharName.intoxication:0-100|substance
CharName.injury:desc|severity(лёгкий/средний/тяжёлый)
CharName.habit:name|details
</health>
Track health for {{char}} AND {{user}}.
<cycle>
day:N
phase:name
fertile:yes/no
mood:description
physical:symptoms
libido:low/normal/high
</cycle>
<diary>
CharName|DETAILED diary entry. Write 4-5 full sentences minimum. Include: emotional state, specific thoughts about recent events, desires and fears, plans or intentions, physical sensations. Write diary for {{char}} and important NPCs. Do NOT write diary for {{user}}. Each entry should feel like reading someone's real private diary — raw, honest, detailed.
</diary>
<wallet>
CharName.balance:amount₽
CharName.spend:category|amount₽|what
CharName.income:amount₽|source
</wallet>
<npc>Name|внешность=desc|характер=traits|отношение=relation|пол:m/f|возраст:N|birthday:YYYY/M/D</npc>
<affection>Name=+/-N|reason</affection>
<agenda>YYYY/M/D|task</agenda>
<agenda->completed task</agenda->`;

// ══ PARSING ══
function hasCD(m){return m?/<(?:world|event|sims|health|cycle|diary|wallet|npc|agenda|thoughts|location|affection)>/i.test(m):false;}
function pl(c){return c.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));}
function kv(l){const i=l.indexOf(':');return i>0?{k:l.substring(0,i).trim().toLowerCase(),v:l.substring(i+1).trim()}:null;}
function sf(r){const d=r.indexOf('.');return d>0?{c:r.substring(0,d).trim(),f:r.substring(d+1).trim().toLowerCase()}:{c:'_default',f:r.toLowerCase()};}

function parse(msg){
    if(!msg)return null;
    const R={world:null,events:[],sims:{},health:{},cycle:null,diary:[],wallet:{},npcs:{},agenda:[],agendaDel:[],affection:{},thoughts:[],locations:[]};
    let has=false,m;
    // world
    const wR=/<world>([\s\S]*?)<\/world>/gi;while((m=wR.exec(msg))){const w={time:'',location:'',weather:'',atmosphere:'',characters:[],costumes:{}};for(const l of pl(m[1])){const p=kv(l);if(!p)continue;if(p.k==='time')w.time=p.v;else if(p.k==='location')w.location=p.v;else if(p.k==='weather')w.weather=p.v;else if(p.k==='atmosphere')w.atmosphere=p.v;else if(p.k==='characters')w.characters=p.v.split(/[,，]/).map(c=>c.trim()).filter(Boolean);else if(p.k==='costume'){// handle "Name=outfit" but also multiple chars separated by ";"
            const parts=p.v.split(/;(?=\s*[^;]+?=)/);for(const part of parts){const eq=part.indexOf('=');if(eq>0)w.costumes[part.substring(0,eq).trim()]=part.substring(eq+1).trim();}}}R.world=w;has=true;}
    // event
    const eR=/<event>([\s\S]*?)<\/event>/gi;while((m=eR.exec(msg))){for(const l of pl(m[1])){const pp=l.indexOf('|');R.events.push(pp>0?{level:l.substring(0,pp).trim(),summary:l.substring(pp+1).trim()}:{level:'обычное',summary:l});}has=true;}
    // thoughts
    const tR=/<thoughts>([\s\S]*?)<\/thoughts>/gi;while((m=tR.exec(msg))){for(const l of pl(m[1])){const pts=l.split('|');if(pts.length>=3)R.thoughts.push({name:pts[0].trim(),emo:pts[1].trim(),text:pts.slice(2).join('|').trim()});else if(pts.length===2)R.thoughts.push({name:pts[0].trim(),emo:'',text:pts[1].trim()});}has=true;}
    // sims
    const sR=/<sims>([\s\S]*?)<\/sims>/gi;while((m=sR.exec(msg))){for(const l of pl(m[1])){const p=kv(l);if(!p)continue;const{c,f}=sf(p.k);if(!['hunger','hygiene','sleep','arousal'].includes(f))continue;const pp=p.v.indexOf('|');const vs=pp>0?p.v.substring(0,pp).trim():p.v;const reason=pp>0?p.v.substring(pp+1).trim():'';const n=parseFloat(vs);if(!isNaN(n)){if(!R.sims[c])R.sims[c]={};R.sims[c][f]={value:Math.max(0,Math.min(100,Math.round(n))),reason};}}has=true;}
    // health
    const hR=/<health>([\s\S]*?)<\/health>/gi;while((m=hR.exec(msg))){for(const l of pl(m[1])){const p=kv(l);if(!p)continue;const{c,f}=sf(p.k);if(!R.health[c])R.health[c]={hp:null,intox:null,injuries:[],habits:[]};const h=R.health[c];if(f==='hp'){const n=parseFloat(p.v);if(!isNaN(n))h.hp=Math.max(0,Math.min(100,Math.round(n)));}else if(f==='intoxication'){const pp=p.v.indexOf('|');const vs=pp>0?p.v.substring(0,pp).trim():p.v;const n=parseFloat(vs);if(!isNaN(n))h.intox={v:Math.max(0,Math.min(100,Math.round(n))),r:pp>0?p.v.substring(pp+1).trim():''};}else if(f==='injury'){const pts=p.v.split('|').map(x=>x.trim());if(pts[0])h.injuries.push({n:pts[0],s:pts[1]||'лёгкий'});}else if(f==='habit'){const pts=p.v.split('|').map(x=>x.trim());if(pts[0])h.habits.push({n:pts[0],d:pts[1]||''});}}has=true;}
    // cycle
    const cR=/<cycle>([\s\S]*?)<\/cycle>/gi;while((m=cR.exec(msg))){const c={day:null,phase:'',symptoms:'',fertile:'',mood:'',physical:'',libido:''};for(const l of pl(m[1])){const p=kv(l);if(!p)continue;if(p.k==='day'){const n=parseInt(p.v);if(!isNaN(n))c.day=n;}else c[p.k]=p.v;}R.cycle=c;has=true;}
    // diary
    const dR=/<diary>([\s\S]*?)<\/diary>/gi;while((m=dR.exec(msg))){for(const l of pl(m[1])){const pp=l.indexOf('|');if(pp>0)R.diary.push({who:l.substring(0,pp).trim(),text:l.substring(pp+1).trim()});}has=true;}
    // wallet
    const wlR=/<wallet>([\s\S]*?)<\/wallet>/gi;while((m=wlR.exec(msg))){for(const l of pl(m[1])){const p=kv(l);if(!p)continue;const{c,f}=sf(p.k);if(!R.wallet[c])R.wallet[c]={bal:null,txs:[]};const w=R.wallet[c];if(f==='balance'){const mt=p.v.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(.*)/);if(mt)w.bal={a:parseFloat(mt[1].replace(',','.')),c:mt[2]||'₽'};}else if(f==='spend'){const pts=p.v.split('|').map(x=>x.trim());if(pts.length>=2){const mt=pts[1].match(/^(\d+(?:\.\d+)?)\s*(.*)/);if(mt)w.txs.push({t:'spend',cat:pts[0],a:parseFloat(mt[1]),cur:mt[2]||'₽',note:pts[2]||''});}}else if(f==='income'){const pts=p.v.split('|').map(x=>x.trim());const mt=pts[0].match(/^(\d+(?:\.\d+)?)\s*(.*)/);if(mt)w.txs.push({t:'income',cat:'доход',a:parseFloat(mt[1]),cur:mt[2]||'₽',note:pts[1]||''});}}has=true;}
    // npc
    const nR=/<npc>([\s\S]*?)<\/npc>/gi;while((m=nR.exec(msg))){for(const l of pl(m[1])){const pts=l.split('|').map(x=>x.trim());if(pts.length<2)continue;const name=pts[0],info={};for(let i=1;i<pts.length;i++){const eq=pts[i].indexOf('='),col=pts[i].indexOf(':');let k,v;if(eq>0&&(col<0||eq<col)){k=pts[i].substring(0,eq).trim().toLowerCase();v=pts[i].substring(eq+1).trim();}else if(col>0){k=pts[i].substring(0,col).trim().toLowerCase();v=pts[i].substring(col+1).trim();}else continue;if(k==='внешность'||k==='appearance')info.app=v;else if(k==='характер'||k==='personality')info.pers=v;else if(k==='отношение'||k==='relation')info.rel=v;else if(k==='пол'||k==='gender')info.gen=v;else if(k==='возраст'||k==='age'){const n=parseInt(v);if(!isNaN(n))info.age=n;}else if(k==='день_рождения'||k==='birthday'||k==='др')info.bd=v;}R.npcs[name]=info;has=true;}}
    // affection
    const aR=/<affection>([\s\S]*?)<\/affection>/gi;while((m=aR.exec(msg))){for(const l of pl(m[1])){const eq=l.indexOf('=');if(eq<=0)continue;const name=l.substring(0,eq).trim(),rest=l.substring(eq+1).trim();const pp=rest.indexOf('|');const vs=pp>0?rest.substring(0,pp).trim():rest;const reason=pp>0?rest.substring(pp+1).trim():'';const n=parseFloat(vs);if(!isNaN(n))R.affection[name]={t:vs.startsWith('+')||vs.startsWith('-')?'r':'a',v:n,r:reason};}has=true;}
    // location
    const lR=/<location>([\s\S]*?)<\/location>/gi;while((m=lR.exec(msg))){for(const l of pl(m[1])){const pts=l.split('|').map(x=>x.trim());if(!pts[0])continue;const loc={name:pts[0],desc:'',conn:[],chars:[]};for(let i=1;i<pts.length;i++){const eq=pts[i].indexOf('=');if(eq<=0)continue;const k=pts[i].substring(0,eq).trim().toLowerCase(),v=pts[i].substring(eq+1).trim();if(k==='описание'||k==='desc')loc.desc=v;else if(k==='связь'||k==='связи'||k==='connection')loc.conn=v.split(/[,，]/).map(x=>x.trim()).filter(Boolean);else if(k==='chars'||k==='персонажи')loc.chars=v.split(/[,，]/).map(x=>x.trim()).filter(Boolean);}R.locations.push(loc);}has=true;}
    // agenda
    const agR=/<agenda>([\s\S]*?)<\/agenda>/gi;while((m=agR.exec(msg))){for(const l of pl(m[1])){const pp=l.indexOf('|');R.agenda.push(pp>0?{d:l.substring(0,pp).trim(),t:l.substring(pp+1).trim()}:{d:'',t:l});}has=true;}
    const agdR=/<agenda->([\s\S]*?)<\/agenda->/gi;while((m=agdR.exec(msg))){for(const l of pl(m[1]))if(l)R.agendaDel.push(l);has=true;}
    return has?R:null;
}

// ══ STATE ══
function mkS(){return{time:'',loc:'',weather:'',atmo:'',chars:[],cos:{},events:[],sims:{},health:{},cycle:{day:null,phase:'',symptoms:'',fertile:'',mood:'',physical:'',libido:''},diary:[],wallets:{},npcs:{},aff:{},agenda:[],thoughts:[],mapN:{},mapE:[]};}
let LS=mkS(),cY=2025,cM=6;
function agg(){
    const chat=getContext()?.chat||[],s=mkS(),un=(getContext()?.name1||'').toLowerCase(),bn=(getContext()?.name2||'').toLowerCase();
    for(let i=0;i<chat.length;i++){const M=chat[i].chronicle_meta;if(!M)continue;
        if(M.world){if(M.world.time)s.time=M.world.time;if(M.world.location)s.loc=M.world.location;if(M.world.weather)s.weather=M.world.weather;if(M.world.atmosphere)s.atmo=M.world.atmosphere;if(M.world.characters?.length)s.chars=[...M.world.characters];if(M.world.costumes)Object.assign(s.cos,M.world.costumes);}
        if(M.events?.length)for(const ev of M.events)s.events.push({...ev,time:M.world?.time||'',mi:i});
        if(M.thoughts?.length)s.thoughts=M.thoughts.filter(t=>t.name.toLowerCase()!==un&&t.name.toLowerCase()!=='{{user}}');
        // sims — only bot+user
        if(M.sims)for(const[cn,stats]of Object.entries(M.sims)){const cnl=cn.toLowerCase();if(cnl!=='_default'&&cnl!==un&&cnl!==bn){const isChar=s.chars.some(c=>c.toLowerCase()===cnl);if(!isChar||(cnl!==un&&cnl!==bn))continue;}if(!s.sims[cn])s.sims[cn]={hunger:70,hygiene:70,sleep:70,arousal:15};for(const[k,v]of Object.entries(stats))s.sims[cn][k]=v.value;}
        if(M.health)for(const[cn,h]of Object.entries(M.health)){if(!s.health[cn])s.health[cn]={hp:100,intox:{v:0,r:''},injuries:[],habits:[]};const sh=s.health[cn];if(h.hp!==null)sh.hp=h.hp;if(h.intox)sh.intox=h.intox;for(const inj of h.injuries){const ex=sh.injuries.find(x=>x.n.toLowerCase()===inj.n.toLowerCase());if(ex)ex.s=inj.s;else sh.injuries.push({...inj});}for(const hab of h.habits){const ex=sh.habits.find(x=>x.n.toLowerCase()===hab.n.toLowerCase());if(ex)ex.d=hab.d;else sh.habits.push({...hab});}}
        if(M.cycle){if(M.cycle.day!==null)s.cycle.day=M.cycle.day;for(const k of['phase','symptoms','fertile','mood','physical','libido'])if(M.cycle[k])s.cycle[k]=M.cycle[k];}
        if(M.diary?.length)for(const d of M.diary){const dl=d.who.toLowerCase();if(dl!==un&&dl!=='{{user}}')s.diary.push({...d,time:M.world?.time||'',mi:i});}
        if(M.wallet)for(const[cn,w]of Object.entries(M.wallet)){if(!s.wallets[cn])s.wallets[cn]={bal:0,cur:'₽',txs:[]};if(w.bal)s.wallets[cn].bal=w.bal.a;for(const tx of(w.txs||[]))s.wallets[cn].txs.push({...tx,date:M.world?.time||''});}
        if(M.npcs)for(const[n,info]of Object.entries(M.npcs)){if(!s.npcs[n])s.npcs[n]={};for(const[k,v]of Object.entries(info))if(v!==undefined&&v!=='')s.npcs[n][k]=v;}
        if(M.affection)for(const[n,d]of Object.entries(M.affection)){if(!s.aff[n])s.aff[n]={v:0,r:''};if(d.t==='a')s.aff[n].v=d.v;else s.aff[n].v+=d.v;if(d.r)s.aff[n].r=d.r;}
        if(M.agendaDel?.length)for(const del of M.agendaDel)s.agenda=s.agenda.filter(a=>!a.t.toLowerCase().includes(del.toLowerCase()));
        if(M.agenda?.length)for(const a of M.agenda)if(!s.agenda.some(x=>x.t===a.t))s.agenda.push({...a,done:false});
        if(M.locations?.length)for(const loc of M.locations){const id=loc.name.toLowerCase().replace(/[·\s>/\\]/g,'_').replace(/[^a-zа-яё0-9_]/gi,'');if(!s.mapN[id])s.mapN[id]={name:loc.name,desc:loc.desc,chars:[],x:40+Object.keys(s.mapN).length%4*120,y:30+Math.floor(Object.keys(s.mapN).length/4)*70};else if(loc.desc)s.mapN[id].desc=loc.desc;if(loc.chars?.length)s.mapN[id].chars=[...loc.chars];for(const cn of loc.conn){const cid=cn.toLowerCase().replace(/[·\s>/\\]/g,'_').replace(/[^a-zа-яё0-9_]/gi,'');if(!s.mapN[cid])s.mapN[cid]={name:cn,desc:'',chars:[],x:s.mapN[id].x+130,y:s.mapN[id].y+40};if(!s.mapE.some(e=>(e.a===id&&e.b===cid)||(e.a===cid&&e.b===id)))s.mapE.push({a:id,b:cid});}}
    }
    if(s.time){const mt=s.time.match(/(\d{4})\D+(\d{1,2})/);if(mt){cY=+mt[1];cM=+mt[2];}}
    return s;
}

// ══ PROMPT INJECTION ══
function buildCtx(s){
    const L=[];
    if(s.time)L.push(`[Время:${s.time}|Место:${s.loc}|Погода:${s.weather}]`);
    for(const[cn,st]of Object.entries(s.sims)){const n=cn==='_default'?(getContext()?.name2||'Bot'):cn;L.push(`[${n}: голод=${st.hunger},гигиена=${st.hygiene},сон=${st.sleep},возб=${st.arousal}]`);}
    for(const[cn,h]of Object.entries(s.health)){const n=cn==='_default'?(getContext()?.name2||'Bot'):cn;const p=[];if(h.hp<100)p.push(`HP:${h.hp}`);if(h.intox?.v>0)p.push(`Алко:${h.intox.v}`);for(const i of h.injuries)p.push(`Травма:${i.n}`);if(p.length)L.push(`[${n}: ${p.join(',')}]`);}
    const bd=[];if(S.userBday)bd.push(`${getContext()?.name1}:${S.userBday}`);if(S.botBday)bd.push(`${getContext()?.name2}:${S.botBday}`);for(const[n,npc]of Object.entries(s.npcs))if(npc.bd)bd.push(`${n}:${npc.bd}`);if(bd.length)L.push(`[ДР:${bd.join(';')}]`);
    const up=s.agenda.filter(a=>!a.done).slice(0,5);if(up.length)L.push(`[Планы:${up.map(a=>(a.d?a.d+' ':'')+ a.t).join(';')}]`);
    return L.join('\n');
}
function onPrompt(ed){if(!S.enabled||!S.injectContext)return;const s=agg();const sys=S.customPrompt||SYS;const ctx=buildCtx(s);if(ed?.chat){ed.chat.unshift({role:'system',content:sys});if(ctx){let idx=ed.chat.length-1;for(let i=ed.chat.length-1;i>=0;i--)if(ed.chat[i].role==='user'){idx=i;break;}ed.chat.splice(idx,0,{role:'system',content:ctx});}}}

// ══ EVENTS ══
function onMsg(idx){if(!S.enabled)return;const chat=getContext()?.chat;if(!chat||idx<0||idx>=chat.length)return;if(!hasCD(chat[idx].mes))return;const p=parse(chat[idx].mes);if(p){chat[idx].chronicle_meta=p;}LS=agg();refreshAll();getContext().saveChat?.();}
function onChat(){if(!S.enabled)return;const chat=getContext()?.chat||[];for(let i=0;i<chat.length;i++)if(!chat[i].chronicle_meta&&chat[i].mes&&hasCD(chat[i].mes)){const p=parse(chat[i].mes);if(p)chat[i].chronicle_meta=p;}LS=agg();refreshAll();}

// ══ UI ══
const SC={hunger:{n:'Голод',i:'fa-solid fa-utensils',bg:'var(--chr-peach-bg)',bd:'var(--chr-peach-border)',c:'var(--chr-peach)'},hygiene:{n:'Гигиена',i:'fa-solid fa-shower',bg:'var(--chr-blue-bg)',bd:'var(--chr-blue-border)',c:'var(--chr-blue)'},sleep:{n:'Сон',i:'fa-solid fa-moon',bg:'var(--chr-lilac-bg)',bd:'var(--chr-lilac-border)',c:'var(--chr-lilac)'},arousal:{n:'Возбуждение',i:'fa-solid fa-fire',bg:'var(--chr-rose-bg)',bd:'var(--chr-rose-border)',c:'var(--chr-rose)'}};
const MO=['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function rn(cn){return cn==='_default'?(getContext()?.name2||'Персонаж'):cn;}

function refreshAll(){rStatus();rSims();rHealth();rTl();rChars();rItems();rCal();rMap();}

function rStatus(){
    $('#chr-date').text(LS.time||'--/--');$('#chr-weather').text(LS.weather||'');$('#chr-loc').text(LS.loc||'—');$('#chr-atmo').text(LS.atmo||'');
    const $t=$('#chr-thoughts').empty();
    if(LS.thoughts.length)for(const th of LS.thoughts)$t.append(`<div class="chr-thought chr-card"><div class="chr-thought__name">${esc(th.name)}</div>${th.emo?`<div class="chr-thought__emo">${esc(th.emo)}</div>`:''}<div class="chr-thought__text">${esc(th.text)}</div></div>`);
    else $t.append('<div class="chr-empty"><i class="fa-solid fa-brain"></i>AI ещё не описал мысли</div>');
    const $c=$('#chr-costumes').empty();const ce=Object.entries(LS.cos);
    if(ce.length)for(const[c,d]of ce)$c.append(`<div style="margin-bottom:3px;"><span style="color:var(--chr-peach);font-weight:600;font-size:11px;">${esc(c)}:</span> <span style="font-size:11px;color:var(--chr-text-m);">${esc(d)}</span></div>`);
    else $c.append('<div class="chr-empty">Нет</div>');
}

function rSims(){
    const $c=$('#chr-sims').empty();const names=Object.keys(LS.sims);
    if(!names.length){$c.append('<div class="chr-empty"><i class="fa-solid fa-heart-pulse"></i>Нет данных</div>');return;}
    for(const cn of names){const stats=LS.sims[cn];
        let cards='';for(const[key,cfg]of Object.entries(SC)){const val=stats[key]??70;cards+=`<div class="chr-sim-card" style="background:${cfg.bg};border:1px solid ${cfg.bd};"><div class="chr-sim-card__icon" style="color:${cfg.c};"><i class="${cfg.i}"></i></div><div class="chr-sim-card__value" style="color:${cfg.c};">${val}</div><div class="chr-sim-card__label">${cfg.n}</div><div class="chr-sim-card__bar" style="width:${val}%;background:${cfg.c};"></div></div>`;}
        $c.append(`<div style="margin-bottom:10px;"><div style="font-family:var(--chr-ff);font-size:12px;font-weight:600;color:var(--chr-text-m);margin-bottom:6px;padding:0 4px;"><i class="fa-solid fa-user" style="margin-right:4px;"></i>${esc(rn(cn))}</div><div class="chr-sims-grid">${cards}</div></div>`);
    }
}

function rHealth(){
    const $c=$('#chr-health').empty();const names=Object.keys(LS.health);
    if(!names.length){$c.append('<div class="chr-empty"><i class="fa-solid fa-kit-medical"></i>Нет данных</div>');return;}
    for(const cn of names){const h=LS.health[cn];let html=`<div style="font-family:var(--chr-ff);font-size:12px;font-weight:600;color:var(--chr-text-m);margin-bottom:6px;"><i class="fa-solid fa-user"></i> ${esc(rn(cn))}</div>`;
        html+=`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;"><span class="chr-tag" style="background:${h.hp<50?'var(--chr-rose-bg)':'var(--chr-mint-bg)'};color:${h.hp<50?'var(--chr-rose)':'var(--chr-mint)'};" title="HP"><i class="fa-solid fa-heart"></i> ${h.hp}</span>`;
        if(h.intox?.v>0)html+=`<span class="chr-tag" style="background:var(--chr-peach-bg);color:var(--chr-peach);" title="Опьянение"><i class="fa-solid fa-wine-glass"></i> ${h.intox.v}%${h.intox.r?' — '+esc(h.intox.r):''}</span>`;
        html+=`</div>`;
        for(const inj of h.injuries)html+=`<div class="chr-inj"><i class="fa-solid fa-bandage" style="width:14px;text-align:center;"></i> ${esc(inj.n)} <span class="chr-tag">${esc(inj.s)}</span></div>`;
        for(const hab of h.habits)html+=`<div class="chr-hab"><i class="fa-solid fa-smoking" style="width:14px;text-align:center;"></i> ${esc(hab.n)} <span style="color:var(--chr-text-d);">${esc(hab.d)}</span></div>`;
        $c.append(`<div class="chr-card" style="padding:10px 12px;margin-bottom:6px;">${html}</div>`);
    }
    const cy=LS.cycle;if(cy.day!==null){$('#chr-cycle').show();const $cc=$('#chr-cycle-c').empty();let html=`<div style="display:flex;gap:10px;align-items:flex-start;"><span style="font-size:24px;font-weight:700;color:var(--chr-rose);font-family:var(--chr-ff);">День${cy.day}</span><div style="flex:1;">`;
        if(cy.phase)html+=`<div style="font-size:12px;font-weight:600;color:var(--chr-text);">${esc(cy.phase)}</div>`;
        const tags=[];if(cy.fertile)tags.push(`<span class="chr-tag" style="background:${cy.fertile.match(/yes|да/i)?'var(--chr-rose-bg)':'var(--chr-mint-bg)'};color:${cy.fertile.match(/yes|да/i)?'var(--chr-rose)':'var(--chr-mint)'};" title="Фертильность"><i class="fa-solid fa-leaf"></i> ${esc(cy.fertile)}</span>`);if(cy.libido)tags.push(`<span class="chr-tag" style="background:var(--chr-rose-bg);color:var(--chr-rose);" title="Либидо"><i class="fa-solid fa-fire"></i> ${esc(cy.libido)}</span>`);
        if(tags.length)html+=`<div style="display:flex;gap:3px;margin-top:3px;">${tags.join('')}</div>`;
        if(cy.mood)html+=`<div style="font-size:11px;color:var(--chr-text-m);margin-top:3px;"><i class="fa-solid fa-comment" style="width:14px;text-align:center;"></i> ${esc(cy.mood)}</div>`;
        if(cy.physical)html+=`<div style="font-size:11px;color:var(--chr-text-m);margin-top:2px;"><i class="fa-solid fa-stethoscope" style="width:14px;text-align:center;"></i> ${esc(cy.physical)}</div>`;
        html+=`</div></div>`;$cc.append(html);
    }else $('#chr-cycle').hide();
}

function rTl(){const $t=$('#chr-tl').empty();if(LS.events.length)for(const ev of LS.events.slice(-50).reverse())$t.append(`<div class="chr-tl chr-card" data-level="${esc(ev.level)}"><div class="chr-tl__time">${esc(ev.time)}</div><div class="chr-tl__text">${esc(ev.summary)}</div></div>`);else $t.append('<div class="chr-empty"><i class="fa-solid fa-timeline"></i>Событий нет</div>');}

function rChars(){
    const $d=$('#chr-diary').empty();if(LS.diary.length)for(const d of LS.diary.slice(-20).reverse())$d.append(`<div class="chr-diary chr-card"><div class="chr-diary__who"><i class="fa-solid fa-feather"></i>${esc(d.who)}</div><div class="chr-diary__text">${esc(d.text)}</div><div class="chr-diary__when">${esc(d.time)}</div></div>`);else $d.append('<div class="chr-empty"><i class="fa-solid fa-book"></i>Записей нет</div>');
    const $n=$('#chr-npcs').empty();const ctx=getContext();
    if(S.userBday)$n.append(`<div class="chr-card" style="padding:8px 10px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-cake-candles" style="font-size:14px;color:var(--chr-rose);"></i><span style="font-size:12px;color:var(--chr-text);font-weight:600;">${esc(ctx?.name1||'User')}</span><span class="chr-tag">${esc(S.userBday)}</span></div>`);
    if(S.botBday)$n.append(`<div class="chr-card" style="padding:8px 10px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-cake-candles" style="font-size:14px;color:var(--chr-rose);"></i><span style="font-size:12px;color:var(--chr-text);font-weight:600;">${esc(ctx?.name2||'Bot')}</span><span class="chr-tag">${esc(S.botBday)}</span></div>`);
    for(const name of Object.keys(LS.npcs)){const npc=LS.npcs[name];const af=LS.aff[name];const pr=LS.chars.includes(name);let tags='';if(npc.gen)tags+=`<span class="chr-tag">${esc(npc.gen)}</span>`;if(npc.age)tags+=`<span class="chr-tag">${npc.age}</span>`;if(npc.rel)tags+=`<span class="chr-tag" style="background:var(--chr-blue-bg);color:var(--chr-blue);">${esc(npc.rel)}</span>`;if(af){const cl=af.v>=0?'mint':'rose';tags+=`<span class="chr-tag" style="background:var(--chr-${cl}-bg);color:var(--chr-${cl});"><i class="fa-solid fa-heart" style="font-size:9px;"></i> ${af.v>0?'+':''}${af.v}</span>`;}if(pr)tags+=`<span class="chr-tag" style="background:var(--chr-peach-bg);color:var(--chr-peach);">в сцене</span>`;
        const colors=['var(--chr-lilac-bg)','var(--chr-blue-bg)','var(--chr-peach-bg)','var(--chr-rose-bg)','var(--chr-mint-bg)'];const ci=name.length%colors.length;
        $n.append(`<div class="chr-npc chr-card">${npc.bd?`<div class="chr-npc__bd"><i class="fa-solid fa-cake-candles"></i> ${esc(npc.bd)}</div>`:''}<div class="chr-npc__av" style="background:${colors[ci]};color:var(--chr-text);">${name.charAt(0).toUpperCase()}</div><div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;color:var(--chr-text);">${esc(name)}</div>${npc.app?`<div style="font-size:10px;color:var(--chr-text-d);">${esc(npc.app)}</div>`:''}<div class="chr-npc__tags" style="margin-top:3px;">${tags}</div></div></div>`);}
}

function rItems(){
    const $w=$('#chr-wallets').empty();const wn=Object.keys(LS.wallets);
    if(wn.length)for(const cn of wn){const w=LS.wallets[cn];let tx='';for(const t of w.txs.slice(-5).reverse()){const sp=t.t==='spend';tx+=`<div class="chr-tx"><div class="chr-tx__icon" style="background:${sp?'var(--chr-rose-bg)':'var(--chr-mint-bg)'};color:${sp?'var(--chr-rose)':'var(--chr-mint)'};">${sp?'↓':'↑'}</div><div class="chr-tx__info"><div class="chr-tx__cat">${esc(t.cat)}</div><div class="chr-tx__note">${esc(t.note)}</div></div><div class="chr-tx__amt" style="color:${sp?'var(--chr-rose)':'var(--chr-mint)'};">${sp?'-':'+'}${t.a}${t.cur||'₽'}</div></div>`;}
        $w.append(`<div class="chr-card" style="padding:10px 12px;margin-bottom:6px;"><div style="text-align:center;margin-bottom:6px;"><div style="font-size:10px;color:var(--chr-text-d);">${esc(rn(cn))}</div><div style="font-family:var(--chr-ff);font-size:22px;font-weight:700;color:var(--chr-text);">${w.bal.toLocaleString('ru-RU')}<span style="font-size:12px;color:var(--chr-text-d);">${w.cur}</span></div></div>${tx}</div>`);}
    else $w.append('<div class="chr-empty"><i class="fa-solid fa-wallet"></i>Нет</div>');
}

function rCal(){
    $('#chr-cal-mo').text(`${MO[cM]||''} ${cY}`);const $g=$('#chr-cal-g').empty();
    const first=new Date(cY,cM-1,1),days=new Date(cY,cM,0).getDate();let sw=first.getDay()-1;if(sw<0)sw=6;
    const evD=new Set(),bdD=new Set(),agD=new Set();
    for(const ev of LS.events){const d=ev.time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(d&&+d[1]===cY&&+d[2]===cM)evD.add(+d[3]);}
    const bds=[...Object.values(LS.npcs).map(n=>n.bd).filter(Boolean)];if(S.userBday)bds.push(S.userBday);if(S.botBday)bds.push(S.botBday);
    for(const bd of bds){const d=bd.match(/(?:\d{4}\D+)?(\d{1,2})\D+(\d{1,2})$/);if(d&&+d[1]===cM)bdD.add(+d[2]);}
    for(const a of LS.agenda){const d=a.d?.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(d&&+d[1]===cY&&+d[2]===cM)agD.add(+d[3]);}
    let sd=0;const sm=LS.time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(sm&&+sm[1]===cY&&+sm[2]===cM)sd=+sm[3];
    for(let i=0;i<sw;i++)$g.append('<div class="chr-cal-d dim"></div>');
    for(let d=1;d<=days;d++){let cls='chr-cal-d';if(d===sd)cls+=' today';let dots='';if(evD.has(d))dots+='<span style="width:3px;height:3px;border-radius:50%;background:var(--chr-peach);display:inline-block;"></span>';if(bdD.has(d))dots+='<span style="width:3px;height:3px;border-radius:50%;background:var(--chr-rose);display:inline-block;"></span>';if(agD.has(d))dots+='<span style="width:3px;height:3px;border-radius:50%;background:var(--chr-blue);display:inline-block;"></span>';$g.append(`<div class="${cls}">${d}<div style="display:flex;gap:2px;justify-content:center;">${dots}</div></div>`);}
    const $a=$('#chr-agenda').empty();if(LS.agenda.length)for(const a of LS.agenda)$a.append(`<div class="chr-card" style="padding:7px 10px;margin-bottom:3px;display:flex;align-items:center;gap:6px;font-size:12px;"><span style="color:var(--chr-blue);">✓</span><span style="color:var(--chr-text);flex:1;">${esc(a.t)}</span>${a.d?`<span style="font-size:10px;color:var(--chr-text-d);">${esc(a.d)}</span>`:''}</div>`);else $a.append('<div class="chr-empty"><i class="fa-solid fa-list-check"></i>Нет</div>');
}

function rMap(){
    const svg=$('#chr-map-svg')[0];if(!svg)return;while(svg.firstChild)svg.removeChild(svg.firstChild);
    const nodes=LS.mapN,edges=LS.mapE,ids=Object.keys(nodes);
    if(!ids.length){$('#chr-map-e').show();$('#chr-map-c').hide();return;}$('#chr-map-e').hide();$('#chr-map-c').show();
    const curId=LS.loc.toLowerCase().replace(/[·\s>/\\]/g,'_').replace(/[^a-zа-яё0-9_]/gi,'');
    for(const e of edges){const a=nodes[e.a],b=nodes[e.b];if(!a||!b)continue;const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a.x+60);line.setAttribute('y1',a.y+22);line.setAttribute('x2',b.x+60);line.setAttribute('y2',b.y+22);line.classList.add('chr-map-edge');svg.appendChild(line);}
    for(const[id,node]of Object.entries(nodes)){const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.classList.add('chr-map-node');if(id===curId)g.classList.add('current');g.setAttribute('transform',`translate(${node.x},${node.y})`);
        const chars=node.chars||[];const nodeH=chars.length?54:36;
        const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('width','120');rect.setAttribute('height',String(nodeH));rect.setAttribute('rx','8');g.appendChild(rect);
        const sn=node.name.includes('·')?node.name.split('·').pop():node.name;
        const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x','60');text.setAttribute('y','14');text.setAttribute('font-size','10');text.setAttribute('font-weight','600');text.setAttribute('text-anchor','middle');text.setAttribute('dominant-baseline','central');text.setAttribute('fill','rgba(255,255,255,0.78)');text.setAttribute('font-family','Comfortaa,system-ui,sans-serif');text.setAttribute('pointer-events','none');text.textContent=sn.length>15?sn.substring(0,13)+'…':sn;g.appendChild(text);
        if(chars.length){const cx=chars.map((c,ci)=>{const ax=16+ci*20;const av=document.createElementNS('http://www.w3.org/2000/svg','circle');av.setAttribute('cx',String(ax));av.setAttribute('cy','36');av.setAttribute('r','8');av.setAttribute('fill','rgba(150,185,210,0.15)');av.setAttribute('stroke','rgba(150,185,210,0.3)');av.setAttribute('stroke-width','1');g.appendChild(av);const at=document.createElementNS('http://www.w3.org/2000/svg','text');at.setAttribute('x',String(ax));at.setAttribute('y','36');at.setAttribute('font-size','8');at.setAttribute('font-weight','700');at.setAttribute('text-anchor','middle');at.setAttribute('dominant-baseline','central');at.setAttribute('fill','rgba(200,220,235,0.9)');at.setAttribute('pointer-events','none');at.textContent=c.charAt(0).toUpperCase();g.appendChild(at);return ax;});if(chars.length>0){const lbl=document.createElementNS('http://www.w3.org/2000/svg','text');lbl.setAttribute('x',String(16+chars.length*20+4));lbl.setAttribute('y','36');lbl.setAttribute('font-size','9');lbl.setAttribute('dominant-baseline','central');lbl.setAttribute('fill','rgba(255,255,255,0.35)');lbl.setAttribute('pointer-events','none');lbl.textContent=chars.length===1?chars[0].split(' ')[0]:chars.map(c=>c.split(' ')[0]).join(', ');lbl.setAttribute('font-family','Comfortaa,system-ui,sans-serif');// truncate if needed
        const maxW=110-(16+chars.length*20+4);g.appendChild(lbl);}}
        let drag=false,ox,oy;g.addEventListener('pointerdown',ev=>{drag=true;ox=ev.clientX-node.x;oy=ev.clientY-node.y;g.setPointerCapture(ev.pointerId);});g.addEventListener('pointermove',ev=>{if(!drag)return;node.x=Math.max(0,(ev.clientX-ox));node.y=Math.max(0,(ev.clientY-oy));rMap();});g.addEventListener('pointerup',()=>{drag=false;});svg.appendChild(g);}
    let mx=500,my=300;for(const n of Object.values(nodes)){const nh=(n.chars?.length)?54:36;if(n.x+130>mx)mx=n.x+140;if(n.y+nh+14>my)my=n.y+nh+20;}svg.setAttribute('viewBox',`0 0 ${mx} ${my}`);
}

// ── Tabs/Buttons ──
function initTabs(){$(document).on('click','.chr-tab',function(){const t=$(this).data('tab');if(!t)return;$('.chr-tab').removeClass('active');$(this).addClass('active');$('.chr-tab-content').removeClass('active');$(`#chr-tab-${t}`).addClass('active');});}
function initBtns(){
    $(document).on('click','#chr-btn-refresh',()=>{onChat();if(window.toastr)toastr.success('Обновлено','Chronicle');});
    $(document).on('click','#chr-cal-p',()=>{cM--;if(cM<1){cM=12;cY--;}rCal();});
    $(document).on('click','#chr-cal-n',()=>{cM++;if(cM>12){cM=1;cY++;}rCal();});
    $(document).on('click','#chr-ag-add',()=>{const t=prompt('Задача:');if(!t)return;const d=prompt('Дата (ГГГГ/М/Д):')||'';LS.agenda.push({d,t,done:false});rCal();});
    $(document).on('click','#chr-map-add',()=>{const n=prompt('Название (Дом·Кухня):');if(!n)return;const id=n.toLowerCase().replace(/[·\s>/\\]/g,'_').replace(/[^a-zа-яё0-9_]/gi,'');if(!LS.mapN[id])LS.mapN[id]={name:n,desc:'',x:40+Object.keys(LS.mapN).length%4*120,y:30};rMap();});
}
async function getTpl(n){try{return await renderExtensionTemplateAsync(TP,n);}catch(e){return '';}}

// ══ INIT ══
jQuery(async()=>{
    console.log(`[Chronicle] Loading v${VER}...`);
    try{
        await initNav();loadS();ensureRx();
        const html=await getTpl('drawer');if(!html){console.error('[Chronicle] No drawer');return;}
        $('#extensions-settings-button').after(html);
        await initDrawer();initTabs();initBtns();initSE();
        if(event_types.CHARACTER_MESSAGE_RENDERED)eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED,onMsg);
        if(event_types.CHAT_CHANGED)eventSource.on(event_types.CHAT_CHANGED,onChat);
        if(event_types.CHAT_COMPLETION_PROMPT_READY)eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY,onPrompt);
        if(event_types.MESSAGE_SWIPED)eventSource.on(event_types.MESSAGE_SWIPED,()=>{LS=agg();refreshAll();});
        if(event_types.MESSAGE_DELETED)eventSource.on(event_types.MESSAGE_DELETED,()=>{LS=agg();refreshAll();});
        onChat();syncUI();
        console.log(`[Chronicle] v${VER} loaded! ✓`);
    }catch(err){console.error('[Chronicle] Init failed:',err);}
});
