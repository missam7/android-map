/* localroute.js — مسیریاب داخلی: گراف راه‌های OSM (Overpass) + الگوریتم A* */
(function (root) {
'use strict';
const FM = root.FM;
const Lb = () => root.Lib;
const RAD = Math.PI / 180;
const SPEED = { motorway: 95, trunk: 80, primary: 60, secondary: 50, tertiary: 45, unclassified: 35,
  residential: 30, living_street: 15, service: 20, road: 30,
  motorway_link: 50, trunk_link: 45, primary_link: 40, secondary_link: 35, tertiary_link: 30 };
const EP = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.openstreetmap.ru/api/interpreter'];

async function overpass(q) {
  const Http = Lb() && Lb().Http; let last = null;
  for (const ep of EP) {
    try {
      if (Http) {
        const r = await Http.post({ url: ep, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          data: 'data=' + encodeURIComponent(q), responseType: 'json', connectTimeout: 20000, readTimeout: 90000 });
        if (r.status >= 400) throw new Error('HTTP ' + r.status);
        return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      }
      const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q) });
      if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json();
    } catch (e) { last = e; }
  }
  throw last || new Error('سرور OSM در دسترس نیست');
}

const hv = (a, b) => FM.haversine(a, b);
function bboxOf(o, d) {
  const pad = Math.max(0.02, hv(o, d) / 111320 * 0.35);
  return [Math.min(o.lat, d.lat) - pad, Math.min(o.lng, d.lng) - pad, Math.max(o.lat, d.lat) + pad, Math.max(o.lng, d.lng) + pad];
}
async function buildGraph(o, d) {
  const [s, w, n, e] = bboxOf(o, d);
  const key = `osmgraph/${s.toFixed(2)},${w.toFixed(2)},${n.toFixed(2)},${e.toFixed(2)}`;
  const dec = new TextDecoder(), enc = new TextEncoder();
  let json = null;
  const cached = await FM.tiles.TileCache.get(key);
  if (cached && Date.now() - cached.ts < 14 * 864e5) { try { json = JSON.parse(dec.decode(cached.buf)); } catch (x) { json = null; } }
  if (!json) {
    const q = `[out:json][timeout:80];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road)(_link)?$"]["access"!~"^(private|no)$"](${s},${w},${n},${e});out body geom;`;
    json = await overpass(q);
    try { FM.tiles.TileCache.put(key, enc.encode(JSON.stringify(json)).buffer, 'application/json'); } catch (x) { /* ignore */ }
  }
  const nodes = new Map(), nid = (p) => p.lat.toFixed(6) + ',' + p.lon.toFixed(6);
  const addNode = (p) => { const k = nid(p); let v = nodes.get(k); if (!v) { v = { lat: p.lat, lng: p.lon, e: [] }; nodes.set(k, v); } return v; };
  (json.elements || []).forEach((w2) => {
    if (w2.type !== 'way' || !w2.geometry || w2.geometry.length < 2) return;
    const t = w2.tags || {}, hw = t.highway, base = SPEED[hw] || 30;
    const ms = parseFloat(t.maxspeed); const spd = (isFinite(ms) && ms > 4 ? ms : base) / 3.6;
    const oneway = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || hw === 'motorway';
    const rev = t.oneway === '-1';
    for (let i = 0; i < w2.geometry.length - 1; i++) {
      const a = addNode(w2.geometry[i]), b = addNode(w2.geometry[i + 1]);
      const len = hv(a, b); if (!len) continue;
      const edge = { len, cost: len / spd, name: t.name || t.ref || '' };
      if (!rev) a.e.push(Object.assign({ to: b }, edge));
      if (!oneway || rev) b.e.push(Object.assign({ to: a }, edge));
    }
  });
  if (!nodes.size) throw new Error('در این محدوده راهی پیدا نشد');
  return Array.from(nodes.values());
}
function nearest(g, p) { let b = null, bd = Infinity; for (const n of g) { const d = hv(n, p); if (d < bd) { bd = d; b = n; } } return bd < 2500 ? b : null; }

function Heap() { this.a = []; }
Heap.prototype.push = function (x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } };
Heap.prototype.pop = function () { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; };

function astar(start, goal) {
  const open = new Heap(), gs = new Map(), from = new Map(), MAXSPD = 95 / 3.6;
  const h = (n) => hv(n, goal) / MAXSPD;
  gs.set(start, 0); open.push({ n: start, f: h(start) });
  const done = new Set();
  while (open.a.length) {
    const cur = open.pop().n;
    if (cur === goal) break;
    if (done.has(cur)) continue; done.add(cur);
    for (const ed of cur.e) {
      const ng = gs.get(cur) + ed.cost;
      if (gs.has(ed.to) && ng >= gs.get(ed.to)) continue;
      gs.set(ed.to, ng); from.set(ed.to, { n: cur, ed }); open.push({ n: ed.to, f: ng + h(ed.to) });
    }
  }
  if (!from.has(goal) && start !== goal) return null;
  const path = [], edges = []; let c = goal;
  while (c && c !== start) { const pv = from.get(c); if (!pv) return null; path.push(c); edges.push(pv.ed); c = pv.n; }
  path.push(start); path.reverse(); edges.reverse();
  return { path, edges, duration: gs.get(goal) || 0 };
}
function toSteps(path, edges) {
  const steps = []; let accLen = 0, accDur = 0, name = edges[0] ? edges[0].name : '';
  const brg = (i) => FM.bearing(path[i], path[i + 1]);
  steps.push({ text: 'حرکت کنید' + (name ? ' در ' + name : ''), dist: 0, loc: [path[0].lat, path[0].lng], type: 'depart', mod: '' });
  for (let i = 0; i < edges.length; i++) {
    accLen += edges[i].len; accDur += edges[i].cost;
    const nxt = edges[i + 1]; if (!nxt) break;
    const da = ((brg(i + 1) - brg(i) + 540) % 360) - 180;
    const turn = Math.abs(da) > 25, renamed = nxt.name && nxt.name !== name;
    if (!turn && !renamed) continue;
    const mod = !turn ? 'straight' : (Math.abs(da) > 140 ? 'uturn' : (da > 0 ? (da > 60 ? 'right' : 'slight right') : (da < -60 ? 'left' : 'slight left')));
    const base = turn ? ({ left: 'به چپ بپیچید', right: 'به راست بپیچید', 'slight left': 'کمی به چپ بپیچید', 'slight right': 'کمی به راست بپیچید', uturn: 'دور بزنید' }[mod] || 'ادامه دهید') : 'ادامه دهید';
    steps.push({ text: base + (nxt.name ? ' به ' + nxt.name : ''), dist: Math.round(accLen), loc: [path[i + 1].lat, path[i + 1].lng], type: turn ? 'turn' : 'new name', mod });
    accLen = 0; name = nxt.name || name;
  }
  steps.push({ text: 'به مقصد رسیدید', dist: Math.round(accLen), loc: [path[path.length - 1].lat, path[path.length - 1].lng], type: 'arrive', mod: '' });
  return steps;
}
async function route(o, d) {
  const g = await buildGraph(o, d);
  const s = nearest(g, o), t = nearest(g, d);
  if (!s || !t) throw new Error('نزدیک مبدا یا مقصد راهی پیدا نشد');
  const r = astar(s, t); if (!r) throw new Error('مسیری بین این دو نقطه پیدا نشد');
  const coords = r.path.map((n) => [n.lat, n.lng]);
  const distance = r.edges.reduce((a, e) => a + e.len, 0);
  return [{ coords, distance, duration: r.duration * 1.25, steps: toSteps(r.path, r.edges), provider: 'local' }];
}
FM.localRoute = { route, _t: { buildGraph, astar } };
})(window);
