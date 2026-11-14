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

  // Animación del radar
  autoplay: true,        // false = empieza en pausa, en el último fotograma
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

  // Modo noche: atenúa la pantalla y ralentiza el radar. Un toque la ilumina 1 minuto.
  nightFrom: '23:00',    // pon '' para desactivarlo
  nightTo: '07:00',
  nightDim: 0.55,        // 0 = nada, 0.8 = muy oscuro
  nightFrameMs: 1400,

  // Recarga automática diaria para liberar memoria ('' para desactivar)
  reloadAt: '04:00',

  // Mapa base oscuro (CARTO). Si algún día falla, cambia esta URL por otro proveedor.
  basemapUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  basemapAttribution: '&copy; OpenStreetMap &copy; CARTO'
};
