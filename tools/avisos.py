#!/usr/bin/env python3
"""Descarga los avisos de AEMET (vía MeteoAlarm, sin clave) y deja solo los de tu zona en avisos.json.

Lo ejecuta GitHub Actions cada 15 minutos (.github/workflows/avisos.yml).
Zona: variable de entorno ZONAS, nombres separados por "|" tal como los escribe AEMET.
"""
import json, os, re, sys, urllib.request
from datetime import datetime, timezone, timedelta

FEED = "https://feeds.meteoalarm.org/api/v1/warnings/feeds-spain"
ZONAS = [z.strip() for z in os.environ.get("ZONAS", "Litoral sur de Tarragona|Litoral sud de Tarragona").split("|") if z.strip()]
OUT = os.environ.get("SALIDA", "avisos.json")
REFRESCO_MIN = 60  # reescribe aunque no cambie nada, para que la tablet sepa que el dato es reciente

NIVELES = {"2": "amarillo", "3": "naranja", "4": "rojo", "yellow": "amarillo", "orange": "naranja", "red": "rojo"}
SEVERIDAD = {"Moderate": "amarillo", "Severe": "naranja", "Extreme": "rojo"}
TIPOS = {"1": "Viento", "2": "Nieve y hielo", "3": "Tormentas", "4": "Niebla", "5": "Temperaturas máximas",
         "6": "Temperaturas mínimas", "7": "Fenómenos costeros", "8": "Incendios forestales", "9": "Aludes",
         "10": "Lluvias", "12": "Inundaciones", "13": "Lluvias e inundaciones"}


def norm(s):
    s = (s or "").lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("à", "a"), ("è", "e"), ("ò", "o")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()


def param(info, name):
    for p in info.get("parameter") or []:
        if p.get("valueName") == name:
            return str(p.get("value", ""))
    return ""


def nivel(info):
    v = param(info, "awareness_level")
    if v:
        partes = [x.strip().lower() for x in v.split(";")]
        for x in partes:
            if x in NIVELES:
                return NIVELES[x]
    return SEVERIDAD.get(info.get("severity", ""))


def tipo(info):
    v = param(info, "awareness_type")
    if v:
        n = v.split(";")[0].strip()
        if n in TIPOS:
            return TIPOS[n]
    return (info.get("event") or "Aviso").strip()


def detalle(info):
    d = (info.get("description") or "").strip()
    d = re.split(r"(?<=\.)\s", d)[0].rstrip(".")
    return d[:90]


def extraer(feed, ahora):
    zonas = [norm(z) for z in ZONAS]
    sustituidos = set()
    candidatos = []
    for w in feed.get("warnings", []):
        a = w.get("alert") or {}
        if a.get("status") != "Actual":
            continue
        for ref in (a.get("references") or "").split():
            partes = ref.split(",")
            if len(partes) >= 2:
                sustituidos.add(partes[1])
        if a.get("msgType") == "Cancel":
            continue
        for info in a.get("info") or []:
            if not str(info.get("language", "")).lower().startswith("es"):
                continue
            areas = [ar.get("areaDesc", "") for ar in info.get("area") or []]
            if not any(any(z in norm(x) for z in zonas) for x in areas):
                continue
            lv = nivel(info)
            if not lv:
                continue  # verde / sin riesgo
            try:
                fin = datetime.fromisoformat(info["expires"])
            except Exception:
                continue
            if fin <= ahora:
                continue
            candidatos.append((a.get("identifier"), {
                "level": lv, "event": tipo(info), "detail": detalle(info),
                "onset": info.get("onset") or info.get("effective"), "expires": info["expires"],
                "zone": next((x for x in areas if any(z in norm(x) for z in zonas)), areas[0] if areas else ""),
            }))
    vistos, avisos = set(), []
    for ident, av in candidatos:
        if ident in sustituidos:
            continue
        clave = (av["level"], av["event"], av["onset"], av["expires"])
        if clave in vistos:
            continue
        vistos.add(clave)
        avisos.append(av)
    avisos.sort(key=lambda x: x["onset"] or "")
    return avisos


def main():
    ahora = datetime.now(timezone.utc)
    if len(sys.argv) > 1:  # prueba local:  python tools/avisos.py feed.json
        feed = json.load(open(sys.argv[1], encoding="utf-8"))
    else:
        req = urllib.request.Request(FEED, headers={"User-Agent": "estacion-meteorologica (uso personal)"})
        with urllib.request.urlopen(req, timeout=60) as r:
            feed = json.load(r)
    avisos = extraer(feed, ahora)
    # Ayuda: nombres de zona de Tarragona que trae el feed hoy (para ajustar ZONAS si hiciera falta)
    nombres = sorted({ar.get("areaDesc", "") for w in feed.get("warnings", []) for i in (w.get("alert") or {}).get("info") or []
                      if str(i.get("language", "")).startswith("es") for ar in i.get("area") or [] if "tarragona" in norm(ar.get("areaDesc", ""))})
    print("Zonas de Tarragona en el feed:", ", ".join(nombres) or "(ninguna con avisos ahora)")
    zona = avisos[0]["zone"] if avisos else ZONAS[0]
    for av in avisos:
        av.pop("zone", None)

    previo = {}
    if os.path.exists(OUT):
        try:
            previo = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            previo = {}
    try:
        antes = datetime.fromisoformat(previo.get("updated", "2000-01-01T00:00:00+00:00"))
    except Exception:
        antes = datetime(2000, 1, 1, tzinfo=timezone.utc)
    if previo.get("alerts") == avisos and previo.get("zone") == zona and ahora - antes < timedelta(minutes=REFRESCO_MIN):
        print("Sin cambios")
        return
    data = {"updated": ahora.replace(microsecond=0).isoformat(), "zone": zona, "alerts": avisos}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("Escrito", OUT, "con", len(avisos), "aviso(s)")


if __name__ == "__main__":
    main()
