"""Migracion de documentos con el formato anterior de celdas y contadores.

- Celda: "estilo" pasa a "tipo"; las "lineas" pasan al texto, separadas por saltos de linea.
- Contadores: siguiente_bloque (seccion) y siguiente_fila / siguiente_columna (tabla),
  iniciados en el maximo actual + 1.
Se aplica al leer un JSON; un documento ya migrado no cambia.
"""
import re


def _maximo(elementos, prefijo):
    mayor = 0
    for e in elementos:
        m = re.fullmatch(prefijo + r"(\d+)", str(e.get("id", "")))
        if m:
            mayor = max(mayor, int(m.group(1)))
    return mayor


def _migrar_celda(celda, columna):
    if not isinstance(celda, dict):
        return celda
    tipo = celda.pop("estilo", None)
    lineas = [x for x in celda.pop("lineas", []) if x != ""]
    if tipo and "tipo" not in celda:
        celda["tipo"] = tipo
    texto = celda.get("texto", "")
    if lineas:
        efectivo = celda.get("tipo") or columna.get("tipo")
        if efectivo == "identificador" and texto and "`" not in texto:
            # antes la primera linea salia en Consolas y las demas en texto normal
            texto = "\n".join("`%s`" % p for p in texto.split("\n"))
        celda["texto"] = "\n".join([texto] + lineas)
    if set(celda) == {"texto"}:
        return celda["texto"]
    return celda


def _migrar_tabla(tabla):
    columnas = {c["id"]: c for c in tabla.get("columnas", [])}
    for fila in tabla.get("filas", []):
        celdas = fila.get("celdas", {})
        for cid in list(celdas):
            celdas[cid] = _migrar_celda(celdas[cid], columnas.get(cid, {}))
    tabla.setdefault("siguiente_fila", _maximo(tabla.get("filas", []), "f") + 1)
    tabla.setdefault("siguiente_columna", _maximo(tabla.get("columnas", []), "c") + 1)


def _migrar_secciones(secciones):
    for s in secciones:
        bloques = s.get("bloques", [])
        if bloques:
            s.setdefault("siguiente_bloque", _maximo(bloques, "b") + 1)
        for b in bloques:
            if b.get("tipo") == "tabla":
                _migrar_tabla(b)
        _migrar_secciones(s.get("secciones", []))


def migrar(doc):
    """Migra el documento en su lugar y lo devuelve."""
    if isinstance(doc, dict):
        _migrar_secciones(doc.get("secciones", []))
    return doc
