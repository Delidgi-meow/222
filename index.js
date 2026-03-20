/**
 * Chronicle — Хроники Мира
 * Модульное расширение для отслеживания RP-мира.
 * 
 * Автор: kissa
 * Версия: 0.1.0
 * 
 * Один файл — никаких внутренних ES-импортов, чтобы не было тихих 404.
 */

import { renderExtensionTemplateAsync, getContext, extension_settings } from '/scripts/extensions.js';
import { getSlideToggleOptions, saveSettingsDebounced, eventSource, event_types } from '/script.js';
import { slideToggle } from '/lib.js';

// ============================================
// Константы
// ============================================

const EXT_NAME = 'chronicle';
const VERSION = '0.1.0';

// Авто-определение папки расширения
const _scriptUrl = import.meta.url;
const _extMatch = _scriptUrl.match(/\/scripts\/extensions\/(third-party\/[^/]+)\//);
const EXT_FOLDER = _extMatch ? _extMatch[1] : 'third-party/SillyTavern-Chronicle';
const TEMPLATE_PATH = `${EXT_FOLDER}/assets/templates`;

console.log(`[Chronicle] Detected folder: ${EXT_FOLDER}`);

// ============================================
// Navbar / Drawer (по паттерну Horae)
// ============================================

let doNavbarIconClick = null;

function isNewNavbarVersion() {
    return typeof doNavbarIconClick === 'function';
}

async function initNavbarFunction() {
    try {
        const scriptModule = await import('/script.js');
        if (scriptModule.doNavbarIconClick) {
            doNavbarIconClick = scriptModule.doNavbarIconClick;
        }
    } catch (err) {
        console.warn('[Chronicle] doNavbarIconClick unavailable, using legacy mode');
    }
}

function openDrawerLegacy() {
    const icon = $('#chronicle_drawer_icon');
    const content = $('#chronicle_drawer_content');

    if (icon.hasClass('closedIcon')) {
        // Закрыть другие ящики
        $('.openDrawer').not('#chronicle_drawer_content').not('.pinnedOpen').addClass('resizing').each((_, el) => {
            slideToggle(el, {
                ...getSlideToggleOptions(),
                onAnimationEnd: (elem) => elem.closest('.drawer-content')?.classList.remove('resizing'),
            });
        });
        $('.openIcon').not('#chronicle_drawer_icon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');
        $('.openDrawer').not('#chronicle_drawer_content').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');

        icon.toggleClass('closedIcon openIcon');
        content.toggleClass('closedDrawer openDrawer');

        content.addClass('resizing').each((_, el) => {
            slideToggle(el, {
                ...getSlideToggleOptions(),
                onAnimationEnd: (elem) => elem.closest('.drawer-content')?.classList.remove('resizing'),
            });
        });
    } else {
        icon.toggleClass('openIcon closedIcon');
        content.toggleClass('openDrawer closedDrawer');

        content.addClass('resizing').each((_, el) => {
            slideToggle(el, {
                ...getSlideToggleOptions(),
                onAnimationEnd: (elem) => elem.closest('.drawer-content')?.classList.remove('resizing'),
            });
        });
    }
}

async function initDrawer() {
    const toggle = $('#chronicle_drawer .drawer-toggle');

    if (isNewNavbarVersion()) {
        toggle.on('click', doNavbarIconClick);
        console.log('[Chronicle] Using new navbar mode');
    } else {
        $('#chronicle_drawer_content').attr('data-slide-toggle', 'hidden').css('display', 'none');
        toggle.on('click', openDrawerLegacy);
        console.log('[Chronicle] Using legacy drawer mode');
    }
}

// ============================================
// Настройки
// ============================================

const DEFAULT_SETTINGS = {
    enabled: true,
    autoParse: true,
    injectContext: true,
    showMessagePanel: true,
    contextDepth: 15,
    sendWorld: true,
    sendCostumes: true,
    sendSims: true,
    sendHealth: true,
    sendCycle: true,
    sendItems: true,
    sendWallet: true,
    sendNpcs: true,
    sendAffection: true,
    sendCalendar: true,
    customSystemPrompt: '',
    themeMode: 'dark',
    customCSS: '',
};

let settings = {};
let isInitialized = false;

function loadSettings() {
    if (extension_settings[EXT_NAME]) {
        settings = { ...DEFAULT_SETTINGS, ...extension_settings[EXT_NAME] };
    } else {
        extension_settings[EXT_NAME] = { ...DEFAULT_SETTINGS };
        settings = { ...DEFAULT_SETTINGS };
    }
}

function saveSettings() {
    extension_settings[EXT_NAME] = settings;
    saveSettingsDebounced();
}

// ============================================
// Regex Rules
// ============================================

const TAG_NAMES = [
    { id: 'chr_world',    name: 'Chronicle — <world>',     pat: '<world>[\\s\\S]*?</world>' },
    { id: 'chr_event',    name: 'Chronicle — <event>',     pat: '<event>[\\s\\S]*?</event>' },
    { id: 'chr_sims',     name: 'Chronicle — <sims>',      pat: '<sims>[\\s\\S]*?</sims>' },
    { id: 'chr_health',   name: 'Chronicle — <health>',    pat: '<health>[\\s\\S]*?</health>' },
    { id: 'chr_cycle',    name: 'Chronicle — <cycle>',     pat: '<cycle>[\\s\\S]*?</cycle>' },
    { id: 'chr_diary',    name: 'Chronicle — <diary>',     pat: '<diary>[\\s\\S]*?</diary>' },
    { id: 'chr_wallet',   name: 'Chronicle — <wallet>',    pat: '<wallet>[\\s\\S]*?</wallet>' },
    { id: 'chr_npc',      name: 'Chronicle — <npc>',       pat: '<npc>[\\s\\S]*?</npc>' },
    { id: 'chr_agenda',   name: 'Chronicle — <agenda>',    pat: '<agenda-?>[\\s\\S]*?</agenda-?>' },
    { id: 'chr_location', name: 'Chronicle — <location>',  pat: '<location>[\\s\\S]*?</location>' },
    { id: 'chr_item',     name: 'Chronicle — <item>',      pat: '<item-?>[\\s\\S]*?</item-?>' },
    { id: 'chr_affect',   name: 'Chronicle — <affection>', pat: '<affection>[\\s\\S]*?</affection>' },
];

function ensureRegexRules() {
    try {
        const ctx = getContext();
        const scripts = ctx?.extensionSettings?.regex;
        if (!scripts || !Array.isArray(scripts)) return;

        const existing = new Set(scripts.map(r => r.id || r.scriptName));

        for (const t of TAG_NAMES) {
            if (existing.has(t.id) || existing.has(t.name)) continue;
            scripts.push({
                id: t.id,
                scriptName: t.name,
                description: t.name,
                findRegex: `/${t.pat}/gim`,
                replaceString: '',
                trimStrings: [],
                placement: [2],
                disabled: false,
                markdownOnly: true,
                promptOnly: true,
                runOnEdit: true,
                substituteRegex: 0,
                minDepth: null,
                maxDepth: null,
            });
            console.log(`[Chronicle] Regex added: ${t.id}`);
        }
    } catch (err) {
        console.warn('[Chronicle] Regex setup failed:', err.message);
    }
}

// ============================================
// Tag Parsing (inline)
// ============================================

function hasChronicleData(msg) {
    if (!msg) return false;
    return /<(?:world|event|sims|health|cycle|diary|wallet|npc|agenda|location|item|affection)>/i.test(msg);
}

function parseLines(content) {
    return content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

function parseKV(line) {
    const idx = line.indexOf(':');
    if (idx <= 0) return null;
    return { key: line.substring(0, idx).trim().toLowerCase(), value: line.substring(idx + 1).trim() };
}

function parseMessage(message) {
    if (!message) return null;
    const result = { world: null, events: [], sims: null };
    let has = false;

    // <world>
    const worldRx = /<world>([\s\S]*?)<\/world>/gi;
    let m;
    while ((m = worldRx.exec(message)) !== null) {
        const w = { time: '', location: '', weather: '', atmosphere: '', characters: [], costumes: {} };
        for (const line of parseLines(m[1])) {
            const kv = parseKV(line);
            if (!kv) continue;
            switch (kv.key) {
                case 'time': w.time = kv.value; break;
                case 'location': w.location = kv.value; break;
                case 'weather': w.weather = kv.value; break;
                case 'atmosphere': w.atmosphere = kv.value; break;
                case 'characters': w.characters = kv.value.split(/[,，]/).map(c => c.trim()).filter(Boolean); break;
                case 'costume': {
                    const eq = kv.value.indexOf('=');
                    if (eq > 0) w.costumes[kv.value.substring(0, eq).trim()] = kv.value.substring(eq + 1).trim();
                    break;
                }
            }
        }
        result.world = w;
        has = true;
    }

    // <event>
    const evRx = /<event>([\s\S]*?)<\/event>/gi;
    while ((m = evRx.exec(message)) !== null) {
        for (const line of parseLines(m[1])) {
            const pipe = line.indexOf('|');
            if (pipe > 0) {
                result.events.push({ level: line.substring(0, pipe).trim(), summary: line.substring(pipe + 1).trim() });
            } else if (line.trim()) {
                result.events.push({ level: 'обычное', summary: line.trim() });
            }
        }
        has = true;
    }

    // <sims>
    const simsRx = /<sims>([\s\S]*?)<\/sims>/gi;
    while ((m = simsRx.exec(message)) !== null) {
        const sims = {};
        for (const line of parseLines(m[1])) {
            const kv = parseKV(line);
            if (!kv) continue;
            if (['hunger', 'hygiene', 'sleep', 'arousal'].includes(kv.key)) {
                const pipe = kv.value.indexOf('|');
                const valStr = pipe > 0 ? kv.value.substring(0, pipe).trim() : kv.value;
                const reason = pipe > 0 ? kv.value.substring(pipe + 1).trim() : '';
                const num = parseFloat(valStr);
                if (!isNaN(num)) {
                    sims[kv.key] = { value: Math.max(0, Math.min(100, Math.round(num))), reason };
                }
            }
        }
        result.sims = sims;
        has = true;
    }

    return has ? result : null;
}

// ============================================
// State
// ============================================

let lastState = {
    time: '', location: '', weather: '', atmosphere: '',
    characters: [], costumes: {},
    events: [],
    sims: { hunger: 70, hygiene: 70, sleep: 70, arousal: 15 },
};

function aggregateState() {
    const chat = getContext()?.chat || [];
    const state = {
        time: '', location: '', weather: '', atmosphere: '',
        characters: [], costumes: {},
        events: [],
        sims: { hunger: 70, hygiene: 70, sleep: 70, arousal: 15 },
    };

    for (let i = 0; i < chat.length; i++) {
        const meta = chat[i].chronicle_meta;
        if (!meta) continue;

        if (meta.world) {
            if (meta.world.time) state.time = meta.world.time;
            if (meta.world.location) state.location = meta.world.location;
            if (meta.world.weather) state.weather = meta.world.weather;
            if (meta.world.atmosphere) state.atmosphere = meta.world.atmosphere;
            if (meta.world.characters?.length) state.characters = [...meta.world.characters];
            if (meta.world.costumes) Object.assign(state.costumes, meta.world.costumes);
        }

        if (meta.events?.length) {
            for (const ev of meta.events) {
                state.events.push({ ...ev, time: meta.world?.time || '', messageId: i });
            }
        }

        if (meta.sims) {
            for (const [k, v] of Object.entries(meta.sims)) {
                state.sims[k] = v.value;
            }
        }
    }

    return state;
}

// ============================================
// Event Handlers
// ============================================

function onMessageReceived(msgIdx) {
    if (!settings.enabled || !settings.autoParse) return;
    const chat = getContext()?.chat;
    if (!chat || msgIdx < 0 || msgIdx >= chat.length) return;

    const msg = chat[msgIdx].mes;
    if (!hasChronicleData(msg)) return;

    const parsed = parseMessage(msg);
    if (parsed) {
        chat[msgIdx].chronicle_meta = parsed;
        console.log(`[Chronicle] Parsed msg #${msgIdx}`);
    }

    lastState = aggregateState();
    refreshAllDisplays();
    getContext().saveChat?.();
}

function onChatChanged() {
    if (!settings.enabled) return;

    const chat = getContext()?.chat || [];
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].chronicle_meta && chat[i].mes && hasChronicleData(chat[i].mes)) {
            const parsed = parseMessage(chat[i].mes);
            if (parsed) chat[i].chronicle_meta = parsed;
        }
    }

    lastState = aggregateState();
    refreshAllDisplays();
}

// ============================================
// UI Refresh
// ============================================

const SIMS_CONFIG = {
    hunger:  { name: 'Голод',       icon: 'fa-utensils', color: '#f59e0b' },
    hygiene: { name: 'Гигиена',     icon: 'fa-shower',   color: '#60a5fa' },
    sleep:   { name: 'Сон',         icon: 'fa-bed',      color: '#a78bfa' },
    arousal: { name: 'Возбуждение', icon: 'fa-fire',     color: '#ec4899' },
};

function refreshAllDisplays() {
    // Статус
    $('#chr-current-date').text(lastState.time || '--/--');
    $('#chr-current-weather').text(lastState.weather || '');
    $('#chr-current-location').text(lastState.location || 'Не задано');
    $('#chr-current-atmosphere').text(lastState.atmosphere || '');

    // Симс бары (и на статусе, и на вкладке симс)
    for (const key of Object.keys(SIMS_CONFIG)) {
        const val = lastState.sims[key] ?? 70;
        const color = SIMS_CONFIG[key].color;
        $(`.chr-sim-bar[data-stat="${key}"]`).each(function () {
            $(this).find('.chr-sim-bar__fill')
                .css('width', `${val}%`)
                .css('background-color', color)
                .toggleClass('low', val < 20);
            $(this).find('.chr-sim-bar__value').text(val);
        });
    }

    // Таймлайн
    const $tl = $('#chr-timeline-list').empty();
    if (lastState.events.length) {
        for (const ev of lastState.events.slice(-50).reverse()) {
            $tl.append(`
                <div class="chr-timeline-item chr-glass-card" data-level="${ev.level}">
                    <div class="chr-timeline-item__time">${ev.time}</div>
                    <div class="chr-timeline-item__text">${ev.summary}</div>
                </div>
            `);
        }
    } else {
        $tl.append('<div class="chr-empty"><i class="fa-solid fa-timeline"></i>Событий пока нет</div>');
    }
}

// ============================================
// Tabs
// ============================================

function initTabs() {
    $(document).on('click', '.chr-tab', function () {
        const tab = $(this).data('tab');
        if (!tab) return;
        $('.chr-tab').removeClass('active');
        $(this).addClass('active');
        $('.chr-tab-content').removeClass('active');
        $(`#chr-tab-${tab}`).addClass('active');
    });
}

// ============================================
// Template
// ============================================

async function getTemplate(name) {
    try {
        return await renderExtensionTemplateAsync(TEMPLATE_PATH, name);
    } catch (err) {
        console.warn(`[Chronicle] Template load failed for "${name}":`, err.message);
        return '';
    }
}

// ============================================
// Init
// ============================================

jQuery(async () => {
    console.log(`[Chronicle] Loading v${VERSION}...`);

    try {
        await initNavbarFunction();
        loadSettings();
        ensureRegexRules();

        const drawerHtml = await getTemplate('drawer');
        if (drawerHtml) {
            $('#extensions-settings-button').after(drawerHtml);
        } else {
            console.error('[Chronicle] Drawer template empty/failed');
            return;
        }

        await initDrawer();
        initTabs();

        // Подписка на события
        if (event_types.CHARACTER_MESSAGE_RENDERED) {
            eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
        }
        if (event_types.CHAT_CHANGED) {
            eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
        }
        if (event_types.MESSAGE_SWIPED) {
            eventSource.on(event_types.MESSAGE_SWIPED, () => {
                lastState = aggregateState();
                refreshAllDisplays();
            });
        }

        // Начальная загрузка
        onChatChanged();

        isInitialized = true;
        console.log(`[Chronicle] v${VERSION} loaded! ✓`);
    } catch (err) {
        console.error('[Chronicle] Init failed:', err);
    }
});
