/* Tablas: edicion de celdas y encabezados en la hoja, y paneles de propiedades de la
   tabla, la columna y la celda. */
(function (F) {
  "use strict";

  const el = F.el;
  const T = F.Tablas = {};
  const E = () => F.Editor;
  const intentar = (fn) => { try { return fn(); } catch (e) { F.avisar(e.message); return null; } };

  const TIPOS_COLUMNA = [["texto", "Texto"], ["identificador", "Identificador (Consolas)"], ["estado", "Estado"]];

  /* ---------- edicion en la hoja ---------- */
  T.editarCelda = function (sid, bid, fid, cid) {
    const m = E().modelo();
    E().seleccionar({ tipo: "celda", sid: sid, bid: bid, fid: fid, cid: cid });
    F.Hoja.editarCelda(sid, bid, fid, cid, m.valorCelda(sid, bid, fid, cid).texto);
  };

  T.editarEncabezado = function (sid, bid, cid) {
    const m = E().modelo();
    E().seleccionar({ tipo: "columna", sid: sid, bid: bid, cid: cid });
    F.Hoja.editarEncabezado(sid, bid, cid, m.columnaDe(sid, bid, cid).c.titulo);
  };

  /* Celda siguiente (dir 1) o anterior (dir -1), de izquierda a derecha y de arriba abajo.
     Al pasar de la ultima celda se agrega una fila, segun el orden de la tabla. */
  function siguienteCelda(m, sid, bid, fid, cid, dir) {
    const t = m.tablaDe(sid, bid);
    let i = t.filas.findIndex((f) => f.id === fid);
    let j = t.columnas.findIndex((c) => c.id === cid) + dir;
    if (j >= t.columnas.length) { j = 0; i++; }
    else if (j < 0) { j = t.columnas.length - 1; i--; }
    if (i < 0) return null;
    if (i >= t.filas.length) {
      const nueva = intentar(() => m.agregarFila(sid, bid, null));
      return nueva ? [sid, bid, nueva, t.columnas[0].id] : null;
    }
    return [sid, bid, t.filas[i].id, t.columnas[j].id];
  }

  T.terminarCelda = function (sid, bid, fid, cid, texto, tecla) {
    const m = E().modelo();
    const cambio = texto !== null && !!intentar(() => m.celdaTexto(sid, bid, fid, cid, texto));
    if (tecla) {
      const sig = siguienteCelda(m, sid, bid, fid, cid, tecla === "adelante" ? 1 : -1);
      if (sig) E().pendienteEditar = { celda: sig };
    }
    if (!cambio) F.Hoja.render(m).then(() => E().procesarPendiente(m));     // sin cambios no se repinta solo
  };

  T.terminarEncabezado = function (sid, bid, cid, texto, tecla) {
    const m = E().modelo();
    const cambio = texto !== null && texto !== "" && !!intentar(() => m.propiedadColumna(sid, bid, cid, "titulo", texto));
    if (tecla) {
      const t = m.tablaDe(sid, bid);
      const j = t.columnas.findIndex((c) => c.id === cid) + (tecla === "adelante" ? 1 : -1);
      if (j >= 0 && j < t.columnas.length) E().pendienteEditar = { columna: [sid, bid, t.columnas[j].id] };
      else if (j >= t.columnas.length && t.filas.length) E().pendienteEditar = { celda: [sid, bid, t.filas[0].id, t.columnas[0].id] };
    }
    if (!cambio) F.Hoja.render(m).then(() => E().procesarPendiente(m));
  };

  T.vaciarCelda = function (s) {
    intentar(() => E().modelo().celdaTexto(s.sid, s.bid, s.fid, s.cid, ""));
  };

  /* ---------- operaciones con confirmacion ---------- */
  T.quitarFila = async function (sid, bid, fid) {
    const m = E().modelo();
    const t = m.tablaDe(sid, bid);
    if (t.clase === "registro") {
      const ok = await F.confirmar("Quitar una fila del registro",
        ["Esta tabla es de registro: sus filas son un historial. ¿Seguro que quieres quitar esta fila?",
         "Puedes deshacerlo con Ctrl+Z."], "Quitar fila");
      if (!ok) return;
    }
    if (intentar(() => m.quitarFila(sid, bid, fid))) E().seleccionar({ tipo: "bloque", sid: sid, bid: bid });
  };

  T.quitarColumna = async function (sid, bid, cid) {
    const m = E().modelo();
    const n = intentar(() => m.contenidoColumna(sid, bid, cid));
    if (n === null) return;
    if (n > 0) {
      const ok = await F.confirmar("Quitar la columna",
        ["Se borrarán " + F.cantidad(n, "celda con contenido", "celdas con contenido") + " de esta columna.",
         "Puedes deshacerlo con Ctrl+Z."], "Quitar columna");
      if (!ok) return;
    }
    if (intentar(() => m.quitarColumna(sid, bid, cid))) E().seleccionar({ tipo: "bloque", sid: sid, bid: bid });
  };

  /* ---------- piezas de los paneles ---------- */
  const campo = (etiqueta, nodo) => F.Propiedades.campo(etiqueta, nodo);

  function selector(opciones, actual, alCambiar) {
    const s = el("select");
    opciones.forEach(([valor, texto]) => {
      const o = el("option", { value: valor, texto: texto });
      if (valor === actual) o.selected = true;
      s.appendChild(o);
    });
    s.addEventListener("change", () => alCambiar(s.value));
    return s;
  }

  function boton(texto, alClic, clase, deshabilitado, titulo) {
    const b = el("button", { type: "button", texto: texto });
    if (clase) b.className = clase;
    if (deshabilitado) { b.disabled = true; if (titulo) b.title = titulo; }
    b.addEventListener("click", alClic);
    return b;
  }

  function entradaTexto(valor, alConfirmar, tipo) {
    const i = el("input", { type: tipo || "text" });
    i.value = valor;
    i.addEventListener("change", () => alConfirmar(i.value));
    i.addEventListener("keydown", (ev) => ev.stopPropagation());
    return i;
  }

  const fila = (...botones) => el("div", { class: "fila-botones" }, botones);

  /* ---------- panel de la tabla ---------- */
  T.pintarTabla = function (cont, modelo, sel) {
    const { sid, bid } = sel;
    const t = modelo.tablaDe(sid, bid);

    cont.appendChild(campo("Tipo de tabla", selector(
      [["estado", "De estado (solo lo vigente)"], ["registro", "De registro (acumula filas)"]], t.clase,
      (v) => E().conSeleccion(() => modelo.tablaClase(sid, bid, v)))));
    if (t.clase === "registro") {
      cont.appendChild(campo("Filas nuevas", selector(
        [["abajo", "Abajo (la más reciente al final)"], ["arriba", "Arriba (la más reciente primero)"]], t.nuevas_filas || "abajo",
        (v) => E().conSeleccion(() => modelo.tablaNuevasFilas(sid, bid, v)))));
    }

    cont.appendChild(el("h3", { class: "subtitulo", texto: "Columnas" }));
    t.columnas.forEach((c, i) => {
      const tarjeta = el("div", { class: "tarjeta" });
      tarjeta.appendChild(entradaTexto(c.titulo, (v) => { if (v.trim()) E().conSeleccion(() => modelo.propiedadColumna(sid, bid, c.id, "titulo", v.trim())); }));
      const ancho = entradaTexto(String(c.ancho_mm), (v) => E().conSeleccion(() => modelo.propiedadColumna(sid, bid, c.id, "ancho_mm", v)), "number");
      ancho.step = "0.5"; ancho.min = "1";
      ancho.title = "Ancho en mm";
      tarjeta.appendChild(el("div", { class: "fila-columna" }, [
        selector(TIPOS_COLUMNA, c.tipo, (v) => E().conSeleccion(() => modelo.propiedadColumna(sid, bid, c.id, "tipo", v))),
        ancho, el("span", { class: "unidad", texto: "mm" })]));
      tarjeta.appendChild(fila(
        boton("←", () => E().conSeleccion(() => modelo.moverColumna(sid, bid, c.id, -1)), "", i === 0, "Mover a la izquierda"),
        boton("→", () => E().conSeleccion(() => modelo.moverColumna(sid, bid, c.id, 1)), "", i === t.columnas.length - 1, "Mover a la derecha"),
        boton("Quitar", () => T.quitarColumna(sid, bid, c.id), "peligro", t.columnas.length === 1, "Una tabla necesita al menos una columna")));
      cont.appendChild(tarjeta);
    });

    const suma = modelo.sumaAnchos(sid, bid);
    const bien = Math.abs(suma - 150) < 0.01;
    cont.appendChild(el("p", { class: "suma " + (bien ? "bien" : "mal"),
      texto: "Suma de anchos: " + (Math.round(suma * 100) / 100) + " de 150 mm" + (bien ? " ✓" : " (debe sumar 150)") }));
    cont.appendChild(fila(
      boton("+ Columna", () => E().conSeleccion(() => modelo.agregarColumna(sid, bid, null))),
      boton("Ajustar a 150 mm", () => E().conSeleccion(() => modelo.ajustarAnchos(sid, bid)), "", bien),
      boton("+ Fila", () => E().conSeleccion(() => modelo.agregarFila(sid, bid, null)))));
    cont.appendChild(el("p", { class: "ayuda", texto: "Haz clic en una celda o en un encabezado de la hoja para editarlo. Tab pasa a la celda siguiente." }));
    cont.appendChild(el("div", { class: "fila-botones separada" }, [
      boton("Duplicar tabla", () => E().duplicarBloque(sid, bid)),
      boton("Quitar tabla", () => E().quitarBloque(sid, bid), "peligro")]));
  };

  /* ---------- panel de una columna ---------- */
  T.pintarColumna = function (cont, modelo, sel) {
    const { sid, bid, cid } = sel;
    const { t, i, c } = modelo.columnaDe(sid, bid, cid);
    cont.appendChild(campo("Título de la columna", entradaTexto(c.titulo, (v) => { if (v.trim()) E().conSeleccion(() => modelo.propiedadColumna(sid, bid, cid, "titulo", v.trim())); })));
    cont.appendChild(campo("Tipo de columna", selector(TIPOS_COLUMNA, c.tipo,
      (v) => E().conSeleccion(() => modelo.propiedadColumna(sid, bid, cid, "tipo", v)))));
    const ancho = entradaTexto(String(c.ancho_mm), (v) => E().conSeleccion(() => modelo.propiedadColumna(sid, bid, cid, "ancho_mm", v)), "number");
    ancho.step = "0.5"; ancho.min = "1";
    cont.appendChild(campo("Ancho (mm)", ancho));
    const suma = modelo.sumaAnchos(sid, bid);
    const bien = Math.abs(suma - 150) < 0.01;
    cont.appendChild(el("p", { class: "suma " + (bien ? "bien" : "mal"),
      texto: "Suma de anchos de la tabla: " + (Math.round(suma * 100) / 100) + " de 150 mm" + (bien ? " ✓" : "") }));
    cont.appendChild(fila(
      boton("Ajustar a 150 mm", () => E().conSeleccion(() => modelo.ajustarAnchos(sid, bid)), "", bien)));
    cont.appendChild(el("div", { class: "fila-botones separada" }, [
      boton("←", () => E().conSeleccion(() => modelo.moverColumna(sid, bid, cid, -1)), "", i === 0, "Mover a la izquierda"),
      boton("→", () => E().conSeleccion(() => modelo.moverColumna(sid, bid, cid, 1)), "", i === t.columnas.length - 1, "Mover a la derecha"),
      boton("Insertar a la izquierda", () => E().conSeleccion(() => modelo.agregarColumna(sid, bid, i))),
      boton("Insertar a la derecha", () => E().conSeleccion(() => modelo.agregarColumna(sid, bid, i + 1)))]));
    cont.appendChild(el("div", { class: "fila-botones separada" }, [
      boton("Seleccionar la tabla", () => E().seleccionar({ tipo: "bloque", sid: sid, bid: bid })),
      boton("Quitar columna", () => T.quitarColumna(sid, bid, cid), "peligro", t.columnas.length === 1, "Una tabla necesita al menos una columna")]));
  };

  /* ---------- panel de una celda ---------- */
  T.pintarCelda = function (cont, modelo, sel) {
    const { sid, bid, fid, cid } = sel;
    const t = modelo.tablaDe(sid, bid);
    const { i: filaIdx } = modelo.filaDe(sid, bid, fid);
    const { c: col } = modelo.columnaDe(sid, bid, cid);
    const v = modelo.valorCelda(sid, bid, fid, cid);
    const ancla = (fn) => E().conSeleccion(fn);

    cont.appendChild(el("p", { class: "ayuda", texto: "Columna «" + col.titulo + "» · fila " + (filaIdx + 1) + " de " + t.filas.length }));

    const texto = el("textarea", { rows: "4" });
    texto.value = v.texto;
    texto.addEventListener("change", () => ancla(() => modelo.celdaTexto(sid, bid, fid, cid, texto.value.replace(/^\n+|\n+$/g, ""))));
    texto.addEventListener("keydown", (ev) => ev.stopPropagation());
    cont.appendChild(campo("Texto (cada Enter es una línea nueva)", texto));

    const TEXTO_TIPO = { texto: "Texto", identificador: "Identificador (Consolas)", estado: "Estado" };
    cont.appendChild(campo("Tipo de la celda", selector(
      [["", "Igual que la columna (" + TEXTO_TIPO[col.tipo] + ")"], ["texto", "Texto"], ["identificador", "Identificador (Consolas)"], ["estado", "Estado"]],
      v.tipo, (x) => ancla(() => modelo.celdaPropiedad(sid, bid, fid, cid, "tipo", x)))));

    const esEstado = (v.tipo || col.tipo) === "estado";
    if (esEstado) {
      const primera = v.texto.split("\n")[0];
      const estados = (modelo.doc.estados || []).map((e) => [e.texto, e.texto + " (" + e.color + ")"]);
      const enLista = estados.some(([x]) => x === primera);
      const opciones = [["", "— elegir un estado —"]].concat(estados);
      cont.appendChild(campo("Estado (primera línea)", selector(opciones, enLista ? primera : "",
        (x) => { if (x) ancla(() => modelo.celdaPrimeraLinea(sid, bid, fid, cid, x)); })));
      if (primera && !enLista) cont.appendChild(el("p", { class: "ayuda", texto: "La primera línea no está en la lista de estados (puede ser un caso especial, como «(no estable)»)." }));
    }

    cont.appendChild(campo("Color de la celda", selector(
      [["", esEstado ? "Automático (según el estado)" : "Sin color"], ["ninguno", "Sin color (fijo)"], ["amarillo", "Amarillo (requiere atención)"], ["gris", "Gris (no existe o no aplica)"]],
      v.color, (x) => ancla(() => modelo.celdaPropiedad(sid, bid, fid, cid, "color", x)))));

    cont.appendChild(el("h3", { class: "subtitulo", texto: "Fila" }));
    cont.appendChild(fila(
      boton("Subir", () => ancla(() => modelo.moverFila(sid, bid, fid, -1)), "", filaIdx === 0),
      boton("Bajar", () => ancla(() => modelo.moverFila(sid, bid, fid, 1)), "", filaIdx === t.filas.length - 1),
      boton("Insertar arriba", () => ancla(() => modelo.agregarFila(sid, bid, filaIdx))),
      boton("Insertar abajo", () => ancla(() => modelo.agregarFila(sid, bid, filaIdx + 1)))));
    cont.appendChild(el("div", { class: "fila-botones separada" }, [
      boton("Seleccionar columna", () => E().seleccionar({ tipo: "columna", sid: sid, bid: bid, cid: cid })),
      boton("Seleccionar tabla", () => E().seleccionar({ tipo: "bloque", sid: sid, bid: bid })),
      boton("Quitar fila", () => T.quitarFila(sid, bid, fid), "peligro")]));
  };
})(window.Folium = window.Folium || {});
