/* Panel derecho: propiedades de lo seleccionado. */
(function (F) {
  "use strict";

  const el = F.el;

  function encabezado(texto) { return el("h3", { class: "subtitulo primero", texto: texto }); }

  function campo(etiqueta, contenido) {
    return el("div", { class: "campo" }, [el("label", { texto: etiqueta }), contenido]);
  }

  function pintar() {
    const cont = document.getElementById("props");
    cont.textContent = "";
    const modelo = F.Editor.modelo();
    const sel = F.Editor.seleccion;
    pintarHistorial();
    if (!modelo) return;
    if (sel && sel.tipo === "bloque" && modelo.bloqueDe(sel.sid, sel.bid)) { pintarBloque(cont, modelo, sel); return; }
    if (sel && sel.tipo === "celda") { cont.appendChild(encabezado("Celda")); F.Tablas.pintarCelda(cont, modelo, sel); return; }
    if (sel && sel.tipo === "columna") { cont.appendChild(encabezado("Columna")); F.Tablas.pintarColumna(cont, modelo, sel); return; }
    if (!sel || sel.tipo !== "seccion" || !modelo.buscar(sel.id)) {
      cont.appendChild(el("p", { class: "ayuda", texto: "Selecciona una sección o un bloque, en la estructura o en la hoja, para ver sus propiedades." }));
      return;
    }
    const r = modelo.buscar(sel.id);
    const s = r.sec;

    const titulo = el("input", { type: "text" });
    titulo.value = s.titulo;
    const confirmar = () => { const t = titulo.value.replace(/\s+/g, " ").trim(); if (t && t !== s.titulo) F.Editor.titulo(s.id, t); else titulo.value = s.titulo; };
    titulo.addEventListener("change", confirmar);
    titulo.addEventListener("keydown", (ev) => { if (ev.key === "Enter") confirmar(); ev.stopPropagation(); });
    cont.appendChild(campo("Título", titulo));

    cont.appendChild(campo("Identificador", el("code", { texto: s.id })));
    cont.appendChild(el("p", { class: "ayuda", texto: modelo.esFijo(s.id)
      ? "El identificador ya está en una versión guardada y no cambia aunque cambies el título."
      : "Se fijará al guardar la primera versión; hasta entonces cambia con el título." }));

    const botonNivel = (texto, dir) => {
      const motivo = modelo.motivoNoNivel(s.id, dir);
      const b = el("button", { type: "button", texto: texto });
      b.disabled = !!motivo;
      if (motivo) b.title = motivo;
      b.addEventListener("click", () => F.Editor.cambiarNivel(s.id, dir));
      return b;
    };
    cont.appendChild(campo("Nivel " + r.nivel, el("div", { class: "fila-botones" }, [
      botonNivel("Subir de nivel", "subir"), botonNivel("Bajar de nivel", "bajar")])));

    const casilla = (texto, campoNombre, habilitada, motivo) => {
      const c = el("input", { type: "checkbox" });
      c.checked = !!s[campoNombre];
      c.disabled = !habilitada;
      c.addEventListener("change", () => F.Editor.marcarSeccion(s.id, campoNombre, c.checked));
      const l = el("label", { class: "casilla" }, [c, " " + texto]);
      if (!habilitada) l.title = motivo;
      return l;
    };
    cont.appendChild(casilla("Sección opcional en esta aplicación", "opcional", true, ""));
    cont.appendChild(casilla("Anexo (no se numera)", "anexo", r.nivel === 1, "Solo el primer nivel puede ser anexo."));

    const duplicar = el("button", { type: "button", texto: "Duplicar sección" });
    duplicar.addEventListener("click", () => F.Editor.duplicarSeccion(s.id));
    const quitar = el("button", { type: "button", class: "peligro", texto: "Quitar sección" });
    quitar.addEventListener("click", () => F.Editor.quitarSeccion(s.id));
    cont.appendChild(el("div", { class: "fila-botones separada" }, [duplicar, quitar]));
  }

  const NOMBRES_TIPO = { parrafo: "Párrafo", nota: "Nota", nota_destacada: "Nota destacada",
    etiqueta: "Etiqueta", tabla: "Tabla", imagen: "Imagen" };
  const TIPOS_TEXTO = ["parrafo", "nota", "nota_destacada", "etiqueta"];

  function pintarBloque(cont, modelo, sel) {
    const o = modelo.bloqueDe(sel.sid, sel.bid);
    const b = o.bloque;
    const esTexto = TIPOS_TEXTO.includes(b.tipo);

    if (esTexto) {
      const tipo = el("select");
      TIPOS_TEXTO.forEach((t) => {
        const op = el("option", { value: t, texto: NOMBRES_TIPO[t] });
        if (t === b.tipo) op.selected = true;
        tipo.appendChild(op);
      });
      tipo.addEventListener("change", () => F.Editor.tipoBloque(sel.sid, sel.bid, tipo.value));
      cont.appendChild(campo("Tipo de bloque", tipo));

      const texto = el("textarea", { rows: "7" });
      texto.value = b.texto;
      texto.addEventListener("change", () => { if (texto.value.trim()) F.Editor.texto(sel.sid, sel.bid, texto.value.replace(/^\n+|\n+$/g, "")); else texto.value = b.texto; });
      texto.addEventListener("keydown", (ev) => ev.stopPropagation());
      cont.appendChild(campo("Texto", texto));
      cont.appendChild(el("p", { class: "ayuda", texto: "Admite `código`, **negrita** y [texto](url). En una nota destacada, una línea en blanco separa párrafos. También puedes editarlo directamente en la hoja con doble clic." }));
    } else if (b.tipo === "tabla") {
      cont.appendChild(encabezado("Tabla"));
      F.Tablas.pintarTabla(cont, modelo, sel);
      return;
    } else {
      cont.appendChild(campo("Tipo de bloque", el("code", { texto: NOMBRES_TIPO[b.tipo] || b.tipo })));
      cont.appendChild(el("p", { class: "ayuda", texto: "Este tipo de bloque se edita en un paso posterior; por ahora puedes moverlo, duplicarlo o quitarlo." }));
    }

    const c = el("input", { type: "checkbox" });
    const siempre = b.tipo === "etiqueta";
    c.checked = siempre || !!b.con_siguiente;
    c.disabled = siempre;
    c.addEventListener("change", () => F.Editor.conSiguiente(sel.sid, sel.bid, c.checked));
    const l = el("label", { class: "casilla" }, [c, " No separar del bloque siguiente"]);
    if (siempre) l.title = "Una etiqueta siempre va con el bloque que sigue.";
    cont.appendChild(l);

    cont.appendChild(el("p", { class: "ayuda" }, ["Está en la sección «" + o.sec.titulo + "»."]));

    const duplicar = el("button", { type: "button", texto: "Duplicar bloque" });
    duplicar.addEventListener("click", () => F.Editor.duplicarBloque(sel.sid, sel.bid));
    const quitar = el("button", { type: "button", class: "peligro", texto: "Quitar bloque" });
    quitar.addEventListener("click", () => F.Editor.quitarBloque(sel.sid, sel.bid));
    cont.appendChild(el("div", { class: "fila-botones separada" }, [duplicar, quitar]));
  }

  function pintarHistorial() {
    const m = F.Editor.modelo();
    document.getElementById("btn-deshacer").disabled = !m || !m.puedeDeshacer();
    document.getElementById("btn-rehacer").disabled = !m || !m.puedeRehacer();
  }

  F.Propiedades = { pintar: pintar, pintarHistorial: pintarHistorial, campo: campo };
})(window.Folium = window.Folium || {});
