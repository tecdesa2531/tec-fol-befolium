/* Pruebas del modelo de secciones (opcional: requiere Node, solo para desarrollo).
   Uso: node pruebas/probar_modelo.js . Todos los datos son inventados. */
const assert = require("assert");
const { Modelo, slug } = require("../web/modelo.js");

function doc() {
  return { formato: 1, documento: "general", secciones: [
    { id: "a", titulo: "Alfa", bloques: [{ tipo: "parrafo", id: "b1", texto: "x" }], secciones: [
      { id: "a1", titulo: "Alfa uno", bloques: [], secciones: [{ id: "a1x", titulo: "Profunda", bloques: [], secciones: [] }] }] },
    { id: "b", titulo: "Beta", bloques: [], secciones: [] },
    { id: "c", titulo: "Gamma", bloques: [], secciones: [], anexo: true }] };
}
const ids = (lista) => lista.map((s) => s.id + (s.secciones && s.secciones.length ? "(" + ids(s.secciones) + ")" : "")).join(",");
let pruebas = 0;
function prueba(nombre, fn) { fn(); pruebas++; console.log("ok - " + nombre); }

prueba("slug sin tildes ni signos", () => {
  assert.strictEqual(slug("Descripción de la aplicación"), "descripcion-de-la-aplicacion");
  assert.strictEqual(slug("¿¿??"), "seccion");
});

prueba("agregar al final, antes, despues y dentro", () => {
  const m = new Modelo("general", doc());
  const n1 = m.agregarSeccion(null, "despues");
  assert.strictEqual(n1, "nueva-seccion");
  const n2 = m.agregarSeccion("b", "antes");
  assert.strictEqual(n2, "nueva-seccion-2");
  const n3 = m.agregarSeccion("b", "dentro", "Hija");
  assert.strictEqual(ids(m.doc.secciones), "a(a1(a1x)),nueva-seccion-2,b(hija),c,nueva-seccion");
});

prueba("limite de 3 niveles", () => {
  const m = new Modelo("general", doc());
  assert.throws(() => m.agregarSeccion("a1x", "dentro"), /3 niveles/);
  assert.throws(() => m.moverSeccion("a", "b", "dentro"), /3 niveles/);   // a tiene altura 3
  assert.strictEqual(ids(m.doc.secciones), "a(a1(a1x)),b,c");
});

prueba("mover: no dentro de si misma ni de sus hijas", () => {
  const m = new Modelo("general", doc());
  assert.throws(() => m.moverSeccion("a", "a", "dentro"));
  assert.throws(() => m.moverSeccion("a", "a1", "despues"), /propias subsecciones/);
  m.moverSeccion("b", "a", "antes");
  assert.strictEqual(ids(m.doc.secciones), "b,a(a1(a1x)),c");
});

prueba("mover quita el anexo si baja de nivel", () => {
  const m = new Modelo("general", doc());
  m.moverSeccion("c", "b", "dentro");
  assert.strictEqual(m.buscar("c").sec.anexo, undefined);
});

prueba("titulo de una seccion nueva genera su id una sola vez", () => {
  const m = new Modelo("general", doc());
  const id = m.agregarSeccion(null, "despues");
  const nuevo = m.confirmarTitulo(id, "Pendientes del equipo");
  assert.strictEqual(nuevo, "pendientes-del-equipo");
  assert.strictEqual(m.confirmarTitulo(nuevo, "Otro titulo"), "pendientes-del-equipo");
  assert.strictEqual(m.buscar("pendientes-del-equipo").sec.titulo, "Otro titulo");
});

prueba("quitar: cuenta el contenido y retira los ids", () => {
  const m = new Modelo("general", doc());
  assert.deepStrictEqual(m.contenidoDe("a"), { bloques: 1, subsecciones: 2 });
  m.quitarSeccion("a");
  assert.strictEqual(ids(m.doc.secciones), "b,c");
  assert.deepStrictEqual(m.doc.ids_retirados.sort(), ["a", "a1", "a1x"]);
  const id = m.agregarSeccion(null, "despues", "Alfa");      // "alfa" no choca; "a" tampoco se reutiliza
  assert.strictEqual(m.idUnico("a"), "a-2");
});

prueba("duplicar con ids nuevos", () => {
  const m = new Modelo("general", doc());
  const copia = m.duplicarSeccion("a");
  assert.strictEqual(copia, "a-copia");
  assert.strictEqual(ids(m.doc.secciones), "a(a1(a1x)),a-copia(a1-copia(a1x-copia)),b,c");
  assert.strictEqual(m.buscar("a-copia").sec.titulo, "Alfa (copia)");
});

prueba("cambiar de nivel", () => {
  const m = new Modelo("general", doc());
  m.cambiarNivel("b", "bajar");                      // b pasa a ser hija de a
  assert.strictEqual(ids(m.doc.secciones), "a(a1(a1x),b),c");
  m.cambiarNivel("b", "subir");
  assert.strictEqual(ids(m.doc.secciones), "a(a1(a1x)),b,c");
  assert.throws(() => m.cambiarNivel("a", "bajar"), /anterior/);
  assert.throws(() => m.cambiarNivel("a", "subir"), /primer nivel/);
});

prueba("deshacer y rehacer, y error que no deja rastro", () => {
  const m = new Modelo("general", doc());
  const inicial = JSON.stringify(m.doc);
  m.agregarSeccion(null, "despues");
  m.quitarSeccion("b");
  assert.ok(m.puedeDeshacer());
  m.deshacer(); m.deshacer();
  assert.strictEqual(JSON.stringify(m.doc), inicial);
  assert.ok(m.puedeRehacer());
  m.rehacer();
  assert.strictEqual(ids(m.doc.secciones), "a(a1(a1x)),b,c,nueva-seccion");
  assert.throws(() => m.agregarSeccion("a1x", "dentro"));
  assert.strictEqual(ids(m.doc.secciones), "a(a1(a1x)),b,c,nueva-seccion");
  assert.strictEqual(m.antes.length, 1);             // el error no agrego historial
  m.agregarSeccion(null, "despues");
  assert.strictEqual(m.puedeRehacer(), false);       // un cambio nuevo borra el rehacer
});

prueba("numeracion como la del paginador", () => {
  const m = new Modelo("general", doc());
  assert.deepStrictEqual(m.numeracion(), { a: "1.", a1: "a)", a1x: "", b: "2.", c: "" });
});

prueba("marcar anexo solo en el primer nivel", () => {
  const m = new Modelo("general", doc());
  assert.throws(() => m.marcarSeccion("a1", "anexo", true), /primer nivel/);
  m.marcarSeccion("b", "anexo", true);
  assert.strictEqual(m.buscar("b").sec.anexo, true);
  m.marcarSeccion("b", "anexo", false);
  assert.strictEqual(m.buscar("b").sec.anexo, undefined);
});

console.log("\n" + pruebas + " pruebas del modelo correctas");
