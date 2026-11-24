"""Pruebas simples (biblioteca estandar). Uso: python pruebas/probar.py
Todos los datos son inventados."""
import copy
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import documentos
import validacion
import visor

DATOS = Path(__file__).resolve().parent / "datos"


def cargar(nombre):
    return documentos.cargar_documento(DATOS / (nombre + ".json"))


def errores(doc):
    return [p["mensaje"] for p in validacion.validar(doc) if p["nivel"] == "error"]


class PruebasValidacion(unittest.TestCase):
    def test_datos_de_prueba_son_validos(self):
        for n in documentos.DOCUMENTOS:
            self.assertEqual(errores(cargar(n)), [], n)

    def test_columnas_no_suman_150(self):
        d = cargar("general")
        d["secciones"][1]["bloques"][1]["columnas"][0]["ancho_mm"] = 10
        self.assertTrue(any("150" in m for m in errores(d)))

    def test_estado_fuera_de_la_lista(self):
        d = cargar("general")
        d["secciones"][1]["secciones"][0]["bloques"][0]["filas"][0]["celdas"]["dev"] = "Inventado"
        self.assertTrue(any("lista" in m for m in errores(d)))

    def test_estado_con_color_fijo_se_acepta(self):
        d = cargar("general")
        celdas = d["secciones"][1]["secciones"][0]["bloques"][0]["filas"][0]["celdas"]
        celdas["dev"] = {"texto": "Inventado", "color": "gris"}
        self.assertEqual(errores(d), [])

    def test_id_repetido_y_enlace_roto(self):
        d = cargar("general")
        d["secciones"][1]["id"] = "descripcion"
        d["secciones"][0]["bloques"][0]["texto"] = "ver [x](#no-existe)"
        mensajes = errores(d)
        self.assertTrue(any("repetido" in m for m in mensajes))
        self.assertTrue(any("no existe" in m for m in mensajes))

    def test_cuatro_niveles(self):
        d = cargar("general")
        d["secciones"][1]["secciones"][0]["secciones"][0]["secciones"] = [
            {"id": "n4", "titulo": "Nivel 4", "bloques": [], "secciones": []}]
        self.assertTrue(any("3 niveles" in m for m in errores(d)))

    def test_secreto_es_solo_advertencia(self):
        d = cargar("general")
        d["secciones"][0]["bloques"][0]["texto"] = "password: abcdef123456"
        problemas = validacion.validar(d)
        self.assertFalse(validacion.hay_errores(problemas))
        self.assertTrue(any(p["nivel"] == "advertencia" for p in problemas))

    def test_estados_especiales(self):
        est = cargar("general")["estados"]
        self.assertEqual(validacion.color_de_estado("0.1.0 (no estable)", est), "amarillo")
        self.assertEqual(validacion.color_de_estado("2 de 3 aplicadas", est), "amarillo")
        self.assertEqual(validacion.color_de_estado("3 de 3 aplicadas", est), "ninguno")
        self.assertIsNone(validacion.color_de_estado("Otro", est))

    def test_formato_de_versiones(self):
        self.assertTrue(validacion.version_valida("general", "20260101-v01"))
        self.assertTrue(validacion.version_valida("repositorio", "0.2.3"))
        self.assertFalse(validacion.version_valida("repositorio", "20260101-v01"))
        self.assertFalse(validacion.version_valida("general", "0.2.3"))


class PruebasVisor(unittest.TestCase):
    def test_formato_de_texto(self):
        self.assertEqual(visor.formato("a `x` **b**"), "a <code>x</code> <b>b</b>")
        self.assertIn('class="int" href="#id"', visor.formato("[t](#id)"))
        self.assertIn('class="lnk" href="https://ejemplo.invalid"', visor.formato("[t](https://ejemplo.invalid)"))
        self.assertIn('<span class="lnk">t</span>', visor.formato("[t]()"))
        self.assertEqual(visor.formato("<b>"), "&lt;b&gt;")

    def test_html_generado(self):
        h = visor.generar_html(cargar("general"))
        self.assertIn('data-w="60,30,30,30"', h)
        self.assertIn('<td class="pend">', h)      # amarillo
        self.assertIn('<td class="na">', h)        # gris
        self.assertIn("<code>demo-rol-lectura</code>", h)
        self.assertIn('<span class="sub">01/01/2026</span>', h)
        self.assertIn('class="diag"', h)
        self.assertIn("Borrador", h)
        self.assertNotIn("Rol de lectura de reportes</code>", h)   # estilo texto en columna identificador

    def test_version_y_anexo(self):
        h = visor.generar_html(cargar("compartidos"), version="20260101-v01", fecha="01/01/2026")
        self.assertIn("20260101-v01", h)
        self.assertNotIn("Borrador", h)
        self.assertIn('<h1 data-id="anexo-a" data-anexo>', h)

    def test_sin_recursos_externos(self):
        h = visor.generar_html(cargar("repositorio"))
        self.assertNotIn("http://", h)
        self.assertNotIn("https://", h)


class PruebasCargador(unittest.TestCase):
    def test_tracking(self):
        self.assertTrue(documentos.tracking_valido("DEMOAP"))
        self.assertFalse(documentos.tracking_valido("DEMO"))

    def test_json_mal_formado(self):
        import tempfile
        with tempfile.TemporaryDirectory() as t:
            ruta = Path(t) / "x.json"
            ruta.write_text("{ no es json", encoding="utf-8")
            with self.assertRaises(ValueError):
                documentos.cargar_documento(ruta)
            self.assertIsNone(documentos.cargar_documento(Path(t) / "no_existe.json"))


if __name__ == "__main__":
    unittest.main(verbosity=1)
