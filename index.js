/**
 * Chronicle — Хроники Мира v0.1.0
 * Один файл — все парсеры, состояние, UI.
 */

import { renderExtensionTemplateAsync, getContext, extension_settings } from '/scripts/extensions.js';
import { getSlideToggleOptions, saveSettingsDebounced, eventSource, event_types } from '/script.js';
import { slideToggle } from '/lib.js';

const EXT_NAME = 'chronicle';
const VERSION = '0.1.0';
const _scriptUrl = import.meta.url;
const _extMatch = _scriptUrl.match(/\/scripts\/extensions\/(third-party\/[^/]+)\//);
const EXT_FOLDER = _extMatch ? _extMatch[1] : 'third-party/SillyTavern-Chronicle';
const TEMPLATE_PATH = `${EXT_FOLDER}/assets/templates`;
console.log(`[Chronicle] Folder: ${EXT_FOLDER}`);

// ── Navbar (точная копия паттерна Horae) ──
let doNavbarIconClick = null;
function isNewNavbarVersion() { return typeof doNavbarIconClick === 'function'; }
async function initNavbarFunction() {
    try {
        const m = await import('/script.js');
        if (m.doNavbarIconClick) doNavbarIconClick = m.doNavbarIconClick;
    } catch (_) {}
}
function openDrawerLegacy() {
    const icon = $('#chronicle_drawer_icon'), content = $('#chronicle_drawer_content');
    if (icon.hasClass('closedIcon')) {
        $('.openDrawer').not('#chronicle_drawer_content').not('.pinnedOpen').addClass('resizing').each((_, el) => {
            slideToggle(el, { ...getSlideToggleOptions(), onAnimationEnd: e => e.closest('.drawer-content')?.classList.remove('resizing') });
        });
        $('.openIcon').not('#chronicle_drawer_icon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');
        $('.openDrawer').not('#chronicle_drawer_content').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');
        icon.toggleClass('closedIcon openIcon');
        content.toggleClass('closedDrawer openDrawer');
        content.addClass('resizing').each((_, el) => {
            slideToggle(el, { ...getSlideToggleOptions(), onAnimationEnd: e => e.closest('.drawer-content')?.classList.remove('resizing') });
        });
    } else {
        icon.toggleClass('openIcon closedIcon');
        content.toggleClass('openDrawer closedDrawer');
        content.addClass('resizing').each((_, el) => {
            slideToggle(el, { ...getSlideToggleOptions(), onAnimationEnd: e => e.closest('.drawer-content')?.classList.remove('resizing') });
        });
    }
}
async function initDrawer() {
    const toggle = $('#chronicle_drawer .drawer-toggle');
    if (isNewNavbarVersion()) {
        toggle.on('click', doNavbarIconClick);
    } else {
        $('#chronicle_drawer_content').attr('data-slide-toggle', 'hidden').css('display', 'none');
        toggle.on('click', openDrawerLegacy);
    }
}

// ── Settings ──
const DEFAULT_SETTINGS = { enabled: true, autoParse: true, injectContext: true, customSystemPrompt: '' };
let settings = {};
function loadSettings() {
    settings = extension_settings[EXT_NAME] ? { ...DEFAULT_SETTINGS, ...extension_settings[EXT_NAME] } : { ...DEFAULT_SETTINGS };
    extension_settings[EXT_NAME] = settings;
}
function saveSettings() { extension_settings[EXT_NAME] = settings; saveSettingsDebounced(); }

// ── Regex Rules ──
const TAG_NAMES = [
    { id:'chr_world', pat:'<world>[\\s\\S]*?</world>' }, { id:'chr_event', pat:'<event>[\\s\\S]*?</event>' },
    { id:'chr_sims', pat:'<sims>[\\s\\S]*?</sims>' }, { id:'chr_health', pat:'<health>[\\s\\S]*?</health>' },
    { id:'chr_cycle', pat:'<cycle>[\\s\\S]*?</cycle>' }, { id:'chr_diary', pat:'<diary>[\\s\\S]*?</diary>' },
    { id:'chr_wallet', pat:'<wallet>[\\s\\S]*?</wallet>' }, { id:'chr_npc', pat:'<npc>[\\s\\S]*?</npc>' },
    { id:'chr_agenda', pat:'<agenda-?>[\\s\\S]*?</agenda-?>' }, { id:'chr_location', pat:'<location>[\\s\\S]*?</location>' },
    { id:'chr_item', pat:'<item-?>[\\s\\S]*?</item-?>' }, { id:'chr_affect', pat:'<affection>[\\s\\S]*?</affection>' },
];
function ensureRegexRules() {
    try {
        const scripts = getContext()?.extensionSettings?.regex;
        if (!scripts || !Array.isArray(scripts)) return;
        const existing = new Set(scripts.map(r => r.id));
        for (const t of TAG_NAMES) {
            if (existing.has(t.id)) continue;
            scripts.push({ id: t.id, scriptName: `Chronicle — ${t.id}`, findRegex: `/${t.pat}/gim`, replaceString: '', trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: true, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null });
        }
    } catch (_) {}
}

// ══════════════════════════════════════
// TAG PARSING — все теги
// ══════════════════════════════════════

function hasChronicleData(msg) {
    return msg ? /<(?:world|event|sims|health|cycle|diary|wallet|npc|agenda|location|item|affection)>/i.test(msg) : false;
}
function pl(c) { return c.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')); }
function kv(line) { const i = line.indexOf(':'); return i > 0 ? { k: line.substring(0, i).trim().toLowerCase(), v: line.substring(i+1).trim() } : null; }

function parseMessage(message) {
    if (!message) return null;
    const R = { world:null, events:[], sims:{}, health:null, cycle:null, diary:[], wallet:null, npcs:{}, agenda:[], agendaDel:[], affection:{}, items:[], itemsDel:[] };
    let has = false, m;

    // <world>
    const wRx = /<world>([\s\S]*?)<\/world>/gi;
    while ((m = wRx.exec(message))) {
        const w = { time:'', location:'', weather:'', atmosphere:'', characters:[], costumes:{} };
        for (const l of pl(m[1])) { const p = kv(l); if (!p) continue;
            if (p.k==='time') w.time=p.v; else if (p.k==='location') w.location=p.v;
            else if (p.k==='weather') w.weather=p.v; else if (p.k==='atmosphere') w.atmosphere=p.v;
            else if (p.k==='characters') w.characters=p.v.split(/[,，]/).map(c=>c.trim()).filter(Boolean);
            else if (p.k==='costume') { const eq=p.v.indexOf('='); if(eq>0) w.costumes[p.v.substring(0,eq).trim()]=p.v.substring(eq+1).trim(); }
        }
        R.world = w; has = true;
    }

    // <event>
    const eRx = /<event>([\s\S]*?)<\/event>/gi;
    while ((m = eRx.exec(message))) {
        for (const l of pl(m[1])) {
            const pipe = l.indexOf('|');
            R.events.push(pipe > 0 ? { level: l.substring(0,pipe).trim(), summary: l.substring(pipe+1).trim() } : { level:'обычное', summary:l });
        }
        has = true;
    }

    // <sims> — мульти-персонаж: "Даниил.hunger:65|reason" или "hunger:65"
    const sRx = /<sims>([\s\S]*?)<\/sims>/gi;
    while ((m = sRx.exec(message))) {
        for (const l of pl(m[1])) {
            const p = kv(l); if (!p) continue;
            const STATS = ['hunger','hygiene','sleep','arousal'];
            let charName = '_default', statKey = p.k;
            const dotIdx = p.k.indexOf('.');
            if (dotIdx > 0) { charName = p.k.substring(0, dotIdx); statKey = p.k.substring(dotIdx+1); }
            if (!STATS.includes(statKey)) continue;
            const pipe = p.v.indexOf('|');
            const valStr = pipe > 0 ? p.v.substring(0,pipe).trim() : p.v;
            const reason = pipe > 0 ? p.v.substring(pipe+1).trim() : '';
            const num = parseFloat(valStr);
            if (isNaN(num)) continue;
            if (!R.sims[charName]) R.sims[charName] = {};
            R.sims[charName][statKey] = { value: Math.max(0,Math.min(100,Math.round(num))), reason };
        }
        has = true;
    }

    // <health>
    const hRx = /<health>([\s\S]*?)<\/health>/gi;
    while ((m = hRx.exec(message))) {
        const h = { hp:null, intoxication:null, injuries:[], habits:[] };
        for (const l of pl(m[1])) { const p = kv(l); if (!p) continue;
            if (p.k==='hp') { const n=parseFloat(p.v); if(!isNaN(n)) h.hp=Math.max(0,Math.min(100,Math.round(n))); }
            else if (p.k==='intoxication') {
                const pipe=p.v.indexOf('|'); const vs=pipe>0?p.v.substring(0,pipe).trim():p.v;
                const n=parseFloat(vs); if(!isNaN(n)) h.intoxication={ value:Math.max(0,Math.min(100,Math.round(n))), reason:pipe>0?p.v.substring(pipe+1).trim():'' };
            }
            else if (p.k==='injury') { const pts=p.v.split('|').map(x=>x.trim()); if(pts[0]) h.injuries.push({ name:pts[0], severity:pts[1]||'лёгкий' }); }
            else if (p.k==='habit') { const pts=p.v.split('|').map(x=>x.trim()); if(pts[0]) h.habits.push({ name:pts[0], detail:pts[1]||'' }); }
        }
        R.health = h; has = true;
    }

    // <cycle>
    const cRx = /<cycle>([\s\S]*?)<\/cycle>/gi;
    while ((m = cRx.exec(message))) {
        const c = { day:null, phase:'', symptoms:'' };
        for (const l of pl(m[1])) { const p = kv(l); if (!p) continue;
            if (p.k==='day'){const n=parseInt(p.v);if(!isNaN(n))c.day=n;} else if(p.k==='phase')c.phase=p.v; else if(p.k==='symptoms')c.symptoms=p.v;
        }
        R.cycle = c; has = true;
    }

    // <diary>
    const dRx = /<diary>([\s\S]*?)<\/diary>/gi;
    while ((m = dRx.exec(message))) {
        for (const l of pl(m[1])) { const pipe=l.indexOf('|'); if(pipe>0) R.diary.push({ author:l.substring(0,pipe).trim(), text:l.substring(pipe+1).trim() }); }
        has = true;
    }

    // <wallet>
    const wlRx = /<wallet>([\s\S]*?)<\/wallet>/gi;
    while ((m = wlRx.exec(message))) {
        const w = { balance:null, transactions:[] };
        for (const l of pl(m[1])) { const p = kv(l); if(!p) continue;
            if (p.k==='balance') { const mt=p.v.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(.*)/); if(mt) w.balance={ amount:parseFloat(mt[1].replace(',','.')), currency:mt[2]||'₽' }; }
            else if (p.k==='spend') { const pts=p.v.split('|').map(x=>x.trim()); if(pts.length>=2){ const mt=pts[1].match(/^(\d+(?:\.\d+)?)\s*(.*)/); if(mt) w.transactions.push({ type:'spend', category:pts[0], amount:parseFloat(mt[1]), currency:mt[2]||'₽', note:pts[2]||'' }); } }
            else if (p.k==='income') { const pts=p.v.split('|').map(x=>x.trim()); const mt=pts[0].match(/^(\d+(?:\.\d+)?)\s*(.*)/); if(mt) w.transactions.push({ type:'income', category:'доход', amount:parseFloat(mt[1]), currency:mt[2]||'₽', note:pts[1]||'' }); }
        }
        R.wallet = w; has = true;
    }

    // <npc>
    const nRx = /<npc>([\s\S]*?)<\/npc>/gi;
    while ((m = nRx.exec(message))) {
        for (const l of pl(m[1])) {
            const pts = l.split('|').map(x=>x.trim()); if(pts.length<2) continue;
            const name = pts[0], info = {};
            for (let i=1;i<pts.length;i++) {
                const eq=pts[i].indexOf('='), col=pts[i].indexOf(':');
                let k,v;
                if(eq>0&&(col<0||eq<col)){k=pts[i].substring(0,eq).trim().toLowerCase();v=pts[i].substring(eq+1).trim();}
                else if(col>0){k=pts[i].substring(0,col).trim().toLowerCase();v=pts[i].substring(col+1).trim();}
                else continue;
                if(k==='внешность'||k==='appearance')info.appearance=v;
                else if(k==='характер'||k==='personality')info.personality=v;
                else if(k==='отношение'||k==='relation')info.relation=v;
                else if(k==='пол'||k==='gender')info.gender=v;
                else if(k==='возраст'||k==='age'){const n=parseInt(v);if(!isNaN(n))info.age=n;}
                else if(k==='день_рождения'||k==='birthday'||k==='др')info.birthday=v;
                else info[k]=v;
            }
            R.npcs[name] = info; has = true;
        }
    }

    // <affection>
    const aRx = /<affection>([\s\S]*?)<\/affection>/gi;
    while ((m = aRx.exec(message))) {
        for (const l of pl(m[1])) {
            const eq=l.indexOf('='); if(eq<=0)continue;
            const name=l.substring(0,eq).trim(), rest=l.substring(eq+1).trim();
            const pipe=rest.indexOf('|'); const vs=pipe>0?rest.substring(0,pipe).trim():rest;
            const reason=pipe>0?rest.substring(pipe+1).trim():'';
            const num=parseFloat(vs); if(isNaN(num))continue;
            R.affection[name]={ type:vs.startsWith('+')||vs.startsWith('-')?'relative':'absolute', value:num, reason };
        }
        has = true;
    }

    // <agenda> / <agenda->
    const agRx = /<agenda>([\s\S]*?)<\/agenda>/gi;
    while ((m = agRx.exec(message))) { for (const l of pl(m[1])) { const pipe=l.indexOf('|'); R.agenda.push(pipe>0?{ date:l.substring(0,pipe).trim(), text:l.substring(pipe+1).trim() }:{ date:'', text:l }); } has=true; }
    const agdRx = /<agenda->([\s\S]*?)<\/agenda->/gi;
    while ((m = agdRx.exec(message))) { for (const l of pl(m[1])) if(l) R.agendaDel.push(l); has=true; }

    return has ? R : null;
}

// ══════════════════════════════════════
// STATE AGGREGATION
// ══════════════════════════════════════

function createState() {
    return {
        time:'', location:'', weather:'', atmosphere:'', characters:[], costumes:{},
        events:[], sims:{}, // sims: { charName: { hunger:70, ... } }
        hp:100, intoxication:{ value:0, reason:'' }, injuries:[], habits:[],
        cycle:{ day:null, phase:'', symptoms:'' },
        diary:[], wallet:{ balance:0, currency:'₽', transactions:[], categories:{} },
        npcs:{}, affection:{}, agenda:[], items:{},
    };
}
let lastState = createState();
let calYear = 2026, calMonth = 3;

function aggregateState() {
    const chat = getContext()?.chat || [];
    const S = createState();
    for (let i = 0; i < chat.length; i++) {
        const M = chat[i].chronicle_meta; if (!M) continue;
        // world
        if (M.world) {
            if(M.world.time)S.time=M.world.time; if(M.world.location)S.location=M.world.location;
            if(M.world.weather)S.weather=M.world.weather; if(M.world.atmosphere)S.atmosphere=M.world.atmosphere;
            if(M.world.characters?.length)S.characters=[...M.world.characters];
            if(M.world.costumes) Object.assign(S.costumes, M.world.costumes);
        }
        // events
        if(M.events?.length) for(const ev of M.events) S.events.push({...ev,time:M.world?.time||'',msgId:i});
        // sims (multi-char)
        if(M.sims) for(const [charName,stats] of Object.entries(M.sims)) {
            if(!S.sims[charName]) S.sims[charName]={hunger:70,hygiene:70,sleep:70,arousal:15};
            for(const [k,v] of Object.entries(stats)) S.sims[charName][k]=v.value;
        }
        // health
        if(M.health) {
            if(M.health.hp!==null)S.hp=M.health.hp;
            if(M.health.intoxication)S.intoxication=M.health.intoxication;
            for(const inj of M.health.injuries){const ex=S.injuries.find(x=>x.name.toLowerCase()===inj.name.toLowerCase());if(ex)ex.severity=inj.severity;else S.injuries.push({...inj});}
            for(const hab of M.health.habits){const ex=S.habits.find(x=>x.name.toLowerCase()===hab.name.toLowerCase());if(ex)ex.detail=hab.detail;else S.habits.push({...hab});}
        }
        // cycle
        if(M.cycle){if(M.cycle.day!==null)S.cycle.day=M.cycle.day;if(M.cycle.phase)S.cycle.phase=M.cycle.phase;if(M.cycle.symptoms)S.cycle.symptoms=M.cycle.symptoms;}
        // diary
        if(M.diary?.length) for(const d of M.diary) S.diary.push({...d,time:M.world?.time||'',msgId:i});
        // wallet
        if(M.wallet){if(M.wallet.balance)S.wallet.balance=M.wallet.balance.amount;for(const tx of(M.wallet.transactions||[]))S.wallet.transactions.push({...tx,date:M.world?.time||''});}
        // npcs
        if(M.npcs) for(const [n,info] of Object.entries(M.npcs)){if(!S.npcs[n])S.npcs[n]={};for(const[k,v] of Object.entries(info))if(v!==undefined&&v!=='')S.npcs[n][k]=v;}
        // affection
        if(M.affection) for(const [n,d] of Object.entries(M.affection)){if(!S.affection[n])S.affection[n]={value:0,reason:''};if(d.type==='absolute')S.affection[n].value=d.value;else S.affection[n].value+=d.value;if(d.reason)S.affection[n].reason=d.reason;}
        // agenda
        if(M.agendaDel?.length) for(const del of M.agendaDel) S.agenda=S.agenda.filter(a=>!a.text.toLowerCase().includes(del.toLowerCase()));
        if(M.agenda?.length) for(const a of M.agenda) if(!S.agenda.some(x=>x.text===a.text)) S.agenda.push({...a,done:false});
    }
    // Установить год/месяц календаря из текущего времени сюжета
    if(S.time){const mt=S.time.match(/(\d{4})\D+(\d{1,2})/);if(mt){calYear=parseInt(mt[1]);calMonth=parseInt(mt[2]);}}
    return S;
}

// ══════════════════════════════════════
// EVENT HANDLERS
// ══════════════════════════════════════

function onMessageReceived(msgIdx) {
    if(!settings.enabled)return;
    const chat=getContext()?.chat; if(!chat||msgIdx<0||msgIdx>=chat.length)return;
    if(!hasChronicleData(chat[msgIdx].mes))return;
    const parsed=parseMessage(chat[msgIdx].mes);
    if(parsed){chat[msgIdx].chronicle_meta=parsed;console.log(`[Chronicle] Parsed #${msgIdx}`);}
    lastState=aggregateState(); refreshAllDisplays(); getContext().saveChat?.();
}
function onChatChanged() {
    if(!settings.enabled)return;
    const chat=getContext()?.chat||[];
    for(let i=0;i<chat.length;i++) if(!chat[i].chronicle_meta&&chat[i].mes&&hasChronicleData(chat[i].mes)){const p=parseMessage(chat[i].mes);if(p)chat[i].chronicle_meta=p;}
    lastState=aggregateState(); refreshAllDisplays();
}

// ══════════════════════════════════════
// UI CONFIG
// ══════════════════════════════════════

const SIMS_CFG = {
    hunger:  { name:'Голод',       icon:'fa-utensils', color:'#f59e0b' },
    hygiene: { name:'Гигиена',     icon:'fa-shower',   color:'#60a5fa' },
    sleep:   { name:'Сон',         icon:'fa-bed',      color:'#a78bfa' },
    arousal: { name:'Возбуждение', icon:'fa-fire',     color:'#ec4899' },
};
const MONTHS_RU = ['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function esc(s) { const d=document.createElement('div');d.textContent=s;return d.innerHTML; }

// ══════════════════════════════════════
// REFRESH ALL DISPLAYS
// ══════════════════════════════════════

function refreshAllDisplays() {
    refreshStatus();
    refreshSims();
    refreshHealth();
    refreshTimeline();
    refreshCharacters();
    refreshItems();
    refreshCalendar();
}

function refreshStatus() {
    $('#chr-current-date').text(lastState.time || '--/--');
    $('#chr-current-weather').text(lastState.weather || '');
    $('#chr-current-location').text(lastState.location || 'Не задано');
    $('#chr-current-atmosphere').text(lastState.atmosphere || '');

    // Мини-симсы на вкладке статус — показать первого персонажа
    const charNames = Object.keys(lastState.sims);
    const first = charNames[0] ? lastState.sims[charNames[0]] : null;
    if (first) {
        for (const key of Object.keys(SIMS_CFG)) {
            const val = first[key] ?? 70;
            $(`#chr-mini-sims .chr-sim-bar[data-stat="${key}"]`).each(function() {
                $(this).find('.chr-sim-bar__fill').css('width',`${val}%`).css('background-color',SIMS_CFG[key].color).toggleClass('low',val<20);
                $(this).find('.chr-sim-bar__value').text(val);
            });
        }
    }

    // Наряды
    const $cos = $('#chr-costumes-quick').empty();
    const cosEntries = Object.entries(lastState.costumes);
    if (cosEntries.length) {
        for (const [char, desc] of cosEntries) {
            $cos.append(`<div style="margin-bottom:4px;"><span style="color:var(--chr-accent);font-weight:600;font-size:12px;">${esc(char)}:</span> <span style="font-size:11px;color:var(--chr-text-muted);">${esc(desc)}</span></div>`);
        }
    } else {
        $cos.append('<div class="chr-empty">Нет данных</div>');
    }
}

function refreshSims() {
    const $cont = $('#chr-sims-chars').empty();
    const charNames = Object.keys(lastState.sims);

    if (!charNames.length) {
        $cont.append('<div class="chr-empty"><i class="fa-solid fa-heart-pulse"></i>Нет данных</div>');
        return;
    }

    for (const charName of charNames) {
        const stats = lastState.sims[charName];
        const displayName = charName === '_default' ? (getContext()?.name2 || 'Персонаж') : charName;

        let barsHtml = '';
        for (const [key, cfg] of Object.entries(SIMS_CFG)) {
            const val = stats[key] ?? 70;
            barsHtml += `
            <div class="chr-sim-bar" data-stat="${key}">
                <i class="chr-sim-bar__icon fa-solid ${cfg.icon}"></i>
                <span class="chr-sim-bar__label">${cfg.name}</span>
                <div class="chr-sim-bar__track"><div class="chr-sim-bar__fill ${val<20?'low':''}" style="width:${val}%;background-color:${cfg.color};"></div></div>
                <span class="chr-sim-bar__value">${val}</span>
            </div>`;
        }

        $cont.append(`
            <div class="chr-glass-card" style="padding:10px 12px;margin-bottom:8px;">
                <div style="font-family:var(--chr-font-display);font-size:13px;font-weight:600;color:var(--chr-accent);margin-bottom:8px;">
                    <i class="fa-solid fa-user"></i> ${esc(displayName)}
                </div>
                <div class="chr-sims-grid">${barsHtml}</div>
            </div>
        `);
    }
}

function refreshHealth() {
    // HP
    $('#chr-hp-value').text(lastState.hp);
    $('#chr-hp-fill').css('width',`${lastState.hp}%`);
    // Intoxication
    const intox = lastState.intoxication?.value||0;
    $('#chr-intox-value').text(intox);
    $('#chr-intox-fill').css('width',`${intox}%`);
    if (lastState.intoxication?.reason) $('#chr-intox-reason').text(lastState.intoxication.reason); else $('#chr-intox-reason').text('');
    // Injuries
    const $inj = $('#chr-injuries-list').empty();
    if (lastState.injuries.length) {
        for (const inj of lastState.injuries) {
            const cls = inj.severity==='тяжёлый'?'severe':inj.severity==='средний'?'medium':'light';
            const tagCls = cls==='severe'?'danger':cls==='medium'?'warning':'info';
            $inj.append(`<div class="chr-injury-item"><div class="chr-injury-item__dot ${cls}"></div><span style="color:var(--chr-text);font-size:12px;">${esc(inj.name)}</span><span class="chr-tag chr-tag--${tagCls}">${esc(inj.severity)}</span></div>`);
        }
    } else $inj.append('<div class="chr-empty"><i class="fa-solid fa-heart-pulse"></i>Травм нет</div>');
    // Habits
    const $hab = $('#chr-habits-list').empty();
    if (lastState.habits.length) {
        for (const h of lastState.habits) $hab.append(`<div class="chr-habit-item"><i class="fa-solid fa-smoking"></i><span>${esc(h.name)}</span><span style="color:var(--chr-text-dim);">${esc(h.detail)}</span></div>`);
    } else $hab.append('<div class="chr-empty"><i class="fa-solid fa-leaf"></i>Нет привычек</div>');
    // Cycle
    if (lastState.cycle.day!==null) { $('#chr-cycle-display').show(); $('#chr-cycle-day').text(`День ${lastState.cycle.day}`); $('#chr-cycle-phase').text(lastState.cycle.phase); $('#chr-cycle-symptoms').text(lastState.cycle.symptoms); }
    else $('#chr-cycle-display').hide();
}

function refreshTimeline() {
    const $tl = $('#chr-timeline-list').empty();
    if (lastState.events.length) {
        for (const ev of lastState.events.slice(-50).reverse())
            $tl.append(`<div class="chr-timeline-item chr-glass-card" data-level="${esc(ev.level)}"><div class="chr-timeline-item__time">${esc(ev.time)}</div><div class="chr-timeline-item__text">${esc(ev.summary)}</div></div>`);
    } else $tl.append('<div class="chr-empty"><i class="fa-solid fa-timeline"></i>Событий пока нет</div>');
}

function refreshCharacters() {
    // Diary
    const $diary = $('#chr-diary-list').empty();
    if (lastState.diary.length) {
        for (const d of lastState.diary.slice(-30).reverse()) {
            $diary.append(`<div class="chr-diary-entry chr-glass-card"><div class="chr-diary-entry__author"><i class="fa-solid fa-feather"></i>${esc(d.author)}</div><div class="chr-diary-entry__text">${esc(d.text)}</div><div class="chr-diary-entry__time">${esc(d.time)}</div></div>`);
        }
    } else $diary.append('<div class="chr-empty"><i class="fa-solid fa-book"></i>Записей нет</div>');

    // NPCs
    const $npc = $('#chr-characters-list').empty();
    const npcNames = Object.keys(lastState.npcs);
    if (npcNames.length) {
        for (const name of npcNames) {
            const npc = lastState.npcs[name];
            const aff = lastState.affection[name];
            const present = lastState.characters.includes(name);
            let tags = '';
            if(npc.gender) tags += `<span class="chr-tag">${esc(npc.gender)}</span>`;
            if(npc.age) tags += `<span class="chr-tag">${npc.age} лет</span>`;
            if(npc.relation) tags += `<span class="chr-tag chr-tag--primary">${esc(npc.relation)}</span>`;
            if(aff){const cls=aff.value>=0?'success':'danger';tags+=`<span class="chr-tag chr-tag--${cls}">♥ ${aff.value>0?'+':''}${aff.value}</span>`;}
            if(present) tags += '<span class="chr-tag chr-tag--accent">в сцене</span>';
            const bdHtml = npc.birthday ? `<div class="chr-npc-card__birthday"><i class="fa-solid fa-cake-candles"></i> ${esc(npc.birthday)}</div>` : '';
            const appearHtml = npc.appearance ? `<div style="font-size:11px;color:var(--chr-text-muted);">${esc(npc.appearance)}</div>` : '';
            $npc.append(`<div class="chr-npc-card chr-glass-card">${bdHtml}<div class="chr-npc-card__header"><div class="chr-npc-card__avatar">${name.charAt(0).toUpperCase()}</div><div><div class="chr-npc-card__name">${esc(name)}</div>${appearHtml}</div></div><div class="chr-npc-card__tags">${tags}</div></div>`);
        }
    } else $npc.append('<div class="chr-empty"><i class="fa-solid fa-users"></i>Персонажей нет</div>');
}

function refreshItems() {
    // Wallet
    $('#chr-wallet-amount').text(lastState.wallet.balance.toLocaleString('ru-RU'));
    const $tx = $('#chr-wallet-transactions').empty();
    for (const tx of lastState.wallet.transactions.slice(-10).reverse()) {
        const sp = tx.type==='spend';
        $tx.append(`<div class="chr-wallet-tx"><div class="chr-wallet-tx__icon ${tx.type}"><i class="fa-solid ${sp?'fa-arrow-down':'fa-arrow-up'}"></i></div><div class="chr-wallet-tx__info"><div class="chr-wallet-tx__category">${esc(tx.category)}</div><div class="chr-wallet-tx__note">${esc(tx.note)}</div></div><div class="chr-wallet-tx__amount ${tx.type}">${sp?'-':'+'}${tx.amount}${tx.currency||'₽'}</div></div>`);
    }
}

// ── Calendar ──

function refreshCalendar() {
    $('#chr-cal-month').text(`${MONTHS_RU[calMonth]} ${calYear}`);
    const $grid = $('#chr-cal-grid').empty();
    const first = new Date(calYear, calMonth-1, 1);
    const days = new Date(calYear, calMonth, 0).getDate();
    let startWd = first.getDay() - 1; if (startWd<0) startWd=6;

    // Собрать даты с событиями
    const eventDates = new Set();
    for (const ev of lastState.events) { const d=ev.time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); if(d&&parseInt(d[1])===calYear&&parseInt(d[2])===calMonth) eventDates.add(parseInt(d[3])); }
    const bdDates = new Set();
    for (const [,npc] of Object.entries(lastState.npcs)) { if(npc.birthday){const d=npc.birthday.match(/(\d{1,2})\D+(\d{1,2})$/);if(d&&parseInt(d[1])===calMonth) bdDates.add(parseInt(d[2]));} }
    const agendaDates = new Set();
    for (const a of lastState.agenda) { const d=a.date?.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); if(d&&parseInt(d[1])===calYear&&parseInt(d[2])===calMonth) agendaDates.add(parseInt(d[3])); }

    // Текущий день сюжета
    let storyDay = 0;
    const stMatch = lastState.time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (stMatch && parseInt(stMatch[1])===calYear && parseInt(stMatch[2])===calMonth) storyDay = parseInt(stMatch[3]);

    // Пустые ячейки до 1-го числа
    for (let i=0;i<startWd;i++) $grid.append('<div class="chr-calendar__day other-month"></div>');

    for (let d=1;d<=days;d++) {
        let cls = 'chr-calendar__day';
        if (d===storyDay) cls += ' today';
        if (eventDates.has(d)) cls += ' has-events';
        if (bdDates.has(d)) cls += ' has-birthday';
        let dots = '';
        if (eventDates.has(d)) dots += '<span style="width:4px;height:4px;border-radius:50%;background:var(--chr-warning);display:inline-block;"></span>';
        if (bdDates.has(d)) dots += '<span style="width:4px;height:4px;border-radius:50%;background:var(--chr-accent);display:inline-block;"></span>';
        if (agendaDates.has(d)) dots += '<span style="width:4px;height:4px;border-radius:50%;background:var(--chr-info);display:inline-block;"></span>';
        $grid.append(`<div class="${cls}" data-day="${d}"><span>${d}</span><div style="display:flex;gap:2px;justify-content:center;margin-top:1px;">${dots}</div></div>`);
    }

    // Agenda list
    const $ag = $('#chr-agenda-list').empty();
    if (lastState.agenda.length) {
        for (const a of lastState.agenda) {
            $ag.append(`<div class="chr-glass-card" style="padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-circle-check" style="color:var(--chr-info);font-size:12px;"></i><div style="flex:1;"><div style="font-size:12px;color:var(--chr-text);">${esc(a.text)}</div>${a.date?`<div style="font-size:10px;color:var(--chr-text-dim);">${esc(a.date)}</div>`:''}</div></div>`);
        }
    } else $ag.append('<div class="chr-empty"><i class="fa-solid fa-list-check"></i>Нет задач</div>');
}

// ── Tabs ──
function initTabs() {
    $(document).on('click', '.chr-tab', function() {
        const tab=$(this).data('tab'); if(!tab)return;
        $('.chr-tab').removeClass('active'); $(this).addClass('active');
        $('.chr-tab-content').removeClass('active'); $(`#chr-tab-${tab}`).addClass('active');
    });
}

// ── Button Handlers ──
function initButtons() {
    // Обновить
    $(document).on('click', '#chr-btn-refresh', () => { onChatChanged(); if(window.toastr) toastr.success('Обновлено','Chronicle'); });
    // Calendar nav
    $(document).on('click', '#chr-cal-prev', () => { calMonth--; if(calMonth<1){calMonth=12;calYear--;} refreshCalendar(); });
    $(document).on('click', '#chr-cal-next', () => { calMonth++; if(calMonth>12){calMonth=1;calYear++;} refreshCalendar(); });
    // Add agenda
    $(document).on('click', '#chr-agenda-add', () => {
        const text = prompt('Текст задачи:');
        if (!text) return;
        const date = prompt('Дата (ГГГГ/М/Д, или пусто):') || '';
        lastState.agenda.push({ date, text, done: false, source: 'user' });
        refreshCalendar();
        if(window.toastr) toastr.success('Задача добавлена','Chronicle');
    });
}

// ── Template ──
async function getTemplate(name) {
    try { return await renderExtensionTemplateAsync(TEMPLATE_PATH, name); } catch(e) { console.warn(`[Chronicle] Template "${name}" failed:`,e.message); return ''; }
}

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════

jQuery(async () => {
    console.log(`[Chronicle] Loading v${VERSION}...`);
    try {
        await initNavbarFunction();
        loadSettings();
        ensureRegexRules();
        const html = await getTemplate('drawer');
        if (!html) { console.error('[Chronicle] No drawer template'); return; }
        $('#extensions-settings-button').after(html);
        await initDrawer();
        initTabs();
        initButtons();
        if(event_types.CHARACTER_MESSAGE_RENDERED) eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
        if(event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
        if(event_types.MESSAGE_SWIPED) eventSource.on(event_types.MESSAGE_SWIPED, ()=>{ lastState=aggregateState(); refreshAllDisplays(); });
        if(event_types.MESSAGE_DELETED) eventSource.on(event_types.MESSAGE_DELETED, ()=>{ lastState=aggregateState(); refreshAllDisplays(); });
        onChatChanged();
        console.log(`[Chronicle] v${VERSION} loaded! ✓`);
    } catch (err) { console.error('[Chronicle] Init failed:', err); }
});
