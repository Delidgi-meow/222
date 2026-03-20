/**
 * Chronicle — Хроники Мира v0.2.0
 * Полный трекер RP-мира: симс, здоровье, дневник, кошелёк, NPC, календарь.
 * Все данные — для ОБОИХ: юзера и бота.
 */
import { renderExtensionTemplateAsync, getContext, extension_settings } from '/scripts/extensions.js';
import { getSlideToggleOptions, saveSettingsDebounced, eventSource, event_types } from '/script.js';
import { slideToggle } from '/lib.js';

const EXT_NAME = 'chronicle', VERSION = '0.2.0';
const _su = import.meta.url, _em = _su.match(/\/scripts\/extensions\/(third-party\/[^/]+)\//);
const EXT_FOLDER = _em ? _em[1] : 'third-party/chronicle';
const TEMPLATE_PATH = `${EXT_FOLDER}/assets/templates`;
console.log(`[Chronicle] Folder: ${EXT_FOLDER}`);

// ── Navbar (Horae pattern) ──
let doNavbarIconClick = null;
async function initNavbarFunction() { try { const m = await import('/script.js'); if(m.doNavbarIconClick) doNavbarIconClick=m.doNavbarIconClick; } catch(_){} }
function openDrawerLegacy() {
    const ic=$('#chronicle_drawer_icon'), co=$('#chronicle_drawer_content');
    if(ic.hasClass('closedIcon')){
        $('.openDrawer').not('#chronicle_drawer_content').not('.pinnedOpen').addClass('resizing').each((_,el)=>{slideToggle(el,{...getSlideToggleOptions(),onAnimationEnd:e=>e.closest('.drawer-content')?.classList.remove('resizing')});});
        $('.openIcon').not('#chronicle_drawer_icon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');
        $('.openDrawer').not('#chronicle_drawer_content').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');
        ic.toggleClass('closedIcon openIcon'); co.toggleClass('closedDrawer openDrawer');
        co.addClass('resizing').each((_,el)=>{slideToggle(el,{...getSlideToggleOptions(),onAnimationEnd:e=>e.closest('.drawer-content')?.classList.remove('resizing')});});
    } else {
        ic.toggleClass('openIcon closedIcon'); co.toggleClass('openDrawer closedDrawer');
        co.addClass('resizing').each((_,el)=>{slideToggle(el,{...getSlideToggleOptions(),onAnimationEnd:e=>e.closest('.drawer-content')?.classList.remove('resizing')});});
    }
}
async function initDrawer() {
    const t=$('#chronicle_drawer .drawer-toggle');
    if(typeof doNavbarIconClick==='function') t.on('click',doNavbarIconClick);
    else { $('#chronicle_drawer_content').attr('data-slide-toggle','hidden').css('display','none'); t.on('click',openDrawerLegacy); }
}

// ══════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════
const DEFAULT_SETTINGS = {
    enabled:true, autoParse:true, injectContext:true,
    sendSims:true, sendHealth:true, sendCycle:false, sendWallet:true, sendDiary:true, sendNpcs:true, sendAffection:true,
    userBirthday:'', botBirthday:'',
    customSystemPrompt:'',
};
let settings = {};
function loadSettings() { settings = extension_settings[EXT_NAME] ? {...DEFAULT_SETTINGS,...extension_settings[EXT_NAME]} : {...DEFAULT_SETTINGS}; extension_settings[EXT_NAME]=settings; }
function saveS() { extension_settings[EXT_NAME]=settings; saveSettingsDebounced(); }

function syncSettingsUI() {
    $('#chr-set-sims').prop('checked', settings.sendSims);
    $('#chr-set-health').prop('checked', settings.sendHealth);
    $('#chr-set-cycle').prop('checked', settings.sendCycle);
    $('#chr-set-wallet').prop('checked', settings.sendWallet);
    $('#chr-set-diary').prop('checked', settings.sendDiary);
    $('#chr-set-calendar').prop('checked', true);
    $('#chr-set-map').prop('checked', true);
    $('#chr-set-user-bday').val(settings.userBirthday || '');
    $('#chr-set-bot-bday').val(settings.botBirthday || '');
    $('#chr-set-system-prompt').val(settings.customSystemPrompt || '');
}
function initSettingsEvents() {
    const bind = (sel, key) => $(document).on('change', sel, function(){ settings[key]=$(this).prop('checked'); saveS(); });
    bind('#chr-set-sims','sendSims'); bind('#chr-set-health','sendHealth'); bind('#chr-set-cycle','sendCycle');
    bind('#chr-set-wallet','sendWallet'); bind('#chr-set-diary','sendDiary');
    $(document).on('change','#chr-set-user-bday',function(){ settings.userBirthday=$(this).val().trim(); saveS(); });
    $(document).on('change','#chr-set-bot-bday',function(){ settings.botBirthday=$(this).val().trim(); saveS(); });
    $(document).on('change','#chr-set-system-prompt',function(){ settings.customSystemPrompt=$(this).val(); saveS(); });
    $(document).on('click','#chr-set-reset-prompt',()=>{ settings.customSystemPrompt=''; $('#chr-set-system-prompt').val(''); saveS(); if(window.toastr)toastr.info('Промпт сброшен','Chronicle'); });
}

// ── Regex ──
const TAG_NAMES = [
    {id:'chr_world',pat:'<world>[\\s\\S]*?</world>'},{id:'chr_event',pat:'<event>[\\s\\S]*?</event>'},
    {id:'chr_sims',pat:'<sims>[\\s\\S]*?</sims>'},{id:'chr_health',pat:'<health>[\\s\\S]*?</health>'},
    {id:'chr_cycle',pat:'<cycle>[\\s\\S]*?</cycle>'},{id:'chr_diary',pat:'<diary>[\\s\\S]*?</diary>'},
    {id:'chr_wallet',pat:'<wallet>[\\s\\S]*?</wallet>'},{id:'chr_npc',pat:'<npc>[\\s\\S]*?</npc>'},
    {id:'chr_agenda',pat:'<agenda-?>[\\s\\S]*?</agenda-?>'},{id:'chr_location',pat:'<location>[\\s\\S]*?</location>'},
    {id:'chr_item',pat:'<item-?>[\\s\\S]*?</item-?>'},{id:'chr_affect',pat:'<affection>[\\s\\S]*?</affection>'},
];
function ensureRegexRules() {
    try { const s=getContext()?.extensionSettings?.regex; if(!s||!Array.isArray(s))return; const ex=new Set(s.map(r=>r.id));
    for(const t of TAG_NAMES){if(ex.has(t.id))continue;s.push({id:t.id,scriptName:`Chronicle — ${t.id}`,findRegex:`/${t.pat}/gim`,replaceString:'',trimStrings:[],placement:[2],disabled:false,markdownOnly:true,promptOnly:true,runOnEdit:true,substituteRegex:0,minDepth:null,maxDepth:null});}} catch(_){}
}

// ══════════════════════════════════════
// SYSTEM PROMPT — формат тегов для AI
// ══════════════════════════════════════
const SYSTEM_PROMPT = `[Chronicle — World Memory System]

At the END of EVERY reply, append ALL of the following tags. Tags are invisible to the reader.

MANDATORY every turn:

<world>
time:exact date and time (2026/3/15 14:30). NEVER relative ("next day").
location:place (use · for levels: Apartment·Kitchen)
weather:short weather description
atmosphere:short mood/atmosphere
characters:names of ALL characters present, comma-separated
costume:Name=outfit description (one line per character, including {{user}})
</world>

<event>
level|event summary 20-50 words
</event>
Levels: обычное / важное / ключевое

<sims>
CharName.hunger:0-100|reason if changed
CharName.hygiene:0-100
CharName.sleep:0-100|reason
CharName.arousal:0-100
</sims>
Write sims for EVERY character present (both {{char}} AND {{user}}). Use their actual names, e.g.:
Даниил.hunger:65|ate breakfast
Таня.hunger:80
Даниил.sleep:40|stayed up late
Таня.sleep:70

OPTIONAL (only when something changes):

<health>
CharName.hp:0-100
CharName.intoxication:0-100|what they drank
CharName.injury:description|severity (лёгкий/средний/тяжёлый)
CharName.habit:name|details
</health>
Track for ALL characters. Prefix with name: Даниил.hp:90, Таня.intoxication:20|wine

<cycle>
day:cycle day number
phase:phase name
symptoms:description
</cycle>

<diary>
CharName|Personal thoughts, reflections, inner monologue of this character about recent events.
</diary>
Write diary entries for BOTH {{char}} AND {{user}} — their private thoughts. At least 2-3 sentences each. Include emotional reactions, plans, worries.

<wallet>
CharName.balance:amount₽
CharName.spend:category|amount₽|description
CharName.income:amount₽|source
</wallet>
Track money for each character separately. Prefix with name.

<npc>
Name|внешность=description|характер=traits|отношение=relation|пол:m/f|возраст:number|birthday:YYYY/M/D
</npc>

<affection>
Name=+/-number|reason
</affection>

<agenda>
YYYY/M/D|task or plan text
</agenda>

<agenda->
completed task text
</agenda->

RULES:
- ALL tags at END of reply, AFTER story text
- time is ALWAYS exact calendar date
- sims/health/wallet: write for ALL characters present, prefix with their name
- diary: write for both {{char}} and {{user}}, 2+ sentences each`;

// ══════════════════════════════════════
// TAG PARSING
// ══════════════════════════════════════
function hasCD(msg) { return msg ? /<(?:world|event|sims|health|cycle|diary|wallet|npc|agenda|location|item|affection)>/i.test(msg) : false; }
function pl(c) { return c.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')); }
function kvp(line) { const i=line.indexOf(':'); return i>0?{k:line.substring(0,i).trim().toLowerCase(),v:line.substring(i+1).trim()}:null; }

/** Разбирает "CharName.field" → {char, field} или {char:'_default', field} */
function splitCharField(raw) {
    const dot = raw.indexOf('.');
    if (dot > 0) return { char: raw.substring(0, dot).trim(), field: raw.substring(dot+1).trim().toLowerCase() };
    return { char: '_default', field: raw.toLowerCase() };
}

function parseMessage(message) {
    if (!message) return null;
    const R = { world:null,events:[],sims:{},health:{},cycle:null,diary:[],wallet:{},npcs:{},agenda:[],agendaDel:[],affection:{} };
    let has=false, m;

    // <world>
    const wRx=/<world>([\s\S]*?)<\/world>/gi;
    while((m=wRx.exec(message))){
        const w={time:'',location:'',weather:'',atmosphere:'',characters:[],costumes:{}};
        for(const l of pl(m[1])){const p=kvp(l);if(!p)continue;
            if(p.k==='time')w.time=p.v;else if(p.k==='location')w.location=p.v;
            else if(p.k==='weather')w.weather=p.v;else if(p.k==='atmosphere')w.atmosphere=p.v;
            else if(p.k==='characters')w.characters=p.v.split(/[,，]/).map(c=>c.trim()).filter(Boolean);
            else if(p.k==='costume'){const eq=p.v.indexOf('=');if(eq>0)w.costumes[p.v.substring(0,eq).trim()]=p.v.substring(eq+1).trim();}
        } R.world=w;has=true;
    }

    // <event>
    const eRx=/<event>([\s\S]*?)<\/event>/gi;
    while((m=eRx.exec(message))){for(const l of pl(m[1])){const pp=l.indexOf('|');R.events.push(pp>0?{level:l.substring(0,pp).trim(),summary:l.substring(pp+1).trim()}:{level:'обычное',summary:l});}has=true;}

    // <sims> — multi-char: "Даниил.hunger:65|reason"
    const sRx=/<sims>([\s\S]*?)<\/sims>/gi;
    while((m=sRx.exec(message))){for(const l of pl(m[1])){const p=kvp(l);if(!p)continue;
        const{char,field}=splitCharField(p.k);const STATS=['hunger','hygiene','sleep','arousal'];if(!STATS.includes(field))continue;
        const pp=p.v.indexOf('|');const vs=pp>0?p.v.substring(0,pp).trim():p.v;const reason=pp>0?p.v.substring(pp+1).trim():'';
        const n=parseFloat(vs);if(isNaN(n))continue;if(!R.sims[char])R.sims[char]={};
        R.sims[char][field]={value:Math.max(0,Math.min(100,Math.round(n))),reason};
    }has=true;}

    // <health> — multi-char
    const hRx=/<health>([\s\S]*?)<\/health>/gi;
    while((m=hRx.exec(message))){for(const l of pl(m[1])){const p=kvp(l);if(!p)continue;
        const{char,field}=splitCharField(p.k);if(!R.health[char])R.health[char]={hp:null,intoxication:null,injuries:[],habits:[]};
        const h=R.health[char];
        if(field==='hp'){const n=parseFloat(p.v);if(!isNaN(n))h.hp=Math.max(0,Math.min(100,Math.round(n)));}
        else if(field==='intoxication'){const pp=p.v.indexOf('|');const vs=pp>0?p.v.substring(0,pp).trim():p.v;const n=parseFloat(vs);if(!isNaN(n))h.intoxication={value:Math.max(0,Math.min(100,Math.round(n))),reason:pp>0?p.v.substring(pp+1).trim():''};}
        else if(field==='injury'){const pts=p.v.split('|').map(x=>x.trim());if(pts[0])h.injuries.push({name:pts[0],severity:pts[1]||'лёгкий'});}
        else if(field==='habit'){const pts=p.v.split('|').map(x=>x.trim());if(pts[0])h.habits.push({name:pts[0],detail:pts[1]||''});}
    }has=true;}

    // <cycle>
    const cRx=/<cycle>([\s\S]*?)<\/cycle>/gi;
    while((m=cRx.exec(message))){const c={day:null,phase:'',symptoms:''};for(const l of pl(m[1])){const p=kvp(l);if(!p)continue;if(p.k==='day'){const n=parseInt(p.v);if(!isNaN(n))c.day=n;}else if(p.k==='phase')c.phase=p.v;else if(p.k==='symptoms')c.symptoms=p.v;}R.cycle=c;has=true;}

    // <diary>
    const dRx=/<diary>([\s\S]*?)<\/diary>/gi;
    while((m=dRx.exec(message))){for(const l of pl(m[1])){const pp=l.indexOf('|');if(pp>0)R.diary.push({author:l.substring(0,pp).trim(),text:l.substring(pp+1).trim()});}has=true;}

    // <wallet> — multi-char
    const wlRx=/<wallet>([\s\S]*?)<\/wallet>/gi;
    while((m=wlRx.exec(message))){for(const l of pl(m[1])){const p=kvp(l);if(!p)continue;
        const{char,field}=splitCharField(p.k);if(!R.wallet[char])R.wallet[char]={balance:null,transactions:[]};
        const w=R.wallet[char];
        if(field==='balance'){const mt=p.v.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(.*)/);if(mt)w.balance={amount:parseFloat(mt[1].replace(',','.')),currency:mt[2]||'₽'};}
        else if(field==='spend'){const pts=p.v.split('|').map(x=>x.trim());if(pts.length>=2){const mt=pts[1].match(/^(\d+(?:\.\d+)?)\s*(.*)/);if(mt)w.transactions.push({type:'spend',category:pts[0],amount:parseFloat(mt[1]),currency:mt[2]||'₽',note:pts[2]||''});}}
        else if(field==='income'){const pts=p.v.split('|').map(x=>x.trim());const mt=pts[0].match(/^(\d+(?:\.\d+)?)\s*(.*)/);if(mt)w.transactions.push({type:'income',category:'доход',amount:parseFloat(mt[1]),currency:mt[2]||'₽',note:pts[1]||''});}
    }has=true;}

    // <npc>
    const nRx=/<npc>([\s\S]*?)<\/npc>/gi;
    while((m=nRx.exec(message))){for(const l of pl(m[1])){const pts=l.split('|').map(x=>x.trim());if(pts.length<2)continue;const name=pts[0],info={};
        for(let i=1;i<pts.length;i++){const eq=pts[i].indexOf('='),col=pts[i].indexOf(':');let k,v;if(eq>0&&(col<0||eq<col)){k=pts[i].substring(0,eq).trim().toLowerCase();v=pts[i].substring(eq+1).trim();}else if(col>0){k=pts[i].substring(0,col).trim().toLowerCase();v=pts[i].substring(col+1).trim();}else continue;
            if(k==='внешность'||k==='appearance')info.appearance=v;else if(k==='характер'||k==='personality')info.personality=v;else if(k==='отношение'||k==='relation')info.relation=v;else if(k==='пол'||k==='gender')info.gender=v;else if(k==='возраст'||k==='age'){const n=parseInt(v);if(!isNaN(n))info.age=n;}else if(k==='день_рождения'||k==='birthday'||k==='др')info.birthday=v;else info[k]=v;
        }R.npcs[name]=info;has=true;}
    }

    // <affection>
    const aRx=/<affection>([\s\S]*?)<\/affection>/gi;
    while((m=aRx.exec(message))){for(const l of pl(m[1])){const eq=l.indexOf('=');if(eq<=0)continue;const name=l.substring(0,eq).trim(),rest=l.substring(eq+1).trim();const pp=rest.indexOf('|');const vs=pp>0?rest.substring(0,pp).trim():rest;const reason=pp>0?rest.substring(pp+1).trim():'';const n=parseFloat(vs);if(!isNaN(n))R.affection[name]={type:vs.startsWith('+')||vs.startsWith('-')?'relative':'absolute',value:n,reason};}has=true;}

    // <agenda>/<agenda->
    const agRx=/<agenda>([\s\S]*?)<\/agenda>/gi;
    while((m=agRx.exec(message))){for(const l of pl(m[1])){const pp=l.indexOf('|');R.agenda.push(pp>0?{date:l.substring(0,pp).trim(),text:l.substring(pp+1).trim()}:{date:'',text:l});}has=true;}
    const agdRx=/<agenda->([\s\S]*?)<\/agenda->/gi;
    while((m=agdRx.exec(message))){for(const l of pl(m[1]))if(l)R.agendaDel.push(l);has=true;}

    return has?R:null;
}

// ══════════════════════════════════════
// STATE
// ══════════════════════════════════════
function createState() {
    return { time:'',location:'',weather:'',atmosphere:'',characters:[],costumes:{},events:[],
        sims:{},health:{},cycle:{day:null,phase:'',symptoms:''},
        diary:[],wallets:{},npcs:{},affection:{},agenda:[] };
}
let lastState=createState(), calYear=2026, calMonth=3;

function aggregateState() {
    const chat=getContext()?.chat||[], S=createState();
    for(let i=0;i<chat.length;i++){
        const M=chat[i].chronicle_meta; if(!M)continue;
        if(M.world){if(M.world.time)S.time=M.world.time;if(M.world.location)S.location=M.world.location;if(M.world.weather)S.weather=M.world.weather;if(M.world.atmosphere)S.atmosphere=M.world.atmosphere;if(M.world.characters?.length)S.characters=[...M.world.characters];if(M.world.costumes)Object.assign(S.costumes,M.world.costumes);}
        if(M.events?.length)for(const ev of M.events)S.events.push({...ev,time:M.world?.time||'',msgId:i});
        // sims multi-char
        if(M.sims)for(const[cn,stats]of Object.entries(M.sims)){if(!S.sims[cn])S.sims[cn]={hunger:70,hygiene:70,sleep:70,arousal:15};for(const[k,v]of Object.entries(stats))S.sims[cn][k]=v.value;}
        // health multi-char
        if(M.health)for(const[cn,h]of Object.entries(M.health)){if(!S.health[cn])S.health[cn]={hp:100,intoxication:{value:0,reason:''},injuries:[],habits:[]};const sh=S.health[cn];if(h.hp!==null)sh.hp=h.hp;if(h.intoxication)sh.intoxication=h.intoxication;for(const inj of h.injuries){const ex=sh.injuries.find(x=>x.name.toLowerCase()===inj.name.toLowerCase());if(ex)ex.severity=inj.severity;else sh.injuries.push({...inj});}for(const hab of h.habits){const ex=sh.habits.find(x=>x.name.toLowerCase()===hab.name.toLowerCase());if(ex)ex.detail=hab.detail;else sh.habits.push({...hab});}}
        if(M.cycle){if(M.cycle.day!==null)S.cycle.day=M.cycle.day;if(M.cycle.phase)S.cycle.phase=M.cycle.phase;if(M.cycle.symptoms)S.cycle.symptoms=M.cycle.symptoms;}
        if(M.diary?.length)for(const d of M.diary)S.diary.push({...d,time:M.world?.time||'',msgId:i});
        // wallet multi-char
        if(M.wallet)for(const[cn,w]of Object.entries(M.wallet)){if(!S.wallets[cn])S.wallets[cn]={balance:0,currency:'₽',transactions:[]};if(w.balance)S.wallets[cn].balance=w.balance.amount;for(const tx of(w.transactions||[]))S.wallets[cn].transactions.push({...tx,date:M.world?.time||''});}
        if(M.npcs)for(const[n,info]of Object.entries(M.npcs)){if(!S.npcs[n])S.npcs[n]={};for(const[k,v]of Object.entries(info))if(v!==undefined&&v!=='')S.npcs[n][k]=v;}
        if(M.affection)for(const[n,d]of Object.entries(M.affection)){if(!S.affection[n])S.affection[n]={value:0,reason:''};if(d.type==='absolute')S.affection[n].value=d.value;else S.affection[n].value+=d.value;if(d.reason)S.affection[n].reason=d.reason;}
        if(M.agendaDel?.length)for(const del of M.agendaDel)S.agenda=S.agenda.filter(a=>!a.text.toLowerCase().includes(del.toLowerCase()));
        if(M.agenda?.length)for(const a of M.agenda)if(!S.agenda.some(x=>x.text===a.text))S.agenda.push({...a,done:false});
    }
    // Установить календарь на RP-дату
    if(S.time){const mt=S.time.match(/(\d{4})\D+(\d{1,2})/);if(mt){calYear=parseInt(mt[1]);calMonth=parseInt(mt[2]);}}
    return S;
}

// ══════════════════════════════════════
// PROMPT INJECTION
// ══════════════════════════════════════
function buildContextPrompt(state) {
    const lines = [];
    if(state.time) lines.push(`[Текущее время: ${state.time} | Место: ${state.location} | Погода: ${state.weather}]`);
    // Sims for all chars
    for(const[cn,stats]of Object.entries(state.sims)){
        const name=cn==='_default'?(getContext()?.name2||'Бот'):cn;
        const parts=Object.entries(SIMS_CFG).map(([k,cfg])=>`${cfg.name}:${stats[k]??70}`).join(', ');
        lines.push(`[Статы ${name}: ${parts}]`);
    }
    // Health for all chars
    for(const[cn,h]of Object.entries(state.health)){
        const name=cn==='_default'?(getContext()?.name2||'Бот'):cn;
        const parts=[];
        if(h.hp<100)parts.push(`HP:${h.hp}`);
        if(h.intoxication?.value>0)parts.push(`Опьянение:${h.intoxication.value}`);
        for(const inj of h.injuries)parts.push(`Травма:${inj.name}(${inj.severity})`);
        for(const hab of h.habits)parts.push(`Привычка:${hab.name}`);
        if(parts.length)lines.push(`[Здоровье ${name}: ${parts.join(', ')}]`);
    }
    // Costumes
    const cosLines=Object.entries(state.costumes).map(([c,d])=>`${c}: ${d}`);
    if(cosLines.length)lines.push(`[Наряды: ${cosLines.join('; ')}]`);
    // Wallets
    for(const[cn,w]of Object.entries(state.wallets)){
        const name=cn==='_default'?(getContext()?.name2||'Бот'):cn;
        if(w.balance!==0)lines.push(`[Кошелёк ${name}: ${w.balance}${w.currency}]`);
    }
    // Birthdays
    const bdLines=[];
    if(settings.userBirthday)bdLines.push(`${getContext()?.name1||'User'}: ${settings.userBirthday}`);
    if(settings.botBirthday)bdLines.push(`${getContext()?.name2||'Bot'}: ${settings.botBirthday}`);
    for(const[n,npc]of Object.entries(state.npcs))if(npc.birthday)bdLines.push(`${n}: ${npc.birthday}`);
    if(bdLines.length)lines.push(`[Дни рождения: ${bdLines.join('; ')}]`);
    // Agenda
    const upcoming=state.agenda.filter(a=>!a.done).slice(0,5);
    if(upcoming.length)lines.push(`[Ближайшие планы: ${upcoming.map(a=>`${a.date?a.date+' — ':''}${a.text}`).join('; ')}]`);
    return lines.join('\n');
}

function onPromptReady(eventData) {
    if(!settings.enabled||!settings.injectContext)return;
    const state=aggregateState();
    const sysPrompt=settings.customSystemPrompt||SYSTEM_PROMPT;
    const ctxPrompt=buildContextPrompt(state);
    if(eventData?.chat){
        // System prompt в начало
        eventData.chat.unshift({role:'system',content:sysPrompt});
        // Context перед последним user message
        if(ctxPrompt){
            let idx=eventData.chat.length-1;
            for(let i=eventData.chat.length-1;i>=0;i--)if(eventData.chat[i].role==='user'){idx=i;break;}
            eventData.chat.splice(idx,0,{role:'system',content:ctxPrompt});
        }
    }
}

// ══════════════════════════════════════
// EVENT HANDLERS
// ══════════════════════════════════════
function onMessageReceived(msgIdx) {
    if(!settings.enabled)return;const chat=getContext()?.chat;if(!chat||msgIdx<0||msgIdx>=chat.length)return;
    if(!hasCD(chat[msgIdx].mes))return;const parsed=parseMessage(chat[msgIdx].mes);
    if(parsed){chat[msgIdx].chronicle_meta=parsed;console.log(`[Chronicle] Parsed #${msgIdx}`);}
    lastState=aggregateState();refreshAllDisplays();getContext().saveChat?.();
}
function onChatChanged() {
    if(!settings.enabled)return;const chat=getContext()?.chat||[];
    for(let i=0;i<chat.length;i++)if(!chat[i].chronicle_meta&&chat[i].mes&&hasCD(chat[i].mes)){const p=parseMessage(chat[i].mes);if(p)chat[i].chronicle_meta=p;}
    lastState=aggregateState();refreshAllDisplays();
}

// ══════════════════════════════════════
// UI
// ══════════════════════════════════════
const SIMS_CFG={hunger:{name:'Голод',icon:'fa-utensils',color:'#f59e0b'},hygiene:{name:'Гигиена',icon:'fa-shower',color:'#60a5fa'},sleep:{name:'Сон',icon:'fa-bed',color:'#a78bfa'},arousal:{name:'Возбуждение',icon:'fa-fire',color:'#ec4899'}};
const MONTHS_RU=['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

function refreshAllDisplays(){refreshStatus();refreshSims();refreshHealth();refreshTimeline();refreshCharacters();refreshItems();refreshCalendar();}

function refreshStatus(){
    $('#chr-current-date').text(lastState.time||'--/--');$('#chr-current-weather').text(lastState.weather||'');
    $('#chr-current-location').text(lastState.location||'Не задано');$('#chr-current-atmosphere').text(lastState.atmosphere||'');
    // Mini sims — first char
    const cn=Object.keys(lastState.sims)[0];const first=cn?lastState.sims[cn]:null;
    if(first)for(const key of Object.keys(SIMS_CFG)){const val=first[key]??70;$(`#chr-mini-sims .chr-sim-bar[data-stat="${key}"]`).each(function(){$(this).find('.chr-sim-bar__fill').css('width',`${val}%`).css('background-color',SIMS_CFG[key].color).toggleClass('low',val<20);$(this).find('.chr-sim-bar__value').text(val);});}
    // Costumes
    const $cos=$('#chr-costumes-quick').empty();const ce=Object.entries(lastState.costumes);
    if(ce.length)for(const[c,d]of ce)$cos.append(`<div style="margin-bottom:4px;"><span style="color:var(--chr-accent);font-weight:600;font-size:12px;">${esc(c)}:</span> <span style="font-size:11px;color:var(--chr-text-muted);">${esc(d)}</span></div>`);
    else $cos.append('<div class="chr-empty">Нет данных</div>');
}

function refreshSims(){
    const $c=$('#chr-sims-chars').empty();const names=Object.keys(lastState.sims);
    if(!names.length){$c.append('<div class="chr-empty"><i class="fa-solid fa-heart-pulse"></i>Нет данных</div>');return;}
    for(const cn of names){const stats=lastState.sims[cn];const dn=cn==='_default'?(getContext()?.name2||'Персонаж'):cn;
        let bars='';for(const[key,cfg]of Object.entries(SIMS_CFG)){const val=stats[key]??70;bars+=`<div class="chr-sim-bar" data-stat="${key}"><i class="chr-sim-bar__icon fa-solid ${cfg.icon}"></i><span class="chr-sim-bar__label">${cfg.name}</span><div class="chr-sim-bar__track"><div class="chr-sim-bar__fill ${val<20?'low':''}" style="width:${val}%;background-color:${cfg.color};"></div></div><span class="chr-sim-bar__value">${val}</span></div>`;}
        $c.append(`<div class="chr-glass-card" style="padding:10px 12px;margin-bottom:8px;"><div style="font-family:var(--chr-font-display);font-size:13px;font-weight:600;color:var(--chr-accent);margin-bottom:8px;"><i class="fa-solid fa-user"></i> ${esc(dn)}</div><div class="chr-sims-grid">${bars}</div></div>`);
    }
}

function refreshHealth(){
    const $cont=$('#chr-health-chars').empty();const names=Object.keys(lastState.health);
    // Add chars that have no health data yet — show defaults
    if(!names.length){$cont.append('<div class="chr-empty"><i class="fa-solid fa-heart-pulse"></i>Нет данных о здоровье</div>');return;}
    for(const cn of names){
        const h=lastState.health[cn];const dn=cn==='_default'?(getContext()?.name2||'Персонаж'):cn;
        let html=`<div style="font-family:var(--chr-font-display);font-size:13px;font-weight:600;color:var(--chr-accent);margin-bottom:8px;"><i class="fa-solid fa-user"></i> ${esc(dn)}</div>`;
        // HP bar
        html+=`<div class="chr-sim-bar"><i class="chr-sim-bar__icon fa-solid fa-heart" style="color:var(--chr-danger);"></i><span class="chr-sim-bar__label">HP</span><div class="chr-sim-bar__track"><div class="chr-sim-bar__fill" style="width:${h.hp}%;background:var(--chr-danger);"></div></div><span class="chr-sim-bar__value">${h.hp}</span></div>`;
        // Intoxication
        const intox=h.intoxication?.value||0;
        if(intox>0)html+=`<div class="chr-sim-bar" style="margin-top:6px;"><i class="chr-sim-bar__icon fa-solid fa-wine-glass" style="color:var(--chr-accent);"></i><span class="chr-sim-bar__label">Алкоголь</span><div class="chr-sim-bar__track"><div class="chr-sim-bar__fill" style="width:${intox}%;background:var(--chr-accent);"></div></div><span class="chr-sim-bar__value">${intox}</span></div>${h.intoxication?.reason?`<div style="font-size:10px;color:var(--chr-text-dim);font-style:italic;margin-top:2px;">${esc(h.intoxication.reason)}</div>`:''}`;
        // Injuries
        if(h.injuries.length){html+='<div style="margin-top:6px;">';for(const inj of h.injuries){const cls=inj.severity==='тяжёлый'?'danger':inj.severity==='средний'?'warning':'info';html+=`<div class="chr-injury-item"><div class="chr-injury-item__dot ${cls==='danger'?'severe':cls==='warning'?'medium':'light'}"></div><span style="color:var(--chr-text);font-size:12px;">${esc(inj.name)}</span><span class="chr-tag chr-tag--${cls}">${esc(inj.severity)}</span></div>`;}html+='</div>';}
        // Habits
        if(h.habits.length){html+='<div style="margin-top:6px;">';for(const hab of h.habits)html+=`<div class="chr-habit-item"><i class="fa-solid fa-smoking"></i><span>${esc(hab.name)}</span><span style="color:var(--chr-text-dim);">${esc(hab.detail)}</span></div>`;html+='</div>';}
        $cont.append(`<div class="chr-glass-card" style="padding:10px 12px;margin-bottom:8px;">${html}</div>`);
    }
    // Cycle (global, not per-char)
    if(lastState.cycle.day!==null){$('#chr-cycle-display').show();$('#chr-cycle-day').text(`День ${lastState.cycle.day}`);$('#chr-cycle-phase').text(lastState.cycle.phase);$('#chr-cycle-symptoms').text(lastState.cycle.symptoms);}else $('#chr-cycle-display').hide();
}

function refreshTimeline(){
    const $tl=$('#chr-timeline-list').empty();
    if(lastState.events.length)for(const ev of lastState.events.slice(-50).reverse())$tl.append(`<div class="chr-timeline-item chr-glass-card" data-level="${esc(ev.level)}"><div class="chr-timeline-item__time">${esc(ev.time)}</div><div class="chr-timeline-item__text">${esc(ev.summary)}</div></div>`);
    else $tl.append('<div class="chr-empty"><i class="fa-solid fa-timeline"></i>Событий пока нет</div>');
}

function refreshCharacters(){
    // Diary
    const $diary=$('#chr-diary-list').empty();
    if(lastState.diary.length)for(const d of lastState.diary.slice(-30).reverse())$diary.append(`<div class="chr-diary-entry chr-glass-card"><div class="chr-diary-entry__author"><i class="fa-solid fa-feather"></i> ${esc(d.author)}</div><div class="chr-diary-entry__text">${esc(d.text)}</div><div class="chr-diary-entry__time">${esc(d.time)}</div></div>`);
    else $diary.append('<div class="chr-empty"><i class="fa-solid fa-book"></i>Записей нет</div>');
    // NPCs + birthdays
    const $npc=$('#chr-characters-list').empty();
    // User & Bot birthdays at top
    const ctx=getContext();
    if(settings.userBirthday)$npc.append(`<div class="chr-glass-card" style="padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-cake-candles" style="color:var(--chr-accent);"></i><span style="font-size:12px;color:var(--chr-text);font-weight:600;">${esc(ctx?.name1||'User')}</span><span class="chr-tag chr-tag--accent">${esc(settings.userBirthday)}</span></div>`);
    if(settings.botBirthday)$npc.append(`<div class="chr-glass-card" style="padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-cake-candles" style="color:var(--chr-accent);"></i><span style="font-size:12px;color:var(--chr-text);font-weight:600;">${esc(ctx?.name2||'Bot')}</span><span class="chr-tag chr-tag--accent">${esc(settings.botBirthday)}</span></div>`);
    // NPC cards
    const npcNames=Object.keys(lastState.npcs);
    if(npcNames.length)for(const name of npcNames){const npc=lastState.npcs[name];const aff=lastState.affection[name];const present=lastState.characters.includes(name);
        let tags='';if(npc.gender)tags+=`<span class="chr-tag">${esc(npc.gender)}</span>`;if(npc.age)tags+=`<span class="chr-tag">${npc.age} лет</span>`;if(npc.relation)tags+=`<span class="chr-tag chr-tag--primary">${esc(npc.relation)}</span>`;if(aff){const cls=aff.value>=0?'success':'danger';tags+=`<span class="chr-tag chr-tag--${cls}">♥ ${aff.value>0?'+':''}${aff.value}</span>`;}if(present)tags+='<span class="chr-tag chr-tag--accent">в сцене</span>';
        const bdH=npc.birthday?`<div class="chr-npc-card__birthday"><i class="fa-solid fa-cake-candles"></i> ${esc(npc.birthday)}</div>`:'';
        $npc.append(`<div class="chr-npc-card chr-glass-card">${bdH}<div class="chr-npc-card__header"><div class="chr-npc-card__avatar">${name.charAt(0).toUpperCase()}</div><div><div class="chr-npc-card__name">${esc(name)}</div>${npc.appearance?`<div style="font-size:11px;color:var(--chr-text-muted);">${esc(npc.appearance)}</div>`:''}</div></div><div class="chr-npc-card__tags">${tags}</div></div>`);
    }else if(!settings.userBirthday&&!settings.botBirthday) $npc.append('<div class="chr-empty"><i class="fa-solid fa-users"></i>Персонажей нет</div>');
}

function refreshItems(){
    // Wallets — all chars
    const $wallets=$('#chr-wallets-container').empty();
    const wNames=Object.keys(lastState.wallets);
    if(wNames.length){for(const cn of wNames){const w=lastState.wallets[cn];const dn=cn==='_default'?(getContext()?.name2||'Персонаж'):cn;
        let txHtml='';for(const tx of w.transactions.slice(-8).reverse()){const sp=tx.type==='spend';txHtml+=`<div class="chr-wallet-tx"><div class="chr-wallet-tx__icon ${tx.type}"><i class="fa-solid ${sp?'fa-arrow-down':'fa-arrow-up'}"></i></div><div class="chr-wallet-tx__info"><div class="chr-wallet-tx__category">${esc(tx.category)}</div><div class="chr-wallet-tx__note">${esc(tx.note)}</div></div><div class="chr-wallet-tx__amount ${tx.type}">${sp?'-':'+'}${tx.amount}${tx.currency||'₽'}</div></div>`;}
        $wallets.append(`<div class="chr-glass-card" style="padding:12px;margin-bottom:8px;"><div style="text-align:center;margin-bottom:8px;"><div style="font-size:11px;color:var(--chr-text-dim);">${esc(dn)}</div><div style="font-family:var(--chr-font-display);font-size:24px;font-weight:700;color:var(--chr-text);">${w.balance.toLocaleString('ru-RU')}<span style="font-size:14px;color:var(--chr-text-muted);">${w.currency}</span></div></div>${txHtml}</div>`);
    }}else $wallets.append('<div class="chr-empty"><i class="fa-solid fa-wallet"></i>Нет данных</div>');
}

function refreshCalendar(){
    $('#chr-cal-month').text(`${MONTHS_RU[calMonth]||''} ${calYear}`);
    const $grid=$('#chr-cal-grid').empty();
    const first=new Date(calYear,calMonth-1,1);const days=new Date(calYear,calMonth,0).getDate();
    let startWd=first.getDay()-1;if(startWd<0)startWd=6;
    // Collect dates with marks
    const evDates=new Set(),bdDates=new Set(),agDates=new Set();
    for(const ev of lastState.events){const d=ev.time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(d&&parseInt(d[1])===calYear&&parseInt(d[2])===calMonth)evDates.add(parseInt(d[3]));}
    // NPC + user/bot birthdays
    const allBDs=[...Object.entries(lastState.npcs).map(([,n])=>n.birthday).filter(Boolean)];
    if(settings.userBirthday)allBDs.push(settings.userBirthday);if(settings.botBirthday)allBDs.push(settings.botBirthday);
    for(const bd of allBDs){const d=bd.match(/(?:\d{4}\D+)?(\d{1,2})\D+(\d{1,2})$/);if(d&&parseInt(d[1])===calMonth)bdDates.add(parseInt(d[2]));}
    for(const a of lastState.agenda){const d=a.date?.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(d&&parseInt(d[1])===calYear&&parseInt(d[2])===calMonth)agDates.add(parseInt(d[3]));}
    let storyDay=0;const stM=lastState.time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(stM&&parseInt(stM[1])===calYear&&parseInt(stM[2])===calMonth)storyDay=parseInt(stM[3]);
    for(let i=0;i<startWd;i++)$grid.append('<div class="chr-calendar__day other-month"></div>');
    for(let d=1;d<=days;d++){
        let cls='chr-calendar__day';if(d===storyDay)cls+=' today';let dots='';
        if(evDates.has(d))dots+='<span style="width:4px;height:4px;border-radius:50%;background:var(--chr-warning);display:inline-block;"></span>';
        if(bdDates.has(d))dots+='<span style="width:4px;height:4px;border-radius:50%;background:var(--chr-accent);display:inline-block;"></span>';
        if(agDates.has(d))dots+='<span style="width:4px;height:4px;border-radius:50%;background:var(--chr-info);display:inline-block;"></span>';
        $grid.append(`<div class="${cls}" data-day="${d}"><span>${d}</span><div style="display:flex;gap:2px;justify-content:center;margin-top:1px;">${dots}</div></div>`);
    }
    // Agenda list
    const $ag=$('#chr-agenda-list').empty();
    if(lastState.agenda.length)for(const a of lastState.agenda)$ag.append(`<div class="chr-glass-card" style="padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-circle-check" style="color:var(--chr-info);"></i><div style="flex:1;"><div style="font-size:12px;color:var(--chr-text);">${esc(a.text)}</div>${a.date?`<div style="font-size:10px;color:var(--chr-text-dim);">${esc(a.date)}</div>`:''}</div></div>`);
    else $ag.append('<div class="chr-empty"><i class="fa-solid fa-list-check"></i>Нет задач</div>');
}

// ── Tabs & Buttons ──
function initTabs(){$(document).on('click','.chr-tab',function(){const t=$(this).data('tab');if(!t)return;$('.chr-tab').removeClass('active');$(this).addClass('active');$('.chr-tab-content').removeClass('active');$(`#chr-tab-${t}`).addClass('active');});}
function initButtons(){
    $(document).on('click','#chr-btn-refresh',()=>{onChatChanged();if(window.toastr)toastr.success('Обновлено','Chronicle');});
    $(document).on('click','#chr-cal-prev',()=>{calMonth--;if(calMonth<1){calMonth=12;calYear--;}refreshCalendar();});
    $(document).on('click','#chr-cal-next',()=>{calMonth++;if(calMonth>12){calMonth=1;calYear++;}refreshCalendar();});
    $(document).on('click','#chr-agenda-add',()=>{const text=prompt('Текст задачи:');if(!text)return;const date=prompt('Дата (ГГГГ/М/Д, или пусто):')||'';lastState.agenda.push({date,text,done:false});refreshCalendar();if(window.toastr)toastr.success('Добавлено','Chronicle');});
}
async function getTemplate(name){try{return await renderExtensionTemplateAsync(TEMPLATE_PATH,name);}catch(e){console.warn(`[Chronicle] Template "${name}" failed:`,e.message);return '';}}

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
jQuery(async()=>{
    console.log(`[Chronicle] Loading v${VERSION}...`);
    try{
        await initNavbarFunction();loadSettings();ensureRegexRules();
        const html=await getTemplate('drawer');if(!html){console.error('[Chronicle] No drawer');return;}
        $('#extensions-settings-button').after(html);
        await initDrawer();initTabs();initButtons();initSettingsEvents();
        // Event subscriptions
        if(event_types.CHARACTER_MESSAGE_RENDERED)eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED,onMessageReceived);
        if(event_types.CHAT_CHANGED)eventSource.on(event_types.CHAT_CHANGED,onChatChanged);
        if(event_types.CHAT_COMPLETION_PROMPT_READY)eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY,onPromptReady);
        if(event_types.MESSAGE_SWIPED)eventSource.on(event_types.MESSAGE_SWIPED,()=>{lastState=aggregateState();refreshAllDisplays();});
        if(event_types.MESSAGE_DELETED)eventSource.on(event_types.MESSAGE_DELETED,()=>{lastState=aggregateState();refreshAllDisplays();});
        onChatChanged();syncSettingsUI();
        console.log(`[Chronicle] v${VERSION} loaded! ✓`);
    }catch(err){console.error('[Chronicle] Init failed:',err);}
});
