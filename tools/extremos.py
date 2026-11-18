#!/usr/bin/env python3
"""Récords oficiales de la estación (valores extremos de AEMET OpenData), por mes y absolutos.

Se descargan una vez a la semana (cambian muy poco) y se guardan en extremos.json.
Necesita AEMET_API_KEY.
"""
import json, os, time, urllib.request
from datetime import datetime, timedelta, timezone

CLAVE = os.environ.get("AEMET_API_KEY", "").strip()
ESTACION = os.environ.get("ESTACION", "0016A")
OUT = os.environ.get("SALIDA", "extremos.json")
API = "https://opendata.aemet.es/opendata/api/valores/climatologicos/valoresextremos/parametro/{}/estacion/{}?api_key={}"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "estacion-meteorologica (uso personal)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    for enc in ("utf-8", "latin-1"):
        try:
            return json.loads(raw.decode(enc))
        except Exception:
            continue
    raise ValueError("respuesta no válida")


def d10(v):
    """AEMET da décimas: '403' → 40.3"""
    try:
        return int(str(v).strip()) / 10
    except (TypeError, ValueError):
        return None


def lista(v):
    return v if isinstance(v, list) else [v] * 13


def resumir(raw):
    """Por mes (0–11) y absoluto (12): valor, día y año. Temperaturas en °C, lluvia en mm, racha en km/h."""
    T, P, V = raw.get("T", {}), raw.get("P", {}), raw.get("V", {})
    out = {}
    if T:
        out["tmax"] = [d10(x) for x in lista(T.get("temMax"))]
        out["tmaxD"] = lista(T.get("diaMax")); out["tmaxY"] = lista(T.get("anioMax"))
        out["tmin"] = [d10(x) for x in lista(T.get("temMin"))]
        out["tminD"] = lista(T.get("diaMin")); out["tminY"] = lista(T.get("anioMin"))
        out["tmaxM"] = T.get("mesMax"); out["tminM"] = T.get("mesMin")
    if P:
        out["rain"] = [d10(x) for x in lista(P.get("precMaxDia"))]
        out["rainD"] = lista(P.get("diaMaxDia")); out["rainY"] = lista(P.get("anioMaxDia")); out["rainM"] = P.get("mesMaxDia")
    if V and V.get("rachMax"):
        out["gust"] = [float(str(x).replace(",", ".")) if x not in (None, "") else None for x in lista(V.get("rachMax"))]
        out["gustD"] = lista(V.get("dia")); out["gustY"] = lista(V.get("anio")); out["gustM"] = V.get("mes")
    return out


def main():
    if not CLAVE:
        print("Sin AEMET_API_KEY")
        return
    try:
        old = json.load(open(OUT, encoding="utf-8"))
        if datetime.now(timezone.utc) - datetime.fromisoformat(old["updated"]) < timedelta(days=7) and old.get("rec"):
            print("extremos.json al día")
            return
    except Exception:
        pass
    raw = {}
    for p in ("T", "P", "V"):
        try:
            meta = get(API.format(p, ESTACION, CLAVE))
            if str(meta.get("estado")) == "200" and meta.get("datos"):
                d = get(meta["datos"])
                raw[p] = d[0] if isinstance(d, list) and d else d
            else:
                print(p, meta.get("estado"), meta.get("descripcion"))
        except Exception as e:
            print("Fallo", p, e)
        time.sleep(2)
    if not raw:
        return
    data = {"updated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(), "id": ESTACION, "raw": raw, "rec": resumir(raw)}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("extremos.json:", {k: list(v.keys()) if isinstance(v, dict) else type(v).__name__ for k, v in raw.items()})


if __name__ == "__main__":
    main()
