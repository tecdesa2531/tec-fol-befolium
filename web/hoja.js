/* Puente con las hojas A4 (iframe): pintar el modelo, marcar la seleccion, editar titulos
   en la hoja y recibir lo que se arrastra encima. */
(function (F) {
  "use strict";

  let marcoListo = null;
  let secuencia = 0;
  let cola = Promise.resolve();

  const iframe = () => document.getElementById("hoja");
  const ventana = () => iframe().contentWindow;
  const documento = () => iframe().contentDocument;

  function escapar(ref) { return ref.replace(/["\\]/g, "\\$&"); }
  function elementoDe(ref) { return documento().querySelector('[data-ref="' + escapar(ref) + '"]'); }

  /* ---------- carga del marco ---------- */
  function asegurarMarco() {
    if (marcoListo) return marcoListo;
    marcoListo = new Promise((resolver) => {
      iframe().addEventListener("load", () => { instalar(); resolver(); }, { once: true });
      iframe().src = "/hoja";
    });
    return marcoListo;
  }

  function instalar() {
    const d = documento();
    d.addEventListener("click", (ev) => {
      if (ev.target.closest("a")) ev.preventDefault();
      const t = ev.target.closest("[data-ref]");
      F.Editor.alHacerClic(t ? t.dataset.ref : null);
    });
    d.addEventListener("dblclick", (ev) => {
      const t = ev.target.closest("[data-ref]");
      if (t) F.Editor.alDobleClic(t.dataset.ref);
    });
    d.addEventListener("keydown", (ev) => F.Editor.alTeclear(ev));
    d.addEventListener("dragover", (ev) => {
      const tipo = F.Editor.tipoArrastrado(ev.dataTransfer);
      if (!tipo) return;
      ev.preventDefault();
      mostrarLinea(destinoSoltar(ev));
    });
    d.addEventListener("dragleave", (ev) => { if (!ev.relatedTarget) ocultarLinea(); });
    d.addEventListener("drop", (ev) => {
      const tipo = F.Editor.tipoArrastrado(ev.dataTransfer);
      if (!tipo) return;
      ev.preventDefault();
      const destino = destinoSoltar(ev);
      ocultarLinea();
      F.Editor.alSoltar(tipo, ev.dataTransfer, destino);
    });
  }

  /* ---------- pintar ---------- */
  async function render(modelo) {
    const numero = ++secuencia;
    cola = cola.then(async () => {
      if (numero !== secuencia) return;            // llego un cambio mas nuevo: este se omite
      await asegurarMarco();
      const r = await F.api("/api/render/" + modelo.nombre, modelo.doc);
      if (numero !== secuencia) return;
      const w = ventana();
      const y = w.scrollY;
      await w.FoliumPaginar(r.src, r.cfg);
      w.scrollTo(0, y);
      marcarSeleccion(F.Editor.seleccion, false);
    });
    return cola;
  }

  /* ---------- seleccion ---------- */
  function marcarSeleccion(sel, desplazar) {
    if (!marcoListo) return;
    const d = documento();
    d.querySelectorAll(".f-sel").forEach((e) => e.classList.remove("f-sel"));
    if (!sel || sel.tipo !== "seccion") return;
    const e = elementoDe("s:" + sel.id);
    if (!e) return;
    e.classList.add("f-sel");
    if (desplazar) e.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /* ---------- edicion del titulo en la hoja ---------- */
  function editarTitulo(id, textoCrudo) {
    const h = elementoDe("s:" + id);
    if (!h) return;
    const d = documento();
    h.textContent = textoCrudo;                       // se edita el texto con su sintaxis, sin numero
    h.contentEditable = "plaintext-only";
    h.classList.add("f-editando");
    h.focus();
    const rango = d.createRange();
    rango.selectNodeContents(h);
    const sel = ventana().getSelection();
    sel.removeAllRanges();
    sel.addRange(rango);
    let terminado = false;
    const terminar = (confirmar) => {
      if (terminado) return;
      terminado = true;
      const texto = h.textContent.replace(/\s+/g, " ").trim();
      h.contentEditable = "false";
      h.classList.remove("f-editando");
      F.Editor.titulo(id, confirmar ? texto : null);
    };
    h.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); terminar(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); terminar(false); }
      ev.stopPropagation();
    });
    h.addEventListener("blur", () => terminar(true));
  }

  /* ---------- soltar encima de la hoja ----------
     El nuevo elemento entra antes del primer titulo que queda debajo del cursor;
     si no hay ninguno, al final del documento. */
  function destinoSoltar(ev) {
    const d = documento();
    const y = ev.clientY;
    const titulos = Array.from(d.querySelectorAll('[data-ref^="s:"]'));
    for (const h of titulos) {
      const r = h.getBoundingClientRect();
      if (r.top + r.height / 2 >= y) return { zona: "antes", ref: h.dataset.ref.slice(2), elemento: h };
    }
    return { zona: "fin", ref: null, elemento: null };
  }

  function mostrarLinea(destino) {
    const d = documento();
    let linea = d.querySelector(".f-linea");
    if (!linea) { linea = d.createElement("div"); linea.className = "f-linea"; d.body.appendChild(linea); }
    let arriba, izq, ancho;
    if (destino.elemento) {
      const r = destino.elemento.getBoundingClientRect();
      const c = destino.elemento.closest(".content").getBoundingClientRect();
      arriba = r.top - 5; izq = c.left; ancho = c.width;
    } else {
      const contenidos = d.querySelectorAll(".page .content");
      const ultimo = contenidos[contenidos.length - 1];
      const r = ultimo.getBoundingClientRect();
      const hijos = ultimo.children;
      const fin = hijos.length ? hijos[hijos.length - 1].getBoundingClientRect().bottom : r.top;
      arriba = fin + 4; izq = r.left; ancho = r.width;
    }
    const w = ventana();
    linea.style.top = (arriba + w.scrollY) + "px";
    linea.style.left = (izq + w.scrollX) + "px";
    linea.style.width = ancho + "px";
  }

  function ocultarLinea() {
    if (!marcoListo) return;
    const l = documento().querySelector(".f-linea");
    if (l) l.remove();
  }

  F.Hoja = {
    asegurarMarco: asegurarMarco,
    render: render,
    marcarSeleccion: marcarSeleccion,
    editarTitulo: editarTitulo,
    ocultarLinea: ocultarLinea,
    enfocar: () => { if (marcoListo) ventana().focus(); },
  };
})(window.Folium = window.Folium || {});
