#!/usr/bin/env python3
"""Rayos de la última hora alrededor de la ubicación, del satélite europeo MTG (Lightning Imager, destellos LFL).

Datos: EUMETSAT Data Store (gratis con registro). Necesita los secretos EUMETSAT_KEY y EUMETSAT_SECRET.
Sin ellos no hace nada. Escribe rayos.json con los rayos en un recuadro de ~±220 km.
Atribución obligatoria: © EUMETSAT.
"""
import glob, json, os, shutil, sys, tempfile, zipfile
from datetime import datetime, timedelta, timezone

KEY = os.environ.get("EUMETSAT_KEY", "").strip()
SECRET = os.environ.get("EUMETSAT_SECRET", "").strip()
LAT = float(os.environ.get("LAT", "41.0765"))
LON = float(os.environ.get("LON", "1.1414"))
DLAT, DLON = 2.0, 2.6          # recuadro (~220 km)
VENTANA_MIN = 60
MAX_PRODUCTOS = 30
OUT = os.environ.get("SALIDA", "rayos.json")
COLECCION = os.environ.get("COLECCION", "")  # si se deja vacío, se busca la colección «Lightning Flashes»


def buscar_coleccion(ds):
    if COLECCION:
        return ds.get_collection(COLECCION)
    candidatas = []
    for c in ds.collections:
        t = str(getattr(c, "title", "")) + " " + str(c)
        if "Lightning Flashes" in t or "LI-2-LFL" in t or "LFL" in t.upper().split():
            candidatas.append(c)
    for c in candidatas:
        print("Colección encontrada:", c, "-", getattr(c, "title", ""))
    if not candidatas:
        raise RuntimeError("No encuentro la colección de destellos (LFL) del Lightning Imager")
    return candidatas[0]


def leer_nc(ruta, desde, hasta):
    """Devuelve [(datetime, lat, lon)] de un NetCDF LFL dentro del recuadro y la ventana."""
    import netCDF4
    import numpy as np
    out = []
    with netCDF4.Dataset(ruta) as nc:
        v = nc.variables
        if "latitude" not in v or "longitude" not in v:
            return out
        lat = np.ma.filled(v["latitude"][:], np.nan).astype(float)
        lon = np.ma.filled(v["longitude"][:], np.nan).astype(float)
        tv = None
        for nombre in ("flash_time", "time", "flash_start_time"):
            if nombre in v:
                tv = v[nombre]
                break
        if tv is None or lat.size == 0:
            return out
        tiempos = netCDF4.num2date(tv[:], tv.units, only_use_cftime_datetimes=False, only_use_python_datetimes=True)
        dentro = (np.abs(lat - LAT) <= DLAT) & (np.abs(lon - LON) <= DLON)
        for i in np.nonzero(dentro)[0]:
            t = tiempos[i]
            if t is None:
                continue
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            if desde <= t <= hasta:
                out.append((t, float(lat[i]), float(lon[i])))
    return out


def descargar_y_leer(producto, desde, hasta, tmp):
    zona = os.path.join(tmp, "p")
    shutil.rmtree(zona, ignore_errors=True)
    os.makedirs(zona)
    with producto.open() as fsrc:
        destino = os.path.join(zona, os.path.basename(getattr(fsrc, "name", "producto")) or "producto")
        with open(destino, "wb") as fdst:
            shutil.copyfileobj(fsrc, fdst)
    if zipfile.is_zipfile(destino):
        with zipfile.ZipFile(destino) as z:
            z.extractall(zona)
    rayos = []
    for nc in glob.glob(os.path.join(zona, "**", "*.nc"), recursive=True):
        if "TRAIL" in os.path.basename(nc).upper():
            continue
        try:
            rayos += leer_nc(nc, desde, hasta)
        except Exception as e:
            print("  no se pudo leer", os.path.basename(nc), "->", e)
    return rayos


def main():
    if not KEY or not SECRET:
        print("Sin EUMETSAT_KEY/EUMETSAT_SECRET: no se descargan rayos.")
        return
    import eumdac
    ahora = datetime.now(timezone.utc)
    desde = ahora - timedelta(minutes=VENTANA_MIN)
    token = eumdac.AccessToken((KEY, SECRET))
    ds = eumdac.DataStore(token)
    col = buscar_coleccion(ds)
    productos = list(col.search(dtstart=desde - timedelta(minutes=15), dtend=ahora))
    productos.sort(key=lambda p: str(getattr(p, "sensing_end", "") or p), reverse=True)
    print(len(productos), "productos en la ventana; se leen como máximo", MAX_PRODUCTOS)
    rayos = []
    with tempfile.TemporaryDirectory() as tmp:
        for p in productos[:MAX_PRODUCTOS]:
            try:
                r = descargar_y_leer(p, desde, ahora, tmp)
                print(" ", p, "->", len(r), "rayos en el recuadro")
                rayos += r
            except Exception as e:
                print("  error con", p, "->", e)
    vistos, lista = set(), []
    for t, la, lo in sorted(rayos, key=lambda x: x[0], reverse=True):
        clave = (t.replace(microsecond=0), round(la, 2), round(lo, 2))
        if clave in vistos:
            continue
        vistos.add(clave)
        lista.append({"t": t.replace(microsecond=0).isoformat(), "lat": round(la, 3), "lon": round(lo, 3)})
    lista = lista[:800]
    data = {"updated": ahora.replace(microsecond=0).isoformat(), "window_min": VENTANA_MIN,
            "latest_product": str(productos[0]) if productos else None, "count": len(lista), "strikes": lista}
    previo = {}
    if os.path.exists(OUT):
        try:
            previo = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            pass
    # sin rayos ahora ni antes: solo se reescribe una vez por hora (para no llenar el historial)
    if not lista and not previo.get("strikes") and previo.get("updated"):
        try:
            if ahora - datetime.fromisoformat(previo["updated"]) < timedelta(minutes=60):
                print("Sin rayos (sin cambios)")
                return
        except Exception:
            pass
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("Escrito", OUT, "con", len(lista), "rayos")


if __name__ == "__main__":
    if len(sys.argv) > 1:  # prueba local: python tools/rayos.py archivo.nc
        ahora = datetime.now(timezone.utc)
        print(leer_nc(sys.argv[1], ahora - timedelta(hours=2), ahora + timedelta(minutes=1)))
    else:
        main()
