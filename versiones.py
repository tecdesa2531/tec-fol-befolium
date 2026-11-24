"""Versiones guardadas: nombres, siguiente version, deteccion de cambios y guardado."""
import copy
import datetime
import hashlib
import json
import re
import shutil
from pathlib import Path

import documentos
import validacion
import visor

RE_TAG = re.compile(r"^\d+\.\d+\.\d+$")
RE_FECHADA = re.compile(r"^(\d{8})-v(\d{2})$")


# ---------- nombres ----------
def nombre_base(app, doc, version):
    """Nombre del PDF sin extension; el HTML guardado lleva el mismo nombre."""
    if doc == "repositorio":
        return "%s-repositorio-v%s" % (app.slug, version)
    m = RE_FECHADA.match(version)
    return "%s_%s_%s-v%s" % (m.group(1), app.slug, doc, m.group(2))


def version_de_archivo(app, doc, nombre):
    """Version contenida en el nombre de un archivo guardado, o None."""
    if doc == "repositorio":
        m = re.fullmatch(re.escape(app.slug) + r"-repositorio-v(\d+\.\d+\.\d+)", nombre)
        return m.group(1) if m else None
    m = re.fullmatch(r"(\d{8})_" + re.escape(app.slug) + "_" + doc + r"-v(\d{2})", nombre)
    return "%s-v%s" % (m.group(1), m.group(2)) if m else None


def clave_orden(doc, version):
    if doc == "repositorio":
        return tuple(int(x) for x in version.split("."))
    m = RE_FECHADA.match(version)
    return (int(m.group(1)), int(m.group(2)))


def guardadas(app, doc):
    """Versiones guardadas de un documento, de la mas antigua a la mas reciente."""
    encontradas = []
    for ruta in app.versiones(doc).glob("*.html"):
        v = version_de_archivo(app, doc, ruta.stem)
        if v:
            encontradas.append(v)
    return sorted(encontradas, key=lambda v: clave_orden(doc, v))


def ultima(app, doc):
    lista = guardadas(app, doc)
    return lista[-1] if lista else None


def hoy_compacto(hoy=None):
    return (hoy or datetime.date.today()).strftime("%Y%m%d")


def siguiente(app, doc, hoy=None):
    """Siguiente AAAAMMDD-vNN del dia para los documentos 1 y 3."""
    fecha = hoy_compacto(hoy)
    usados = [int(RE_FECHADA.match(v).group(2)) for v in guardadas(app, doc)
              if v.startswith(fecha)]
    return "%s-v%02d" % (fecha, max(usados) + 1 if usados else 1)


def version_valida(doc, version):
    if doc == "repositorio":
        return bool(RE_TAG.match(version or ""))
    return bool(RE_FECHADA.match(version or ""))


# ---------- lectura y comparacion ----------
def cargar_actuales(app):
    return {d: documentos.cargar_documento(app.actual / (d + ".json")) for d in documentos.DOCUMENTOS}


def cargar_guardada(app, doc, version):
    return documentos.cargar_documento(app.versiones(doc) / (nombre_base(app, doc, version) + ".json"))


def sin_vigentes(doc):
    copia = copy.deepcopy(doc)
    copia.pop("versiones_vigentes", None)
    return copia


def imagenes_de(doc):
    """Nombres de archivo de las imagenes que usa un documento."""
    nombres = set()

    def recorrer(secciones):
        for s in secciones:
            for b in s.get("bloques", []):
                if b.get("tipo") == "imagen" and b.get("archivo"):
                    nombres.add(Path(b["archivo"]).name)
            recorrer(s.get("secciones", []))

    recorrer(doc.get("secciones", []))
    return sorted(nombres)


def hashes_imagenes(app, doc):
    """{archivo: sha256 del contenido, o None si falta}. Detecta cambios por contenido."""
    res = {}
    for nombre in imagenes_de(doc):
        ruta = app.actual / "imagenes" / nombre
        res[nombre] = hashlib.sha256(ruta.read_bytes()).hexdigest() if ruta.is_file() else None
    return res


def ruta_hashes(app, doc, version):
    return app.versiones(doc) / (nombre_base(app, doc, version) + ".imagenes.json")


def hashes_guardados(app, doc, version):
    try:
        return json.loads(ruta_hashes(app, doc, version).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def difiere_de_guardada(app, d, doc, version, con_vigentes=False):
    """Compara un documento (y sus imagenes, por contenido) con una version guardada."""
    guardada = cargar_guardada(app, d, version)
    if not con_vigentes:
        doc, guardada = sin_vigentes(doc), sin_vigentes(guardada)
    return doc != guardada or hashes_imagenes(app, doc) != hashes_guardados(app, d, version)


def cambio_propio(app, doc, actual):
    """True si el contenido difiere de la ultima version guardada (o no hay ninguna)."""
    v = ultima(app, doc)
    return v is None or difiere_de_guardada(app, doc, actual, v)


def errores_por_documento(actuales):
    return {d: [p for p in validacion.validar(doc) if p["nivel"] == "error"]
            for d, doc in actuales.items() if doc is not None}


def propuesta(app, hoy=None):
    """Datos para el dialogo Guardar version."""
    actuales = cargar_actuales(app)
    faltan = [d for d, doc in actuales.items() if doc is None]
    errores = {d: e for d, e in errores_por_documento(actuales).items() if e}
    res = {"faltan": faltan, "errores": errores, "documentos": {}}
    if faltan or errores:
        return res
    for d in documentos.DOCUMENTOS:
        res["documentos"][d] = {
            "ultima": ultima(app, d),
            "cambio": cambio_propio(app, d, actuales[d]),
            "sugerida": siguiente(app, d, hoy) if d != "repositorio" else "",
        }
    res["hay_cambios"] = any(x["cambio"] for x in res["documentos"].values())
    return res


def tokens_de(app, vigentes):
    """Valores de {{version_...}} y {{pdf_...}} para el documento general."""
    tokens = {}
    for d in ("repositorio", "compartidos"):
        version = (vigentes or {}).get(d)
        tokens["version_" + d] = version or "(sin guardar)"
        tokens["pdf_" + d] = (nombre_base(app, d, version) + ".pdf") if version else "(sin guardar)"
    return tokens


# ---------- guardado ----------
def guardar_version(app, pedidas, hoy=None):
    """Guarda una version. `pedidas` trae la version de cada documento que cambia.

    Nunca sobrescribe. Todo se valida antes de escribir. Devuelve un resumen.
    """
    hoy = hoy or datetime.date.today()
    actuales = cargar_actuales(app)
    for d, doc in actuales.items():
        if doc is None:
            raise ValueError("Falta el documento %s." % d)
    errores = {d: e for d, e in errores_por_documento(actuales).items() if e}
    if errores:
        raise ValueError("Hay errores de validación en: %s." % ", ".join(sorted(errores)))

    ultimas = {d: ultima(app, d) for d in documentos.DOCUMENTOS}
    cambia = {d: cambio_propio(app, d, actuales[d]) for d in ("repositorio", "compartidos")}
    nuevas = {}
    for d in ("repositorio", "compartidos"):
        if cambia[d]:
            v = (pedidas.get(d) or "").strip()
            if not v and d == "compartidos":
                v = siguiente(app, d, hoy)
            if not version_valida(d, v):
                raise ValueError("Versión no válida para %s: '%s'." % (d, v))
            nuevas[d] = v
    vigentes = {d: nuevas.get(d, ultimas[d]) for d in ("repositorio", "compartidos")}

    general = copy.deepcopy(actuales["general"])
    general["versiones_vigentes"] = vigentes
    anterior = ultimas["general"]
    cambia["general"] = (anterior is None
                         or difiere_de_guardada(app, "general", general, anterior, con_vigentes=True))
    if not any(cambia.values()):
        raise ValueError("No hay cambios que guardar.")
    if not cambia["general"]:
        raise ValueError("No hay cambios que guardar.")
    v = (pedidas.get("general") or "").strip() or siguiente(app, "general", hoy)
    if not version_valida("general", v):
        raise ValueError("Versión no válida para general: '%s'." % v)
    nuevas["general"] = v

    carpeta_pdf = app.documentacion / nuevas["general"]
    if carpeta_pdf.exists():
        raise ValueError("Ya existe la carpeta %s." % carpeta_pdf.name)
    docs_finales = dict(actuales, general=general)
    for d, v in nuevas.items():
        base = nombre_base(app, d, v)
        for ext in (".html", ".json", ".imagenes.json"):
            if (app.versiones(d) / (base + ext)).exists():
                raise ValueError("Ya existe la versión %s de %s." % (v, d))

    # --- escritura ---
    fecha_texto = hoy.strftime("%d/%m/%Y")
    for d, v in nuevas.items():
        base = nombre_base(app, d, v)
        pagina = visor.generar_html(docs_finales[d], version=v, fecha=fecha_texto,
                                    carpeta_actual=app.actual, tokens=tokens_de(app, vigentes))
        (app.versiones(d) / (base + ".html")).write_text(pagina, encoding="utf-8", newline="\n")
        documentos.guardar_documento(app.versiones(d) / (base + ".json"), docs_finales[d])
        ruta_hashes(app, d, v).write_text(
            json.dumps(hashes_imagenes(app, docs_finales[d]), indent=2) + "\n", encoding="utf-8", newline="\n")
    documentos.guardar_documento(app.actual / "general.json", general)

    carpeta_pdf.mkdir()
    imprimir = [{"documento": d, "version": v, "pdf": nombre_base(app, d, v) + ".pdf"}
                for d, v in nuevas.items()]
    copiados = []
    avisos = []
    for d in ("repositorio", "compartidos"):
        if d in nuevas:
            continue
        nombre = nombre_base(app, d, ultimas[d]) + ".pdf"
        origen = app.documentacion / (anterior or "") / nombre
        if anterior and origen.is_file():
            shutil.copyfile(origen, carpeta_pdf / nombre)
            copiados.append(nombre)
        else:
            avisos.append("No se encontró el PDF anterior %s; cópialo a mano en la carpeta nueva." % nombre)
    return {"carpeta": str(carpeta_pdf), "version_general": nuevas["general"],
            "imprimir": imprimir, "copiados": copiados, "avisos": avisos}
