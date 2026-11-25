"""Imagenes de los diagramas: se validan por su contenido, reciben un nombre propio con su
hash y se guardan en actual/imagenes/. Solo PNG, JPG y SVG."""
import base64
import binascii
import hashlib
import re
import struct
from pathlib import Path

MAX_BYTES = 10 * 1024 * 1024
ANCHO_UTIL_MM = 150
ALTO_UTIL_MM = 247
ALTO_POR_DEFECTO_MM = 80
NOMBRES_GENERICOS = ("image", "imagen", "captura", "screenshot", "sin-titulo", "untitled", "pasted",
                     "blob", "unnamed", "diagrama", "download")


def tipo_de(datos):
    """('png'|'jpg'|'svg') segun el contenido, o None si no es una imagen admitida."""
    if datos.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if datos.startswith(b"\xff\xd8\xff"):
        return "jpg"
    try:
        texto = datos[:4096].decode("utf-8-sig", errors="strict")
    except UnicodeDecodeError:
        return None
    if re.search(r"<svg[\s>]", texto):
        return "svg"
    return None


def _dimensiones_png(d):
    return struct.unpack(">II", d[16:24]) if len(d) >= 24 else None


def _dimensiones_jpg(d):
    i = 2
    while i + 9 < len(d):
        if d[i] != 0xFF:
            i += 1
            continue
        marca = d[i + 1]
        if marca in (0xD8, 0x01) or 0xD0 <= marca <= 0xD7:
            i += 2
            continue
        largo = struct.unpack(">H", d[i + 2:i + 4])[0]
        if 0xC0 <= marca <= 0xCF and marca not in (0xC4, 0xC8, 0xCC):
            alto, ancho = struct.unpack(">HH", d[i + 5:i + 9])
            return ancho, alto
        i += 2 + largo
    return None


def _numero(texto):
    m = re.match(r"\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$", texto or "")
    return float(m.group(1)) if m else None


def _dimensiones_svg(d):
    texto = d[:4096].decode("utf-8-sig", errors="replace")
    etiqueta = re.search(r"<svg\b[^>]*>", texto)
    if not etiqueta:
        return None
    et = etiqueta.group(0)
    ancho = re.search(r'\bwidth\s*=\s*"([^"]*)"', et)
    alto = re.search(r'\bheight\s*=\s*"([^"]*)"', et)
    a, h = _numero(ancho.group(1)) if ancho else None, _numero(alto.group(1)) if alto else None
    if a and h:
        return a, h
    caja = re.search(r'\bviewBox\s*=\s*"([^"]*)"', et)
    if caja:
        partes = re.split(r"[\s,]+", caja.group(1).strip())
        if len(partes) == 4:
            try:
                return float(partes[2]), float(partes[3])
            except ValueError:
                return None
    return None


def dimensiones(datos, tipo):
    """(ancho, alto) en pixeles, o None si no se pueden leer."""
    try:
        medidas = {"png": _dimensiones_png, "jpg": _dimensiones_jpg, "svg": _dimensiones_svg}[tipo](datos)
    except (struct.error, IndexError):
        return None
    return medidas if medidas and medidas[0] > 0 and medidas[1] > 0 else None


def alto_sugerido_mm(medidas):
    """Alto que tiene la imagen al ocupar los 150 mm de ancho, a medio mm y sin pasar del alto util."""
    if not medidas:
        return ALTO_POR_DEFECTO_MM
    alto = ANCHO_UTIL_MM * medidas[1] / medidas[0]
    return max(5, min(ALTO_UTIL_MM, round(alto * 2) / 2))


def slug(texto):
    t = re.sub(r"[^a-z0-9]+", "-", str(texto).lower()).strip("-")
    return t[:40].strip("-")


def nombre_propio(original, seccion, hash8, extension):
    """Nombre del archivo: el de origen (si dice algo) o uno por la seccion, mas el hash corto."""
    raiz = slug(Path(str(original or "")).stem)
    if not raiz or raiz in NOMBRES_GENERICOS or re.fullmatch(r"(image|imagen|captura|screenshot)-?\d*", raiz):
        raiz = "imagen-" + (slug(seccion) or "diagrama")
    return "%s-%s.%s" % (raiz, hash8, extension)


def guardar(carpeta_actual, datos_base64, original, seccion):
    """Valida y guarda una imagen en actual/imagenes/. Devuelve archivo, sha256 y medidas."""
    try:
        datos = base64.b64decode(str(datos_base64), validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("La imagen no se pudo leer.")
    if not datos:
        raise ValueError("La imagen está vacía.")
    if len(datos) > MAX_BYTES:
        raise ValueError("La imagen pesa más de %d MB." % (MAX_BYTES // (1024 * 1024)))
    tipo = tipo_de(datos)
    if tipo is None:
        raise ValueError("Solo se admiten imágenes PNG, JPG o SVG.")
    digest = hashlib.sha256(datos).hexdigest()
    archivo = nombre_propio(original, seccion, digest[:8], tipo)
    carpeta = Path(carpeta_actual) / "imagenes"
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = carpeta / archivo
    if not destino.is_file() or destino.read_bytes() != datos:
        destino.write_bytes(datos)
    medidas = dimensiones(datos, tipo)
    return {"archivo": archivo, "sha256": digest, "tipo": tipo,
            "ancho_px": int(medidas[0]) if medidas else None,
            "alto_px": int(medidas[1]) if medidas else None,
            "alto_mm": alto_sugerido_mm(medidas)}
