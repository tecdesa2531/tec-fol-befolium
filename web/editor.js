/* Editor: modelos de los documentos, seleccion, autoguardado y atajos de teclado. */
(function (F) {
  "use strict";

  const RETRASO_GUARDADO = 400;

  const E = F.Editor = {
    modelos: {},            // nombre del documento -> Modelo (cada uno con su historial)
    activo: null,
    seleccion: null,        // { tipo: "seccion", id }
    origenArrastrado: null,
    pendienteEditar: null,  // id de la seccion nueva cuyo titulo se edita al terminar de pintar
  };

  let temporizadores = {};
  let colaGuardado = Promise.resolve();

  E.modelo = () => E.modelos[E.activo] || null;

  /* ---------- carga ---------- */
  E.reiniciar = function () {
    E.modelos = {};
    E.activo = null;
    E.seleccion = null;
    Object.values(temporizadores).forEach(clearTimeout);
    temporizadores = {};
  };

  async function cargar(nombre) {
    if (E.modelos[nombre]) return E.modelos[nombre];
    const doc = await F.api("/api/documento/" + nombre);
    const m = new F.Modelo(nombre, doc);
    m.alCambiar(() => alCambiarModelo(m));
    E.modelos[nombre] = m;
    return m;
  }

  E.activar = async function (nombre) {
    await cargar(nombre);
    if (E.activo !== nombre) E.seleccion = null;
    E.activo = nombre;
    F.Arbol.pintar();
    F.Propiedades.pintar();
    await F.Hoja.render(E.modelo());
  };

  /* ---------- cambios: pintar y guardar ---------- */
  async function alCambiarModelo(m) {
    if (m !== E.modelo()) return;
    if (E.seleccion && !m.buscar(E.seleccion.id)) E.seleccion = null;
    F.Arbol.pintar();
    F.Propiedades.pintar();
    programarGuardado(m.nombre);
    try {
      await F.Hoja.render(m);
    } catch (e) {
      F.avisar(e.message);
      return;
    }
    if (E.pendienteEditar && m.buscar(E.pendienteEditar)) {
      const id = E.pendienteEditar;
      E.pendienteEditar = null;
      F.Hoja.marcarSeleccion({ tipo: "seccion", id: id }, true);
      F.Hoja.editarTitulo(id, m.buscar(id).sec.titulo);
    }
  }

  function estadoGuardado(texto, error) {
    const p = document.getElementById("guardado");
    p.textContent = texto;
    p.classList.toggle("error", !!error);
  }

  function programarGuardado(nombre) {
    clearTimeout(temporizadores[nombre]);
    estadoGuardado("Guardando…");
    temporizadores[nombre] = setTimeout(() => guardar(nombre), RETRASO_GUARDADO);
  }

  function guardar(nombre) {
    delete temporizadores[nombre];
    colaGuardado = colaGuardado.then(async () => {
      const m = E.modelos[nombre];
      if (!m) return;
      try {
        const r = await F.api("/api/documento/" + nombre, m.doc);
        F.alGuardar(nombre, r);
        if (!Object.keys(temporizadores).length) estadoGuardado("Guardado ✓");
      } catch (e) {
        estadoGuardado("No se pudo guardar: " + e.message, true);
      }
    });
    return colaGuardado;
  }

  /* Guarda ahora lo que este pendiente (antes de guardar una version). */
  E.guardarYa = async function () {
    Object.keys(temporizadores).forEach((n) => { clearTimeout(temporizadores[n]); guardar(n); });
    await colaGuardado;
  };

  window.addEventListener("beforeunload", () => {
    Object.keys(temporizadores).forEach((n) => {
      const m = E.modelos[n];
      if (m) fetch("/api/documento/" + n, { method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(m.doc) });
    });
  });

  /* ---------- seleccion ---------- */
  E.seleccionar = function (sel, desplazar) {
    E.seleccion = sel;
    F.Arbol.pintar();
    F.Propiedades.pintar();
    F.Hoja.marcarSeleccion(sel, !!desplazar);
  };

  E.alHacerClic = function (ref) {
    if (!ref) { E.seleccionar(null); return; }
    const partes = ref.split(":");
    if (partes[0] === "s") E.seleccionar({ tipo: "seccion", id: partes.slice(1).join(":") });
  };

  E.alDobleClic = function (ref) {
    const partes = ref.split(":");
    if (partes[0] !== "s") return;
    const id = partes.slice(1).join(":");
    E.seleccionar({ tipo: "seccion", id: id });
    F.Hoja.editarTitulo(id, E.modelo().buscar(id).sec.titulo);
  };

  /* ---------- operaciones (con avisos y confirmaciones) ---------- */
  function intentar(fn) {
    try { return fn(); } catch (e) { F.avisar(e.message); return null; }
  }

  /* Titulo confirmado (texto) o cancelado (null). */
  E.titulo = function (id, texto) {
    const m = E.modelo();
    if (texto) {
      const eraSeleccionada = !!(E.seleccion && E.seleccion.id === id);
      const nuevoId = intentar(() => m.confirmarTitulo(id, texto));
      if (nuevoId && eraSeleccionada) E.seleccionar({ tipo: "seccion", id: nuevoId });
    } else {
      F.Hoja.render(m);          // se cancela: la hoja vuelve a pintar el titulo guardado
    }
  };

  E.agregarSeccion = function () {
    const m = E.modelo();
    const sel = E.seleccion;
    const id = sel ? intentar(() => m.agregarSeccion(sel.id, "despues")) : intentar(() => m.agregarSeccion(null, "despues"));
    if (id) { E.seleccion = { tipo: "seccion", id: id }; E.pendienteEditar = id; F.Arbol.pintar(); F.Propiedades.pintar(); }
  };

  E.duplicarSeccion = function (id) {
    const nuevo = intentar(() => E.modelo().duplicarSeccion(id));
    if (nuevo) E.seleccionar({ tipo: "seccion", id: nuevo }, true);
  };

  E.quitarSeccion = async function (id) {
    const m = E.modelo();
    const r = m.buscar(id);
    if (!r) return;
    const c = m.contenidoDe(id);
    if (c.bloques > 0 || c.subsecciones > 0) {
      const partes = [];
      if (c.bloques) partes.push(F.cantidad(c.bloques, "bloque", "bloques"));
      if (c.subsecciones) partes.push(F.cantidad(c.subsecciones, "subsección", "subsecciones"));
      const ok = await F.confirmar("Quitar «" + r.sec.titulo + "»",
        ["Se borrarán " + partes.join(" y ") + ".", "Puedes deshacerlo con Ctrl+Z."], "Quitar");
      if (!ok) return;
    }
    intentar(() => m.quitarSeccion(id));
  };

  E.cambiarNivel = (id, dir) => { intentar(() => E.modelo().cambiarNivel(id, dir)); };
  E.marcarSeccion = (id, campo, valor) => { intentar(() => E.modelo().marcarSeccion(id, campo, valor)); };

  E.deshacer = function () { const m = E.modelo(); if (m) m.deshacer(); };
  E.rehacer = function () { const m = E.modelo(); if (m) m.rehacer(); };

  /* ---------- arrastrar y soltar ---------- */
  E.tipoArrastrado = function (dt) {
    if (!dt) return null;
    const tipos = Array.from(dt.types);
    if (tipos.includes(F.Arbol.TIPO_NUEVO)) return "nuevo";
    if (tipos.includes(F.Arbol.TIPO_SECCION)) return "seccion";
    return null;
  };

  /* destino: { zona: "antes" | "despues" | "dentro" | "fin", ref } */
  E.alSoltar = function (tipo, dt, destino) {
    const m = E.modelo();
    const fin = destino.zona === "fin";
    const ref = fin ? null : destino.ref;
    const zona = fin ? "despues" : destino.zona;
    if (tipo === "nuevo") {
      if (dt.getData(F.Arbol.TIPO_NUEVO) !== "seccion") return;
      const id = intentar(() => m.agregarSeccion(ref, zona));
      if (id) { E.seleccion = { tipo: "seccion", id: id }; E.pendienteEditar = id; F.Arbol.pintar(); F.Propiedades.pintar(); }
    } else {
      const id = dt.getData(F.Arbol.TIPO_SECCION);
      if (intentar(() => m.moverSeccion(id, ref, zona))) E.seleccionar({ tipo: "seccion", id: id }, true);
    }
  };

  /* ---------- teclado ---------- */
  E.alTeclear = function (ev) {
    const t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector("dialog[open]")) return;
    const ctrl = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (ctrl && k === "z" && !ev.shiftKey) { ev.preventDefault(); E.deshacer(); }
    else if (ctrl && (k === "y" || (k === "z" && ev.shiftKey))) { ev.preventDefault(); E.rehacer(); }
    else if (k === "escape") E.seleccionar(null);
    else if ((k === "delete" || k === "supr") && E.seleccion && E.seleccion.tipo === "seccion") {
      ev.preventDefault();
      E.quitarSeccion(E.seleccion.id);
    }
  };

  document.addEventListener("keydown", (ev) => E.alTeclear(ev));
})(window.Folium = window.Folium || {});
