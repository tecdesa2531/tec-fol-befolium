"""Visor A4: genera el HTML completo de un documento a partir de su JSON.

El HTML lleva el CSS y el paginador incrustados, asi que se abre sin Folium.
"""
import base64
import html
import json
import mimetypes
import re
from pathlib import Path

from validacion import color_de_estado, texto_de

WEB = Path(__file__).resolve().parent / "web"
CLASE_COLOR = {"amarillo": "pend", "gris": "na"}


# ---------- texto con formato ----------
RE_FORMATO = re.compile(r"`([^`]*)`|\*\*(.+?)\*\*|\[([^\]]*)\]\(([^)]*)\)")


def formato(texto):
    """Convierte `codigo`, **negrita** y [texto](url) a HTML seguro."""
    salida = []
    pos = 0
    for m in RE_FORMATO.finditer(texto):
        salida.append(html.escape(texto[pos:m.start()], quote=False))
        if m.group(1) is not None:
            salida.append("<code>%s</code>" % html.escape(m.group(1), quote=False))
        elif m.group(2) is not None:
            salida.append("<b>%s</b>" % formato(m.group(2)))
        else:
            etiqueta = formato(m.group(3))
            url = m.group(4).strip()
            if not url:
                salida.append('<span class="lnk">%s</span>' % etiqueta)
            elif url.startswith("#"):
                salida.append('<a class="int" href="%s">%s</a>' % (html.escape(url), etiqueta))
            else:
                salida.append('<a class="lnk" href="%s">%s</a>' % (html.escape(url), etiqueta))
        pos = m.end()
    salida.append(html.escape(texto[pos:], quote=False))
    return "".join(salida).replace("\n", "<br>")


# ---------- bloques ----------
def atributo_kwn(bloque):
    return " data-kwn" if bloque.get("con_siguiente") else ""


def html_imagen(b, carpeta):
    alto = b.get("alto_mm", 80)
    archivo = b.get("archivo")
    ruta = (Path(carpeta) / "imagenes" / archivo) if (archivo and carpeta) else None
    if ruta and ruta.is_file():
        tipo = mimetypes.guess_type(ruta.name)[0] or "image/png"
        datos = base64.b64encode(ruta.read_bytes()).decode("ascii")
        return ('<div class="fig"%s style="height:%smm"><img alt="" src="data:%s;base64,%s"></div>'
                % (atributo_kwn(b), alto, tipo, datos))
    desc = b.get("descripcion", [])
    if isinstance(desc, str):
        desc = [desc]
    partes = ['<div class="diag"%s style="height:%smm">' % (atributo_kwn(b), alto)]
    if desc:
        partes.append('<p class="dt">%s</p>' % formato(desc[0]))
        for linea in desc[1:]:
            partes.append('<p class="ds">%s</p>' % formato(linea))
    if b.get("fuente_drawio"):
        partes.append('<p class="ds" style="text-align:center">Fuente: <code>%s</code></p>'
                      % html.escape(b["fuente_drawio"], quote=False))
    partes.append("</div>")
    return "\n ".join(partes)


def html_celda(celda, columna, estados):
    texto = texto_de(celda)
    objeto = celda if isinstance(celda, dict) else {}
    color = objeto.get("color")
    if not color and columna.get("tipo") == "estado":
        color = color_de_estado(texto, estados)
    clase = CLASE_COLOR.get(color or "ninguno", "")
    estilo = objeto.get("estilo") or ("identificador" if columna.get("tipo") == "identificador" else "texto")
    if estilo == "identificador" and "`" not in texto and texto:
        cuerpo = "<br>".join("<code>%s</code>" % html.escape(p, quote=False) for p in texto.split("\n"))
    else:
        cuerpo = formato(texto)
    for linea in objeto.get("lineas", []):
        cuerpo += '<span class="sub">%s</span>' % formato(linea)
    return "<td%s>%s</td>" % (' class="%s"' % clase if clase else "", cuerpo)


def html_tabla(b, estados):
    cols = b["columnas"]
    anchos = ",".join("%g" % float(c["ancho_mm"]) for c in cols)
    lineas = ['<table data-w="%s"%s>' % (anchos, atributo_kwn(b))]
    lineas.append(" <thead><tr>%s</tr></thead>"
                  % "".join("<th>%s</th>" % formato(c["titulo"]) for c in cols))
    lineas.append(" <tbody>")
    for f in b.get("filas", []):
        celdas = f.get("celdas", {})
        lineas.append("  <tr>%s</tr>"
                      % "".join(html_celda(celdas.get(c["id"]), c, estados) for c in cols))
    lineas.append(" </tbody>")
    lineas.append("</table>")
    return "\n".join(lineas)


def html_bloque(b, doc, carpeta):
    tipo = b["tipo"]
    if tipo == "parrafo":
        return "<p%s>%s</p>" % (atributo_kwn(b), formato(b["texto"]))
    if tipo == "etiqueta":
        return '<p class="lbl" data-kwn>%s</p>' % formato(b["texto"])
    if tipo == "nota":
        return '<p class="note"%s>%s</p>' % (atributo_kwn(b), formato(b["texto"]))
    if tipo == "nota_destacada":
        parrafos = [p for p in re.split(r"\n\s*\n", b["texto"]) if p.strip()]
        return ('<div class="callout"%s>%s</div>'
                % (atributo_kwn(b), "".join("<p>%s</p>" % formato(p) for p in parrafos)))
    if tipo == "tabla":
        return html_tabla(b, doc.get("estados", []))
    return html_imagen(b, carpeta)


def html_secciones(secciones, nivel, doc, carpeta, salida):
    for s in secciones:
        extra = " data-anexo" if (nivel == 1 and s.get("anexo")) else ""
        salida.append('<h%d data-id="%s"%s>%s</h%d>'
                      % (nivel, html.escape(s["id"]), extra, formato(s["titulo"]), nivel))
        for b in s.get("bloques", []):
            salida.append(html_bloque(b, doc, carpeta))
        html_secciones(s.get("secciones", []), nivel + 1, doc, carpeta, salida)


# ---------- pagina completa ----------
def configuracion(doc, version, fecha):
    """Datos que lee el paginador (window.FOLIUM). Todo viene del JSON."""
    rotulo = version or "Borrador"
    portada = []
    for campo in doc.get("portada", []):
        auto = campo.get("automatico")
        if auto == "version":
            valor = rotulo
        elif auto == "fecha":
            valor = fecha or ""
        else:
            valor = campo.get("valor", "")
        portada.append({"etiqueta": campo["etiqueta"], "valor": valor})
    pie = "%s · %s · %s" % (doc["aplicacion"], doc["titulo_pagina"], rotulo)
    return {"pie": html.escape(pie, quote=False), "organizacion": doc["organizacion"],
            "titulo_pagina": doc["titulo_pagina"], "portada": portada}


PLANTILLA = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titulo}</title>
<style>
{css}</style>
</head>
<body>

<div class="bar">
  <span><b>Folium</b> &nbsp;{barra} · Hojas A4</span>
  <span class="sp"></span>
  <label><input type="checkbox" id="g"> Ver márgenes (3 cm / 2,5 cm)</label>
  <label>Zoom
    <select id="z"><option value="0.75">75 %</option><option value="1" selected>100 %</option><option value="1.25">125 %</option></select>
  </label>
</div>

<div id="pages"></div>
<div id="measure"></div>

<div id="src">

{cuerpo}

</div>
<script>window.FOLIUM = {config};</script>
<script>
{js}</script>
</body>
</html>
"""


def generar_html(doc, version=None, fecha=None, carpeta_actual=None):
    """HTML completo. version=None significa borrador."""
    cfg = configuracion(doc, version, fecha)
    cuerpo = []
    html_secciones(doc.get("secciones", []), 1, doc, carpeta_actual, cuerpo)
    return PLANTILLA.format(
        titulo=html.escape("Folium · %s · %s" % (doc["aplicacion"], doc["titulo_pagina"]), quote=False),
        css=(WEB / "estilos.css").read_text(encoding="utf-8"),
        barra=html.escape(doc["titulo_pagina"], quote=False),
        cuerpo="\n".join(cuerpo),
        config=json.dumps(cfg, ensure_ascii=False).replace("</", "<\\/"),
        js=(WEB / "paginador.js").read_text(encoding="utf-8"))
