/* Estación meteorológica — lógica (v3)
   JavaScript ES5 a propósito (sin flechas, let/const ni async) para que funcione en Android 6. */
(function () {
  'use strict';

  /* ======================= Configuración ======================= */
  var C = window.CONFIG || {};
  var Q = parseQuery();
  /* También por #: #demo, #amarillo, #naranja, #rojo, #noche (modo demo) */
  var HASH = (location.hash || '').replace('#', '');

  function parseQuery() {
    var o = {};
    var s = (location.search || '').replace(/^\?/, '');
    if (!s) { return o; }
    var parts = s.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      try { o[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); } catch (e) { /* parámetro mal escrito */ }
    }
    return o;
  }
  function pick(q, c, d) {
    if (q !== undefined && q !== '') { return q; }
    if (c !== undefined) { return c; }
    return d;
  }
  function def(v, d) { return v === undefined ? d : v; }

  var cfg = {
    name: pick(Q.name, C.name, 'Salou'),
    lat: parseFloat(pick(Q.lat, C.lat, 41.0765)),
    lon: parseFloat(pick(Q.lon, C.lon, 1.1414)),
    zoom: parseInt(pick(Q.zoom, C.zoom, 8), 10),
    seaLat: parseFloat(def(C.seaLat, 41.05)),
    seaLon: parseFloat(def(C.seaLon, 1.15)),
    weatherEveryMin: C.weatherEveryMin || 10,
    radarEveryMin: C.radarEveryMin || 5,
    forecastEveryMin: C.forecastEveryMin || 60,
    seaEveryMin: C.seaEveryMin || 30,
    alertsEveryMin: C.alertsEveryMin || 10,
    alertsUrl: def(C.alertsUrl, 'avisos.json'),
    autoplay: C.autoplay === true,
    playLoops: C.playLoops || 3,
    obsUrl: def(C.obsUrl, 'observacion.json'),
    obsMaxAgeMin: C.obsMaxAgeMin || 120,
    sound: C.sound !== false,
    soundVolume: def(C.soundVolume, 0.25),
    days: C.days || 8,
    frameMs: C.frameMs || 700,
    fcFrameMs: C.fcFrameMs || 450,
    pauseLastMs: C.pauseLastMs || 2000,
    radarOpacity: C.radarOpacity || 0.8,
    radarForecast: C.radarForecast !== false,
    fcOpacity: C.fcOpacity || 0.85,
    radarStaleMin: C.radarStaleMin || 20,
    basemapUrl: C.basemapUrl || 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labelsUrl: def(C.labelsUrl, 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'),
    basemapAttribution: C.basemapAttribution || 'Mapa &copy; Esri, HERE, Garmin, &copy; OpenStreetMap',
    reloadAt: def(C.reloadAt, '04:00'),
    nightFrom: def(C.nightFrom, '23:00'),
    nightTo: C.nightTo || '07:00',
    nightDim: def(C.nightDim, 0.55),
    nightFrameMs: C.nightFrameMs || 1400,
    tomorrowFrom: C.tomorrowFrom || '20:00',
    radarFade: C.radarFade !== false,
    fullRadarSec: C.fullRadarSec || 30,
    demo: Q.demo === '1' || C.demo === true || /^(demo|amarillo|naranja|rojo|noche|tarde)$/.test(HASH),
    demoAlert: Q.alert || (/^(amarillo|naranja|rojo)$/.test(HASH) ? HASH : ''),
    forceNight: Q.night === '1' || HASH === 'noche'
  };

  var RADAR_COLOR = 2;      // Universal Blue (el esquema gratuito de RainViewer)
  var CACHE_KEY = 'estacion-meteo-cache-v3';
  var LEVEL_RANK = { amarillo: 1, naranja: 2, rojo: 3 };
  var LEVEL_NAME = { amarillo: 'Aviso amarillo', naranja: 'Aviso naranja', rojo: 'Aviso rojo' };

  /* ======================= Utilidades ======================= */
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var DEMO_T = new Date(2026, 10, 14, HASH === 'tarde' ? 21 : 17, HASH === 'tarde' ? 35 : 17, 0).getTime(), DEMO_T0 = Date.now();
  function setDemoTime(h, m) { DEMO_T = new Date(2026, 10, 14, h, m, 0).getTime(); DEMO_T0 = Date.now(); }
  function now() { return cfg.demo ? new Date(DEMO_T + (Date.now() - DEMO_T0)) : new Date(); }
  function fmtTime(unix) { var d = new Date(unix * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtNum(v, dec) { return Number(v).toFixed(dec).replace('.', ','); }
  function mmTxt(v) { return v < 10 ? fmtNum(v, 1) : String(Math.round(v)); }
  /* '2026-11-14T17:00' (hora local de Open-Meteo) → Date */
  function parseLocal(s) {
    s = String(s);
    return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0);
  }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function dayWord(d) {
    var n = now(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
    if (sameDay(d, n)) { return 'hoy'; }
    if (sameDay(d, t)) { return 'mañana'; }
    return DOW_LONG[d.getDay()];
  }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  var DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  function compass(deg) { return COMPASS[Math.round(deg / 45) % 8]; }

  function getJSON(url, ok, fail) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 25000;
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        var data;
        try { data = JSON.parse(xhr.responseText); } catch (e) { fail(e); return; }
        ok(data);
      } else { fail(new Error('HTTP ' + xhr.status)); }
    };
    xhr.onerror = function () { fail(new Error('red')); };
    xhr.ontimeout = function () { fail(new Error('timeout')); };
    xhr.send();
  }

  /* ======================= Iconos ======================= */
  var CLOUD_A = 'M8 19h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1A3 3 0 0 0 8 19z';
  var CLOUD_B = 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z';
  var CLOUD_C = 'M7 14h10a3.5 3.5 0 0 0 .5-7 5.5 5.5 0 0 0-10.5 1.3A3 3 0 0 0 7 14z';
  var SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>';
  var ICONS = {
    sun: [[SUN, '#FFD27A']],
    moon: [['<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', '#C9D6F0']],
    partly: [['<circle cx="9" cy="9" r="3"/><path d="M9 3v1.5M3 9h1.5M4.8 4.8l1 1M13.2 4.8l-1 1"/>', '#FFD27A'], ['<path d="' + CLOUD_A + '"/>', '#E8EEF9']],
    partlyNight: [['<path d="M11 3.5a4 4 0 1 0 4.2 5.2A3.6 3.6 0 0 1 11 3.5z"/>', '#C9D6F0'], ['<path d="' + CLOUD_A + '"/>', '#E8EEF9']],
    cloud: [['<path d="' + CLOUD_B + '"/>', '#B8C6DC']],
    fog: [['<path d="M5 9h14M4 13h16M6 17h12"/>', '#B8C6DC']],
    rain: [['<path d="' + CLOUD_C + '"/>', '#B8C6DC'], ['<path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>', '#7FB6FF']],
    snow: [['<path d="' + CLOUD_C + '"/>', '#B8C6DC'], ['<path d="M8 17.5v.01M12 18.5v.01M16 17.5v.01M10 20.5v.01M14 20.5v.01" stroke-width="2.4"/>', '#DCE8FA']],
    storm: [['<path d="' + CLOUD_C + '"/>', '#B8C6DC'], ['<path d="M12.5 14l-2 3.5h3l-2 3.5"/>', '#FFD27A']]
  };
  function svgIcon(kind) {
    var parts = ICONS[kind] || ICONS.cloud;
    var out = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    for (var i = 0; i < parts.length; i++) { out += '<g stroke="' + parts[i][1] + '">' + parts[i][0] + '</g>'; }
    return out + '</svg>';
  }
  function lineIcon(path, color, fill) {
    return '<svg viewBox="0 0 24 24" fill="' + (fill || 'none') + '" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  var I_UMB = '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/><path d="M12 3v.5"/>';
  var I_CHECK = '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.5"/>';
  var I_BOLT = '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>';
  var I_WARN = '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.01"/>';
  var I_INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>';

  /* Códigos WMO de Open-Meteo → icono y texto */
  function wmo(code, isDay) {
    var day = isDay !== 0;
    if (code === 0) { return { kind: day ? 'sun' : 'moon', label: day ? 'Despejado' : 'Noche despejada' }; }
    if (code === 1) { return { kind: day ? 'sun' : 'moon', label: 'Mayormente despejado' }; }
    if (code === 2) { return { kind: day ? 'partly' : 'partlyNight', label: 'Parcialmente nublado' }; }
    if (code === 3) { return { kind: 'cloud', label: 'Nublado' }; }
    if (code === 45 || code === 48) { return { kind: 'fog', label: 'Niebla' }; }
    if (code >= 51 && code <= 55) { return { kind: 'rain', label: 'Llovizna' }; }
    if (code === 56 || code === 57) { return { kind: 'rain', label: 'Llovizna helada' }; }
    if (code === 61) { return { kind: 'rain', label: 'Lluvia débil' }; }
    if (code === 63) { return { kind: 'rain', label: 'Lluvia' }; }
    if (code === 65) { return { kind: 'rain', label: 'Lluvia fuerte' }; }
    if (code === 66 || code === 67) { return { kind: 'rain', label: 'Lluvia helada' }; }
    if (code >= 71 && code <= 77) { return { kind: 'snow', label: 'Nieve' }; }
    if (code >= 80 && code <= 82) { return { kind: 'rain', label: 'Chubascos' }; }
    if (code === 85 || code === 86) { return { kind: 'snow', label: 'Chubascos de nieve' }; }
    if (code === 95) { return { kind: 'storm', label: 'Tormenta' }; }
    if (code === 96 || code === 99) { return { kind: 'storm', label: 'Tormenta con granizo' }; }
    return { kind: 'cloud', label: 'Nublado' };
  }

  /* ======================= Reloj ======================= */
  function updateClock() {
    var d = now();
    $('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    $('date-t').textContent = DOW_LONG[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
  }

  /* ======================= Previsión (Open-Meteo) ======================= */
  var W = null;            // últimos datos de previsión
  var lastOk = 0, lastError = false;

  function weatherUrl() {
    return 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + cfg.lat + '&longitude=' + cfg.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl' +
      '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day,pressure_msl,cape,wind_speed_10m,wind_gusts_10m,wind_direction_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max,wind_gusts_10m_max,wind_speed_10m_max,wind_direction_10m_dominant' +
      '&minutely_15=precipitation&past_minutely_15=1&forecast_minutely_15=8' +
      '&past_hours=24&forecast_hours=120' +
      '&wind_speed_unit=kmh&timezone=auto&forecast_days=' + cfg.days;
  }

  function hourIndex(h, cur) {
    var key = String(cur.time).slice(0, 13) + ':00';
    for (var i = 0; i < h.time.length; i++) { if (String(h.time[i]) === key) { return i; } }
    return 0;
  }

  function renderWeather(d) {
    W = d;
    var cur = d.current, h = d.hourly, dl = d.daily;
    var w = wmo(cur.weather_code, cur.is_day);
    var idx = hourIndex(h, cur);

    $('temp').textContent = Math.round(cur.temperature_2m) + '°';
    $('bigicon').innerHTML = svgIcon(w.kind);
    $('cond').textContent = w.label;
    $('range').textContent = 'Sensación ' + Math.round(cur.apparent_temperature) + '° · Máx ' +
      Math.round(dl.temperature_2m_max[0]) + '° · Mín ' + Math.round(dl.temperature_2m_min[0]) + '°';

    renderNextHour(d);
    checkSound();

    /* Viento y rachas */
    /* la flecha apunta hacia donde sopla el viento (la dirección en texto es de donde viene) */
    $('wind').innerHTML = '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="#5EC8FF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="-webkit-transform: rotate(' + ((cur.wind_direction_10m + 180) % 360) + 'deg); transform: rotate(' + ((cur.wind_direction_10m + 180) % 360) + 'deg)"><path d="M12 4v16M6 10l6-6 6 6"/></svg>' +
      Math.round(cur.wind_speed_10m) + ' <span class="u">km/h ' + compass(cur.wind_direction_10m) + '</span>';
    var gust = cur.wind_gusts_10m;
    setSub('wind-s', gust == null ? '&nbsp;' : 'Rachas ' + Math.round(gust) + ' km/h', gust >= 50 ? 'warn' : '');

    /* Humedad y rocío */
    $('hum').innerHTML = Math.round(cur.relative_humidity_2m) + ' <span class="u">%</span>';
    setSub('hum-s', cur.dew_point_2m == null ? '&nbsp;' : 'Punto de rocío ' + Math.round(cur.dew_point_2m) + '°', '');

    /* Lluvia de hoy: lo ya caído (horas pasadas, según el modelo) y lo que falta */
    var today = String(dl.time[0]), nowHour = String(cur.time).slice(0, 13) + ':00';
    var fallen = 0, expected = 0;
    for (var q = 0; q < h.time.length; q++) {
      var ht = String(h.time[q]);
      if (ht.slice(0, 10) !== today) { continue; }
      var mm = h.precipitation[q] || 0;
      if (ht < nowHour) { fallen += mm; } else { expected += mm; }
    }
    $('rain').innerHTML = fmtNum(fallen, 1) + ' <span class="u">mm</span>';
    rainSource = 'modelo';
    var est = radarRainToday();
    if (est !== null) { $('rain').innerHTML = (est > 0 && est < 0.1 ? '<0,1' : fmtNum(est, 1)) + ' <span class="u">mm</span>'; rainSource = 'radar'; }
    setSub('rain-s', expected >= 0.1 ? 'Prevista +' + mmTxt(expected) + ' mm' : 'Sin más lluvia hoy', 'blue');

    /* Presión y tendencia en 3 h */
    $('press').innerHTML = Math.round(cur.pressure_msl) + ' <span class="u">hPa</span>';
    var p3 = idx >= 3 ? h.pressure_msl[idx - 3] : null;
    if (p3 == null) { setSub('press-s', '&nbsp;', ''); }
    else {
      var dp = cur.pressure_msl - p3, dpt = (dp > 0 ? '+' : '−') + fmtNum(Math.abs(dp), 0);
      if (dp <= -1) { setSub('press-s', '↓ Bajando (' + dpt + ' en 3 h)', dp <= -3 ? 'warn' : ''); }
      else if (dp >= 1) { setSub('press-s', '↑ Subiendo (' + dpt + ' en 3 h)', ''); }
      else { setSub('press-s', '→ Estable', ''); }
    }

    var measured = applyObsStation();
    $('rain-l').textContent = rainSource === 'estación' ? 'Llovido hoy' : (rainSource === 'radar' ? 'Llovido hoy · radar' : 'Llovido hoy · modelo');
    renderSun(dl);
    renderEvening(d);
    renderHours(d, idx);
    renderDays(dl);
    renderStorm(d, idx);
    fixMapSize();
  }

  var rainSource = 'modelo';
  function setSub(id, html, cls) {
    var el = $(id);
    el.innerHTML = html;
    el.className = 's' + (cls ? ' ' + cls : '');
  }

  /* Lluvia en la próxima hora (datos cada 15 min; en España se interpolan del modelo horario) */
  function renderNextHour(d) {
    var el = $('nexthour');
    var m = d.minutely_15, steps = [];
    if (m && m.time && m.precipitation) {
      var n = now(), i0 = 0;
      for (var i = 0; i < m.time.length; i++) { if (parseLocal(m.time[i]) <= n) { i0 = i; } }
      for (var k = i0; k < m.time.length && steps.length < 8; k++) { steps.push(m.precipitation[k] || 0); }
    }
    if (!steps.length) { el.className = 'nh hidden'; return; }

    var WET = 0.05; // mm en 15 min
    function run(from) { var c = 0; while (from + c < steps.length && steps[from + c] >= WET) { c++; } return c; }
    function intensity(from, len) {
      var mx = 0;
      for (var j = from; j < from + len; j++) { mx = Math.max(mx, steps[j] * 4); }
      return mx < 2 ? 'débil' : (mx < 10 ? 'moderada' : 'fuerte');
    }
    function durTxt(len) { var mins = len * 15; return mins >= 60 ? (mins % 60 ? fmtNum(mins / 60, 1) + ' h' : (mins / 60) + ' h') : mins + ' min'; }

    var icon = lineIcon(I_UMB, '#7FB6FF');
    /* el radar manda sobre el modelo si ve lluvia encima ahora mismo */
    if (radarHere && radarHere.wet && now().getTime() / 1000 - radarHere.time < 30 * 60 && steps[0] < WET) {
      el.className = 'nh wet';
      el.innerHTML = icon + '<b>Lloviendo ahora</b><span class="x">· ' + ['', 'débil', 'moderada', 'fuerte'][radarHere.level] + ' · radar</span>';
      return;
    }
    if (radarEta && Date.now() / 1000 - radarEta.time < 20 * 60 && steps[0] < WET) {
      el.className = 'nh wet';
      el.innerHTML = icon + '<b>Lluvia en ~' + radarEta.minutes + ' min</b><span class="x">· ' + ['', 'débil', 'moderada', 'fuerte'][radarEta.level] + ' · radar</span>';
      return;
    }
    if (steps[0] >= WET) {
      var r = run(0);
      el.className = 'nh wet';
      el.innerHTML = icon + (r >= 5 ? '<b>Lloviendo · seguirá la próxima hora</b>' : '<b>Lloviendo · para en ~' + (r * 15) + ' min</b>');
      return;
    }
    for (var s = 1; s <= 4 && s < steps.length; s++) {
      if (steps[s] >= WET) {
        var len = run(s);
        el.className = 'nh wet';
        el.innerHTML = icon + '<b>Lluvia en ~' + (s * 15) + ' min</b><span class="x">· ' + intensity(s, len) + ', ' + durTxt(len) + '</span>';
        return;
      }
    }
    el.className = 'nh';
    el.innerHTML = lineIcon(I_CHECK, '#3DDC84') + 'Sin lluvia la próxima hora';
  }

  /* Sol: el próximo evento (salida u ocaso) y el UV del día */
  function renderSun(dl) {
    if (!dl.sunrise || !dl.sunset) { return; }
    var n = now(), rise = parseLocal(dl.sunrise[0]), set = parseLocal(dl.sunset[0]);
    var uv = dl.uv_index_max ? Math.round(dl.uv_index_max[0] || 0) : null;
    if (n < rise) {
      $('sun').innerHTML = hhmm(rise) + ' <span class="u">salida</span>';
      setSub('sun-s', 'Ocaso ' + hhmm(set) + (uv != null ? ' · UV ' + uv : ''), '');
    } else if (n < set) {
      $('sun').innerHTML = hhmm(set) + ' <span class="u">ocaso</span>';
      setSub('sun-s', 'Salida ' + hhmm(rise) + (uv != null ? ' · UV ' + uv : ''), '');
    } else {
      var rise2 = dl.sunrise[1] ? parseLocal(dl.sunrise[1]) : null;
      var uv2 = dl.uv_index_max && dl.uv_index_max[1] != null ? Math.round(dl.uv_index_max[1]) : null;
      $('sun').innerHTML = (rise2 ? hhmm(rise2) : '--') + ' <span class="u">salida</span>';
      setSub('sun-s', 'Mañana' + (uv2 != null ? ' · UV ' + uv2 : ''), '');
    }
  }

  /* Por la noche: tarjeta «Mañana» en lugar de Mar y Sol, y fase lunar junto a la fecha */
  function isEvening() {
    var d = now(), m = d.getHours() * 60 + d.getMinutes();
    return m >= hm(cfg.tomorrowFrom) || m < hm(cfg.nightTo);
  }
  function renderEvening(d) {
    var app = $('app'), on = isEvening();
    app.className = app.className.replace(/\s*evening/g, '') + (on ? ' evening' : '');
    var dl = d.daily, h = d.hourly, n = now();
    /* después de medianoche, «mañana» ya es hoy */
    var j = n.getHours() < 12 ? 0 : 1;
    if (on && dl.time[j]) {
      var day = parseLocal(dl.time[j] + 'T12:00'), key = String(dl.time[j]);
      var first = -1;
      for (var i = 0; i < h.time.length; i++) {
        if (String(h.time[i]).slice(0, 10) === key && parseLocal(h.time[i]) > n && ((h.precipitation_probability[i] || 0) >= 40 || (h.precipitation[i] || 0) >= 0.2)) { first = i; break; }
      }
      var p = Math.round(dl.precipitation_probability_max[j] || 0);
      var rain = first >= 0 ? 'Lluvia ' + p + ' % desde las ' + parseLocal(h.time[first]).getHours() + ' h' : (p >= 20 ? 'Lluvia ' + p + ' %' : 'Sin lluvia prevista');
      var gust = dl.wind_gusts_10m_max ? dl.wind_gusts_10m_max[j] : null;
      var uv = dl.uv_index_max ? dl.uv_index_max[j] : null;
      $('tomorrow').innerHTML = svgIcon(wmo(dl.weather_code[j], 1).kind) + '<div class="tx"><div class="l">' + (j === 0 ? 'Hoy' : 'Mañana') + ' · ' + DOW_LONG[day.getDay()] + '</div>' +
        '<div class="r"><span class="mx">' + Math.round(dl.temperature_2m_max[j]) + '°</span><span class="mn">' + Math.round(dl.temperature_2m_min[j]) + '°</span><span class="rn">' + rain + '</span></div>' +
        '<div class="s">' + (gust != null ? 'Rachas de hasta ' + Math.round(gust) + ' km/h' : '') + (uv != null ? (gust != null ? ' · ' : '') + 'UV ' + Math.round(uv) : '') + '</div></div>';
    }
    /* fase lunar: entre el ocaso y el amanecer */
    var dark = dl.sunrise && dl.sunset && (n < parseLocal(dl.sunrise[0]) || n >= parseLocal(dl.sunset[0]));
    $('moon').innerHTML = dark ? moonHtml(n) : '';
  }

  /* Fase lunar calculada (luna nueva de referencia: 6 ene 2000 18:14 UTC; mes sinódico 29,53 días) */
  function moonHtml(d) {
    var ph = ((d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000 / 29.530588853) % 1;
    if (ph < 0) { ph += 1; }
    var names = ['Luna nueva', 'Creciente', 'Cuarto creciente', 'Gibosa creciente', 'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Menguante'];
    var name = names[Math.floor((ph * 8 + 0.5)) % 8];
    var rx = Math.abs(Math.cos(ph * 2 * Math.PI)) * 9, path;
    if (ph < 0.5) { path = 'M12 3A9 9 0 0 1 12 21A' + rx.toFixed(2) + ' 9 0 0 ' + (ph < 0.25 ? 0 : 1) + ' 12 3Z'; }
    else { path = 'M12 3A9 9 0 0 0 12 21A' + rx.toFixed(2) + ' 9 0 0 ' + (ph < 0.75 ? 0 : 1) + ' 12 3Z'; }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="#5B6B84" stroke-width="1.2"/><path d="' + path + '" fill="#C9D6F0"/></svg>' + name;
  }

  /* Próximas 24 h: 6 horas una a una y luego 6 bloques de 3 h */
  var hourCols = [];
  function renderHours(d, idx) {
    var h = d.hourly;
    hourCols = [];
    var k, j;
    for (k = 1; k <= 6; k++) { if (idx + k < h.time.length) { hourCols.push({ i: idx + k, n: 1 }); } }
    for (k = 0; k < 6; k++) { j = idx + 7 + 3 * k; if (j + 2 < h.time.length) { hourCols.push({ i: j, n: 3 }); } }

    var mx = 0, c;
    for (k = 0; k < hourCols.length; k++) {
      c = hourCols[k];
      c.mm = 0; c.p = 0; c.code = 0;
      for (j = c.i; j < c.i + c.n; j++) {
        c.mm += h.precipitation[j] || 0;
        c.p = Math.max(c.p, h.precipitation_probability[j] || 0);
        c.code = Math.max(c.code, h.weather_code[j] || 0);
      }
      c.start = parseLocal(h.time[c.i]);
      c.end = new Date(c.start.getTime() + c.n * 3600000);
      mx = Math.max(mx, c.mm);
    }
    var html = '', prevH = -1;
    for (k = 0; k < hourCols.length; k++) {
      c = hourCols[k];
      var hr = c.start.getHours();
      var mid = c.i + (c.n === 3 ? 1 : 0);
      var hw = wmo(c.code >= 95 ? c.code : h.weather_code[mid], h.is_day[mid]);
      var bar;
      if (c.mm >= 0.05) {
        var bh = Math.max(4, Math.round(c.mm / (mx || 1) * 30));
        bar = '<div class="mm">' + mmTxt(c.mm) + '</div><div class="b' + (c.code >= 95 ? ' storm' : '') + '" style="height: ' + bh + 'px"></div>';
      } else { bar = '<div class="b0"></div>'; }
      var cls = 'hour' + (prevH >= 0 && hr < prevH ? ' newday' : '') + (c.n === 3 && (hr < 7 || hr >= 22) ? ' night' : '');
      html += '<div class="' + cls + '"><div class="t">' + pad(hr) + 'h</div>' + svgIcon(hw.kind) +
        '<div class="d">' + Math.round(h.temperature_2m[c.i]) + '°</div><div class="bw">' + bar + '</div>' +
        '<div class="p">' + Math.round(c.p) + ' %</div></div>';
      prevH = hr;
    }
    $('hours-cols').innerHTML = html;
    renderCurve(h);
    renderHoursBand();
  }

  /* Curva de temperatura sobre las columnas */
  function renderCurve(h) {
    var n = hourCols.length;
    if (n < 2) { $('hours-curve').innerHTML = ''; return; }
    var t = [], lo = 1e9, hi = -1e9, k;
    for (k = 0; k < n; k++) { var v = h.temperature_2m[hourCols[k].i]; t.push(v); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    var pts = [];
    for (k = 0; k < n; k++) { pts.push(((k + 0.5) / n * 1000).toFixed(1) + ',' + (25 - (t[k] - lo) / Math.max(1, hi - lo) * 20).toFixed(1)); }
    var y0 = pts[0].split(',')[1], y1 = pts[n - 1].split(',')[1];
    $('hours-curve').innerHTML = '<svg viewBox="0 0 1000 30" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB86B" stop-opacity="0.35"/><stop offset="1" stop-color="#FFB86B" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M0,' + y0 + ' L' + pts.join(' L') + ' L1000,' + y1 + ' L1000,30 L0,30 Z" fill="url(#tg)"/>' +
      '<polyline points="0,' + y0 + ' ' + pts.join(' ') + ' 1000,' + y1 + '" fill="none" stroke="#FFB86B" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }

  /* Franja del aviso más alto por encima de las horas que cubre */
  function renderHoursBand() {
    var wrap = $('hours-wrap'), band = $('hours-band');
    var a = activeAlerts()[0];
    $('hours-alert').className = 'ha';
    if (!a || !hourCols.length) { wrap.className = ''; return; }
    var on = new Date(a.onset), ex = roundEnd(new Date(a.expires)), first = -1, last = -1;
    for (var k = 0; k < hourCols.length; k++) {
      if (hourCols[k].start < ex && hourCols[k].end > on) { if (first < 0) { first = k; } last = k; }
    }
    if (first < 0) { wrap.className = ''; return; }
    var n = hourCols.length;
    band.style.left = (first / n * 100) + '%';
    band.style.width = ((last - first + 1) / n * 100) + '%';
    band.className = a.level;
    band.textContent = '';
    wrap.className = 'band';
    var hb = $('hours-alert');
    hb.className = 'ha ' + a.level;
    hb.textContent = LEVEL_NAME[a.level] + ' ' + (on > now() ? 'de ' + pad(on.getHours()) + ' a ' + pad(ex.getHours()) + ' h' : 'hasta las ' + pad(ex.getHours()) + ' h');
  }

  function renderDays(dl) {
    var html = '';
    for (var j = 0; j < cfg.days && j < dl.time.length; j++) {
      var date = parseLocal(dl.time[j] + 'T12:00');
      var dw = wmo(dl.weather_code[j], 1);
      var dp = dl.precipitation_probability_max[j];
      html += '<div class="day" data-j="' + j + '">' + svgIcon(dw.kind) + '<div class="tx"><div class="n">' + (j === 0 ? 'Hoy' : DOW[date.getDay()]) +
        '<span>' + (dp == null ? '--' : Math.round(dp)) + ' %</span></div>' +
        '<div class="d">' + Math.round(dl.temperature_2m_max[j]) + '° <span class="mn">' + Math.round(dl.temperature_2m_min[j]) + '°</span></div></div></div>';
    }
    $('days').innerHTML = html;
  }

  /* ---- Detalle de un día (al pulsar en la fila de 5 días) ---- */
  var dayTimer = null;
  function openDay(j) {
    if (!W || !W.daily.time[j]) { return; }
    var d = W.daily, h = W.hourly, key = String(d.time[j]), n = now();
    var date = parseLocal(key + 'T12:00'), dw = wmo(d.weather_code[j], 1);
    var idx = [], k;
    for (k = 0; k < h.time.length; k++) { if (String(h.time[k]).slice(0, 10) === key) { idx.push(k); } }

    /* resumen por tramos del día */
    var parts = [['Madrugada', 0, 6], ['Mañana', 6, 12], ['Tarde', 12, 18], ['Noche', 18, 24]], resumen = [];
    for (var p = 0; p < parts.length; p++) {
      var mm = 0, codes = {}, best = -1, bestN = 0, pmax = 0, any = false;
      for (k = 0; k < idx.length; k++) {
        var hr = +String(h.time[idx[k]]).slice(11, 13);
        if (hr < parts[p][1] || hr >= parts[p][2]) { continue; }
        any = true;
        mm += h.precipitation[idx[k]] || 0;
        pmax = Math.max(pmax, h.precipitation_probability[idx[k]] || 0);
        var c = h.weather_code[idx[k]]; codes[c] = (codes[c] || 0) + 1;
        if (codes[c] > bestN || (codes[c] === bestN && c > best)) { best = c; bestN = codes[c]; }
      }
      if (!any) { continue; }
      var txt = wmo(best, 1).label;
      if (mm >= 0.2) { txt += ' · ' + mmTxt(mm) + ' mm'; } else if (pmax >= 30) { txt += ' · ' + Math.round(pmax) + ' % lluvia'; }
      resumen.push('<div class="pt"><b>' + parts[p][0] + '</b><span>' + txt + '</span></div>');
    }

    /* horas cada 2 h */
    var cols = '', mx = 0;
    for (k = 0; k < idx.length; k += 2) { mx = Math.max(mx, (h.precipitation[idx[k]] || 0) + (h.precipitation[idx[k] + 1] || 0)); }
    for (k = 0; k < idx.length; k += 2) {
      var i = idx[k], m2 = (h.precipitation[i] || 0) + (idx[k + 1] ? (h.precipitation[i + 1] || 0) : 0);
      var pr = Math.max(h.precipitation_probability[i] || 0, idx[k + 1] ? (h.precipitation_probability[i + 1] || 0) : 0);
      var past = parseLocal(h.time[i]).getTime() + 7200000 <= n.getTime();
      var bar = m2 >= 0.05 ? '<div class="mm">' + mmTxt(m2) + '</div><div class="b' + (h.weather_code[i] >= 95 ? ' storm' : '') + '" style="height: ' + Math.max(4, Math.round(m2 / (mx || 1) * 30)) + 'px"></div>' : '<div class="b0"></div>';
      var ws = h.wind_speed_10m ? Math.round(h.wind_speed_10m[i]) : null;
      cols += '<div class="hour' + (past ? ' past' : '') + '"><div class="t">' + String(h.time[i]).slice(11, 13) + 'h</div>' + svgIcon(wmo(h.weather_code[i], h.is_day[i]).kind) +
        '<div class="d">' + Math.round(h.temperature_2m[i]) + '°</div><div class="bw">' + bar + '</div><div class="p">' + Math.round(pr) + ' %</div>' +
        (ws != null ? '<div class="w">' + ws + ' km/h</div>' : '') + '</div>';
    }

    var facts = [
      ['Lluvia', d.precipitation_sum[j] >= 0.1 ? mmTxt(d.precipitation_sum[j]) + ' mm' : 'Nada', 'Prob. máx. ' + Math.round(d.precipitation_probability_max[j] || 0) + ' %'],
      ['Viento', d.wind_speed_10m_max ? Math.round(d.wind_speed_10m_max[j]) + ' km/h' + (d.wind_direction_10m_dominant ? ' ' + compass(d.wind_direction_10m_dominant[j]) : '') : '--', d.wind_gusts_10m_max ? 'Rachas ' + Math.round(d.wind_gusts_10m_max[j]) + ' km/h' : ''],
      ['Sol', d.sunrise ? hhmm(parseLocal(d.sunrise[j])) + ' – ' + hhmm(parseLocal(d.sunset[j])) : '--', d.uv_index_max ? 'UV máx. ' + Math.round(d.uv_index_max[j] || 0) : '']
    ];
    var fh = '';
    for (k = 0; k < facts.length; k++) { fh += '<div class="f"><div class="l">' + facts[k][0] + '</div><div class="v">' + facts[k][1] + '</div><div class="s">' + facts[k][2] + '</div></div>'; }

    var title = j === 0 ? 'Hoy' : (j === 1 ? 'Mañana' : DOW_LONG[date.getDay()].charAt(0).toUpperCase() + DOW_LONG[date.getDay()].slice(1));
    $('daypanel').innerHTML = '<div class="dp-box">' +
      '<div class="dp-head">' + svgIcon(dw.kind) + '<div class="dp-t"><div class="dp-n">' + (j < 2 ? title + ' · ' + DOW_LONG[date.getDay()] : title) + ' ' + date.getDate() + ' de ' + MONTHS[date.getMonth()] + '</div>' +
      '<div class="dp-c">' + dw.label + ' · <b>' + Math.round(d.temperature_2m_max[j]) + '°</b> <span>' + Math.round(d.temperature_2m_min[j]) + '°</span></div></div>' +
      '<button type="button" class="dp-x" aria-label="Cerrar">×</button></div>' +
      '<div class="dp-facts">' + fh + '</div>' +
      '<div class="dp-parts">' + resumen.join('') + '</div>' +
      '<div class="dp-hours">' + cols + '</div>' +
      '<div class="dp-foot">Previsión del modelo (Open-Meteo) · toca fuera para cerrar · se cierra sola en 30 s</div></div>';
    $('daypanel').className = 'on';
    var ds = $('days').children;
    for (k = 0; k < ds.length; k++) { ds[k].className = 'day' + (k === j ? ' sel' : ''); }
    clearTimeout(dayTimer);
    dayTimer = setTimeout(closeDay, 30000);
  }
  function closeDay() {
    clearTimeout(dayTimer);
    $('daypanel').className = '';
    var ds = $('days').children;
    for (var k = 0; k < ds.length; k++) { ds[k].className = 'day'; }
  }

  /* Riesgo de tormenta en las próximas 12 h (previsión, no rayos reales) */
  function renderStorm(d, idx) {
    var h = d.hourly, el = $('chip-storm');
    var level = 0, first = -1, last = -1;
    for (var k = 0; k <= 12 && idx + k < h.time.length; k++) {
      var i = idx + k, code = h.weather_code[i] || 0, cape = h.cape ? (h.cape[i] || 0) : 0, p = h.precipitation_probability[i] || 0;
      var lv = 0;
      if (code >= 95 || (cape >= 2000 && p >= 50)) { lv = 2; }
      else if (cape >= 800 && p >= 30) { lv = 1; }
      if (lv) { level = Math.max(level, lv); if (first < 0) { first = i; } last = i; }
    }
    if (!level) { el.className = 'chip storm'; return; }
    var a = parseLocal(h.time[first]), b = new Date(parseLocal(h.time[last]).getTime() + 3600000);
    var when = (first === idx ? 'ahora' : a.getHours()) + '–' + b.getHours() + ' h';
    el.innerHTML = lineIcon(I_BOLT, '#FFD23F', 'rgba(255,210,63,0.25)') + '<b>Riesgo de tormenta ' + (level === 2 ? 'alto' : 'moderado') + '</b><span>· ' + when + ' · previsión</span>';
    el.className = 'chip storm on';
  }

  /* ======================= Mar (Open-Meteo Marine) ======================= */
  function loadSea() {
    if (cfg.demo) { renderSea({ current: { sea_surface_temperature: 19.2, wave_height: 0.6, wave_direction: 95 } }); return; }
    var url = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + cfg.seaLat + '&longitude=' + cfg.seaLon +
      '&current=wave_height,wave_direction,sea_surface_temperature&timezone=auto';
    getJSON(url, renderSea, function () { /* se mantiene el último dato */ });
  }
  function renderSea(d) {
    var c = d && d.current;
    if (!c) { return; }
    $('sea').innerHTML = (c.sea_surface_temperature == null ? '--' : Math.round(c.sea_surface_temperature)) + '° <span class="u">agua</span>';
    setSub('sea-s', c.wave_height == null ? '&nbsp;' : 'Olas ' + fmtNum(c.wave_height, 1) + ' m' + (c.wave_direction == null ? '' : ' · ' + compass(c.wave_direction)), c.wave_height >= 2 ? 'warn' : '');
  }

  /* ======================= Estación de AEMET (datos medidos) ======================= */
  /* observacion.json lo genera la tarea de GitHub si el repositorio tiene la clave AEMET_API_KEY */
  var OBS = null;
  function loadObs() {
    if (cfg.demo || !cfg.obsUrl) { return; }
    var sep = cfg.obsUrl.indexOf('?') < 0 ? '?' : '&';
    getJSON(cfg.obsUrl + sep + 't=' + Date.now(), function (d) { OBS = d; if (W) { renderWeather(W); } updateStatus(); }, function () { OBS = null; });
  }
  function obsFresh() {
    if (!OBS || !OBS.time) { return false; }
    var t = new Date(OBS.time);
    return Date.now() - t.getTime() < cfg.obsMaxAgeMin * 60000 && sameDay(t, now());
  }
  /* Sustituye lo que da el modelo por lo medido en la estación */
  function applyObsStation() {
    if (!obsFresh()) { return false; }
    var o = OBS;
    if (o.temp != null) {
      $('temp').textContent = Math.round(o.temp) + '°';
      /* sensación: la del modelo corregida con la diferencia entre lo medido y lo previsto */
      var wc = W && W.current, dl = W && W.daily;
      if (wc && dl) {
        $('range').textContent = 'Sensación ' + Math.round(wc.apparent_temperature + (o.temp - wc.temperature_2m)) + '° · Máx ' +
          Math.round(Math.max(dl.temperature_2m_max[0], o.temp)) + '° · Mín ' + Math.round(Math.min(dl.temperature_2m_min[0], o.temp)) + '°';
      }
    }
    if (o.wind != null) {
      var dir = o.dir != null && o.dir <= 360 ? o.dir : null;
      $('wind').innerHTML = (dir != null ? '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="#5EC8FF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="-webkit-transform: rotate(' + ((dir + 180) % 360) + 'deg); transform: rotate(' + ((dir + 180) % 360) + 'deg)"><path d="M12 4v16M6 10l6-6 6 6"/></svg>' : '') +
        Math.round(o.wind) + ' <span class="u">km/h' + (dir != null ? ' ' + compass(dir) : '') + '</span>';
      if (o.gust != null) { setSub('wind-s', 'Rachas ' + Math.round(o.gust) + ' km/h', o.gust >= 50 ? 'warn' : ''); }
    }
    if (o.hum != null) { $('hum').innerHTML = Math.round(o.hum) + ' <span class="u">%</span>'; }
    if (o.pressure != null) { $('press').innerHTML = Math.round(o.pressure) + ' <span class="u">hPa</span>'; }
    if (o.rain_today != null) { $('rain').innerHTML = fmtNum(o.rain_today, 1) + ' <span class="u">mm</span>'; rainSource = 'estación'; }
    return true;
  }

  /* ======================= Avisos de AEMET ======================= */
  /* avisos.json lo genera la tarea de GitHub (carpeta avisos-github/). Formato:
     { "updated": "ISO", "zone": "Litoral sur de Tarragona",
       "alerts": [ { "level": "naranja", "event": "Lluvias", "detail": "...", "onset": "ISO", "expires": "ISO" } ] } */
  var AL = null, alertsFailed = false;

  function loadAlerts() {
    if (cfg.demo) { AL = demoAlerts(); renderAlerts(); return; }
    if (!cfg.alertsUrl) { renderAlerts(); return; }
    var sep = cfg.alertsUrl.indexOf('?') < 0 ? '?' : '&';
    getJSON(cfg.alertsUrl + sep + 't=' + Date.now(), function (d) { AL = d; alertsFailed = false; renderAlerts(); },
      function () { alertsFailed = true; renderAlerts(); });
  }

  function activeAlerts() {
    var out = [], n = now();
    if (!AL || !AL.alerts) { return out; }
    for (var i = 0; i < AL.alerts.length; i++) {
      var a = AL.alerts[i];
      if (LEVEL_RANK[a.level] && new Date(a.expires) > n) { out.push(a); }
    }
    out.sort(function (x, y) { return (LEVEL_RANK[y.level] - LEVEL_RANK[x.level]) || (new Date(x.onset) - new Date(y.onset)); });
    return out;
  }

  /* AEMET pone los finales a las HH:59:59: se redondean a la hora siguiente */
  function roundEnd(d) { return d.getMinutes() >= 59 ? new Date(Math.ceil(d.getTime() / 60000) * 60000) : d; }
  function when1(d) { return sameDay(d, now()) ? 'las ' + hhmm(d) : dayWord(d) + ' a las ' + hhmm(d); }
  function whenTxt(a) {
    var on = new Date(a.onset), ex = roundEnd(new Date(a.expires)), n = now();
    if (on <= n) { return 'hasta ' + when1(ex); }
    if (sameDay(on, ex)) { return (sameDay(on, n) ? 'hoy' : dayWord(on)) + ' de ' + hhmm(on) + ' a ' + hhmm(ex); }
    return 'desde ' + when1(on) + ' hasta ' + when1(ex);
  }

  function renderAlerts() {
    var app = $('app'), col = $('col-alert'), wide = $('wide-alert');
    var zone = (AL && AL.zone) || 'tu zona';
    var list = activeAlerts();
    var wasWide = app.className.indexOf('wide') >= 0;
    app.className = isEvening() ? 'evening' : '';
    wide.className = 'alert-banner wide';
    col.className = 'alert-banner';

    if (!cfg.demo && !cfg.alertsUrl) { afterAlertLayout(wasWide); return; }

    var stale = AL && AL.updated && (Date.now() - new Date(AL.updated).getTime() > 3 * 3600000);
    if (!list.length) {
      if (!AL || stale) {
        col.className = 'alert-banner on calm gray';
        var upd = AL && AL.updated ? new Date(AL.updated) : null;
        var veryOld = !upd || Date.now() - upd.getTime() > 48 * 3600000;
        col.innerHTML = lineIcon(I_INFO, '#8494AF') + '<span class="calm-t">' + (AL ? (veryOld ? 'Avisos de AEMET aún sin datos · revisa la tarea de GitHub' : 'Avisos de AEMET sin actualizar desde ' + dayWord(upd) + ' ' + hhmm(upd)) : (alertsFailed ? 'Avisos de AEMET no disponibles' : 'Cargando avisos de AEMET…')) + '</span>';
      } else {
        col.className = 'alert-banner on calm';
        col.innerHTML = lineIcon(I_CHECK, '#3DDC84') + '<span class="calm-t">Sin avisos de AEMET · ' + zone + '</span>';
      }
      afterAlertLayout(wasWide);
      return;
    }

    checkAlertSound(list);
    var a = list[0], rest = list.length - 1, more = '';
    if (rest === 1) { more = '+1 aviso ' + list[1].level; }
    else if (rest > 1) { more = '+' + rest + ' avisos'; }
    var color = a.level === 'amarillo' ? '#FFD23F' : (a.level === 'naranja' ? '#FF9A3D' : '#FFFFFF');
    var html = lineIcon(I_WARN, color) +
      '<div class="pill">' + LEVEL_NAME[a.level] + '</div>' +
      '<div class="txt"><div class="m">' + esc(a.event) + ' · ' + whenTxt(a) + '</div>' +
      '<div class="sub">' + (a.detail ? esc(a.detail) + ' · ' : '') + esc(zone) + ' · AEMET</div></div>' +
      (more ? '<div class="more">' + more + '</div>' : '');

    if (a.level === 'naranja' || a.level === 'rojo') {
      app.className += ' wide ' + a.level;
      wide.className = 'alert-banner wide on ' + a.level;
      wide.innerHTML = html;
    } else {
      col.className = 'alert-banner on ' + a.level;
      col.innerHTML = html;
    }
    afterAlertLayout(wasWide);
  }
  /* Panel con todos los avisos (al pulsar la franja o «+N avisos») */
  function openAlerts() {
    var list = activeAlerts();
    if (!list.length) { return; }
    var html = '<div class="dp-box"><div class="dp-head">' + lineIcon(I_WARN, '#FF9A3D') + '<div class="dp-t"><div class="dp-n">Avisos de AEMET · ' + esc((AL && AL.zone) || '') + '</div>' +
      '<div class="dp-c">' + list.length + (list.length === 1 ? ' aviso activo o previsto' : ' avisos activos o previstos') + '</div></div>' +
      '<button type="button" class="dp-x" aria-label="Cerrar">×</button></div><div class="al-list">';
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      html += '<div class="al-row ' + a.level + '"><span class="al-pill">' + LEVEL_NAME[a.level] + '</span><div class="al-tx"><div class="al-m">' + esc(a.event) + ' · ' + whenTxt(a) + '</div>' +
        (a.detail ? '<div class="al-d">' + esc(a.detail) + '</div>' : '') + '</div></div>';
    }
    html += '</div><div class="dp-foot">Fuente: AEMET (vía MeteoAlarm)' + (AL && AL.updated ? ' · comprobado a las ' + hhmm(new Date(AL.updated)) : '') + ' · toca fuera para cerrar</div></div>';
    $('daypanel').innerHTML = html;
    $('daypanel').className = 'on';
    clearTimeout(dayTimer);
    dayTimer = setTimeout(closeDay, 30000);
  }

  function afterAlertLayout() { renderHoursBand(); fixMapSize(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ======================= Radar: observado + previsión ======================= */
  var map = null, userMoved = false, programmatic = false;
  var obsFrames = [], fcFrames = [], frames = [], cur = 0, playing = cfg.autoplay, animTimer = null;
  var radarHost = '', lastObsKey = '', OBS = 100, displayed = null;
  var layerCache = {}, fcLayers = [];

  function fixMapSize() {
    if (!map) { return; }
    map.invalidateSize();
    if (!userMoved) {
      programmatic = true;
      map.setView([cfg.lat, cfg.lon], cfg.zoom, { animate: false });
      programmatic = false;
    }
  }

  function initMap() {
    map = L.map('map', { zoomControl: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, minZoom: 5, maxZoom: 10 })
      .setView([cfg.lat, cfg.lon], cfg.zoom);
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('Previsión <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0) · Avisos AEMET');
    map.on('dragstart zoomstart', function () { if (!programmatic) { userMoved = true; } touchFull(); });
    map.on('click', function () { if (!full) { enterFull(); } else { touchFull(); } });
    if (cfg.radarFade) { $('radar').className += ' fade'; }
    if (!cfg.demo) {
      L.tileLayer(cfg.basemapUrl, { subdomains: 'abcd', maxZoom: 16, attribution: cfg.basemapAttribution + ' · Radar &copy; RainViewer' }).addTo(map);
      /* nombres de lugares por encima del radar */
      if (cfg.labelsUrl) {
        map.createPane('labels');
        map.getPane('labels').style.zIndex = 450;
        map.getPane('labels').style.pointerEvents = 'none';
        L.tileLayer(cfg.labelsUrl, { pane: 'labels', subdomains: 'abcd', maxZoom: 16 }).addTo(map);
      }
    }
    var m = L.marker([cfg.lat, cfg.lon], { icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="pin"><div class="ring"></div><div class="core"></div><div class="name"></div></div>' }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    m.getElement().querySelector('.name').textContent = cfg.name;
  }

  /* ---- Radar ampliado: tocar el mapa lo pone a pantalla completa; vuelve solo tras unos segundos sin tocarlo ---- */
  var full = false, fullTimer = null, zoomCtl = null;
  function enterFull() {
    full = true;
    $('radar').className += ' full';
    updateFullInfo();
    zoomCtl = L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    map.invalidateSize();
    touchFull();
  }
  function exitFull() {
    if (!full) { return; }
    full = false;
    clearTimeout(fullTimer);
    $('radar').className = $('radar').className.replace(/\s*full/g, '');
    if (zoomCtl) { map.removeControl(zoomCtl); zoomCtl = null; }
    userMoved = false;
    fixMapSize();
  }
  function touchFull() {
    if (!full) { return; }
    clearTimeout(fullTimer);
    fullTimer = setTimeout(exitFull, cfg.fullRadarSec * 1000);
  }
  function updateFullInfo() {
    if (!W) { $('fullinfo').innerHTML = '<span class="c">' + $('clock').textContent + '</span>'; return; }
    var w = wmo(W.current.weather_code, W.current.is_day);
    var nh = $('nexthour').textContent || '';
    $('fullinfo').innerHTML = '<span class="c">' + $('clock').textContent + '</span><i></i>' + svgIcon(w.kind) +
      '<span class="t">' + Math.round(W.current.temperature_2m) + '°</span>' + (nh ? '<span class="n">' + esc(nh) + '</span>' : '');
  }

  function setPlayIcon() {
    var b = $('play');
    b.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    b.setAttribute('aria-label', playing ? 'Pausar animación del radar' : 'Reproducir animación del radar');
  }

  /* ---- Capas observadas (RainViewer). Solo el fotograma visible y el siguiente en memoria. ---- */
  function getObsLayer(f) {
    if (cfg.demo) { return null; }
    if (!layerCache[f.path]) {
      var layer = L.tileLayer(radarHost + f.path + '/256/{z}/{x}/{y}/' + RADAR_COLOR + '/1_0.png', {
        tileSize: 256, maxNativeZoom: 7, maxZoom: 10, opacity: 0, zIndex: 10, updateWhenIdle: true, keepBuffer: 0
      });
      layer._ready = false;
      layer.on('loading', function () { layer._ready = false; });
      layer.on('load', function () { layer._ready = true; });
      layer.addTo(map);
      layerCache[f.path] = layer;
    }
    return layerCache[f.path];
  }
  function trimObs(keep) {
    for (var id in layerCache) {
      if (layerCache.hasOwnProperty(id) && !keep[id]) { map.removeLayer(layerCache[id]); delete layerCache[id]; }
    }
  }
  function layerFor(i) {
    var f = frames[i];
    if (!f) { return null; }
    return f.kind === 'obs' ? getObsLayer(f) : getFcLayer(f.j);
  }

  function framePos(i) {
    var f = frames[i], nObs = obsFrames.length;
    if (f.kind === 'obs') { return nObs > 1 ? OBS * f.j / (nObs - 1) : 0; }
    var t0 = nObs ? obsFrames[nObs - 1].time : Math.floor(now().getTime() / 1000);
    return Math.min(100, OBS + (100 - OBS) * (f.time - t0) / 86400);
  }

  function radarAgeMin() {
    if (!obsFrames.length) { return -1; }
    return Math.round((now().getTime() / 1000 - obsFrames[obsFrames.length - 1].time) / 60);
  }

  function showFrame(i) {
    if (!frames.length) { return; }
    cur = Math.max(0, Math.min(i, frames.length - 1));
    var f = frames[cur];
    var lc = layerFor(cur);
    if (displayed && displayed !== lc) { displayed.setOpacity(0); }
    if (lc) { lc.setOpacity(f.kind === 'obs' ? cfg.radarOpacity : cfg.fcOpacity); if (lc.setZIndex) { lc.setZIndex(20); } }
    displayed = lc;

    /* precarga del siguiente fotograma observado y limpieza del resto */
    var keep = {};
    if (f.kind === 'obs') { keep[f.path] = true; }
    var nf = frames[(cur + 1) % frames.length];
    if (nf.kind === 'obs') { keep[nf.path] = true; var ln = getObsLayer(nf); if (ln && ln !== lc) { ln.setZIndex(10); } }
    trimObs(keep);

    /* línea de tiempo */
    var pos = framePos(cur);
    $('t-fill').style.width = Math.min(pos, OBS) + '%';
    $('t-fill-fc').style.left = OBS + '%';
    $('t-fill-fc').style.width = Math.max(0, pos - OBS) + '%';
    $('t-thumb').style.left = pos + '%';
    $('t-thumb').className = f.kind === 'fc' ? 'fc' : '';

    /* pastilla de modo */
    var chip = $('chip-r'), age = radarAgeMin();
    var stale = !cfg.demo && f.kind === 'obs' && cur === obsFrames.length - 1 && age > cfg.radarStaleMin;
    if (f.kind === 'obs') {
      chip.className = 'chip mode' + (stale ? ' warn' : '');
      chip.querySelector('.k').textContent = 'Observado';
      chip.querySelector('.w').textContent = fmtTime(f.time) + (stale ? ' · hace ' + age + ' min' : '');
    } else {
      var d = new Date(f.time * 1000);
      chip.className = 'chip mode fc';
      chip.querySelector('.k').textContent = 'Previsión';
      chip.querySelector('.w').textContent = dayWord(d) + ' ' + hhmm(d);
    }
  }

  function layoutTimeline() {
    OBS = fcFrames.length ? 19 : 100;
    $('t-obs').style.width = OBS + '%';
    $('t-fc').style.left = OBS + '%';
    $('t-fc').style.display = fcFrames.length ? 'block' : 'none';
    $('t-now').style.left = 'calc(' + OBS + '% - 1px)';
    $('t-now').style.display = fcFrames.length ? 'block' : 'none';
    $('tlh-obs').style.width = OBS + '%';
    $('tlh-fc').style.display = fcFrames.length ? 'block' : 'none';
    var t = '';
    function tick(left, txt, cls, shift) {
      return '<span class="' + (cls || '') + '" style="left: ' + left + '%; -webkit-transform: translateX(' + shift + '); transform: translateX(' + shift + ')">' + txt + '</span>';
    }
    if (fcFrames.length) {
      t += tick(0, '−2 h', '', '0');
      t += tick(OBS, 'Ahora', 'now', '-50%');
      for (var hh = 6; hh <= 18; hh += 6) { t += tick(OBS + (100 - OBS) * hh / 24, '+' + hh + ' h', '', '-50%'); }
      t += tick(100, '+24 h', '', '-100%');
    } else if (obsFrames.length) {
      t += tick(0, fmtTime(obsFrames[0].time), '', '0');
      t += tick(100, 'ahora', 'now', '-100%');
    }
    $('ticks').innerHTML = t;
  }

  function rebuildFrames() {
    frames = [];
    var k;
    for (k = 0; k < obsFrames.length; k++) { frames.push({ kind: 'obs', j: k, time: obsFrames[k].time, path: obsFrames[k].path }); }
    var t0 = obsFrames.length ? obsFrames[obsFrames.length - 1].time : 0;
    for (k = 0; k < fcFrames.length; k++) { if (fcFrames[k].time > t0) { frames.push({ kind: 'fc', j: k, time: fcFrames[k].time }); } }
    layoutTimeline();
    showFrame(obsFrames.length ? obsFrames.length - 1 : 0);
    schedule();
  }

  /* ---- Animación ---- */
  function isNight() {
    if (cfg.forceNight) { return true; }
    if (!cfg.nightFrom) { return false; }
    var d = now(), m = d.getHours() * 60 + d.getMinutes();
    var a = hm(cfg.nightFrom), b = hm(cfg.nightTo);
    return a > b ? (m >= a || m < b) : (m >= a && m < b);
  }
  function hm(t) { var p = String(t).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1] || 0, 10); }

  var waited = 0, loops = 0;
  function schedule() {
    clearTimeout(animTimer);
    if (!playing || frames.length < 2) { return; }
    var f = frames[cur];
    var step = isNight() ? cfg.nightFrameMs : (f.kind === 'fc' ? cfg.fcFrameMs : cfg.frameMs);
    var delay = (cur === obsFrames.length - 1 || cur === frames.length - 1) ? cfg.pauseLastMs : step;
    animTimer = setTimeout(advance, delay);
  }
  function advance() {
    var nxt = (cur + 1) % frames.length;
    /* tras unas vueltas se para solo en la hora actual */
    if (nxt === 0) {
      loops++;
      if (loops >= cfg.playLoops) { loops = 0; setPlaying(false); showFrame(obsFrames.length ? obsFrames.length - 1 : 0); return; }
    }
    var nf = frames[nxt];
    var ln = nf && nf.kind === 'obs' ? getObsLayer(nf) : null;
    /* si el siguiente fotograma aún no ha cargado, espera hasta 3 s para no enseñar el mapa vacío */
    if (ln && !ln._ready && waited < 3000) { waited += 250; animTimer = setTimeout(advance, 250); return; }
    waited = 0;
    showFrame(nxt);
    schedule();
  }
  function setPlaying(v) {
    playing = v;
    if (v) { loops = 0; }
    setPlayIcon();
    if (playing) { schedule(); } else { clearTimeout(animTimer); }
  }

  /* ---- Observado (RainViewer, últimas 2 h) ---- */
  function loadRadar() {
    if (cfg.demo) { applyObs('', demoObs()); return; }
    getJSON('https://api.rainviewer.com/public/weather-maps.json', function (data) {
      var r = data.radar || {};
      var list = (r.past || []).concat(r.nowcast || []);
      if (list.length) { applyObs(data.host || 'https://tilecache.rainviewer.com', list); }
      radarFails = 0; updateStatus(); scheduleRadar();
    }, function () { radarFails++; updateStatus(); scheduleRadar(); });
  }
  /* ---- Análisis del radar alrededor de la ubicación (zoom 7, 3×3 teselas = 768 px, ~0,9 km por píxel) ----
     · si llueve ahora encima, · si una zona de lluvia se acerca y en cuántos minutos llegaría,
     · y un acumulado aproximado del día.  Si el navegador no puede leer las imágenes, se ignora. */
  var radarHere = null, radarEta = null, radarOk = false;
  var CELL = 6, GN = 128; // celdas de 6 px → rejilla 128×128 (~5,5 km por celda)
  function tilePos() {
    var z = 7, n = Math.pow(2, z), latR = cfg.lat * Math.PI / 180;
    var fx = (cfg.lon + 180) / 360 * n, fy = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
    var tx = Math.floor(fx), ty = Math.floor(fy);
    return { z: z, tx: tx, ty: ty, cx: 256 + Math.floor((fx - tx) * 256), cy: 256 + Math.floor((fy - ty) * 256) };
  }
  function loadMosaic(f, tp, done) {
    var cv = document.createElement('canvas'); cv.width = 768; cv.height = 768;
    var ctx = cv.getContext('2d'), left = 9, failed = false;
    function one(dx, dy) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { ctx.drawImage(img, (dx + 1) * 256, (dy + 1) * 256); if (--left === 0 && !failed) { finish(); } };
      img.onerror = function () { if (!failed) { failed = true; done(null); } };
      img.src = radarHost + f.path + '/256/' + tp.z + '/' + (tp.tx + dx) + '/' + (tp.ty + dy) + '/' + RADAR_COLOR + '/1_0.png';
    }
    function finish() {
      try { done(ctx.getImageData(0, 0, 768, 768).data); } catch (e) { done(null); }
    }
    for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) { one(dx, dy); } }
  }
  function pixLevel(d, o) {
    if (d[o + 3] <= 40) { return 0; }
    var r = d[o], g = d[o + 1];
    return r > 180 && g < 140 ? 3 : (r > 180 ? 2 : 1);
  }
  /* rejilla de celdas: nivel máximo si al menos un tercio de la celda tiene eco */
  function toGrid(d) {
    var g = new Uint8Array(GN * GN);
    for (var gy = 0; gy < GN; gy++) {
      for (var gx = 0; gx < GN; gx++) {
        var wet = 0, mx = 0;
        for (var y = gy * CELL; y < gy * CELL + CELL; y += 2) {
          for (var x = gx * CELL; x < gx * CELL + CELL; x += 2) {
            var l = pixLevel(d, (y * 768 + x) * 4); if (l) { wet++; if (l > mx) { mx = l; } }
          }
        }
        g[gy * GN + gx] = wet >= 3 ? mx : 0;
      }
    }
    return g;
  }
  function analyzeRadar() {
    if (cfg.demo || obsFrames.length < 4 || !radarHost) { return; }
    /* se compara con el fotograma de hace ~60 min (o el más antiguo) para medir mejor la velocidad */
    var tp = tilePos(), fNew = obsFrames[obsFrames.length - 1], fOld = obsFrames[Math.max(0, obsFrames.length - 7)];
    loadMosaic(fNew, tp, function (dNew) {
      if (!dNew) { radarOk = false; return; }
      /* lluvia encima ahora (5×5 px alrededor) */
      var wet = 0, lv = 0;
      for (var y = tp.cy - 2; y <= tp.cy + 2; y++) { for (var x = tp.cx - 2; x <= tp.cx + 2; x++) { var l = pixLevel(dNew, (y * 768 + x) * 4); if (l) { wet++; lv = Math.max(lv, l); } } }
      radarHere = { time: fNew.time, wet: wet >= 3, level: lv };
      radarOk = true;
      accumulate(radarHere);
      loadMosaic(fOld, tp, function (dOld) {
        radarEta = dOld ? eta(toGrid(dOld), toGrid(dNew), tp, (fNew.time - fOld.time) / 60) : null;
        if (W) { renderWeather(W); }
        checkSound();
      });
      if (W) { renderWeather(W); }
    });
  }
  /* desplazamiento que mejor encaja el fotograma viejo con el nuevo → velocidad → ¿llega aquí y cuándo? */
  function eta(gOld, gNew, tp, minutes) {
    var nOld = 0, nNew = 0, k;
    for (k = 0; k < gOld.length; k++) { if (gOld[k]) { nOld++; } if (gNew[k]) { nNew++; } }
    if (nOld < 8 || nNew < 8) { return null; }
    var R = 12;
    function score(sx, sy) {
      var sc = 0;
      for (var y = Math.max(0, -sy); y < GN - Math.max(0, sy); y++) {
        var ro = y * GN, rn = (y + sy) * GN + sx;
        for (var x = Math.max(0, -sx); x < GN - Math.max(0, sx); x++) { if (gOld[ro + x] && gNew[rn + x]) { sc++; } }
      }
      return sc;
    }
    var best = -1, bx = 0, by = 0;
    for (var sy = -R; sy <= R; sy += 2) {           // búsqueda gruesa cada 2 celdas…
      for (var sx = -R; sx <= R; sx += 2) {
        var sc = score(sx, sy);
        if (sc > best || (sc === best && sx * sx + sy * sy < bx * bx + by * by)) { best = sc; bx = sx; by = sy; }
      }
    }
    var cx0 = bx, cy0 = by;                           // …y fina alrededor del mejor
    for (sy = cy0 - 1; sy <= cy0 + 1; sy++) {
      for (sx = cx0 - 1; sx <= cx0 + 1; sx++) {
        sc = score(sx, sy);
        if (sc > best) { best = sc; bx = sx; by = sy; }
      }
    }
    if (best < Math.min(nOld, nNew) * 0.3) { return null; }
    /* ajuste por debajo de una celda (parábola sobre los vecinos) */
    function sub(a, b0, c) { var den = a - 2 * b0 + c; return den < 0 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * den))) : 0; }
    var fxs = bx + sub(score(bx - 1, by), best, score(bx + 1, by));
    var fys = by + sub(score(bx, by - 1), best, score(bx, by + 1));
    bx = fxs; by = fys;
    var vx = bx / minutes, vy = by / minutes;           // celdas por minuto
    if (vx * vx + vy * vy < 0.0004) { return null; }    // casi quieta
    var cx = tp.cx / CELL, cy = tp.cy / CELL;
    for (var t = 5; t <= 60; t += 5) {
      var lvl = 0;
      for (k = 0; k < gNew.length; k++) {
        if (!gNew[k]) { continue; }
        var px = (k % GN) + 0.5 + vx * t, py = Math.floor(k / GN) + 0.5 + vy * t;
        if ((px - cx) * (px - cx) + (py - cy) * (py - cy) <= 1.2) { lvl = Math.max(lvl, gNew[k]); }
      }
      if (lvl) { return { minutes: t, level: lvl, time: Math.floor(Date.now() / 1000), speed: Math.round(Math.sqrt(vx * vx + vy * vy) * CELL * 0.92 * 60) }; }
    }
    return null;
  }
  /* acumulado del día con el radar (solo mientras la app está abierta) */
  var ACC_KEY = 'estacion-radar-acum';
  function accumulate(h) {
    var d = now(), key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(), a;
    try { a = JSON.parse(localStorage.getItem(ACC_KEY) || 'null'); } catch (e) { a = null; }
    if (!a || a.day !== key) { a = { day: key, mm: 0, last: 0, since: d.getTime() }; }
    if (a.last && h.time > a.last) {
      var mins = Math.min(15, (h.time - a.last) / 60);
      a.mm += [0, 1, 4, 15][h.wet ? h.level : 0] * mins / 60;
    }
    if (!a.last || h.time > a.last) { a.last = h.time; }
    try { localStorage.setItem(ACC_KEY, JSON.stringify(a)); } catch (e2) { /* sin almacenamiento */ }
  }
  /* devuelve el acumulado del radar si ha cubierto casi todo el día (desde antes de las 01:00), si no null */
  function radarRainToday() {
    if (!radarOk) { return null; }
    var a, d = now();
    try { a = JSON.parse(localStorage.getItem(ACC_KEY) || 'null'); } catch (e) { return null; }
    if (!a || a.day !== d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()) { return null; }
    var since = new Date(a.since);
    return since.getHours() < 1 ? a.mm : null;
  }

  function applyObs(host, list) {
    var key = list.length ? String(list[list.length - 1].time) + ':' + list.length : '';
    if (key === lastObsKey) { return; }
    lastObsKey = key;
    radarHost = host;
    obsFrames = list;
    rebuildFrames();
    analyzeRadar();
  }

  /* ---- Previsión +24 h: rejilla de puntos de Open-Meteo pintada en el navegador ---- */
  /* 17×13 = 221 puntos cada hora ≈ 5.300 llamadas/día: por debajo del límite gratuito (10.000) */
  var GRID = { cols: 17, rows: 13, dLat: 0.24, dLon: 0.375, up: 10 };
  var gridBounds = null;

  function gridPoints() {
    var lats = [], lons = [];
    var la0 = cfg.lat + (GRID.rows - 1) / 2 * GRID.dLat, lo0 = cfg.lon - (GRID.cols - 1) / 2 * GRID.dLon;
    for (var r = 0; r < GRID.rows; r++) {
      for (var c = 0; c < GRID.cols; c++) { lats.push((la0 - r * GRID.dLat).toFixed(3)); lons.push((lo0 + c * GRID.dLon).toFixed(3)); }
    }
    gridBounds = L.latLngBounds(
      [la0 - (GRID.rows - 1) * GRID.dLat - GRID.dLat / 2, lo0 - GRID.dLon / 2],
      [la0 + GRID.dLat / 2, lo0 + (GRID.cols - 1) * GRID.dLon + GRID.dLon / 2]);
    return { lats: lats, lons: lons };
  }

  function loadForecastGrid() {
    if (!cfg.radarForecast) { return; }
    var pts = gridPoints();
    if (cfg.demo) { applyGrid(demoGrid()); return; }
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pts.lats.join(',') + '&longitude=' + pts.lons.join(',') +
      '&hourly=precipitation&forecast_hours=26&timeformat=unixtime&timezone=GMT';
    getJSON(url, function (d) {
      if (!d || !d.length) { return; }
      var times = d[0].hourly.time, out = [];
      for (var k = 0; k < times.length; k++) {
        var vals = [];
        for (var p = 0; p < d.length; p++) { vals.push((d[p].hourly.precipitation[k]) || 0); }
        out.push({ time: times[k], vals: vals });
      }
      applyGrid(out);
    }, function () { /* se reintenta en el siguiente ciclo */ });
  }

  function applyGrid(list) {
    var t0 = Math.floor(now().getTime() / 1000), out = [];
    for (var k = 0; k < list.length; k++) {
      if (list[k].time > t0 && list[k].time <= t0 + 24 * 3600 + 1800) { out.push(list[k]); }
    }
    for (var i = 0; i < fcLayers.length; i++) { if (fcLayers[i]) { map.removeLayer(fcLayers[i]); } }
    fcLayers = [];
    if (displayed && frames[cur] && frames[cur].kind === 'fc') { displayed = null; }
    fcFrames = out;
    rebuildFrames();
  }

  /* mm/h → color (misma escala que la leyenda) */
  var STOPS = [[0.03, 136, 221, 238, 0], [0.2, 136, 221, 238, 0.35], [0.5, 136, 221, 238, 0.60], [2, 0, 163, 224, 0.75], [5, 255, 238, 0, 0.80], [10, 255, 129, 0, 0.85], [25, 193, 0, 0, 0.90], [50, 255, 170, 255, 0.90]];
  function colorFor(v) {
    if (v < STOPS[0][0]) { return [0, 0, 0, 0]; }
    for (var i = 1; i < STOPS.length; i++) {
      if (v < STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], t = (v - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, a[4] + (b[4] - a[4]) * t];
      }
    }
    var l = STOPS[STOPS.length - 1];
    return [l[1], l[2], l[3], l[4]];
  }

  /* Cada fotograma: se interpolan los valores de la rejilla (curva suave) y luego se colorean */
  function smooth(t) { return t * t * (3 - 2 * t); }
  function getFcLayer(j) {
    if (fcLayers[j]) { return fcLayers[j]; }
    var f = fcFrames[j];
    if (!f || !gridBounds) { return null; }
    var S = GRID.up, W2 = GRID.cols * S, H2 = GRID.rows * S, v = f.vals;
    var cv = document.createElement('canvas');
    cv.width = W2; cv.height = H2;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(W2, H2), d = img.data;
    for (var y = 0; y < H2; y++) {
      var gy = Math.max(0, Math.min(GRID.rows - 1, (y + 0.5) / S - 0.5)), r0 = Math.floor(gy), r1 = Math.min(r0 + 1, GRID.rows - 1), ty = smooth(gy - r0);
      for (var x = 0; x < W2; x++) {
        var gx = Math.max(0, Math.min(GRID.cols - 1, (x + 0.5) / S - 0.5)), c0 = Math.floor(gx), c1 = Math.min(c0 + 1, GRID.cols - 1), tx = smooth(gx - c0);
        var a = v[r0 * GRID.cols + c0], b = v[r0 * GRID.cols + c1], c = v[r1 * GRID.cols + c0], e = v[r1 * GRID.cols + c1];
        var val = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
        var col = colorFor(val), o = (y * W2 + x) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.round(col[3] * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    var layer = L.imageOverlay(cv.toDataURL('image/png'), gridBounds, { opacity: 0, interactive: false, className: 'fc-img', zIndex: 5 });
    layer.addTo(map);
    fcLayers[j] = layer;
    return layer;
  }

  /* ======================= Estado, reintentos y ciclos ======================= */
  function updateStatus() {
    var el = $('status');
    var age = radarAgeMin();
    var radarOld = !cfg.demo && obsFrames.length && age > cfg.radarStaleMin;
    var radarTxt = radarOld ? ' · Radar sin actualizar (' + age + ' min)' : '';
    if (!lastOk) {
      el.className = lastError ? 'warn' : '';
      el.textContent = (lastError ? 'Sin conexión · reintentando' : 'Cargando datos…') + radarTxt;
    } else {
      var min = Math.max(0, Math.round((Date.now() - lastOk) / 60000));
      var txt = min < 1 ? 'ahora' : 'hace ' + min + ' min';
      if (lastError) { el.className = 'warn'; el.textContent = 'Sin conexión · datos de ' + txt + ' · reintentando' + radarTxt; }
      else { el.className = radarOld ? 'warn' : ''; el.textContent = 'Actualizado ' + txt + (obsFresh() ? ' · medido en ' + OBS.station.replace(' aeropuerto', '') + ' ' + hhmm(new Date(OBS.time)) : ' · datos del modelo') + radarTxt; }
    }
    if (frames.length) { showFrame(cur); }
  }

  /* Si falla, vuelve a probar a los 30 s, 1, 2 y 5 min; si va bien, a la frecuencia normal */
  var BACKOFF = [30, 60, 120, 300];
  function nextDelay(fails, normalMin) {
    if (!fails) { return normalMin * 60000; }
    return Math.min(BACKOFF[Math.min(fails, BACKOFF.length) - 1] * 1000, normalMin * 60000);
  }
  var weatherTimer = null, weatherFails = 0, radarTimer = null, radarFails = 0;
  function scheduleWeather() { clearTimeout(weatherTimer); weatherTimer = setTimeout(loadWeather, nextDelay(weatherFails, cfg.weatherEveryMin)); }
  function scheduleRadar() { clearTimeout(radarTimer); radarTimer = setTimeout(loadRadar, nextDelay(radarFails, cfg.radarEveryMin)); }

  function loadWeather() {
    if (cfg.demo) { renderWeather(demoWeather()); lastOk = Date.now() - 3 * 60000; updateStatus(); return; }
    getJSON(weatherUrl(), function (data) {
      try { renderWeather(data); } catch (e) { lastError = true; weatherFails++; updateStatus(); scheduleWeather(); return; }
      lastOk = Date.now(); lastError = false; weatherFails = 0;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: lastOk, data: data })); } catch (e2) { /* sin almacenamiento */ }
      updateStatus(); scheduleWeather();
    }, function () { lastError = true; weatherFails++; updateStatus(); scheduleWeather(); });
  }
  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) { return; }
      var c = JSON.parse(raw);
      if (c && c.data && Date.now() - c.t < 6 * 3600 * 1000) { renderWeather(c.data); lastOk = c.t; updateStatus(); }
    } catch (e) { /* caché inválida */ }
  }

  /* ======================= Sonido ======================= */
  /* Los navegadores solo dejan sonar después de un primer toque en la pantalla */
  var actx = null, lastRainState = null;
  function unlockAudio() {
    if (!cfg.sound) { return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!actx && AC) { actx = new AC(); }
      if (actx && actx.state === 'suspended') { actx.resume(); }
    } catch (e) { actx = null; }
  }
  function chime(kind) {
    if (!cfg.sound || !actx || isNight()) { return; }
    try {
      var notes = kind === 'alert' ? [880, 660, 880] : [660, 880];
      var t0 = actx.currentTime + 0.05;
      for (var i = 0; i < notes.length; i++) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = notes[i];
        g.gain.setValueAtTime(0, t0 + i * 0.28);
        g.gain.linearRampToValueAtTime(cfg.soundVolume, t0 + i * 0.28 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.28 + 0.6);
        o.connect(g); g.connect(actx.destination);
        o.start(t0 + i * 0.28); o.stop(t0 + i * 0.28 + 0.65);
      }
    } catch (e) { /* sin sonido */ }
  }
  /* suena cuando empieza a llover (o va a llover en ≤30 min) y cuando entra un aviso nuevo */
  function checkSound() {
    var nh = $('nexthour'), wetSoon = nh.className.indexOf('wet') >= 0 && (/Lloviendo/.test(nh.textContent) || (/Lluvia en ~(\d+)/.test(nh.textContent) && +RegExp.$1 <= 30));
    if (lastRainState === false && wetSoon) { chime('rain'); }
    lastRainState = wetSoon;
  }
  var SEEN_KEY = 'estacion-avisos-vistos';
  function checkAlertSound(list) {
    var seen = {};
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (e) { seen = {}; }
    var isNew = false, keep = {};
    for (var i = 0; i < list.length; i++) {
      var id = list[i].level + '|' + list[i].event + '|' + list[i].onset;
      keep[id] = 1;
      if (!seen[id]) { isNew = true; }
    }
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(keep)); } catch (e2) { /* sin almacenamiento */ }
    if (isNew && AL && !cfg.demo) { chime('alert'); }
  }

  /* ======================= Modo noche y recarga diaria ======================= */
  var awakeUntil = 0, startedAt = Date.now(), wasNight = null;
  function applyNight() {
    var night = isNight() && Date.now() > awakeUntil;
    var dim = $('dim');
    dim.style.opacity = night ? cfg.nightDim : 0;
    dim.style.display = night ? 'block' : 'none';
    if (night !== wasNight) { wasNight = night; if (playing) { schedule(); } }
  }
  function wakeFromNight(e) { if (e && e.target && e.target.parentNode && e.target.parentNode.id === 'demobar') { return; } if (isNight()) { awakeUntil = Date.now() + 60000; applyNight(); } }
  function minuteTick() {
    applyNight();
    if (W) { renderSun(W.daily); renderNextHour(W); renderEvening(W); }
    renderAlerts();
    if (!cfg.reloadAt || cfg.demo) { return; }
    var d = new Date();
    if (pad(d.getHours()) + ':' + pad(d.getMinutes()) === cfg.reloadAt && Date.now() - startedAt > 3600000 && navigator.onLine !== false) {
      location.reload();
    }
  }

  /* ======================= Datos de muestra (?demo=1, &alert=amarillo|naranja|rojo, &night=1) ======================= */
  function demoObs() {
    var out = [], base = Math.floor(now().getTime() / 1000) - 12 * 600 - 420;
    for (var i = 0; i < 13; i++) { out.push({ time: base + i * 600, path: '' }); }
    return out;
  }
  function demoWeather() {
    var storm = cfg.demoAlert === 'naranja' || cfg.demoAlert === 'rojo';
    var H = now().getHours();
    var time = [], temp = [], prob = [], prec = [], code = [], isDay = [], pres = [], cape = [], wsp = [];
    for (var hh = -24; hh < 192; hh++) {
      var d = new Date(2026, 10, 14, hh);
      time.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':00');
      var hr = d.getHours();
      temp.push(Math.round(14 + 4 * Math.sin((hr - 9) / 24 * 2 * Math.PI)));
      isDay.push(hr >= 8 && hr < 18 ? 1 : 0);
      var rel = hh - H, p = 0, mm = 0, c = hr >= 8 && hr < 16 ? 1 : 3;
      if (hh >= 9 && hh <= 10) { mm = 0.2; c = 61; p = 40; }
      if (H >= 20 && hh >= 39 && hh <= 41) { mm = [1.6, 3.2, 1.1][hh - 39]; p = [70, 75, 60][hh - 39]; c = 61; }
      if (H < 20 && rel >= 1 && rel <= 6) { var bump = [0.6, 1.8, 2.4, 1.2, 0.2, 0][rel - 1]; mm = storm ? bump * 4 : bump; p = [45, 60, 70, 45, 20, 10][rel - 1]; c = mm >= 0.5 ? (storm && rel <= 4 ? 95 : 61) : 3; }
      prob.push(p); prec.push(mm); code.push(c);
      pres.push(1016 - (hh > 10 ? (hh - 10) * 0.4 : 0));
      cape.push(storm && rel >= 0 && rel <= 5 ? 1800 : 150);
      if (hh >= 36 && hh <= 41) { mm = [0.4, 1.6, 2.4, 3.2, 1.1, 0.3][hh - 36]; prec[prec.length - 1] = mm; prob[prob.length - 1] = 70; code[code.length - 1] = 61; }
      wsp.push(Math.round(10 + 8 * Math.sin(hh / 5)));
    }
    var mt = [], mp = [];
    for (var k = -1; k < 8; k++) {
      var md = new Date(2026, 10, 14, H, 15 + k * 15);
      mt.push('2026-11-14T' + pad(md.getHours()) + ':' + pad(md.getMinutes()));
      mp.push(storm ? 0.6 : (H < 20 && k >= 2 && k <= 5 ? 0.15 : 0));
    }
    return {
      current: { time: '2026-11-14T' + pad(H) + ':15', temperature_2m: H >= 20 ? 14.1 : (storm ? 15.2 : 18.2), apparent_temperature: storm ? 13 : 17.1, relative_humidity_2m: storm ? 94 : 68, dew_point_2m: storm ? 14.6 : 12.1,
        is_day: H >= 18 ? 0 : 1, weather_code: H >= 20 ? 0 : (storm ? 95 : 2), wind_speed_10m: storm ? 38 : 14, wind_direction_10m: storm ? 95 : 45, wind_gusts_10m: storm ? 71 : 32, pressure_msl: storm ? 1004.2 : 1013.1 },
      minutely_15: { time: mt, precipitation: mp },
      hourly: { time: time, temperature_2m: temp, precipitation_probability: prob, precipitation: prec, weather_code: code, is_day: isDay, pressure_msl: pres, cape: cape, wind_speed_10m: wsp },
      daily: {
        time: ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'],
        weather_code: [storm ? 95 : 2, 61, 3, 0, 0, 2, 61, 3],
        temperature_2m_max: [20, 19, 18, 19, 21, 20, 17, 16], temperature_2m_min: [12, 13, 11, 10, 11, 12, 11, 9],
        precipitation_probability_max: [storm ? 90 : 40, 70, 20, 0, 0, 10, 60, 30], precipitation_sum: [storm ? 36 : 4, 6.2, 0, 0, 0, 0, 3.1, 0.4],
        sunrise: ['2026-11-14T07:51', '2026-11-15T07:52', '2026-11-16T07:53', '2026-11-17T07:54', '2026-11-18T07:55', '2026-11-19T07:56', '2026-11-20T07:57', '2026-11-21T07:58'],
        sunset: ['2026-11-14T17:38', '2026-11-15T17:37', '2026-11-16T17:36', '2026-11-17T17:36', '2026-11-18T17:35', '2026-11-19T17:34', '2026-11-20T17:34', '2026-11-21T17:33'],
        uv_index_max: [2.1, 1.8, 2.4, 2.6, 2.5, 2.3, 1.5, 2], wind_gusts_10m_max: [storm ? 75 : 35, 45, 30, 25, 28, 30, 50, 40], wind_speed_10m_max: [storm ? 40 : 18, 24, 15, 12, 14, 15, 28, 20], wind_direction_10m_dominant: [45, 90, 315, 300, 330, 300, 90, 0]
      }
    };
  }
  function demoGrid() {
    var out = [], t0 = Math.floor(now().getTime() / 3600000) * 3600;
    for (var k = 1; k <= 25; k++) {
      var vals = [];
      /* una banda de lluvia que entra por el SO y sale por el NE */
      var cx = -5 + k * 0.6, cy = 10 - k * 0.45;
      for (var r = 0; r < GRID.rows; r++) {
        for (var c = 0; c < GRID.cols; c++) {
          var dx = (c - 8) - cx, dy = r - cy;
          var v = 6 * Math.exp(-(dx * dx / 3 + dy * dy / 1.6)) + 2.5 * Math.exp(-((dx + 3) * (dx + 3) / 2 + (dy - 2) * (dy - 2) / 1.2)) * (k < 9 ? 1 : Math.max(0, 1 - (k - 9) / 6));
          vals.push(v);
        }
      }
      out.push({ time: t0 + k * 3600, vals: vals });
    }
    return out;
  }
  function demoAlerts() {
    var lv = cfg.demoAlert;
    var base = { updated: new Date().toISOString(), zone: 'Litoral sur de Tarragona', alerts: [] };
    if (!LEVEL_RANK[lv]) { return base; }
    var d = now();
    function at(h) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h); return x.toISOString(); }
    base.alerts.push({ level: lv, event: 'Lluvias', detail: 'Acumulados de 60 mm en 12 h', onset: at(lv === 'amarillo' ? 21 : 17), expires: at(27) });
    if (lv !== 'amarillo') { base.alerts.push({ level: 'amarillo', event: 'Tormentas', detail: '', onset: at(18), expires: at(23) }); }
    return base;
  }

  /* Barra para cambiar de estado en el modo demo */
  function demoBar() {
    var bar = document.createElement('div');
    bar.id = 'demobar';
    var opts = [['', 'Tarde 17:17'], ['amarillo', 'Aviso amarillo'], ['naranja', 'Aviso naranja'], ['rojo', 'Aviso rojo'], ['tarde', 'Noche 21:35'], ['noche', 'Atenuado']];
    var mode = HASH === 'tarde' ? 'tarde' : '';
    var html = '<span>Demo · datos inventados</span>';
    for (var i = 0; i < opts.length; i++) { html += '<button type="button" data-v="' + opts[i][0] + '">' + opts[i][1] + '</button>'; }
    bar.innerHTML = html;
    document.body.appendChild(bar);
    function mark() {
      var bs = bar.getElementsByTagName('button');
      for (var k = 0; k < bs.length; k++) {
        var v = bs[k].getAttribute('data-v');
        bs[k].className = (v === 'noche' ? cfg.forceNight : (v === 'tarde' ? (!cfg.forceNight && mode === 'tarde') : (!cfg.forceNight && mode !== 'tarde' && v === cfg.demoAlert))) ? 'on' : '';
      }
    }
    bar.onclick = function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-v');
      if (v === null || v === undefined) { return; }
      cfg.forceNight = v === 'noche';
      mode = v === 'tarde' ? 'tarde' : (v === 'noche' ? mode : '');
      cfg.demoAlert = (v === 'noche' || v === 'tarde') ? '' : v;
      if (mode === 'tarde') { setDemoTime(21, 35); } else { setDemoTime(17, 17); }
      updateClock();
      awakeUntil = 0;
      renderWeather(demoWeather());
      AL = demoAlerts(); renderAlerts();
      lastObsKey = ''; applyObs('', demoObs()); applyGrid(demoGrid());
      applyNight();
      mark();
      if (e.stopPropagation) { e.stopPropagation(); }
    };
    mark();
  }

  /* ======================= Pantalla completa y pantalla encendida ======================= */
  function toggleFullscreen() {
    var el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { req.call(el); }
    }
  }
  function keepAwake() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) { navigator.wakeLock.request('screen').then(function () {}, function () {}); }
    } catch (e) { /* no disponible en navegadores antiguos */ }
  }

  /* ======================= Arranque ======================= */
  function start() {
    $('place').textContent = cfg.name;
    document.title = cfg.name + ' · Estación meteorológica';
    updateClock();
    setPlayIcon();

    initMap();
    loadCache();
    loadWeather();
    loadRadar();
    loadForecastGrid();
    loadSea();
    loadAlerts();
    loadObs();

    $('play').onclick = function () { setPlaying(!playing); touchFull(); };
    $('fullclose').onclick = exitFull;
    $('wide-alert').onclick = openAlerts;
    $('col-alert').onclick = function () { if (this.className.indexOf('calm') < 0) { openAlerts(); } };
    $('days').onclick = function (e) {
      var t = e.target;
      while (t && t !== this && !(t.getAttribute && t.getAttribute('data-j') !== null)) { t = t.parentNode; }
      if (t && t !== this) { openDay(parseInt(t.getAttribute('data-j'), 10)); }
    };
    $('daypanel').onclick = function (e) {
      var t = e.target;
      if (t === this || (t.className && String(t.className).indexOf('dp-x') >= 0)) { closeDay(); }
      else { clearTimeout(dayTimer); dayTimer = setTimeout(closeDay, 30000); }
    };
    $('track').onclick = function (e) {
      if (!frames.length) { return; }
      var r = this.getBoundingClientRect(), pct = (e.clientX - r.left) / r.width * 100, best = 0, bd = 1e9;
      for (var i = 0; i < frames.length; i++) { var dd = Math.abs(framePos(i) - pct); if (dd < bd) { bd = dd; best = i; } }
      setPlaying(false);
      showFrame(best);
      touchFull();
    };
    $('clock').ondblclick = toggleFullscreen;
    $('temp').ondblclick = toggleFullscreen;

    setTimeout(fixMapSize, 600);
    setTimeout(fixMapSize, 2500);

    setInterval(function () { updateClock(); if (full) { updateFullInfo(); } }, 5000);
    setInterval(updateStatus, 30000);
    setInterval(minuteTick, 60000);
    setInterval(loadForecastGrid, cfg.forecastEveryMin * 60000);
    setInterval(loadSea, cfg.seaEveryMin * 60000);
    setInterval(loadAlerts, cfg.alertsEveryMin * 60000);
    setInterval(loadObs, 10 * 60000);
    minuteTick();
    if (cfg.demo) { demoBar(); }
    document.addEventListener('touchstart', wakeFromNight, false);
    document.addEventListener('mousedown', wakeFromNight, false);
    document.addEventListener('touchstart', unlockAudio, false);
    document.addEventListener('mousedown', unlockAudio, false);

    keepAwake();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { keepAwake(); clearTimeout(weatherTimer); clearTimeout(radarTimer); loadWeather(); loadRadar(); }
    });
    window.addEventListener('resize', function () { if (map) { map.invalidateSize(); } });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
})();
