/* Modelo de un documento: cambios, historial (deshacer y rehacer) y reglas del arbol de
   secciones. No toca la pantalla ni el servidor. */
(function (raiz) {
  "use strict";

  const MAX_NIVEL = 3;
  const MAX_HISTORIAL = 200;

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
      this.provisionales = new Set();   // secciones nuevas cuyo titulo aun no se confirma
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
      this.provisionales.add(nuevoId);
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

    /* Confirma el titulo. En una seccion nueva, la primera vez se genera su identificador
       estable a partir del titulo; despues ya no cambia. Devuelve el identificador. */
    confirmarTitulo(id, titulo) {
      let idFinal = id;
      const provisional = this.provisionales.has(id);
      this.cambiar(() => {
        const r = this.buscar(id);
        r.sec.titulo = titulo;
        if (provisional) {
          idFinal = this.idUnico(slug(titulo), id);
          r.sec.id = idFinal;
        }
      });
      this.provisionales.delete(id);
      return idFinal;
    }

    quitarSeccion(id) {
      return this.cambiar(() => {
        const r = this.buscar(id);
        const ids = this.idsDe(r.sec);
        r.lista.splice(r.indice, 1);
        const retirados = new Set(this.doc.ids_retirados || []);
        ids.forEach((i) => { if (!this.provisionales.has(i)) retirados.add(i); });
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
  }

  const api = { Modelo: Modelo, slug: slug, MAX_NIVEL: MAX_NIVEL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (raiz.Folium = raiz.Folium || {}).Modelo = Modelo, raiz.Folium.slug = slug;
})(typeof window !== "undefined" ? window : globalThis);
