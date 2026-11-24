/* Panel derecho: propiedades de lo seleccionado. */
(function (F) {
  "use strict";

  const el = F.el;

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
    if (!sel || sel.tipo !== "seccion" || !modelo.buscar(sel.id)) {
      cont.appendChild(el("p", { class: "ayuda", texto: "Selecciona una sección en la estructura o en la hoja para ver sus propiedades." }));
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

  function pintarHistorial() {
    const m = F.Editor.modelo();
    document.getElementById("btn-deshacer").disabled = !m || !m.puedeDeshacer();
    document.getElementById("btn-rehacer").disabled = !m || !m.puedeRehacer();
  }

  F.Propiedades = { pintar: pintar, pintarHistorial: pintarHistorial };
})(window.Folium = window.Folium || {});
