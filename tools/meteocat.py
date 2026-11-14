"""Avisos de Situació Meteorològica de Perill (SMP) del Servei Meteorològic de Catalunya.

Necesita el secreto METEOCAT_API_KEY (clave gratuita: https://apidocs.meteocat.gencat.cat/).
Deja en meteocat.json solo los avisos que afectan a tu comarca, con el mismo formato que avisos.json.
"""
import json, os, sys, urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

CLAVE = os.environ.get("METEOCAT_API_KEY", "").strip()
COMARCA = os.environ.get("COMARCA", "Tarragonès")
COMARCA_ID = int(os.environ.get("COMARCA_ID", "36"))  # 36 = Tarragonès (se comprueba por nombre si se puede)
OUT = os.environ.get("SALIDA", "meteocat.json")
TZ = ZoneInfo("Europe/Madrid")
BASE = "https://api.meteo.cat"

# grau de perill 1-2 moderat (groc), 3-4 alt (taronja), 5-6 molt alt (vermell)
def nivel(perill):
    return "rojo" if perill >= 5 else ("naranja" if perill >= 3 else "amarillo")

NOMBRES = [
    ("intensitat de pluja", "Lluvia intensa"), ("acumulaci", "Lluvia acumulada"), ("ventad", "Viento"),
    ("vent", "Viento"), ("mar", "Estado del mar"), ("neu", "Nieve"), ("calor nocturna", "Calor nocturno"),
    ("calor", "Calor"), ("fred", "Frío"), ("temps violent", "Tiempo violento"), ("boira", "Niebla"),
]
def evento(nom):
    n = (nom or "").lower()
    for k, v in NOMBRES:
        if k in n:
            return v
    return nom or "Aviso"

CAT_ES = [("Intensitat", "Intensidad"), ("minuts", "minutos"), ("hores", "horas"), ("Ratxa màxima", "Racha máxima"),
          ("Ratxa", "Racha"), ("Onades", "Olas"), ("Temperatura màxima", "Temperatura máxima"), ("Gruix", "Espesor")]
def es(t):
    for a, b in CAT_ES:
        t = t.replace(a, b)
    return t

def pedir(ruta):
    req = urllib.request.Request(BASE + ruta, headers={"X-Api-Key": CLAVE, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def comarca_id():
    try:
        for c in pedir("/referencia/v1/comarques"):
            if (c.get("nom") or "").lower() == COMARCA.lower():
                return int(c["codi"])
    except Exception as e:  # si falla, se usa el número de la configuración
        print("No se pudo leer la lista de comarcas:", e)
    return COMARCA_ID

def tramo(dia, periodo):
    """«2023-06-12T00:00Z» + «12-18» → (inicio, fin) en hora local."""
    d = datetime.strptime(dia[:10], "%Y-%m-%d")
    a, b = periodo.split("-")
    ini = datetime(d.year, d.month, d.day, int(a), tzinfo=TZ)
    fin = datetime(d.year, d.month, d.day, tzinfo=TZ) + timedelta(hours=24 if int(b) == 0 else int(b))
    return ini, fin

def extraer(episodios, cid):
    trozos = []
    for ep in episodios or []:
        meteor = (ep.get("meteor") or {}).get("nom")
        for av in ep.get("avisos") or []:
            if (av.get("estat") or "Vigent") not in ("Vigent", "Obert") and isinstance(av.get("estat"), str):
                continue
            for ev in av.get("evolucions") or []:
                for per in ev.get("periodes") or []:
                    for af in per.get("afectacions") or []:
                        if af.get("idComarca") != cid or af.get("auxiliar"):
                            continue
                        ini, fin = tramo(af.get("dia") or ev.get("dia"), per["nom"])
                        trozos.append({"level": nivel(int(af.get("perill") or 1)), "event": evento(meteor),
                                       "detail": es((af.get("llindar") or ev.get("llindar1") or "").strip()),
                                       "description": (ev.get("comentari") or "").strip()[:800],
                                       "onset": ini.isoformat(), "expires": fin.isoformat()})
    # une tramos seguidos del mismo fenómeno y nivel
    trozos.sort(key=lambda x: (x["event"], x["level"], x["onset"]))
    unidos = []
    for t in trozos:
        u = unidos[-1] if unidos else None
        if u and u["event"] == t["event"] and u["level"] == t["level"] and t["onset"] <= u["expires"]:
            u["expires"] = max(u["expires"], t["expires"])
            if not u["description"]:
                u["description"] = t["description"]
        else:
            unidos.append(dict(t, source="Meteocat", headline="", instruction=""))
    unidos.sort(key=lambda x: x["onset"])
    return unidos

def main():
    if len(sys.argv) > 1:  # prueba local:  python tools/meteocat.py episodis.json
        episodios, cid = json.load(open(sys.argv[1], encoding="utf-8")), COMARCA_ID
    else:
        if not CLAVE:
            print("Sin METEOCAT_API_KEY: se omiten los avisos de Meteocat")
            return
        cid = comarca_id()
        episodios = pedir("/pronostic/v1/smp/episodis-oberts")
    avisos = extraer(episodios, cid)
    data = {"updated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(), "zone": COMARCA, "alerts": avisos}
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
        if previo.get("alerts") == avisos and datetime.now(timezone.utc) - datetime.fromisoformat(previo["updated"]) < timedelta(hours=1):
            print("Sin cambios")
            return
    except Exception:
        pass
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(len(avisos), "avisos de Meteocat para", COMARCA)

if __name__ == "__main__":
    main()
