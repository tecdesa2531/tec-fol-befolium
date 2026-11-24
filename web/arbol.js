/* Panel izquierdo: arbol de secciones (se reordena arrastrando) y paleta de bloques. */
(function (F) {
  "use strict";

  const el = F.el;
  const TIPO_NUEVO = "application/x-folium-nuevo";
  const TIPO_SECCION = "application/x-folium-seccion";

  const PALETA = [
    ["seccion", "Sección", true],
    ["parrafo", "Párrafo", false],
    ["nota", "Nota", false],
    ["nota_destacada", "Nota destacada", false],
    ["etiqueta", "Etiqueta", false],
    ["tabla", "Tabla", false],
    ["imagen", "Imagen", false],
  ];

  let menuAbierto = null;

  function cerrarMenu() { if (menuAbierto) { menuAbierto.remove(); menuAbierto = null; } }

  /* ---------- zonas al arrastrar sobre una fila ---------- */
  function zonaDe(ev, fila) {
    const r = fila.getBoundingClientRect();
    const f = (ev.clientY - r.top) / r.height;
    return f < 0.28 ? "antes" : f > 0.72 ? "despues" : "dentro";
  }

  function limpiarMarcas() {
    document.querySelectorAll("#arbol .dz-antes,#arbol .dz-despues,#arbol .dz-dentro,#arbol .dz-no")
      .forEach((e) => e.classList.remove("dz-antes", "dz-despues", "dz-dentro", "dz-no"));
  }

  /* ---------- pintar ---------- */
  function pintar() {
    cerrarMenu();
    const cont = document.getElementById("arbol");
    cont.textContent = "";
    const modelo = F.Editor.modelo();
    if (!modelo) return;
    const num = modelo.numeracion();
    const ul = el("ul");
    modelo.doc.secciones.forEach((s) => ul.appendChild(fila(modelo, s, num, 1)));
    cont.appendChild(ul);
    if (!modelo.doc.secciones.length) cont.appendChild(el("p", { class: "ayuda", texto: "Todavía no hay secciones." }));
  }

  function fila(modelo, sec, num, nivel) {
    const li = el("li");
    const seleccionada = F.Editor.seleccion && F.Editor.seleccion.tipo === "seccion" && F.Editor.seleccion.id === sec.id;
    const f = el("div", { class: "fila nivel" + nivel + (seleccionada ? " sel" : ""), draggable: "true", "data-id": sec.id });
    f.appendChild(el("span", { class: "n", texto: num[sec.id] || "" }));
    f.appendChild(el("span", { class: "t", texto: sec.titulo }));
    const mas = el("button", { type: "button", class: "mas", "aria-label": "Acciones de la sección", texto: "⋯" });
    mas.addEventListener("click", (ev) => { ev.stopPropagation(); abrirMenu(mas, sec.id); });
    f.appendChild(mas);

    f.addEventListener("click", () => F.Editor.seleccionar({ tipo: "seccion", id: sec.id }, true));
    f.addEventListener("dblclick", () => renombrar(f, sec));
    f.addEventListener("dragstart", (ev) => {
      ev.dataTransfer.setData(TIPO_SECCION, sec.id);
      ev.dataTransfer.effectAllowed = "move";
    });
    f.addEventListener("dragover", (ev) => {
      const tipo = F.Editor.tipoArrastrado(ev.dataTransfer);
      if (!tipo) return;
      const zona = zonaDe(ev, f);
      const origen = F.Editor.origenArrastrado;       // id al arrastrar una seccion existente
      const m = F.Editor.modelo();
      const motivo = tipo === "seccion" ? m.motivoNoMover(origen, sec.id, zona) : m.motivoNoAgregar(sec.id, zona);
      limpiarMarcas();
      if (motivo) { f.classList.add("dz-no"); return; }
      ev.preventDefault();
      f.classList.add("dz-" + zona);
    });
    f.addEventListener("dragleave", () => f.classList.remove("dz-antes", "dz-despues", "dz-dentro", "dz-no"));
    f.addEventListener("drop", (ev) => {
      const tipo = F.Editor.tipoArrastrado(ev.dataTransfer);
      if (!tipo) return;
      ev.preventDefault();
      ev.stopPropagation();
      const zona = zonaDe(ev, f);
      limpiarMarcas();
      F.Editor.alSoltar(tipo, ev.dataTransfer, { zona: zona, ref: sec.id });
    });
    li.appendChild(f);

    if (sec.secciones && sec.secciones.length) {
      const sub = el("ul");
      sec.secciones.forEach((c) => sub.appendChild(fila(modelo, c, num, nivel + 1)));
      li.appendChild(sub);
    }
    return li;
  }

  /* ---------- renombrar en el arbol ---------- */
  function renombrar(f, sec) {
    const t = f.querySelector(".t");
    const entrada = el("input", { type: "text", class: "renombrar" });
    entrada.value = sec.titulo;
    t.replaceWith(entrada);
    entrada.focus();
    entrada.select();
    let terminado = false;
    const terminar = (confirmar) => {
      if (terminado) return;
      terminado = true;
      const texto = entrada.value.replace(/\s+/g, " ").trim();
      F.Editor.titulo(sec.id, confirmar ? texto : null);
      if (!confirmar || !texto) pintar();
    };
    entrada.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") terminar(true);
      else if (ev.key === "Escape") terminar(false);
      ev.stopPropagation();
    });
    entrada.addEventListener("blur", () => terminar(true));
    entrada.addEventListener("click", (ev) => ev.stopPropagation());
  }

  /* ---------- menu de cada fila ---------- */
  function abrirMenu(boton, id) {
    cerrarMenu();
    const menu = el("div", { class: "menu-fila", role: "menu" });
    const opciones = [
      ["Renombrar", () => { const f = document.querySelector('#arbol .fila[data-id="' + id + '"]'); renombrar(f, F.Editor.modelo().buscar(id).sec); }],
      ["Duplicar", () => F.Editor.duplicarSeccion(id)],
      ["Quitar", () => F.Editor.quitarSeccion(id)],
    ];
    opciones.forEach(([texto, accion]) => {
      const b = el("button", { type: "button", role: "menuitem", texto: texto });
      b.addEventListener("click", (ev) => { ev.stopPropagation(); cerrarMenu(); accion(); });
      menu.appendChild(b);
    });
    boton.parentElement.appendChild(menu);
    menuAbierto = menu;
  }

  /* ---------- paleta de bloques ---------- */
  function pintarPaleta() {
    const cont = document.getElementById("paleta");
    cont.textContent = "";
    PALETA.forEach(([tipo, texto, activo]) => {
      const e = el("div", { class: "pieza" + (activo ? "" : " pronto"), draggable: activo ? "true" : "false",
                            title: activo ? "Arrástrala a la hoja o a la estructura" : "Disponible en el siguiente paso" });
      e.textContent = texto;
      if (activo) {
        e.addEventListener("dragstart", (ev) => {
          ev.dataTransfer.setData(TIPO_NUEVO, tipo);
          ev.dataTransfer.effectAllowed = "copy";
        });
      }
      cont.appendChild(e);
    });
  }

  /* soltar en el espacio vacio del arbol: al final del primer nivel */
  function instalar() {
    const cont = document.getElementById("arbol");
    cont.addEventListener("dragover", (ev) => {
      if (ev.target !== cont && ev.target.closest(".fila")) return;
      const tipo = F.Editor.tipoArrastrado(ev.dataTransfer);
      if (tipo) { ev.preventDefault(); limpiarMarcas(); }
    });
    cont.addEventListener("drop", (ev) => {
      if (ev.target.closest(".fila")) return;
      const tipo = F.Editor.tipoArrastrado(ev.dataTransfer);
      if (!tipo) return;
      ev.preventDefault();
      F.Editor.alSoltar(tipo, ev.dataTransfer, { zona: "fin", ref: null });
    });
    document.addEventListener("click", cerrarMenu);
    document.addEventListener("dragend", () => { limpiarMarcas(); F.Hoja.ocultarLinea(); F.Editor.origenArrastrado = null; });
    document.addEventListener("dragstart", (ev) => {
      F.Editor.origenArrastrado = ev.dataTransfer.types.includes(TIPO_SECCION) ? ev.target.dataset.id : null;
    });
    pintarPaleta();
  }

  F.Arbol = { pintar: pintar, instalar: instalar, TIPO_NUEVO: TIPO_NUEVO, TIPO_SECCION: TIPO_SECCION };
})(window.Folium = window.Folium || {});
