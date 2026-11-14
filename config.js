// Ajustes de la estación meteorológica. Edita solo este archivo.
// También puedes cambiar la ubicación por la URL, p. ej.:  index.html?lat=41.38&lon=2.17&name=Barcelona
window.CONFIG = {
  // Ubicación (por defecto: Salou)
  name: 'Salou',
  lat: 41.0765,
  lon: 1.1414,
  // Punto de mar para temperatura del agua y olas (un poco mar adentro)
  seaLat: 41.05,
  seaLon: 1.15,

  // Zoom inicial del mapa (el radar gratuito llega a zoom 7 de resolución real)
  zoom: 8,

  // Cada cuántos minutos se actualizan los datos
  weatherEveryMin: 10,
  radarEveryMin: 5,
  forecastEveryMin: 60,  // previsión de lluvia +24 h en el mapa
  seaEveryMin: 30,
  alertsEveryMin: 10,

  // Avisos de AEMET: archivo que genera la tarea de GitHub (ver avisos-github/LEEME.txt).
  // Si la web está en el mismo GitHub Pages, basta con 'avisos.json'. Pon '' para quitar los avisos.
  alertsUrl: 'avisos.json',

  // Datos medidos en la estación de AEMET (Reus aeropuerto). Los genera la misma tarea si el
  // repositorio tiene el secreto AEMET_API_KEY. Sin él, se usa el modelo y el radar.
  obsUrl: 'observacion.json',
  obsMaxAgeMin: 180,     // si el último dato tiene más de 3 h, se ignora

  // Rayos de la última hora (satélite MTG de EUMETSAT). Los genera la misma tarea si el
  // repositorio tiene los secretos EUMETSAT_KEY y EUMETSAT_SECRET.
  lightningUrl: 'rayos.json',
  lightningNearKm: 30,   // a esta distancia o menos: aviso destacado y sonido

  // Sonido al empezar a llover o con un aviso nuevo (necesita un toque en la pantalla tras cargar)
  sound: true,
  soundVolume: 0.25,

  // Días de previsión (se desliza la fila con el dedo; caben 5 a la vista)
  days: 8,

  // Animación del radar
  autoplay: false,       // false = quieto en la hora actual; dale al play para animarlo
  playLoops: 3,          // al darle al play da estas vueltas y vuelve solo a la hora actual
  frameMs: 700,          // ms por fotograma observado (cada 10 min)
  fcFrameMs: 450,        // ms por fotograma de previsión (cada hora)
  pauseLastMs: 2000,     // pausa en "ahora" y al final
  radarOpacity: 0.8,
  radarForecast: true,   // false = solo las 2 h observadas
  fcOpacity: 0.85,
  radarStaleMin: 20,     // aviso si el último fotograma del radar tiene más de estos minutos
  radarFade: true,       // fundido entre fotogramas (pon false si la tablet va a tirones)
  fullRadarSec: 30,      // al tocar el mapa se amplía; vuelve solo tras estos segundos sin tocarlo

  // Desde esta hora (y hasta nightTo) la tarjeta «Mañana» sustituye a Mar y Sol
  tomorrowFrom: '20:00',

  // Modo noche. Un toque muestra la pantalla normal 1 minuto.
  nightFrom: '23:00',    // pon '' para desactivarlo
  nightTo: '07:00',
  nightMode: 'reloj',    // 'reloj' = solo hora, temperatura, lluvia y avisos en negro · 'atenuar' = pantalla normal oscurecida
  nightDim: 0.55,        // (modo 'atenuar') 0 = nada, 0.8 = muy oscuro
  nightFrameMs: 1400,

  // Aviso abajo si la tablet deja de cargar o si la batería baja de este %
  batteryWarn: 30,

  // Se recarga sola cuando se publica una versión nueva en GitHub
  autoUpdate: true,

  // Recarga automática diaria para liberar memoria ('' para desactivar)
  reloadAt: '04:00',

  // Mapa base oscuro (Esri, sin clave) y nombres de lugares por encima del radar.
  // Alternativa: CARTO con clave gratuita (carto.com/basemaps/apikey):
  //   basemapUrl: 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=TU_CLAVE',
  //   labelsUrl: '',  basemapAttribution: '&copy; OpenStreetMap &copy; CARTO'
  basemapUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  labelsUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  basemapAttribution: 'Mapa &copy; Esri, HERE, Garmin, &copy; OpenStreetMap'
};
