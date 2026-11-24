"""Validacion de un documento. Devuelve una lista de problemas.

Cada problema es un diccionario: nivel ("error" o "advertencia"), donde, mensaje.
Solo los errores impiden guardar una version.
"""
import re
from pathlib import Path

from documentos import DOCUMENTOS

TIPOS_BLOQUE = ("parrafo", "etiqueta", "nota", "nota_destacada", "tabla", "imagen")
TIPOS_COLUMNA = ("texto", "identificador", "estado")
COLORES = ("ninguno", "amarillo", "gris")
RE_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
RE_NM = re.compile(r"(\d+) de (\d+) aplicadas?")
RE_LINK_INTERNO = re.compile(r"\]\(#([^)]*)\)")

RE_VERSION = {
    "general": re.compile(r"^\d{8}-v\d{2}$"),
    "compartidos": re.compile(r"^\d{8}-v\d{2}$"),
    "repositorio": re.compile(r"^\d+\.\d+\.\d+$"),
}

# Patrones que sugieren un secreto. Solo producen advertencia.
PATRONES_SECRETO = (
    re.compile(r"(?i)(password|contrase.a|secret|token|clave)\s*[:=]\s*\S{6,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY"),
    re.compile(r"[A-Za-z0-9+/=]{40,}"),
)


def version_valida(documento, version):
    patron = RE_VERSION.get(documento)
    return bool(patron and patron.match(version or ""))


def texto_de(celda):
    if isinstance(celda, dict):
        return str(celda.get("texto", ""))
    return "" if celda is None else str(celda)


def color_de_estado(texto, estados):
    """Color que corresponde a un texto de estado, o None si no esta permitido."""
    t = texto.strip()
    for e in estados:
        if e.get("texto") == t:
            return e.get("color", "ninguno")
    if t.endswith("(no estable)"):
        return "amarillo"
    m = RE_NM.search(t)
    if m:
        return "amarillo" if int(m.group(1)) < int(m.group(2)) else "ninguno"
    return None


def validar(doc):
    problemas = []

    def error(donde, mensaje):
        problemas.append({"nivel": "error", "donde": donde, "mensaje": mensaje})

    def aviso(donde, mensaje):
        problemas.append({"nivel": "advertencia", "donde": donde, "mensaje": mensaje})

    if not isinstance(doc, dict):
        error("documento", "El documento debe ser un objeto JSON")
        return problemas
    if doc.get("formato") != 1:
        error("formato", "Formato no soportado (se espera 1)")
    if doc.get("documento") not in DOCUMENTOS:
        error("documento", "Debe ser general, repositorio o compartidos")
    for campo in ("aplicacion", "organizacion", "titulo_pagina"):
        if not doc.get(campo):
            error(campo, "Falta el campo")
    portada = doc.get("portada")
    if not isinstance(portada, list):
        error("portada", "Debe ser una lista")
    else:
        for i, campo in enumerate(portada):
            if not campo.get("etiqueta"):
                error("portada[%d]" % i, "Falta la etiqueta")
            if campo.get("automatico") not in (None, "version", "fecha"):
                error("portada[%d]" % i, "automatico debe ser version o fecha")
            if "valor" not in campo and "automatico" not in campo:
                error("portada[%d]" % i, "Falta valor o automatico")

    estados = doc.get("estados", [])
    for e in estados:
        if e.get("color") not in COLORES:
            error("estados", "Color no permitido en '%s'" % e.get("texto"))

    ids = {}
    enlaces = []
    textos = []

    def recorrer(secciones, nivel, ruta):
        for s in secciones:
            sid = s.get("id", "")
            donde = "%s/%s" % (ruta, sid or "?")
            if not RE_ID.match(sid):
                error(donde, "Identificador vacío o con caracteres no permitidos")
            elif sid in ids:
                error(donde, "Identificador repetido")
            ids[sid] = True
            if not s.get("titulo"):
                error(donde, "Falta el título")
            if nivel > 3:
                error(donde, "Máximo 3 niveles de secciones")
            if s.get("anexo") and nivel != 1:
                error(donde, "Solo el nivel 1 puede ser anexo")
            validar_bloques(s.get("bloques", []), donde)
            recorrer(s.get("secciones", []), nivel + 1, donde)

    def validar_bloques(bloques, donde_seccion):
        vistos = set()
        for b in bloques:
            bid = b.get("id", "")
            donde = "%s#%s" % (donde_seccion, bid or "?")
            if not bid or bid in vistos:
                error(donde, "Identificador de bloque vacío o repetido")
            vistos.add(bid)
            tipo = b.get("tipo")
            if tipo not in TIPOS_BLOQUE:
                error(donde, "Tipo de bloque desconocido: %s" % tipo)
            elif tipo == "tabla":
                validar_tabla(b, donde)
            elif tipo == "imagen":
                if not b.get("alto_mm"):
                    error(donde, "Falta alto_mm")
                archivo = b.get("archivo") or ""
                if archivo and (archivo != Path(archivo).name or "\\" in archivo):
                    error(donde, "archivo debe ser solo el nombre del archivo de imagen, sin rutas")
            else:
                if not isinstance(b.get("texto"), str):
                    error(donde, "Falta el texto")
                else:
                    textos.append((donde, b["texto"]))

    def validar_tabla(t, donde):
        if t.get("clase") not in ("estado", "registro"):
            error(donde, "clase debe ser estado o registro")
        columnas = t.get("columnas", [])
        if not columnas:
            error(donde, "La tabla no tiene columnas")
        cids = set()
        for c in columnas:
            if c.get("id") in cids or not c.get("id"):
                error(donde, "Identificador de columna vacío o repetido")
            cids.add(c.get("id"))
            if c.get("tipo") not in TIPOS_COLUMNA:
                error(donde, "Tipo de columna desconocido en '%s'" % c.get("titulo"))
        try:
            suma = sum(float(c["ancho_mm"]) for c in columnas)
            if abs(suma - 150) > 0.01:
                error(donde, "Las columnas suman %g mm (deben sumar 150)" % suma)
        except (KeyError, TypeError, ValueError):
            error(donde, "Cada columna necesita ancho_mm numérico")
        fvistos = set()
        for f in t.get("filas", []):
            fid = f.get("id", "")
            if not fid or fid in fvistos:
                error(donde, "Identificador de fila vacío o repetido")
            fvistos.add(fid)
            celdas = f.get("celdas", {})
            for cid in celdas:
                if cid not in cids:
                    error("%s/%s" % (donde, fid), "Celda de una columna que no existe: %s" % cid)
            for c in columnas:
                celda = celdas.get(c.get("id"))
                if isinstance(celda, dict):
                    if celda.get("color") not in (None,) + COLORES:
                        error("%s/%s" % (donde, fid), "Color de celda no permitido")
                    if celda.get("estilo") not in (None, "texto", "identificador"):
                        error("%s/%s" % (donde, fid), "estilo debe ser texto o identificador")
                    for linea in celda.get("lineas", []):
                        textos.append(("%s/%s" % (donde, fid), linea))
                texto = texto_de(celda)
                textos.append(("%s/%s" % (donde, fid), texto))
                if c.get("tipo") == "estado" and texto.strip():
                    fijo = isinstance(celda, dict) and celda.get("color")
                    if not fijo and color_de_estado(texto, estados) is None:
                        error("%s/%s" % (donde, fid),
                              "Estado '%s' no está en la lista" % texto.strip())

    recorrer(doc.get("secciones", []), 1, "")

    for donde, texto in textos:
        for m in RE_LINK_INTERNO.finditer(texto):
            if m.group(1) not in ids:
                error(donde, "Enlace interno a una sección que no existe: #%s" % m.group(1))
        for patron in PATRONES_SECRETO:
            if patron.search(texto):
                aviso(donde, "Posible secreto; solo se guarda dónde está, no su valor")
                break
    return problemas


def hay_errores(problemas):
    return any(p["nivel"] == "error" for p in problemas)
