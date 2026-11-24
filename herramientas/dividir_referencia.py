"""Divide la carpeta referencia/ en partes pequenas dentro de referencia/secciones/.

Solo biblioteca estandar. No modifica nada fuera de referencia/secciones/.
Uso: python herramientas/dividir_referencia.py
"""
import difflib
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REF = RAIZ / "referencia"
SAL = REF / "secciones"

DOCUMENTOS = [
    ("doc1", "plantilla_documento_1_general.html", "Documento 1 (general)"),
    ("doc2", "plantilla_documento_2_repositorio.html", "Documento 2 (repositorio)"),
    ("doc3", "plantilla_documento_3_compartidos.html", "Documento 3 (compartidos)"),
]
ACUERDOS = "acuerdos_documentacion_infraestructura.md"


def leer(ruta):
    return ruta.read_text(encoding="utf-8")


def escribir(nombre, texto):
    (SAL / nombre).write_text(texto, encoding="utf-8", newline="\n")
    return len(texto.encode("utf-8"))


def slug(texto):
    t = unicodedata.normalize("NFD", texto)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t[:40] or "sin-titulo"


def quitar_etiquetas(texto):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", texto)).strip()


def titulos_html(html):
    res = []
    for m in re.finditer(r"<h([123])\b[^>]*>(.*?)</h\1>", html, re.S):
        res.append((int(m.group(1)), quitar_etiquetas(m.group(2))))
    return res


def titulos_md(md):
    res = []
    for linea in md.splitlines():
        m = re.match(r"^(#{1,3}) (.+)$", linea)
        if m:
            res.append((len(m.group(1)), m.group(2).strip()))
    return res


def formato_titulos(lista):
    return "; ".join("h%d %s" % (n, t) for n, t in lista)


def dividir_acuerdos(entradas):
    md = leer(REF / ACUERDOS)
    partes = re.split(r"(?m)^(?=## )", md)
    for i, parte in enumerate(partes):
        if i == 0:
            nombre = "acuerdos_00_cabecera.md"
        else:
            titulo = parte.splitlines()[0][3:].strip()
            nombre = "acuerdos_%02d_%s.md" % (i, slug(titulo))
        tam = escribir(nombre, parte)
        entradas.append(("Acuerdos", nombre, titulos_md(parte), tam))


def partir_html(html):
    """Devuelve (css, js, fuente) de un HTML de referencia."""
    css = re.search(r"<style>\n?(.*?)</style>", html, re.S).group(1)
    js = re.search(r"<script>\n?(.*?)</script>", html, re.S).group(1)
    ini = html.index('<div id="src">') + len('<div id="src">')
    fin = html.index("<script>")
    fuente = html[ini:fin]
    fuente = re.sub(r"</div>\s*$", "", fuente.rstrip())
    return css, js, fuente.strip("\n") + "\n"


def diferencias(nombre_a, texto_a, nombre_b, texto_b):
    dif = list(difflib.unified_diff(
        texto_a.splitlines(), texto_b.splitlines(),
        fromfile=nombre_a, tofile=nombre_b, lineterm="", n=0))
    return "\n".join(dif) + "\n" if dif else "(sin diferencias)\n"


def dividir_documentos(entradas):
    datos = {}
    for clave, archivo, _ in DOCUMENTOS:
        datos[clave] = partir_html(leer(REF / archivo))

    css1, js1, _ = datos["doc1"]
    tam = escribir("comun_estilos.css", css1)
    entradas.append(("Comun", "comun_estilos.css", [], tam))
    tam = escribir("comun_paginador.js", js1)
    entradas.append(("Comun", "comun_paginador.js", [], tam))

    texto = "Diferencias frente al CSS y al paginador comunes (tomados del documento 1).\n\n"
    for clave in ("doc2", "doc3"):
        css, js, _ = datos[clave]
        texto += "## CSS %s\n\n" % clave + diferencias("doc1", css1, clave, css) + "\n"
        texto += "## Paginador %s\n\n" % clave + diferencias("doc1", js1, clave, js) + "\n"
    tam = escribir("comun_diferencias.md", texto)
    entradas.append(("Comun", "comun_diferencias.md", [], tam))

    for clave, archivo, etiqueta in DOCUMENTOS:
        fuente = datos[clave][2]
        partes = re.split(r"(?m)^(?=<h1\b)", fuente)
        for i, parte in enumerate(partes):
            if i == 0:
                if not parte.strip():
                    continue
                nombre = "%s_00_preambulo.html" % clave
            else:
                titulo = quitar_etiquetas(re.search(r"<h1\b[^>]*>(.*?)</h1>", parte, re.S).group(1))
                nombre = "%s_%02d_%s.html" % (clave, i, slug(titulo))
            tam = escribir(nombre, parte)
            entradas.append((etiqueta, nombre, titulos_html(parte), tam))


def escribir_indice(entradas):
    lineas = [
        "# Indice de referencia/secciones/",
        "",
        "Generado por herramientas/dividir_referencia.py. No editar a mano.",
        "",
    ]
    for doc, nombre, titulos, tam in entradas:
        lineas.append("- `%s` | %s | %d bytes" % (nombre, doc, tam))
        if titulos:
            lineas.append("  - %s" % formato_titulos(titulos))
    escribir("indice.md", "\n".join(lineas) + "\n")


def main():
    SAL.mkdir(exist_ok=True)
    for viejo in SAL.iterdir():
        if viejo.is_file():
            viejo.unlink()
    entradas = []
    dividir_acuerdos(entradas)
    dividir_documentos(entradas)
    escribir_indice(entradas)
    print("Partes generadas en %s: %d (mas indice.md)" % (SAL, len(entradas)))


if __name__ == "__main__":
    main()
