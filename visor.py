"""Visor A4: genera el HTML de un documento a partir de su JSON.

- generar_html: pagina completa, con CSS y paginador incrustados (se abre sin Folium).
- fragmento: solo el contenido y la configuracion, para volver a paginar en el editor.
  Con editable=True cada elemento lleva data-ref (identificadores de seccion, bloque,
  fila y columna) para saber que se toco; los HTML guardados no los llevan.
"""
import base64
import html
import json
import mimetypes
import re
from pathlib import Path

from validacion import color_de_estado, primera_linea, texto_de

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
def ref(editable, tipo, *partes):
    """Atributo data-ref (solo en el editor): tipo:parte1:parte2..."""
    if not editable:
        return ""
    return ' data-ref="%s"' % html.escape(":".join((tipo,) + partes))


def atributo_kwn(bloque):
    return " data-kwn" if bloque.get("con_siguiente") else ""


def html_imagen(b, carpeta, r):
    alto = b.get("alto_mm", 80)
    archivo = Path(b.get("archivo") or "").name      # solo el nombre: nunca rutas
    ruta = (Path(carpeta) / "imagenes" / archivo) if (archivo and carpeta) else None
    if ruta and ruta.is_file():
        tipo = mimetypes.guess_type(ruta.name)[0] or "image/png"
        datos = base64.b64encode(ruta.read_bytes()).decode("ascii")
        return ('<div class="fig"%s%s style="height:%smm"><img alt="" src="data:%s;base64,%s"></div>'
                % (atributo_kwn(b), r, alto, tipo, datos))
    desc = b.get("descripcion", [])
    if isinstance(desc, str):
        desc = [desc]
    partes = ['<div class="diag"%s%s style="height:%smm">' % (atributo_kwn(b), r, alto)]
    if desc:
        partes.append('<p class="dt">%s</p>' % formato(desc[0]))
        for linea in desc[1:]:
            partes.append('<p class="ds">%s</p>' % formato(linea))
    if b.get("fuente_drawio"):
        partes.append('<p class="ds" style="text-align:center">Fuente: <code>%s</code></p>'
                      % html.escape(b["fuente_drawio"], quote=False))
    partes.append("</div>")
    return "\n ".join(partes)


def html_celda(celda, columna, estados, r):
    texto = texto_de(celda)
    objeto = celda if isinstance(celda, dict) else {}
    tipo = objeto.get("tipo") or columna.get("tipo")        # la celda puede salirse del tipo de su columna
    color = objeto.get("color")
    if not color and tipo == "estado":
        color = color_de_estado(primera_linea(texto), estados)
    clase = CLASE_COLOR.get(color or "ninguno", "")
    if tipo == "identificador" and "`" not in texto and texto:
        cuerpo = "<br>".join("<code>%s</code>" % html.escape(p, quote=False) for p in texto.split("\n"))
    else:
        cuerpo = formato(texto)
    return "<td%s%s>%s</td>" % (' class="%s"' % clase if clase else "", r, cuerpo)


def html_tabla(b, estados, sid, editable):
    cols = b["columnas"]
    anchos = ",".join("%g" % float(c["ancho_mm"]) for c in cols)
    lineas = ['<table data-w="%s"%s%s>' % (anchos, atributo_kwn(b), ref(editable, "b", sid, b["id"]))]
    lineas.append(" <thead><tr>%s</tr></thead>" % "".join(
        "<th%s>%s</th>" % (ref(editable, "h", sid, b["id"], c["id"]), formato(c["titulo"])) for c in cols))
    lineas.append(" <tbody>")
    if not b.get("filas"):
        lineas.append('  <tr><td class="sinreg" colspan="%d">Sin registros</td></tr>' % len(cols))
    for f in b.get("filas", []):
        celdas = f.get("celdas", {})
        tds = "".join(html_celda(celdas.get(c["id"]), c, estados,
                                 ref(editable, "c", sid, b["id"], f["id"], c["id"])) for c in cols)
        lineas.append("  <tr%s>%s</tr>" % (ref(editable, "f", sid, b["id"], f["id"]), tds))
    lineas.append(" </tbody>")
    lineas.append("</table>")
    return "\n".join(lineas)


def html_bloque(b, doc, carpeta, sid, editable):
    tipo = b["tipo"]
    r = ref(editable, "b", sid, b["id"])
    if tipo == "parrafo":
        return "<p%s%s>%s</p>" % (atributo_kwn(b), r, formato(b["texto"]))
    if tipo == "etiqueta":
        return '<p class="lbl" data-kwn%s>%s</p>' % (r, formato(b["texto"]))
    if tipo == "nota":
        return '<p class="note"%s%s>%s</p>' % (atributo_kwn(b), r, formato(b["texto"]))
    if tipo == "nota_destacada":
        parrafos = [p for p in re.split(r"\n\s*\n", b["texto"]) if p.strip()]
        return ('<div class="callout"%s%s>%s</div>'
                % (atributo_kwn(b), r, "".join("<p>%s</p>" % formato(p) for p in parrafos)))
    if tipo == "tabla":
        return html_tabla(b, doc.get("estados", []), sid, editable)
    return html_imagen(b, carpeta, r)


def html_secciones(secciones, nivel, doc, carpeta, salida, editable):
    for s in secciones:
        extra = " data-anexo" if (nivel == 1 and s.get("anexo")) else ""
        salida.append('<h%d data-id="%s"%s%s>%s</h%d>'
                      % (nivel, html.escape(s["id"]), extra, ref(editable, "s", s["id"]),
                         formato(s["titulo"]), nivel))
        for b in s.get("bloques", []):
            salida.append(html_bloque(b, doc, carpeta, s["id"], editable))
        html_secciones(s.get("secciones", []), nivel + 1, doc, carpeta, salida, editable)


# ---------- configuracion y tokens ----------
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


def aplicar_tokens(doc, tokens):
    """Reemplaza {{nombre}} por su valor en todos los textos del documento."""
    if not tokens:
        return doc
    texto = json.dumps(doc, ensure_ascii=False)
    for nombre, valor in tokens.items():
        texto = texto.replace("{{%s}}" % nombre, json.dumps(valor, ensure_ascii=False)[1:-1])
    return json.loads(texto)


def fragmento(doc, version=None, fecha=None, carpeta_actual=None, tokens=None, editable=False):
    """Contenido del documento (sin pagina) y su configuracion, listos para paginar."""
    doc = aplicar_tokens(doc, tokens)
    cuerpo = []
    html_secciones(doc.get("secciones", []), 1, doc, carpeta_actual, cuerpo, editable)
    return {"src": "\n".join(cuerpo), "cfg": configuracion(doc, version, fecha)}


# ---------- pagina completa ----------
# Marco del editor: sin la barra de vista previa oscura, con el fondo claro de la
# interfaz y los marcadores de seleccion. No cambia las hojas ni la impresion.
ESTILO_VISTA = """<style>
@media screen{
html,body{background:#F0F1F5}
.bar{display:none}
#pages{padding-top:24px}
.page{box-shadow:0 1px 3px rgba(20,30,50,.10),0 6px 18px rgba(20,30,50,.10)}
img{-webkit-user-drag:none;user-select:none}
.f-error{outline:2px solid #C62828;outline-offset:2px}
.f-aviso{outline:2px dashed #E0A100;outline-offset:2px}
.f-sel{outline:2px solid #0070C0;outline-offset:3px}
.f-editando{outline:2px solid #0070C0;outline-offset:3px;background:#E8F2FA;cursor:text}
.f-linea{position:absolute;height:3px;background:#0070C0;border-radius:2px;pointer-events:none;z-index:50}
.f-asa{position:absolute;width:20px;height:26px;display:flex;align-items:center;justify-content:center;
  background:#fff;border:1px solid #D0D4DC;border-radius:6px;color:#667085;font:12px/1 system-ui,sans-serif;
  cursor:grab;user-select:none;z-index:40;box-shadow:0 1px 3px rgba(20,30,50,.15)}
.f-mas{position:absolute;display:flex;align-items:center;justify-content:center;background:rgba(0,112,192,.14);
  color:#0070C0;font:700 13px/1 system-ui,sans-serif;border-radius:4px;cursor:pointer;user-select:none;z-index:45}
.f-mas:hover{background:rgba(0,112,192,.32)}
.f-borde{position:absolute;width:2px;background:#0070C0;pointer-events:none;z-index:46}
}
@media print{.f-linea,.f-asa,.f-mas,.f-borde{display:none!important}.f-error,.f-aviso{outline:0!important}}
</style>
""" 

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

{estilo_vista}<div class="bar">
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


def pagina(titulo, barra, cuerpo, config, vista):
    return PLANTILLA.format(
        titulo=html.escape(titulo, quote=False),
        css=(WEB / "estilos.css").read_text(encoding="utf-8"),
        barra=html.escape(barra, quote=False),
        estilo_vista=ESTILO_VISTA if vista else "",
        cuerpo=cuerpo,
        config=json.dumps(config, ensure_ascii=False).replace("</", "<\\/"),
        js=(WEB / "paginador.js").read_text(encoding="utf-8"))


def generar_html(doc, version=None, fecha=None, carpeta_actual=None, tokens=None):
    """HTML completo y autonomo. version=None significa borrador."""
    frag = fragmento(doc, version, fecha, carpeta_actual, tokens)
    return pagina("Folium · %s · %s" % (doc["aplicacion"], doc["titulo_pagina"]),
                  doc["titulo_pagina"], frag["src"], frag["cfg"], vista=False)


def generar_marco():
    """Marco vacio del editor: el contenido llega despues con FoliumPaginar()."""
    return pagina("Folium · hojas", "Hojas A4", "", None, vista=True)
