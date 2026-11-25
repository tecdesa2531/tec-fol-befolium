/* Editor: modelos de los documentos, seleccion, autoguardado y atajos de teclado. */
(function (F) {
  "use strict";

  const RETRASO_GUARDADO = 400;
  const TIPOS_TEXTO = ["parrafo", "nota", "nota_destacada", "etiqueta"];

  const E = F.Editor = {
    modelos: {},            // nombre del documento -> Modelo (cada uno con su historial)
    activo: null,
    seleccion: null,        // { tipo: "seccion", id } | { tipo: "bloque", sid, bid } | { tipo: "celda", sid, bid, fid, cid } | { tipo: "columna", sid, bid, cid }
    origenArrastrado: null,
    pendienteEditar: null,  // { seccion } | { bloque: [sid, bid] } | { celda: [sid, bid, fid, cid] } | { columna: [sid, bid, cid] }
  };

  let temporizadores = {};
  let colaGuardado = Promise.resolve();

  E.modelo = () => E.modelos[E.activo] || null;
  E.problemas = () => (F.problemasActivos ? F.problemasActivos() : []);

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
    m.fijos = new Set((await F.api("/api/ids_fijos/" + nombre)).ids);
    m.alCambiar(() => alCambiarModelo(m));
    E.modelos[nombre] = m;
    return m;
  }

  /* Despues de guardar una version, sus secciones pasan a tener identificador fijo. */
  E.actualizarFijos = async function () {
    for (const nombre of Object.keys(E.modelos)) {
      E.modelos[nombre].fijos = new Set((await F.api("/api/ids_fijos/" + nombre)).ids);
    }
    F.Propiedades.pintar();
  };

  E.activar = async function (nombre) {
    await cargar(nombre);
    if (E.activo !== nombre) E.seleccion = null;
    E.activo = nombre;
    F.Arbol.pintar();
    F.Propiedades.pintar();
    await F.Hoja.render(E.modelo());
  };

  /* ---------- cambios: pintar y guardar ---------- */
  function seleccionExiste(m) {
    const s = E.seleccion;
    if (!s) return true;
    if (s.tipo === "seccion") return !!m.buscar(s.id);
    if (s.tipo === "bloque") return !!m.bloqueDe(s.sid, s.bid);
    try {
      if (s.tipo === "celda") { m.valorCelda(s.sid, s.bid, s.fid, s.cid); m.columnaDe(s.sid, s.bid, s.cid); }
      else m.columnaDe(s.sid, s.bid, s.cid);
      return true;
    } catch (err) { return false; }
  }

  async function alCambiarModelo(m) {
    if (m !== E.modelo()) return;
    if (!seleccionExiste(m)) E.seleccion = null;
    F.Arbol.pintar();
    F.Propiedades.pintar();
    programarGuardado(m.nombre);
    try {
      await F.Hoja.render(m);
    } catch (e) {
      F.avisar(e.message);
      return;
    }
    procesarPendiente(m);
  }

  /* Empieza a editar lo que quedo pendiente (un titulo, texto, celda o encabezado nuevo). */
  function procesarPendiente(m) {
    const p = E.pendienteEditar;
    E.pendienteEditar = null;
    if (!p) return;
    try {
      if (p.seccion && m.buscar(p.seccion)) {
        F.Hoja.marcarSeleccion({ tipo: "seccion", id: p.seccion }, true);
        F.Hoja.editarTitulo(p.seccion, m.buscar(p.seccion).sec.titulo);
      } else if (p.bloque && m.bloqueDe(p.bloque[0], p.bloque[1])) {
        F.Hoja.marcarSeleccion({ tipo: "bloque", sid: p.bloque[0], bid: p.bloque[1] }, true);
        F.Hoja.editarBloque(p.bloque[0], p.bloque[1], m.bloqueDe(p.bloque[0], p.bloque[1]).bloque.texto);
      } else if (p.celda) {
        const [sid, bid, fid, cid] = p.celda;
        E.seleccionar({ tipo: "celda", sid: sid, bid: bid, fid: fid, cid: cid }, true);
        F.Hoja.editarCelda(sid, bid, fid, cid, m.valorCelda(sid, bid, fid, cid).texto);
      } else if (p.columna) {
        const [sid, bid, cid] = p.columna;
        E.seleccionar({ tipo: "columna", sid: sid, bid: bid, cid: cid }, true);
        F.Hoja.editarEncabezado(sid, bid, cid, m.columnaDe(sid, bid, cid).c.titulo);
      }
    } catch (err) { /* lo pendiente ya no existe */ }
  }
  E.procesarPendiente = procesarPendiente;

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

  /* Guarda ahora lo que este pendiente (antes de guardar una version o de imprimir). */
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

  /* ref de la hoja: s:<seccion> | b:<seccion>:<bloque> | f, c, h: dentro de una tabla */
  E.alHacerClic = function (ref) {
    if (!ref) { E.seleccionar(null); return; }
    const p = ref.split(":");
    if (p[0] === "s") E.seleccionar({ tipo: "seccion", id: p.slice(1).join(":") });
    else if (p[0] === "c") E.seleccionar({ tipo: "celda", sid: p[1], bid: p[2], fid: p[3], cid: p[4] });
    else if (p[0] === "h") E.seleccionar({ tipo: "columna", sid: p[1], bid: p[2], cid: p[3] });
    else if (p.length >= 3) E.seleccionar({ tipo: "bloque", sid: p[1], bid: p[2] });
  };

  E.alDobleClic = function (ref) {
    const p = ref.split(":");
    if (p[0] === "s") {
      const id = p.slice(1).join(":");
      E.seleccionar({ tipo: "seccion", id: id });
      F.Hoja.editarTitulo(id, E.modelo().buscar(id).sec.titulo);
    } else if (p[0] === "b") {
      E.editarBloque(p[1], p[2]);
    } else if (p[0] === "c") {
      F.Tablas.editarCelda(p[1], p[2], p[3], p[4]);
    } else if (p[0] === "h") {
      F.Tablas.editarEncabezado(p[1], p[2], p[3]);
    }
  };

  E.esTexto = function (sid, bid) {
    const o = E.modelo().bloqueDe(sid, bid);
    return !!o && TIPOS_TEXTO.includes(o.bloque.tipo);
  };

  E.editarBloque = function (sid, bid) {
    if (!E.esTexto(sid, bid)) return;
    E.seleccionar({ tipo: "bloque", sid: sid, bid: bid });
    F.Hoja.editarBloque(sid, bid, E.modelo().bloqueDe(sid, bid).bloque.texto);
  };

  /* ---------- operaciones (con avisos y confirmaciones) ---------- */
  function intentar(fn) {
    try { return fn(); } catch (e) { F.avisar(e.message); return null; }
  }

  /* Titulo confirmado (texto) o cancelado (null). */
  E.titulo = function (id, texto) {
    const m = E.modelo();
    if (texto) {
      const eraSeleccionada = !!(E.seleccion && E.seleccion.tipo === "seccion" && E.seleccion.id === id);
      const nuevoId = intentar(() => m.confirmarTitulo(id, texto));
      if (nuevoId && eraSeleccionada) E.seleccionar({ tipo: "seccion", id: nuevoId });
    } else {
      F.Hoja.render(m);          // se cancela: la hoja vuelve a pintar el titulo guardado
    }
  };

  /* Texto de un bloque confirmado (texto) o cancelado (null). */
  E.texto = function (sid, bid, texto) {
    const m = E.modelo();
    if (texto === null || texto === "") { F.Hoja.render(m); return; }
    if (!intentar(() => m.textoBloque(sid, bid, texto))) F.Hoja.render(m);   // sin cambios: repinta
  };

  E.agregarSeccion = function () {
    const m = E.modelo();
    const s = E.seleccion;
    const ref = s ? (s.tipo === "seccion" ? s.id : s.sid) : null;
    const id = intentar(() => m.agregarSeccion(ref, "despues"));
    if (id) { E.seleccion = { tipo: "seccion", id: id }; E.pendienteEditar = { seccion: id }; F.Arbol.pintar(); F.Propiedades.pintar(); }
  };

  /* Inserta un bloque nuevo (doble clic en la paleta): despues del bloque seleccionado o al
     final de la seccion seleccionada. */
  E.insertar = function (tipo) {
    if (tipo === "seccion") { E.agregarSeccion(); return; }
    const lugar = E.lugarDeInsercion();
    if (!lugar) { F.avisar("Primero agrega una sección."); return; }
    colocarBloque(E.modelo(), lugar.sid, lugar.indice, tipo);
  };

  /* Donde cae un bloque nuevo: despues del seleccionado, al final de la seccion seleccionada o
     al final de la ultima seccion. null si el documento no tiene secciones. */
  E.lugarDeInsercion = function () {
    const m = E.modelo();
    const s = E.seleccion;
    if (s && (s.tipo === "bloque" || s.tipo === "celda" || s.tipo === "columna") && m.bloqueDe(s.sid, s.bid)) {
      return { sid: s.sid, indice: m.bloqueDe(s.sid, s.bid).indice + 1 };
    }
    if (s && s.tipo === "seccion" && m.buscar(s.id)) return { sid: s.id, indice: null };
    if (!m.doc.secciones.length) return null;
    const ultima = (lista) => { const u = lista[lista.length - 1]; return (u.secciones && u.secciones.length) ? ultima(u.secciones) : u; };
    return { sid: ultima(m.doc.secciones).id, indice: null };
  };

  function colocarBloque(m, sid, indice, tipo) {
    const soloSeleccion = tipo === "tabla" || tipo === "imagen";     // sin texto que editar al insertar
    const crear = () => (tipo === "tabla" ? m.agregarTabla(sid, indice) : tipo === "imagen" ? m.agregarImagen(sid, indice) : m.agregarBloque(sid, indice, tipo));
    const bid = intentar(crear);
    if (!bid) return;
    E.seleccion = { tipo: "bloque", sid: sid, bid: bid };
    if (!soloSeleccion) E.pendienteEditar = { bloque: [sid, bid] };
    F.Arbol.pintar();
    F.Propiedades.pintar();
    if (soloSeleccion) F.Hoja.marcarSeleccion(E.seleccion, true);
  }

  E.duplicarSeccion = function (id) {
    const nuevo = intentar(() => E.modelo().duplicarSeccion(id));
    if (nuevo) E.seleccionar({ tipo: "seccion", id: nuevo }, true);
  };

  E.duplicarBloque = function (sid, bid) {
    const nuevo = intentar(() => E.modelo().duplicarBloque(sid, bid));
    if (nuevo) E.seleccionar({ tipo: "bloque", sid: sid, bid: nuevo }, true);
  };

  E.quitarBloque = function (sid, bid) { intentar(() => E.modelo().quitarBloque(sid, bid)); };
  E.tipoBloque = function (sid, bid, tipo) { intentar(() => E.modelo().tipoBloque(sid, bid, tipo)); };
  E.conSiguiente = function (sid, bid, valor) { intentar(() => E.modelo().conSiguiente(sid, bid, valor)); };

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

  /* Aplica un cambio del modelo con aviso de errores; la seleccion se conserva. */
  E.conSeleccion = function (fn) { return intentar(fn); };

  /* Selecciona la tabla si lo seleccionado no es ya parte de ella (sus anchos se ven en el panel). */
  function seleccionarTabla(sid, bid) {
    const s = E.seleccion;
    if (s && s.sid === sid && s.bid === bid && (s.tipo === "bloque" || s.tipo === "columna")) return;
    E.seleccionar({ tipo: "bloque", sid: sid, bid: bid });
  }

  /* Clic en una barra + de la hoja: agrega una fila o una columna segun el orden de la tabla. */
  E.agregarDesdeBarra = function (tipo, sid, bid) {
    const m = E.modelo();
    const hecho = intentar(() => (tipo === "fila" ? m.agregarFila(sid, bid, null) : m.agregarColumna(sid, bid, null)));
    if (hecho) seleccionarTabla(sid, bid);
  };

  /* Fin del arrastre del borde entre columnas: la columna cid pasa a medir ancho mm. */
  E.redimensionar = function (sid, bid, cid, ancho) {
    const m = E.modelo();
    const cambio = intentar(() => m.redimensionarColumna(sid, bid, cid, ancho));
    if (cambio) seleccionarTabla(sid, bid);
    else F.Hoja.render(m);          // sin cambio: la hoja vuelve a los anchos guardados
  };

  /* Clic en un problema de la lista: selecciona el elemento afectado y lo muestra. */
  E.irA = function (ref) {
    const m = E.modelo();
    if (!m || !ref) return;
    try {
      if (ref.tipo === "seccion" && m.buscar(ref.sid)) E.seleccionar({ tipo: "seccion", id: ref.sid }, true);
      else if (ref.tipo === "bloque" && m.bloqueDe(ref.sid, ref.bid)) E.seleccionar({ tipo: "bloque", sid: ref.sid, bid: ref.bid }, true);
      else if (ref.tipo === "celda") { m.valorCelda(ref.sid, ref.bid, ref.fid, ref.cid); m.columnaDe(ref.sid, ref.bid, ref.cid); E.seleccionar({ tipo: "celda", sid: ref.sid, bid: ref.bid, fid: ref.fid, cid: ref.cid }, true); }
      else if (ref.tipo === "columna") { m.columnaDe(ref.sid, ref.bid, ref.cid); E.seleccionar({ tipo: "columna", sid: ref.sid, bid: ref.bid, cid: ref.cid }, true); }
      else if (ref.tipo === "portada" || ref.tipo === "estados" || ref.tipo === "documento") { E.seleccionar(null); F.Documento.resaltar(ref); }
      else F.avisar("Ese elemento ya no existe.");
    } catch (err) { F.avisar("Ese elemento ya no existe."); }
  };

  E.deshacer = function () { const m = E.modelo(); if (m) m.deshacer(); };
  E.rehacer = function () { const m = E.modelo(); if (m) m.rehacer(); };

  /* ---------- arrastrar y soltar ---------- */
  /* Devuelve { clase: "nuevo" | "seccion" | "bloque", tipo } o null si no es de Folium. */
  E.tipoArrastrado = function (dt) {
    if (!dt) return null;
    const tipos = Array.from(dt.types);
    const nuevo = tipos.find((t) => t.startsWith(F.Arbol.PREFIJO_NUEVO));
    if (nuevo) return { clase: "nuevo", tipo: nuevo.slice(F.Arbol.PREFIJO_NUEVO.length) };
    if (tipos.includes(F.Arbol.TIPO_SECCION)) return { clase: "seccion", tipo: "seccion" };
    if (tipos.includes(F.Arbol.TIPO_BLOQUE)) return { clase: "bloque", tipo: "bloque" };
    if (tipos.includes("Files")) return { clase: "archivo", tipo: "archivo" };      // archivos de imagen desde el equipo
    return null;
  };

  E.esBloque = (a) => a.clase === "bloque" || a.clase === "archivo" || (a.clase === "nuevo" && a.tipo !== "seccion");

  /* Archivos soltados en un sitio sin destino exacto (por ejemplo, encima del primer titulo):
     van al lugar de insercion habitual. */
  E.alSoltarSinLugar = function (dt) {
    const lugar = E.lugarDeInsercion();
    if (!lugar) { F.avisar("Primero agrega una sección."); return; }
    F.Imagenes.soltar(Array.from(dt.files), lugar.sid, lugar.indice, null);
  };

  /* destino de secciones: { zona: "antes" | "despues" | "dentro" | "fin", ref }
     destino de bloques:   { bloque: true, sid, indice } o { zona: "dentro", ref } (fila del arbol) */
  E.alSoltar = function (arrastrado, dt, destino) {
    const m = E.modelo();
    if (E.esBloque(arrastrado)) {
      const sid = destino.bloque ? destino.sid : destino.ref;
      const indice = destino.bloque ? destino.indice : null;
      if (!sid) return;
      if (arrastrado.clase === "archivo") { F.Imagenes.soltar(Array.from(dt.files), sid, indice, destino.sobre); return; }
      if (arrastrado.clase === "nuevo") { colocarBloque(m, sid, indice, arrastrado.tipo); return; }
      const [origenSid, origenBid] = dt.getData(F.Arbol.TIPO_BLOQUE).split(":");
      const nuevo = intentar(() => m.moverBloque(origenSid, origenBid, sid, indice));
      if (nuevo) E.seleccionar({ tipo: "bloque", sid: sid, bid: nuevo });
      return;
    }
    const fin = destino.zona === "fin";
    const ref = fin ? null : destino.ref;
    const zona = fin ? "despues" : destino.zona;
    if (arrastrado.clase === "nuevo") {
      const id = intentar(() => m.agregarSeccion(ref, zona));
      if (id) { E.seleccion = { tipo: "seccion", id: id }; E.pendienteEditar = { seccion: id }; F.Arbol.pintar(); F.Propiedades.pintar(); }
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
    const s = E.seleccion;
    if (ctrl && k === "z" && !ev.shiftKey) { ev.preventDefault(); E.deshacer(); }
    else if (ctrl && (k === "y" || (k === "z" && ev.shiftKey))) { ev.preventDefault(); E.rehacer(); }
    else if (k === "escape") E.seleccionar(null);
    else if (k === "enter" && s && s.tipo === "bloque") { ev.preventDefault(); E.editarBloque(s.sid, s.bid); }
    else if (k === "enter" && s && s.tipo === "celda") { ev.preventDefault(); F.Tablas.editarCelda(s.sid, s.bid, s.fid, s.cid); }
    else if (k === "enter" && s && s.tipo === "columna") { ev.preventDefault(); F.Tablas.editarEncabezado(s.sid, s.bid, s.cid); }
    else if ((k === "delete" || k === "supr") && s && s.tipo === "celda") {
      ev.preventDefault();
      F.Tablas.vaciarCelda(s);
    }
    else if (k === "enter" && s && s.tipo === "seccion") {
      ev.preventDefault();
      F.Hoja.editarTitulo(s.id, E.modelo().buscar(s.id).sec.titulo);
    }
    else if ((k === "delete" || k === "supr") && s) {
      ev.preventDefault();
      if (s.tipo === "seccion") E.quitarSeccion(s.id);
      else if (s.tipo === "bloque") E.quitarBloque(s.sid, s.bid);
    }
  };

  /* Ctrl+V con una imagen copiada (por ejemplo, exportada desde draw.io). Si hay una imagen
     seleccionada la reemplaza; si no, se inserta una nueva en el lugar de insercion. */
  E.alPegar = function (ev) {
    const t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!E.modelo() || document.querySelector("dialog[open]")) return;
    const items = Array.from((ev.clipboardData && ev.clipboardData.items) || []);
    const it = items.find((i) => i.kind === "file" && i.type.startsWith("image/"));
    if (!it) return;
    ev.preventDefault();
    const archivo = it.getAsFile();
    if (!archivo || !F.Imagenes.esImagen(archivo)) { F.avisar("Solo se admiten imágenes PNG, JPG o SVG."); return; }
    F.Imagenes.pegar(archivo);
  };

  /* Un archivo soltado fuera de la hoja no debe abrirse en el navegador. */
  ["dragover", "drop"].forEach((nombre) => document.addEventListener(nombre, (ev) => {
    if (ev.dataTransfer && Array.from(ev.dataTransfer.types).includes("Files")) ev.preventDefault();
  }));

  document.addEventListener("paste", (ev) => E.alPegar(ev));
  document.addEventListener("keydown", (ev) => E.alTeclear(ev));
})(window.Folium = window.Folium || {});
