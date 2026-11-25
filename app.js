/* Miami Art Week 2026 guide
   Reads the event list live from the Google Sheet, so edits to the sheet
   show up on the site the next time the page loads. */

const CONFIG = {
  sheetId: '1-jsDKhBEISPl0HEYBs4Fc2fCG6cwjS1KALVcDbj1oLU',
  tabs: [
    { name: 'Art Shows, Parties & More', free: false },
    { name: 'Free Art Exhibits', free: true }
  ],
  defaultYear: 2026,
  defaultMapQuery: 'Miami Beach Convention Center, Miami Beach, FL',
  picksKey: 'maw2026-picks'
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOOD_ALIASES = { 'downtown miami': 'Downtown', 'miami design district': 'Design District' };

/* ---------- Pure helpers (also used by the tests) ---------- */

function ymd(y, m, d) { return y * 10000 + (m + 1) * 100 + d; }

/* Turns "Dec 2", "Nov 29–Dec 6", "Nov 16–Jan 20, 2027" or
   "Dec 1, 2026–Mar 14, 2027" into a list of [start, end] day numbers. */
function parseDates(text, defaultYear) {
  const year0 = defaultYear || CONFIG.defaultYear;
  const re = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?|(\d{4})|(\d{1,2})|([–—-]|\bto\b|\bthrough\b)/gi;
  const dates = [];
  let month = null, dashPending = false, m;
  while ((m = re.exec(String(text || '')))) {
    if (m[1]) {
      month = MONTHS[m[1].toLowerCase()];
    } else if (m[2]) {
      if (dates.length) { dates[dates.length - 1].y = Number(m[2]); dates[dates.length - 1].explicit = true; }
    } else if (m[3]) {
      const d = Number(m[3]);
      if (month === null || d < 1 || d > 31) continue;
      dates.push({ y: year0, m: month, d: d, explicit: false, joined: dashPending });
      dashPending = false;
    } else if (m[4]) {
      dashPending = dates.length > 0;
    }
  }
  const ranges = [];
  dates.forEach(function (dt) {
    if (dt.joined && ranges.length) {
      const r = ranges[ranges.length - 1];
      let y = dt.y;
      if (!dt.explicit) {
        y = r.startDate.y;
        if (dt.m < r.startDate.m) y += 1;
      }
      r.end = ymd(y, dt.m, dt.d);
    } else {
      ranges.push({ start: ymd(dt.y, dt.m, dt.d), end: ymd(dt.y, dt.m, dt.d), startDate: dt });
    }
  });
  return ranges.filter(function (r) { return r.end >= r.start; })
    .map(function (r) { return [r.start, r.end]; });
}

function cleanHood(value) {
  const v = String(value || '').trim();
  return HOOD_ALIASES[v.toLowerCase()] || v;
}

function isUrl(value) { return /^https?:\/\/\S+$/i.test(String(value || '').trim()); }

function keyFor(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function looksFree(info) {
  return /free admission|free entry|free and open|free public|free museum|free gallery|free immersive|^free\b/i.test(String(info || ''));
}

/* Reads one tab (a grid of text cells) into event records.
   Section titles sit alone in column A, followed by a header row. */
function parseTab(grid, tabIsFree) {
  const events = [];
  let pendingTitle = '', section = '', cols = null;
  grid.forEach(function (row) {
    const a = String(row[0] || '').trim();
    const b = String(row[1] || '').trim();
    if (/^venue/i.test(b)) {
      section = tabIsFree ? 'Art Exhibitions' : (pendingTitle || section || 'Events');
      cols = { name: 1, tickets: -1, date: -1, schedule: -1, hood: -1, address: -1, link: -1, info: -1 };
      row.forEach(function (cell, i) {
        const label = String(cell || '').trim().toLowerCase();
        if (i < 2 || !label) return;
        if (label === 'date') cols.date = i;
        else if (label === 'schedule') cols.schedule = i;
        else if (label === 'neighborhood') cols.hood = i;
        else if (label === 'address') cols.address = i;
        else if (label.indexOf('info') > -1 || label.indexOf('reserv') > -1) cols.info = i;
        else if (label.indexOf('link') > -1 || label.indexOf('ticket') > -1) {
          if (cols.tickets === -1) cols.tickets = i; else if (cols.link === -1) cols.link = i;
        }
      });
      return;
    }
    if (!b) {
      if (a && !/^\d+$/.test(a) && a.charAt(0) !== '*') pendingTitle = a;
      return;
    }
    if (!cols) return;
    const get = function (i) { return i > -1 ? String(row[i] || '').trim() : ''; };
    let name = b, starred = false;
    if (/^\*|\*$/.test(name)) { starred = true; name = name.replace(/^\*+\s*|\s*\*+$/g, ''); }
    const info = get(cols.info);
    const date = get(cols.date);
    events.push({
      key: keyFor(name),
      name: name,
      starred: starred,
      section: section,
      tickets: get(cols.tickets),
      link: get(cols.link),
      date: date,
      ranges: parseDates(date),
      schedule: get(cols.schedule),
      hood: cleanHood(get(cols.hood)),
      address: get(cols.address),
      info: info,
      free: !!tabIsFree || looksFree(info)
    });
  });
  return events;
}

/* Joins the tabs. The free tab repeats some events from the main tab,
   so repeats are merged and simply marked as free. */
function mergeTabs(lists) {
  const byKey = {};
  const out = [];
  lists.forEach(function (list) {
    list.forEach(function (ev) {
      const id = ev.key + '|' + ev.date.toLowerCase();
      if (byKey[id]) {
        if (ev.free) byKey[id].free = true;
        if (ev.starred) byKey[id].starred = true;
        return;
      }
      ev.id = id;
      byKey[id] = ev;
      out.push(ev);
    });
  });
  return out;
}

function hasPlace(ev) {
  return !!ev.address && !/\btbd\b|unconfirmed|to be announced/i.test(ev.address);
}

function mapQuery(ev) {
  return ev.address.split(';')[0].trim();
}

function matches(ev, f, picks) {
  if (f.section === '__free' && !ev.free) return false;
  if (f.section === '__picks' && !picks[ev.id]) return false;
  if (f.section && f.section.indexOf('__') !== 0 && ev.section !== f.section) return false;
  if (f.hood && ev.hood !== f.hood) return false;
  if (f.day && !ev.ranges.some(function (r) { return r[0] <= f.day && f.day <= r[1]; })) return false;
  if (f.q) {
    const hay = (ev.name + ' ' + ev.hood + ' ' + ev.address + ' ' + ev.info + ' ' + ev.schedule).toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; })) return false;
  }
  return true;
}

/* The days of the week itself: taken from the short events (a week or less). */
function weekDays(events) {
  const counts = {};
  events.forEach(function (ev) {
    ev.ranges.forEach(function (r) {
      const s = toDate(r[0]), e = toDate(r[1]);
      if ((e - s) / 864e5 > 9) return;
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const k = ymd(d.getFullYear(), d.getMonth(), d.getDate());
        counts[k] = (counts[k] || 0) + 1;
      }
    });
  });
  return Object.keys(counts).map(Number).filter(function (k) { return counts[k] >= 3; })
    .sort(function (x, y) { return x - y; }).slice(0, 14);
}

function toDate(n) { return new Date(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100); }

function gridFromGviz(response) {
  const rows = (response && response.table && response.table.rows) || [];
  return rows.map(function (r) {
    return (r.c || []).map(function (cell) {
      if (!cell || cell.v === null || cell.v === undefined) return '';
      return String(cell.f !== undefined && cell.f !== null ? cell.f : cell.v);
    });
  });
}

/* Search phrases to try, best first, when looking up an address on the map. */
function geocodeCandidates(address) {
  const full = String(address || '').split(';')[0].replace(/\s+/g, ' ').trim();
  const parts = full.split(',').map(function (p) { return p.trim(); }).filter(Boolean);
  const out = [];
  const add = function (v) { if (v && out.indexOf(v) === -1) out.push(v); };
  const streetAt = parts.findIndex(function (p) { return /^\d+\s+\S/.test(p) && !/^\d{5}$/.test(p); });
  if (streetAt > -1) add(parts.slice(streetAt).join(', ').replace(/\s+(suite|ste|unit|#)\s*[\w-]+/i, ''));
  add(full);
  if (parts.length && streetAt !== 0) {
    const city = /miami beach/i.test(full) ? 'Miami Beach, FL' : 'Miami, FL';
    add(parts[0] + ', ' + city);
    if (parts[0].indexOf('/') > -1) add(parts[0].split('/')[0].trim() + ', ' + city);
  }
  return out;
}

/* Loads one tab through Google's script endpoint, which works from any site. */
function loadTab(tab, index) {
  return new Promise(function (resolve, reject) {
    const cb = '__mawSheet' + index;
    const script = document.createElement('script');
    const timer = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, 20000);
    function cleanup() { clearTimeout(timer); delete window[cb]; script.remove(); }
    window[cb] = function (response) {
      cleanup();
      if (!response || response.status === 'error') reject(new Error('sheet error'));
      else resolve(parseTab(gridFromGviz(response), tab.free));
    };
    script.onerror = function () { cleanup(); reject(new Error('network')); };
    script.src = 'https://docs.google.com/spreadsheets/d/' + CONFIG.sheetId + '/gviz/tq?headers=0&sheet=' +
      encodeURIComponent(tab.name) + '&tqx=' + encodeURIComponent('out:json;responseHandler:' + cb);
    document.head.appendChild(script);
  });
}

function loadEvents() {
  return Promise.all(CONFIG.tabs.map(loadTab)).then(mergeTabs);
}

if (typeof module !== 'undefined') {
  module.exports = { parseDates, parseTab, mergeTabs, matches, weekDays, gridFromGviz, hasPlace, mapQuery, looksFree, cleanHood, geocodeCandidates };
}

/* ---------- Page ---------- */

if (typeof document !== 'undefined' && document.getElementById('list')) (function () {
  const $ = function (id) { return document.getElementById(id); };
  const state = { events: [], filter: { section: '', hood: '', day: 0, q: '' }, picks: {}, selected: null, coords: {}, view: 'list' };
  const wide = window.matchMedia ? window.matchMedia('(min-width: 960px)') : { matches: false };
  let big = null, cluster = null, markers = {}, lastFit = '';

  try { state.picks = JSON.parse(localStorage.getItem(CONFIG.picksKey) || '{}') || {}; } catch (e) { state.picks = {}; }
  function savePicks() { try { localStorage.setItem(CONFIG.picksKey, JSON.stringify(state.picks)); } catch (e) { /* private mode */ } }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function linkify(text) {
    return esc(text).replace(/https?:\/\/[^\s<]+/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener">More info</a>';
    });
  }

  function chip(label, active, onClick, count) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (active ? ' is-on' : '');
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.innerHTML = esc(label) + (count !== undefined ? ' <span class="chip-n">' + count + '</span>' : '');
    b.addEventListener('click', onClick);
    return b;
  }

  function renderFilters() {
    const f = state.filter, ev = state.events;
    const secBox = $('sections');
    secBox.innerHTML = '';
    const sections = [];
    ev.forEach(function (e) { if (sections.indexOf(e.section) === -1) sections.push(e.section); });
    const setSection = function (v) { return function () { f.section = v; render(); }; };
    secBox.appendChild(chip('All', !f.section, setSection(''), ev.length));
    sections.forEach(function (s) {
      secBox.appendChild(chip(s, f.section === s, setSection(s), ev.filter(function (e) { return e.section === s; }).length));
    });
    secBox.appendChild(chip('Free', f.section === '__free', setSection('__free'), ev.filter(function (e) { return e.free; }).length));
    secBox.appendChild(chip('♥ My picks', f.section === '__picks', setSection('__picks'),
      ev.filter(function (e) { return state.picks[e.id]; }).length));

    const dayBox = $('days');
    const keepDay = dayBox.scrollLeft;
    dayBox.innerHTML = '';
    const dayTile = function (top, big, bottom, active, onClick, label) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'day' + (active ? ' is-on' : '');
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
      b.setAttribute('aria-label', label);
      b.innerHTML = '<span class="day-top">' + esc(top) + '</span><span class="day-num">' + esc(big) +
        '</span><span class="day-bot">' + esc(bottom) + '</span>';
      b.addEventListener('click', onClick);
      return b;
    };
    dayBox.appendChild(dayTile('Any', 'All', 'days', !f.day, function () { f.day = 0; render(); }, 'Any day'));
    weekDays(ev).forEach(function (d) {
      const dt = toDate(d);
      const label = DAY_NAMES[dt.getDay()] + ' ' + MONTH_NAMES[dt.getMonth()] + ' ' + dt.getDate();
      dayBox.appendChild(dayTile(DAY_NAMES[dt.getDay()], dt.getDate(), MONTH_NAMES[dt.getMonth()], f.day === d,
        function () { f.day = f.day === d ? 0 : d; render(); }, label));
    });

    dayBox.scrollLeft = keepDay;

    const sel = $('hood');
    const counts = {};
    ev.forEach(function (e) { if (e.hood) counts[e.hood] = (counts[e.hood] || 0) + 1; });
    sel.innerHTML = '';
    const addOption = function (value, label) {
      const o = document.createElement('option');
      o.value = value; o.textContent = label;
      sel.appendChild(o);
    };
    addOption('', 'All neighborhoods');
    Object.keys(counts).sort(function (x, y) { return x.localeCompare(y); }).forEach(function (h) {
      addOption(h, h + ' (' + counts[h] + ')');
    });
    sel.value = f.hood;
    sel.parentNode.classList.toggle('is-on', !!f.hood);
    $('clear').hidden = !(f.section || f.hood || f.day || f.q);
  }

  function card(ev) {
    const el = document.createElement('article');
    el.className = 'card' + (state.selected === ev.id ? ' is-selected' : '');
    el.dataset.id = ev.id;
    const picked = !!state.picks[ev.id];
    const place = hasPlace(ev);
    let actions = '';
    if (isUrl(ev.tickets)) actions += '<a class="btn btn-solid" href="' + esc(ev.tickets) + '" target="_blank" rel="noopener">Tickets / RSVP</a>';
    if (isUrl(ev.link) && ev.link !== ev.tickets) actions += '<a class="btn" href="' + esc(ev.link) + '" target="_blank" rel="noopener">Details</a>';
    if (place) {
      actions += '<button type="button" class="btn" data-act="map">Show on map</button>';
      actions += '<a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(mapQuery(ev)) +
        '" target="_blank" rel="noopener">Directions</a>';
    }
    el.innerHTML =
      '<div class="card-top">' +
        '<div class="card-tags">' +
          '<span class="tag">' + esc(ev.section) + '</span>' +
          (ev.free ? '<span class="tag tag-free">Free</span>' : '') +
          (ev.starred ? '<span class="tag tag-star">\u2605 Favorite</span>' : '') +
        '</div>' +
        '<button type="button" class="pick' + (picked ? ' is-on' : '') + '" data-act="pick" aria-pressed="' + picked +
          '" aria-label="' + (picked ? 'Remove from my picks' : 'Add to my picks') + '">' + (picked ? '\u2665' : '\u2661') + '</button>' +
      '</div>' +
      '<h3>' + esc(ev.name) + '</h3>' +
      '<div class="meta">' +
        '<span class="pill pill-date">' + esc(ev.date || 'Date to be announced') + '</span>' +
        (ev.hood ? '<span class="pill pill-hood">' + esc(ev.hood) + '</span>' : '') +
      '</div>' +
      (ev.schedule ? '<p class="line"><span class="lbl">Hours</span>' + esc(ev.schedule) + '</p>' : '') +
      (ev.address ? '<p class="line"><span class="lbl">Where</span>' + esc(ev.address) + '</p>' : '') +
      (ev.info ? '<p class="info">' + linkify(ev.info) + '</p>' : '') +
      (actions ? '<div class="actions">' + actions + '</div>' : '');
    return el;
  }

  function visible() {
    return state.events.filter(function (e) { return matches(e, state.filter, state.picks); });
  }

  function render() {
    renderFilters();
    const list = $('list'), shown = visible();
    list.innerHTML = '';
    const frag = document.createDocumentFragment();
    shown.forEach(function (ev) { frag.appendChild(card(ev)); });
    list.appendChild(frag);
    $('count').textContent = shown.length + (shown.length === 1 ? ' event' : ' events');
    $('empty').hidden = shown.length > 0;
    $('empty').textContent = state.filter.section === '__picks'
      ? 'No picks yet. Tap the heart on any event to save it here.'
      : 'Nothing matches those filters. Try clearing one.';

    const route = $('route');
    const stops = shown.filter(hasPlace).slice(0, 10).map(mapQuery);
    if (state.filter.section === '__picks' && stops.length > 1) {
      const dest = stops[stops.length - 1];
      route.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) +
        '&waypoints=' + encodeURIComponent(stops.slice(0, -1).join('|'));
      route.hidden = false;
    } else {
      route.hidden = true;
    }
    renderPins(shown);
  }

  /* ---------- Master map: every filtered event as a pin ---------- */

  function hasPins() { return !!big; }

  function initBigMap() {
    if (big || !window.L || !Object.keys(state.coords).length) return;
    document.body.classList.add('has-pins');
    $('bigmap-wrap').hidden = false;
    $('view-toggle').hidden = false;
    big = L.map('bigmap', { zoomControl: true, scrollWheelZoom: true }).setView([25.79, -80.19], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
    }).addTo(big);
    cluster = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 46, spiderfyOnMaxZoom: false,
      iconCreateFunction: function (c) {
        const n = c.getAllChildMarkers().reduce(function (sum, m) { return sum + (m.options.count || 1); }, 0);
        return L.divIcon({ html: '<span>' + n + '</span>', className: 'pin pin-cluster', iconSize: [42, 42] });
      }
    });
    big.addLayer(cluster);
  }

  function popupHtml(group) {
    const first = group[0];
    const q = mapQuery(first);
    let html = '<div class="pop">';
    group.slice(0, 8).forEach(function (ev) {
      html += '<div class="pop-ev"><p class="pop-name">' + esc(ev.name) + '</p>' +
        '<p class="pop-meta"><span class="pop-date">' + esc(ev.date || 'Date to be announced') + '</span>' +
        (ev.schedule ? ' <span>' + esc(ev.schedule) + '</span>' : '') + '</p>' +
        (isUrl(ev.tickets) ? '<a class="pop-link" href="' + esc(ev.tickets) + '" target="_blank" rel="noopener">Tickets / RSVP</a>' : '') +
        '</div>';
    });
    if (group.length > 8) html += '<p class="pop-more">Plus ' + (group.length - 8) + ' more here. Search the list to see them.</p>';
    html += '<p class="pop-addr">' + esc(q) + '</p>' +
      '<a class="btn btn-accent" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q) +
      '" target="_blank" rel="noopener">Directions in Google Maps</a></div>';
    return html;
  }

  function renderPins(shown) {
    if (!hasPins()) return;
    cluster.clearLayers();
    markers = {};
    const groups = {};
    let pinned = 0;
    shown.forEach(function (ev) {
      if (!hasPlace(ev)) return;
      const c = state.coords[mapQuery(ev)];
      if (!c) return;
      const k = c[0].toFixed(5) + ',' + c[1].toFixed(5);
      (groups[k] = groups[k] || { at: c, events: [] }).events.push(ev);
      pinned += 1;
    });
    Object.keys(groups).forEach(function (k) {
      const g = groups[k];
      const many = g.events.length > 1;
      const m = L.marker(g.at, {
        count: g.events.length, title: many ? g.events.length + ' events' : g.events[0].name,
        icon: L.divIcon({ html: many ? '<span>' + g.events.length + '</span>' : '', className: 'pin' + (many ? ' pin-multi' : ''), iconSize: many ? [30, 30] : [18, 18] })
      });
      m.bindPopup(popupHtml(g.events), { maxWidth: 280, minWidth: 220, closeButton: true });
      g.events.forEach(function (ev) { markers[ev.id] = m; });
      cluster.addLayer(m);
    });
    $('pin-note').textContent = pinned === shown.length
      ? pinned + (pinned === 1 ? ' event' : ' events') + ' on the map'
      : pinned + ' of ' + shown.length + ' on the map. The rest have no confirmed address yet.';
    fitPins(false);
  }

  function fitPins(force) {
    if (!hasPins() || !$('bigmap').offsetWidth) return;
    const f = state.filter;
    const sig = [f.section, f.hood, f.day, f.q, Object.keys(markers).length].join('|');
    if (!force && sig === lastFit) return;
    lastFit = sig;
    big.invalidateSize();
    const b = cluster.getBounds();
    if (b.isValid()) big.fitBounds(b.pad(0.12), { maxZoom: 15, animate: false });
  }

  function setView(view) {
    state.view = view;
    document.body.classList.toggle('view-map', view === 'map');
    $('view-list').setAttribute('aria-pressed', view === 'list' ? 'true' : 'false');
    $('view-map').setAttribute('aria-pressed', view === 'map' ? 'true' : 'false');
    if (view === 'map' && hasPins()) {
      big.invalidateSize();
      fitPins(true);
      const top = $('view-toggle').getBoundingClientRect().top + window.pageYOffset - 130;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  function showOnBigMap(ev) {
    const m = markers[ev.id];
    if (!m) return false;
    state.selected = ev.id;
    document.querySelectorAll('.card.is-selected').forEach(function (c) { c.classList.remove('is-selected'); });
    document.querySelectorAll('.card').forEach(function (c) { if (c.dataset.id === ev.id) c.classList.add('is-selected'); });
    cluster.zoomToShowLayer(m, function () { m.openPopup(); });
    return true;
  }

  function select(ev) {
    state.selected = ev.id;
    document.querySelectorAll('.card.is-selected').forEach(function (c) { c.classList.remove('is-selected'); });
    document.querySelectorAll('.card').forEach(function (c) { if (c.dataset.id === ev.id) c.classList.add('is-selected'); });
    const q = mapQuery(ev);
    $('map').src = 'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&z=15&output=embed';
    $('map-title').textContent = ev.name;
    $('map-sub').textContent = [ev.date, ev.address].filter(Boolean).join(' · ');
    $('map-open').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
    $('map-dir').href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q);
    $('map-links').hidden = false;
    $('map-panel').classList.add('is-open');
  }

  function wire() {
    $('list').addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      const cardEl = e.target.closest('.card');
      if (!cardEl) return;
      const ev = state.events.find(function (x) { return x.id === cardEl.dataset.id; });
      if (!ev) return;
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'pick') {
        if (state.picks[ev.id]) delete state.picks[ev.id]; else state.picks[ev.id] = 1;
        savePicks();
        render();
        return;
      }
      if (hasPins() && wide.matches) { showOnBigMap(ev); return; }
      if (hasPlace(ev)) select(ev);
    });
    let t;
    $('q').addEventListener('input', function (e) {
      clearTimeout(t);
      const v = e.target.value.trim();
      t = setTimeout(function () { state.filter.q = v; render(); }, 120);
    });
    $('hood').addEventListener('change', function (e) { state.filter.hood = e.target.value; render(); });
    $('view-list').addEventListener('click', function () { setView('list'); });
    $('view-map').addEventListener('click', function () { setView('map'); });
    $('map-close').addEventListener('click', function () { $('map-panel').classList.remove('is-open'); });
    $('clear').addEventListener('click', function () {
      state.filter = { section: '', hood: '', day: 0, q: '' };
      $('q').value = '';
      render();
    });
  }

  function start() {
    wire();
    $('map').src = 'https://www.google.com/maps?q=' + encodeURIComponent(CONFIG.defaultMapQuery) + '&z=12&output=embed';
    const coordsReady = fetch('coords.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    Promise.all([loadEvents(), coordsReady]).then(function (res) {
      state.events = res[0];
      state.coords = res[1] || {};
      $('loading').hidden = true;
      if (!state.events.length) throw new Error('empty');
      $('controls').hidden = false;
      initBigMap();
      render();
    }).catch(function () {
      $('loading').hidden = true;
      $('error').hidden = false;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
