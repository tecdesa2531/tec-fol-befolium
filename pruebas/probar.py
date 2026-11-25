"""Pruebas simples (biblioteca estandar). Uso: python pruebas/probar.py
Todos los datos son inventados."""
import copy
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import documentos
import migracion
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
        self.assertIn("<code>0.1.0</code><br>01/01/2026", h)      # segunda linea en el mismo texto
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


class PruebasCeldasYContadores(unittest.TestCase):
    def tabla(self, doc):
        return doc["secciones"][0]["bloques"][0]

    def doc_con_tabla(self, columnas, celdas):
        doc = cargar("general")
        doc["secciones"] = [{"id": "s", "titulo": "S", "bloques": [
            {"tipo": "tabla", "id": "b1", "clase": "estado", "columnas": columnas,
             "filas": [{"id": "f1", "celdas": celdas}]}], "secciones": []}]
        return doc

    COLS = [{"id": "c1", "titulo": "A", "ancho_mm": 75, "tipo": "texto"},
            {"id": "c2", "titulo": "B", "ancho_mm": 75, "tipo": "estado"}]

    def test_migra_estilo_y_lineas(self):
        doc = self.doc_con_tabla(
            [{"id": "c1", "titulo": "A", "ancho_mm": 75, "tipo": "identificador"},
             {"id": "c2", "titulo": "B", "ancho_mm": 75, "tipo": "texto"}],
            {"c1": {"texto": "demo-x", "lineas": ["01/01/2026"]},
             "c2": {"texto": "Hola", "lineas": ["otra", ""], "estilo": "identificador"}})
        migracion.migrar(doc)
        celdas = self.tabla(doc)["filas"][0]["celdas"]
        self.assertEqual(celdas["c1"], "`demo-x`\n01/01/2026")            # la primera linea seguia en Consolas
        self.assertEqual(celdas["c2"], {"texto": "`Hola`\notra", "tipo": "identificador"})
        self.assertNotIn("lineas", str(doc))
        self.assertNotIn("estilo", str(doc))
        copia = copy.deepcopy(doc)
        self.assertEqual(migracion.migrar(doc), copia)                      # migrar dos veces no cambia nada

    def test_migra_contadores_al_maximo(self):
        doc = self.doc_con_tabla(self.COLS, {})
        doc["secciones"][0]["bloques"][0]["filas"] = [{"id": "f2", "celdas": {}}, {"id": "f7", "celdas": {}}]
        migracion.migrar(doc)
        self.assertEqual(self.tabla(doc)["siguiente_fila"], 8)
        self.assertEqual(self.tabla(doc)["siguiente_columna"], 3)
        self.assertEqual(doc["secciones"][0]["siguiente_bloque"], 2)

    def test_validacion_de_contadores(self):
        doc = self.doc_con_tabla(self.COLS, {})
        migracion.migrar(doc)
        self.assertEqual(errores(doc), [])
        self.tabla(doc)["siguiente_fila"] = 1                               # no puede quedar por debajo de f1
        self.assertTrue(any("siguiente_fila" in e for e in errores(doc)))

    def test_celda_estado_en_columna_de_texto(self):
        doc = self.doc_con_tabla(self.COLS, {"c1": {"texto": "En uso\n22/11/2026", "tipo": "estado"}, "c2": "En uso"})
        migracion.migrar(doc)
        self.assertEqual(errores(doc), [])                                  # cuenta la primera linea
        h = visor.generar_html(doc)
        self.assertIn("22/11/2026", h)
        self.assertIn("En uso<br>22/11/2026", h)
        doc["secciones"][0]["bloques"][0]["filas"][0]["celdas"]["c1"] = {"texto": "Nada\nmas", "tipo": "estado"}
        self.assertTrue(any("Estado 'Nada'" in e for e in errores(doc)))

    def test_celda_de_texto_en_columna_de_estado(self):
        doc = self.doc_con_tabla(self.COLS, {"c2": {"texto": "cualquier cosa", "tipo": "texto"}})
        migracion.migrar(doc)
        self.assertEqual(errores(doc), [])                                  # ya no se valida como estado
        self.assertNotIn('class="pend"', visor.generar_html(doc))

    def test_color_automatico_con_primera_linea(self):
        est = [{"texto": "Pendiente", "color": "amarillo"}]
        doc = self.doc_con_tabla(self.COLS, {"c2": "Pendiente\nen proceso"})
        doc["estados"] = est
        self.assertIn('<td class="pend"', visor.generar_html(doc))

    def test_el_formato_anterior_da_error(self):
        doc = self.doc_con_tabla(self.COLS, {"c1": {"texto": "x", "lineas": ["y"]}})
        self.assertTrue(any("Formato anterior" in e for e in errores(doc)))


class PruebasImagenesYEstados(unittest.TestCase):
    def doc(self, bloque):
        doc = cargar("general")
        doc["secciones"] = [{"id": "s", "titulo": "S", "bloques": [bloque], "secciones": []}]
        return doc

    def test_imagen_valida_sin_archivo_se_dibuja_como_recuadro(self):
        doc = self.doc({"tipo": "imagen", "id": "b1", "alto_mm": 60, "descripcion": ["Titulo", "detalle"],
                        "fuente_drawio": "03_Diagramas/arq.drawio"})
        self.assertEqual(errores(doc), [])
        h = visor.generar_html(doc)
        self.assertIn('class="diag"', h)
        self.assertIn("height:60mm", h)

    def test_alto_y_fuente_de_la_imagen(self):
        for alto in (0, -1, 248, "x", None):
            self.assertTrue(errores(self.doc({"tipo": "imagen", "id": "b1", "alto_mm": alto})), alto)
        for fuente in ("otra/arq.drawio", "03_Diagramas/../x.drawio", "03_Diagramas\\x.drawio", "03_Diagramas"):
            doc = self.doc({"tipo": "imagen", "id": "b1", "alto_mm": 50, "fuente_drawio": fuente})
            self.assertTrue(any("fuente_drawio" in e for e in errores(doc)), fuente)

    def test_los_problemas_traen_el_elemento(self):
        doc = self.doc({"tipo": "tabla", "id": "b1", "clase": "estado",
                        "columnas": [{"id": "c1", "titulo": "A", "ancho_mm": 150, "tipo": "estado"}],
                        "filas": [{"id": "f1", "celdas": {"c1": "Nada"}}]})
        malo = [p for p in validacion.validar(doc) if "Estado 'Nada'" in p["mensaje"]][0]
        self.assertEqual(malo["ref"], {"tipo": "celda", "sid": "s", "bid": "b1", "fid": "f1", "cid": "c1"})
        doc["secciones"][0]["titulo"] = ""
        self.assertIn({"tipo": "seccion", "sid": "s"}, [p["ref"] for p in validacion.validar(doc)])

    def test_estados_repetidos_o_vacios(self):
        doc = self.doc({"tipo": "parrafo", "id": "b1", "texto": "x"})
        doc["estados"] = [{"texto": "A", "color": "gris"}, {"texto": "A", "color": "gris"}, {"texto": " ", "color": "gris"}]
        mensajes = errores(doc)
        self.assertTrue(any("repetido" in m for m in mensajes))
        self.assertTrue(any("sin texto" in m for m in mensajes))


class PruebasCss(unittest.TestCase):
    def test_llaves_balanceadas(self):
        # una llave de mas descarta en silencio las reglas que siguen
        for nombre in ("estilos.css", "folium.css"):
            texto = (RAIZ / "web" / nombre).read_text(encoding="utf-8")
            self.assertEqual(texto.count("{"), texto.count("}"), nombre)

    def test_impresion_anula_la_vista(self):
        css = (RAIZ / "web" / "estilos.css").read_text(encoding="utf-8")
        bloque = css[css.index("@media print"):]
        for regla in ("background:#fff!important", "box-shadow:none!important", "padding:0!important",
                      "zoom:1!important", "gap:0!important", ".bar{display:none!important}"):
            self.assertIn(regla, bloque)
        self.assertIn("@page{size:A4;margin:0}", css)

    def test_estilos_del_editor_solo_en_pantalla(self):
        self.assertTrue(visor.ESTILO_VISTA.lstrip().startswith("<style>\n@media screen{"))


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
