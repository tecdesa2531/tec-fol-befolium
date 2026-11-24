/* Modelo de un documento: cambios, historial (deshacer y rehacer) y reglas del arbol de
   secciones. No toca la pantalla ni el servidor. */
(function (raiz) {
  "use strict";

  const MAX_NIVEL = 3;
  const MAX_HISTORIAL = 200;
  const TEXTOS_NUEVOS = {
    parrafo: "Nuevo párrafo",
    nota: "Nueva nota",
    nota_destacada: "Nueva nota destacada",
    etiqueta: "Nueva etiqueta",
  };

  function quitarTildes(texto) { return texto.normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  /* Identificador estable a partir de un titulo: minusculas, sin tildes, con guiones. */
  function slug(texto) {
    const t = quitarTildes(String(texto)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return t || "seccion";
  }

  class Modelo {
    constructor(nombre, doc) {
      this.nombre = nombre;
      this.doc = doc;
      this.antes = [];
      this.despues = [];
      this.fijos = new Set();           // ids que ya estan en alguna version guardada: no cambian
      this.oyentes = [];
    }

    alCambiar(fn) { this.oyentes.push(fn); }
    avisar(motivo) { this.oyentes.forEach((f) => f(motivo)); }

    /* ---------- historial ---------- */
    puedeDeshacer() { return this.antes.length > 0; }
    puedeRehacer() { return this.despues.length > 0; }

    /* Aplica un cambio. Si lanza un error, el documento vuelve a como estaba. */
    cambiar(fn) {
      const instantanea = JSON.stringify(this.doc);
      try { fn(); } catch (e) { this.doc = JSON.parse(instantanea); throw e; }
      if (JSON.stringify(this.doc) === instantanea) return false;
      this.antes.push(instantanea);
      if (this.antes.length > MAX_HISTORIAL) this.antes.shift();
      this.despues = [];
      this.avisar("cambio");
      return true;
    }

    deshacer() {
      if (!this.puedeDeshacer()) return false;
      this.despues.push(JSON.stringify(this.doc));
      this.doc = JSON.parse(this.antes.pop());
      this.avisar("deshacer");
      return true;
    }

    rehacer() {
      if (!this.puedeRehacer()) return false;
      this.antes.push(JSON.stringify(this.doc));
      this.doc = JSON.parse(this.despues.pop());
      this.avisar("rehacer");
      return true;
    }

    esFijo(id) { return this.fijos.has(id); }

    /* ---------- consultas del arbol ---------- */
    buscar(id, lista, nivel, padre) {
      lista = lista || this.doc.secciones;
      nivel = nivel || 1;
      for (let i = 0; i < lista.length; i++) {
        const s = lista[i];
        if (s.id === id) return { sec: s, lista: lista, indice: i, nivel: nivel, padre: padre || null };
        const r = this.buscar(id, s.secciones || [], nivel + 1, s);
        if (r) return r;
      }
      return null;
    }

    altura(sec) {
      let h = 0;
      (sec.secciones || []).forEach((c) => { h = Math.max(h, this.altura(c)); });
      return h + 1;
    }

    idsDe(sec, salida) {
      salida = salida || [];
      salida.push(sec.id);
      (sec.secciones || []).forEach((c) => this.idsDe(c, salida));
      return salida;
    }

    todosIds() {
      const ids = new Set(this.doc.ids_retirados || []);
      this.doc.secciones.forEach((s) => this.idsDe(s).forEach((i) => ids.add(i)));
      return ids;
    }

    /* Cuantos bloques y subsecciones se borrarian al quitar una seccion. */
    contenidoDe(id) {
      const r = this.buscar(id);
      let bloques = 0, subsecciones = 0;
      const contar = (s, esRaiz) => {
        bloques += (s.bloques || []).length;
        (s.secciones || []).forEach((c) => { subsecciones++; contar(c, false); });
      };
      contar(r.sec, true);
      return { bloques: bloques, subsecciones: subsecciones };
    }

    /* Numeracion como la del paginador: 1., a) y sin numero en nivel 3 y anexos. */
    numeracion() {
      const m = {};
      let n1 = 0;
      this.doc.secciones.forEach((s) => {
        if (s.anexo) m[s.id] = ""; else { n1++; m[s.id] = n1 + "."; }
        (s.secciones || []).forEach((c, i) => {
          m[c.id] = String.fromCharCode(97 + i) + ")";
          (c.secciones || []).forEach((d) => { m[d.id] = ""; });
        });
      });
      return m;
    }

    idUnico(base, excepto, reservados) {
      const usados = this.todosIds();
      if (reservados) reservados.forEach((i) => usados.add(i));
      if (excepto) usados.delete(excepto);
      if (!usados.has(base)) return base;
      let n = 2;
      while (usados.has(base + "-" + n)) n++;
      return base + "-" + n;
    }

    /* ---------- reglas de posicion ----------
       zona: "antes" o "despues" (hermana de refId) o "dentro" (hija, al final).
       refId vacio: al final del primer nivel. */
    ubicar(refId, zona) {
      if (!refId) return { lista: this.doc.secciones, indice: this.doc.secciones.length, nivel: 1 };
      const r = this.buscar(refId);
      if (!r) throw new Error("No se encontró la sección de destino.");
      if (zona === "antes") return { lista: r.lista, indice: r.indice, nivel: r.nivel };
      if (zona === "despues") return { lista: r.lista, indice: r.indice + 1, nivel: r.nivel };
      if (!r.sec.secciones) r.sec.secciones = [];
      return { lista: r.sec.secciones, indice: r.sec.secciones.length, nivel: r.nivel + 1 };
    }

    nivelDestino(refId, zona) {
      if (!refId) return 1;
      const r = this.buscar(refId);
      if (!r) return 0;
      return zona === "dentro" ? r.nivel + 1 : r.nivel;
    }

    /* Texto con el motivo por el que no se puede mover, o null si se puede. */
    motivoNoMover(id, refId, zona) {
      const o = this.buscar(id);
      if (!o) return "No se encontró la sección.";
      if (refId === id) return "Una sección no se puede mover dentro de sí misma.";
      if (refId && this.buscar(refId, o.sec.secciones || [], o.nivel + 1, o.sec)) {
        return "Una sección no se puede mover dentro de sus propias subsecciones.";
      }
      const nivel = this.nivelDestino(refId, zona);
      if (nivel === 0) return "No se encontró la sección de destino.";
      if (nivel + this.altura(o.sec) - 1 > MAX_NIVEL) return "Las secciones admiten hasta 3 niveles.";
      return null;
    }

    motivoNoAgregar(refId, zona) {
      const nivel = this.nivelDestino(refId, zona);
      if (nivel === 0) return "No se encontró la sección de destino.";
      return nivel > MAX_NIVEL ? "Las secciones admiten hasta 3 niveles." : null;
    }

    /* ---------- operaciones ---------- */
    agregarSeccion(refId, zona, titulo) {
      titulo = titulo || "Nueva sección";
      let nuevoId = null;
      this.cambiar(() => {
        const motivo = this.motivoNoAgregar(refId, zona);
        if (motivo) throw new Error(motivo);
        const d = this.ubicar(refId, zona);
        nuevoId = this.idUnico(slug(titulo));
        d.lista.splice(d.indice, 0, { id: nuevoId, titulo: titulo, bloques: [], secciones: [] });
      });
      return nuevoId;
    }

    moverSeccion(id, refId, zona) {
      return this.cambiar(() => {
        const motivo = this.motivoNoMover(id, refId, zona);
        if (motivo) throw new Error(motivo);
        const o = this.buscar(id);
        o.lista.splice(o.indice, 1);
        const d = this.ubicar(refId, zona);
        d.lista.splice(d.indice, 0, o.sec);
        if (d.nivel !== 1) delete o.sec.anexo;
      });
    }

    /* Cambia el titulo. Mientras la seccion no este en ninguna version guardada, su
       identificador se regenera a partir del titulo (y los enlaces internos que la nombraban
       se actualizan); desde la primera version guardada queda fijo. Devuelve el identificador. */
    confirmarTitulo(id, titulo) {
      let idFinal = id;
      this.cambiar(() => {
        const r = this.buscar(id);
        r.sec.titulo = titulo;
        if (!this.esFijo(id)) {
          const nuevo = this.idUnico(slug(titulo), id);
          if (nuevo !== id) {
            r.sec.id = nuevo;
            this.reescribirEnlaces(this.doc, id, nuevo);
            idFinal = nuevo;
          }
        }
      });
      return idFinal;
    }

    reescribirEnlaces(nodo, viejo, nuevo) {
      const de = "](#" + viejo + ")", a = "](#" + nuevo + ")";
      if (Array.isArray(nodo)) {
        nodo.forEach((x, i) => { if (typeof x === "string") nodo[i] = x.split(de).join(a); else this.reescribirEnlaces(x, viejo, nuevo); });
      } else if (nodo && typeof nodo === "object") {
        Object.keys(nodo).forEach((k) => {
          if (typeof nodo[k] === "string") nodo[k] = nodo[k].split(de).join(a); else this.reescribirEnlaces(nodo[k], viejo, nuevo);
        });
      }
    }

    quitarSeccion(id) {
      return this.cambiar(() => {
        const r = this.buscar(id);
        const ids = this.idsDe(r.sec);
        r.lista.splice(r.indice, 1);
        const retirados = new Set(this.doc.ids_retirados || []);
        ids.forEach((i) => { if (this.esFijo(i)) retirados.add(i); });   // solo los ya publicados
        if (retirados.size) this.doc.ids_retirados = Array.from(retirados);
      });
    }

    duplicarSeccion(id) {
      let nuevoId = null;
      this.cambiar(() => {
        const r = this.buscar(id);
        const reservados = new Set();
        const clonar = (s) => {
          const c = JSON.parse(JSON.stringify(s));
          const reasignar = (x) => {
            x.id = this.idUnico(x.id + "-copia", null, reservados);
            reservados.add(x.id);
            (x.secciones || []).forEach(reasignar);
          };
          reasignar(c);
          return c;
        };
        const copia = clonar(r.sec);
        copia.titulo = r.sec.titulo + " (copia)";
        r.lista.splice(r.indice + 1, 0, copia);
        nuevoId = copia.id;
      });
      return nuevoId;
    }

    /* dir: "subir" (pasa a ser hermana de su padre) o "bajar" (pasa a ser hija de la anterior). */
    motivoNoNivel(id, dir) {
      const r = this.buscar(id);
      if (!r) return "No se encontró la sección.";
      if (dir === "subir") {
        return r.padre ? null : "Ya está en el primer nivel.";
      }
      if (r.indice === 0) return "No hay una sección anterior en el mismo nivel.";
      return this.motivoNoMover(id, r.lista[r.indice - 1].id, "dentro");
    }

    cambiarNivel(id, dir) {
      const r = this.buscar(id);
      const motivo = this.motivoNoNivel(id, dir);
      if (motivo) throw new Error(motivo);
      if (dir === "subir") return this.moverSeccion(id, r.padre.id, "despues");
      return this.moverSeccion(id, r.lista[r.indice - 1].id, "dentro");
    }

    /* Indicadores de una seccion: "opcional" y "anexo". */
    marcarSeccion(id, campo, valor) {
      return this.cambiar(() => {
        const r = this.buscar(id);
        if (campo === "anexo" && r.nivel !== 1) throw new Error("Solo el primer nivel puede ser anexo.");
        if (valor) r.sec[campo] = true; else delete r.sec[campo];
      });
    }

    /* ---------- bloques de texto ---------- */
    bloqueDe(sid, bid) {
      const r = this.buscar(sid);
      if (!r) return null;
      const bloques = r.sec.bloques || (r.sec.bloques = []);
      const indice = bloques.findIndex((b) => b.id === bid);
      return indice < 0 ? null : { sec: r.sec, bloques: bloques, indice: indice, bloque: bloques[indice] };
    }

    idBloqueNuevo(sec, reservados) {
      const usados = new Set((sec.bloques || []).map((b) => b.id));
      if (reservados) reservados.forEach((i) => usados.add(i));
      let n = 1;
      (sec.bloques || []).forEach((b) => { const m = /^b(\d+)$/.exec(b.id); if (m) n = Math.max(n, Number(m[1]) + 1); });
      while (usados.has("b" + n)) n++;
      return "b" + n;
    }

    /* indice null: al final de los bloques de la seccion. Devuelve el id del bloque. */
    agregarBloque(sid, indice, tipo) {
      if (!TEXTOS_NUEVOS[tipo]) throw new Error("Ese tipo de bloque todavía no se puede agregar.");
      let nuevoId = null;
      this.cambiar(() => {
        const r = this.buscar(sid);
        if (!r) throw new Error("No se encontró la sección de destino.");
        if (!r.sec.bloques) r.sec.bloques = [];
        nuevoId = this.idBloqueNuevo(r.sec);
        const i = indice === null || indice === undefined ? r.sec.bloques.length : indice;
        r.sec.bloques.splice(i, 0, { tipo: tipo, id: nuevoId, texto: TEXTOS_NUEVOS[tipo] });
      });
      return nuevoId;
    }

    /* Devuelve el id del bloque despues de moverlo (cambia solo si choca con otro del destino). */
    moverBloque(sid, bid, sidDestino, indice) {
      let idFinal = bid;
      this.cambiar(() => {
        const o = this.bloqueDe(sid, bid);
        const d = this.buscar(sidDestino);
        if (!o || !d) throw new Error("No se encontró el bloque o su destino.");
        if (!d.sec.bloques) d.sec.bloques = [];
        let i = indice === null || indice === undefined ? d.sec.bloques.length : indice;
        if (o.bloques === d.sec.bloques && o.indice < i) i--;      // al quitarlo, los de abajo suben
        o.bloques.splice(o.indice, 1);
        if (d.sec.bloques.some((b) => b.id === o.bloque.id)) o.bloque.id = this.idBloqueNuevo(d.sec);
        idFinal = o.bloque.id;
        d.sec.bloques.splice(i, 0, o.bloque);
      });
      return idFinal;
    }

    quitarBloque(sid, bid) {
      return this.cambiar(() => {
        const o = this.bloqueDe(sid, bid);
        if (!o) throw new Error("No se encontró el bloque.");
        o.bloques.splice(o.indice, 1);
      });
    }

    duplicarBloque(sid, bid) {
      let nuevoId = null;
      this.cambiar(() => {
        const o = this.bloqueDe(sid, bid);
        const copia = JSON.parse(JSON.stringify(o.bloque));
        copia.id = this.idBloqueNuevo(o.sec);
        (copia.filas || []).forEach((f, i) => { f.id = "f" + (i + 1); });
        o.bloques.splice(o.indice + 1, 0, copia);
        nuevoId = copia.id;
      });
      return nuevoId;
    }

    textoBloque(sid, bid, texto) {
      return this.cambiar(() => {
        const o = this.bloqueDe(sid, bid);
        if (!o || typeof o.bloque.texto !== "string") throw new Error("Este bloque no tiene texto.");
        o.bloque.texto = texto;
      });
    }

    /* Cambia entre los tipos de texto (parrafo, nota, nota destacada y etiqueta). */
    tipoBloque(sid, bid, tipo) {
      return this.cambiar(() => {
        const o = this.bloqueDe(sid, bid);
        if (!TEXTOS_NUEVOS[tipo] || typeof o.bloque.texto !== "string") throw new Error("No se puede cambiar a ese tipo.");
        o.bloque.tipo = tipo;
        if (tipo === "etiqueta") delete o.bloque.con_siguiente;     // las etiquetas siempre van con el siguiente
      });
    }

    conSiguiente(sid, bid, valor) {
      return this.cambiar(() => {
        const o = this.bloqueDe(sid, bid);
        if (valor) o.bloque.con_siguiente = true; else delete o.bloque.con_siguiente;
      });
    }

    /* ---------- tablas ---------- */
    tablaDe(sid, bid) {
      const o = this.bloqueDe(sid, bid);
      if (!o || o.bloque.tipo !== "tabla") throw new Error("No se encontró la tabla.");
      return o.bloque;
    }

    siguienteId(prefijo, lista) {
      const usados = new Set(lista.map((x) => x.id));
      let n = 1;
      lista.forEach((x) => { const m = new RegExp("^" + prefijo + "(\\d+)$").exec(x.id); if (m) n = Math.max(n, Number(m[1]) + 1); });
      while (usados.has(prefijo + n)) n++;
      return prefijo + n;
    }

    /* Reparte los anchos en proporcion para que sumen 150 mm (a medio milimetro). */
    repartirAnchos(columnas) {
      if (!columnas.length) return;
      const suma = columnas.reduce((a, c) => a + Number(c.ancho_mm || 0), 0);
      let a = columnas.map((c) => (suma > 0 ? Number(c.ancho_mm || 0) * 150 / suma : 150 / columnas.length));
      a = a.map((x) => Math.max(5, Math.round(x * 2) / 2));
      const resto = Math.round((150 - a.reduce((x, y) => x + y, 0)) * 2) / 2;
      const i = a.indexOf(Math.max.apply(null, a));
      a[i] = Math.round((a[i] + resto) * 2) / 2;
      columnas.forEach((c, k) => { c.ancho_mm = a[k]; });
    }

    sumaAnchos(sid, bid) {
      return this.tablaDe(sid, bid).columnas.reduce((a, c) => a + Number(c.ancho_mm || 0), 0);
    }

    agregarTabla(sid, indice) {
      let nuevoId = null;
      this.cambiar(() => {
        const r = this.buscar(sid);
        if (!r) throw new Error("No se encontró la sección de destino.");
        if (!r.sec.bloques) r.sec.bloques = [];
        nuevoId = this.idBloqueNuevo(r.sec);
        const i = indice === null || indice === undefined ? r.sec.bloques.length : indice;
        r.sec.bloques.splice(i, 0, {
          tipo: "tabla", id: nuevoId, clase: "estado",
          columnas: [1, 2, 3].map((n) => ({ id: "c" + n, titulo: "Columna " + n, ancho_mm: 50, tipo: "texto" })),
          filas: [{ id: "f1", celdas: {} }] });
      });
      return nuevoId;
    }

    tablaClase(sid, bid, clase) {
      return this.cambiar(() => {
        const t = this.tablaDe(sid, bid);
        t.clase = clase;
        if (clase === "registro") { if (!t.nuevas_filas) t.nuevas_filas = "abajo"; } else delete t.nuevas_filas;
      });
    }

    tablaNuevasFilas(sid, bid, valor) {
      return this.cambiar(() => {
        const t = this.tablaDe(sid, bid);
        if (t.clase !== "registro") throw new Error("Solo las tablas de registro tienen esta propiedad.");
        t.nuevas_filas = valor === "arriba" ? "arriba" : "abajo";
      });
    }

    /* ---- columnas ---- */
    columnaDe(sid, bid, cid) {
      const t = this.tablaDe(sid, bid);
      const i = t.columnas.findIndex((c) => c.id === cid);
      if (i < 0) throw new Error("No se encontró la columna.");
      return { t: t, i: i, c: t.columnas[i] };
    }

    agregarColumna(sid, bid, indice) {
      let nuevoId = null;
      this.cambiar(() => {
        const t = this.tablaDe(sid, bid);
        nuevoId = this.siguienteId("c", t.columnas);
        const i = indice === null || indice === undefined ? t.columnas.length : indice;
        t.columnas.splice(i, 0, { id: nuevoId, titulo: "Columna " + (t.columnas.length + 1), ancho_mm: 20, tipo: "texto" });
        this.repartirAnchos(t.columnas);
      });
      return nuevoId;
    }

    contenidoColumna(sid, bid, cid) {
      const t = this.tablaDe(sid, bid);
      return t.filas.filter((f) => {
        const v = f.celdas && f.celdas[cid];
        return v !== undefined && v !== null && (typeof v === "string" ? v !== "" : true);
      }).length;
    }

    quitarColumna(sid, bid, cid) {
      return this.cambiar(() => {
        const { t, i } = this.columnaDe(sid, bid, cid);
        if (t.columnas.length === 1) throw new Error("Una tabla necesita al menos una columna.");
        t.columnas.splice(i, 1);
        t.filas.forEach((f) => { if (f.celdas) delete f.celdas[cid]; });
        this.repartirAnchos(t.columnas);
      });
    }

    moverColumna(sid, bid, cid, dir) {
      return this.cambiar(() => {
        const { t, i } = this.columnaDe(sid, bid, cid);
        const j = i + dir;
        if (j < 0 || j >= t.columnas.length) throw new Error("La columna ya está en ese extremo.");
        const c = t.columnas[i];
        t.columnas[i] = t.columnas[j];
        t.columnas[j] = c;
      });
    }

    /* campo: "titulo", "tipo" o "ancho_mm" (el ancho no reparte: la suma se avisa y se ajusta aparte) */
    propiedadColumna(sid, bid, cid, campo, valor) {
      return this.cambiar(() => {
        const { c } = this.columnaDe(sid, bid, cid);
        if (campo === "ancho_mm") {
          const n = Number(valor);
          if (!(n > 0)) throw new Error("El ancho debe ser mayor que 0 mm.");
          c.ancho_mm = n;
        } else if (campo === "tipo") {
          if (!["texto", "identificador", "estado"].includes(valor)) throw new Error("Tipo de columna no válido.");
          c.tipo = valor;
        } else {
          c.titulo = valor;
        }
      });
    }

    ajustarAnchos(sid, bid) {
      return this.cambiar(() => this.repartirAnchos(this.tablaDe(sid, bid).columnas));
    }

    /* ---- filas ---- */
    filaDe(sid, bid, fid) {
      const t = this.tablaDe(sid, bid);
      const i = t.filas.findIndex((f) => f.id === fid);
      if (i < 0) throw new Error("No se encontró la fila.");
      return { t: t, i: i, f: t.filas[i] };
    }

    /* indice null: segun la tabla (de registro con filas nuevas arriba: al principio; si no, al final) */
    agregarFila(sid, bid, indice) {
      let nuevoId = null;
      this.cambiar(() => {
        const t = this.tablaDe(sid, bid);
        nuevoId = this.siguienteId("f", t.filas);
        let i = indice;
        if (i === null || i === undefined) i = (t.clase === "registro" && t.nuevas_filas === "arriba") ? 0 : t.filas.length;
        t.filas.splice(i, 0, { id: nuevoId, celdas: {} });
      });
      return nuevoId;
    }

    quitarFila(sid, bid, fid) {
      return this.cambiar(() => { const { t, i } = this.filaDe(sid, bid, fid); t.filas.splice(i, 1); });
    }

    moverFila(sid, bid, fid, dir) {
      return this.cambiar(() => {
        const { t, i } = this.filaDe(sid, bid, fid);
        const j = i + dir;
        if (j < 0 || j >= t.filas.length) throw new Error("La fila ya está en ese extremo.");
        const f = t.filas[i];
        t.filas[i] = t.filas[j];
        t.filas[j] = f;
      });
    }

    /* ---- celdas ---- */
    valorCelda(sid, bid, fid, cid) {
      const { f } = this.filaDe(sid, bid, fid);
      const v = f.celdas ? f.celdas[cid] : undefined;
      if (v && typeof v === "object") return { texto: v.texto || "", lineas: (v.lineas || []).slice(), color: v.color || "", estilo: v.estilo || "" };
      return { texto: v === undefined || v === null ? "" : String(v), lineas: [], color: "", estilo: "" };
    }

    /* Guarda una celda: texto simple si no tiene nada mas; objeto si lleva lineas, color o estilo. */
    guardarCelda(f, cid, v) {
      if (!f.celdas) f.celdas = {};
      const extra = v.lineas.length || v.color || v.estilo;
      if (!extra) { f.celdas[cid] = v.texto; return; }
      const o = { texto: v.texto };
      if (v.lineas.length) o.lineas = v.lineas;
      if (v.color) o.color = v.color;
      if (v.estilo) o.estilo = v.estilo;
      f.celdas[cid] = o;
    }

    celdaCambiar(sid, bid, fid, cid, aplicar) {
      return this.cambiar(() => {
        const { f } = this.filaDe(sid, bid, fid);
        this.columnaDe(sid, bid, cid);
        const v = this.valorCelda(sid, bid, fid, cid);
        aplicar(v);
        this.guardarCelda(f, cid, v);
      });
    }

    celdaTexto(sid, bid, fid, cid, texto) { return this.celdaCambiar(sid, bid, fid, cid, (v) => { v.texto = texto; }); }

    /* campo: "color" (ninguno, amarillo, gris o "" para automatico) o "estilo" (texto, identificador o "") */
    celdaPropiedad(sid, bid, fid, cid, campo, valor) {
      if (campo === "color" && !["", "ninguno", "amarillo", "gris"].includes(valor)) throw new Error("Color no válido.");
      if (campo === "estilo" && !["", "texto", "identificador"].includes(valor)) throw new Error("Estilo no válido.");
      return this.celdaCambiar(sid, bid, fid, cid, (v) => { v[campo] = valor; });
    }

    celdaLineas(sid, bid, fid, cid, lineas) {
      return this.celdaCambiar(sid, bid, fid, cid, (v) => { v.lineas = lineas.filter((x) => x !== ""); });
    }
  }

  const api = { Modelo: Modelo, slug: slug, MAX_NIVEL: MAX_NIVEL, TEXTOS_NUEVOS: TEXTOS_NUEVOS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (raiz.Folium = raiz.Folium || {}).Modelo = Modelo, raiz.Folium.slug = slug;
})(typeof window !== "undefined" ? window : globalThis);
