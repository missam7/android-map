/* admin.js — شناسایی مستقیم استان / شهرستان / بخش / ناحیه‌ی شهرداری / پلاک ثبتی (بدون کوکی سحاک) */
(function (root) {
'use strict';
const FM = root.FM;
const Lb = () => root.Lib;
const DAY = 864e5;

/* مراکز تقریبی استان‌ها — فقط به‌عنوان پاسخ آفلاین */
const PROV = [
  ['آذربایجان شرقی',37.90,46.29],['آذربایجان غربی',37.55,45.07],['اردبیل',38.25,48.29],
  ['اصفهان',32.65,51.67],['البرز',35.84,50.94],['ایلام',33.63,46.42],['بوشهر',28.92,50.84],
  ['تهران',35.70,51.40],['چهارمحال و بختیاری',32.33,50.86],['خراسان جنوبی',32.87,59.22],
  ['خراسان رضوی',36.30,59.60],['خراسان شمالی',37.47,57.33],['خوزستان',31.32,48.67],
  ['زنجان',36.68,48.49],['سمنان',35.57,53.39],['سیستان و بلوچستان',29.50,60.86],
  ['فارس',29.60,52.54],['قزوین',36.27,50.00],['قم',34.64,50.88],['کردستان',35.31,46.99],
  ['کرمان',30.28,57.08],['کرمانشاه',34.31,47.07],['کهگیلویه و بویراحمد',30.67,51.59],
  ['گلستان',36.84,54.43],['گیلان',37.28,49.58],['لرستان',33.49,48.35],['مازندران',36.47,52.35],
  ['مرکزی',34.09,49.70],['هرمزگان',27.19,56.28],['همدان',34.80,48.52],['یزد',31.90,54.37]
];
function nearestProvince(ll) {
  let best = '', bd = Infinity, k = Math.cos(ll.lat * Math.PI / 180);
  PROV.forEach(([n, la, lo]) => { const d = (la - ll.lat) ** 2 + ((lo - ll.lng) * k) ** 2; if (d < bd) { bd = d; best = n; } });
  return best ? 'استان ' + best : '';
}

/* کش روی گوشی: دقت ۴ رقم ≈ ۱۱ متر */
const ck = (ll) => (+ll.lat).toFixed(4) + ',' + (+ll.lng).toFixed(4);
function cacheGet(k) { const c = FM.store.get('adminCache', {}), v = c[k]; return v && Date.now() - v.t < 180 * DAY ? v.d : null; }
function cachePut(k, d) {
  const c = FM.store.get('adminCache', {}); c[k] = { t: Date.now(), d };
  const ks = Object.keys(c);
  if (ks.length > 500) ks.sort((a, b) => c[a].t - c[b].t).slice(0, 150).forEach((x) => delete c[x]);
  FM.store.set('adminCache', c);
}

async function httpJson(url, headers) {
  const Http = Lb() && Lb().Http;
  if (Http) {
    const r = await Http.get({ url, headers: headers || {}, responseType: 'json', connectTimeout: 12000, readTimeout: 20000 });
    if (r.status >= 400) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  }
  const r = await fetch(url, { headers: headers || {} }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
}

/* ۱) نشان: تبدیل نقطه به تقسیمات */
async function neshanReverse(ll) {
  const key = FM.cfg('neshanKey'); if (!key) throw new Error('کلید نشان موجود نیست');
  const j = await httpJson(`https://api.neshan.org/v5/reverse?lat=${ll.lat}&lng=${ll.lng}`, { 'Api-Key': key });
  if (!j || (j.status && j.status !== 'OK')) throw new Error((j && j.status) || 'پاسخ نامعتبر');
  return {
    state: j.state || '', county: j.county || '', district: j.district || '', city: j.city || '',
    village: j.village || '', neighbourhood: j.neighbourhood || '',
    zone: j.municipality_zone ? String(j.municipality_zone) : '', address: j.formatted_address || ''
  };
}

/* ۲) پارسل مشهد → پلاک و ناحیه‌ی ثبتی و کد نوسازی */
const RX = {
  nosazi: /nosazi|نوسازی|^code$/i,
  plak:   /plak|پلاک|asli|اصلی|farei|فرعی/i,
  bakhsh: /bakhsh|بخش.?ثبت|sabt|ثبتی|sector/i,
  nahie:  /nahi|ناحیه/i,
  zone:   /mantaghe|منطقه|zone/i
};
function pickBy(p, rx) {
  for (const k of Object.keys(p || {})) {
    if (!rx.test(k)) continue;
    const v = p[k]; if (v == null || typeof v === 'object' || String(v).trim() === '') continue;
    return String(v).trim();
  }
  return '';
}
async function mashhadParcel(ll) {
  const token = FM.cfg('mashhadToken'); if (!token) return null;
  const cql = `INTERSECTS(wkb_geometry,POINT(${ll.lat} ${ll.lng}))`;
  const url = 'https://websdi.mashhad.ir/api/proxy/geotajak/wfs?service=wfs&request=GetFeature&outputFormat=application/json'
    + '&typeName=geotajak:features&srsname=EPSG:4326&count=1&startIndex=0&CQL_FILTER=' + encodeURIComponent(cql);
  const j = await httpJson(url, { Accept: 'application/json', Authorization: 'Bearer ' + token });
  return (j && j.features && j.features[0]) || null;
}

/* ۳) پرس‌وجوی اصلی */
async function lookup(ll, opt) {
  const k = ck(ll);
  if (!(opt && opt.fresh)) { const hit = cacheGet(k); if (hit) return hit; }
  const out = { state: '', county: '', district: '', city: '', village: '', neighbourhood: '',
    zone: '', nahie: '', plak: '', bakhsh: '', nosazi: '', address: '', approx: false };
  try { Object.assign(out, await neshanReverse(ll)); }
  catch (e) { out.state = nearestProvince(ll); out.approx = true; }
  try {
    const hits = (FM.vec && FM.vec.pointLookup) ? FM.vec.pointLookup(ll) : [];
    hits.forEach((h) => {
      if (RX.nahie.test(h.layer) && !out.nahie) out.nahie = h.name;
      else if (RX.zone.test(h.layer) && h.name) out.zone = h.name;
      else if (/شهرستان/.test(h.layer) && !out.county) out.county = h.name;
      else if (/^بخش|بخش‌ها/.test(h.layer) && !out.district) out.district = h.name;
    });
  } catch (e) { /* بی‌اهمیت */ }
  try {
    const f = await mashhadParcel(ll);
    if (f) {
      const p = f.properties || {};
      out.nosazi = pickBy(p, RX.nosazi); out.plak = pickBy(p, RX.plak);
      out.bakhsh = pickBy(p, RX.bakhsh); if (!out.nahie) out.nahie = pickBy(p, RX.nahie);
    }
  } catch (e) { /* خارج از مشهد یا سرور در دسترس نیست */ }
  cachePut(k, out); return out;
}

/* ۴) متن فارسی برای توضیحات نقطه */
function describe(a) {
  const s = [];
  if (a.state) s.push(a.state.replace(/^استان\s*/, 'استان '));
  if (a.county) s.push(a.county);
  if (a.district) s.push(a.district);
  if (a.city) s.push('شهر ' + a.city); else if (a.village) s.push('روستای ' + a.village);
  if (a.zone) s.push('منطقه‌ی شهرداری ' + a.zone);
  if (a.nahie) s.push('ناحیه‌ی ' + a.nahie);
  if (a.neighbourhood) s.push('محله‌ی ' + a.neighbourhood);
  if (a.bakhsh) s.push('بخش ثبتی ' + a.bakhsh);
  if (a.plak) s.push('پلاک ثبتی ' + a.plak);
  if (a.nosazi) s.push('کد نوسازی ' + a.nosazi);
  let t = s.join(' — ');
  if (a.approx && t) t += ' (تقریبی، بدون اینترنت)';
  return t;
}

/* ۵) نوشتن خودکار روی هر عارضه */
async function annotate(feature, onDone) {
  try {
    const g = feature && feature.geometry; if (!g) return null;
    let ll = null;
    if (g.type === 'Point') ll = { lat: g.coordinates[1], lng: g.coordinates[0] };
    else { const b = L.geoJSON(g).getBounds(); if (b.isValid()) ll = b.getCenter(); }
    if (!ll) return null;
    const a = await lookup(ll);
    const p = feature.properties = feature.properties || {};
    p.state = a.state || p.state; p.county = a.county || p.county; p.district = a.district || p.district;
    if (a.zone) p.municipality_zone = a.zone;
    if (a.nahie) p.nahie = a.nahie;
    if (a.bakhsh) p.registry_sector = a.bakhsh;
    if (a.plak) p.registry_plak = a.plak;
    if (a.nosazi) p.nosazi = a.nosazi;
    if (a.address) p.address = a.address;
    const txt = describe(a);
    if (txt) p.description = p.description ? (p.description.indexOf(txt) >= 0 ? p.description : p.description + '\n' + txt) : txt;
    if (onDone) onDone(a, txt);
    return a;
  } catch (e) { return null; }
}

FM.admin = { lookup, describe, annotate, nearestProvince };
})(window);
