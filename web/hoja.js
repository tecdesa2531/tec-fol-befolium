/* Puente con las hojas A4 (iframe): pintar el modelo, marcar la seleccion, editar textos
   en la hoja, arrastrar bloques y recibir lo que se suelta encima. */
(function (F) {
  "use strict";

  let marcoListo = null;
  let secuencia = 0;
  let cola = Promise.resolve();

  const iframe = () => document.getElementById("hoja");
  const ventana = () => iframe().contentWindow;
  const documento = () => iframe().contentDocument;

  function escapar(ref) { return ref.replace(/["\\]/g, "\\$&"); }
  function elementosDe(ref) { return Array.from(documento().querySelectorAll('[data-ref="' + escapar(ref) + '"]')); }
  function elementoDe(ref) { return elementosDe(ref)[0] || null; }

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
      if (ev.target.closest(".f-asa")) return;
      const t = ev.target.closest("[data-ref]");
      F.Editor.alHacerClic(t ? t.dataset.ref : null);
    });
    d.addEventListener("dblclick", (ev) => {
      const t = ev.target.closest("[data-ref]");
      if (t) F.Editor.alDobleClic(t.dataset.ref);
    });
    d.addEventListener("keydown", (ev) => F.Editor.alTeclear(ev));
    d.addEventListener("dragstart", (ev) => {
      const asa = ev.target.closest && ev.target.closest(".f-asa");
      if (!asa) return;
      ev.dataTransfer.setData(F.Arbol.TIPO_BLOQUE, asa.dataset.bloque);
      ev.dataTransfer.effectAllowed = "move";
    });
    d.addEventListener("dragend", ocultarLinea);
    d.addEventListener("dragover", (ev) => {
      const arrastrado = F.Editor.tipoArrastrado(ev.dataTransfer);
      if (!arrastrado) return;
      const destino = destinoSoltar(ev, arrastrado);
      if (!destino) { ocultarLinea(); return; }
      ev.preventDefault();
      mostrarLinea(destino);
    });
    d.addEventListener("dragleave", (ev) => { if (!ev.relatedTarget) ocultarLinea(); });
    d.addEventListener("drop", (ev) => {
      const arrastrado = F.Editor.tipoArrastrado(ev.dataTransfer);
      if (!arrastrado) return;
      ev.preventDefault();
      const destino = destinoSoltar(ev, arrastrado);
      ocultarLinea();
      if (destino) F.Editor.alSoltar(arrastrado, ev.dataTransfer, destino);
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
  function refDe(sel) {
    if (!sel) return null;
    if (sel.tipo === "seccion") return "s:" + sel.id;
    if (sel.tipo === "bloque") return "b:" + sel.sid + ":" + sel.bid;
    return null;
  }

  function marcarSeleccion(sel, desplazar) {
    if (!marcoListo) return;
    const d = documento();
    d.querySelectorAll(".f-sel").forEach((e) => e.classList.remove("f-sel"));
    d.querySelectorAll(".f-asa").forEach((e) => e.remove());
    const ref = refDe(sel);
    if (!ref) return;
    const elementos = elementosDe(ref);
    if (!elementos.length) return;
    elementos.forEach((e) => e.classList.add("f-sel"));
    if (sel.tipo === "bloque") ponerAsa(elementos[0], sel);
    if (desplazar) elementos[0].scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /* asa para arrastrar el bloque seleccionado, en el margen izquierdo de la hoja */
  function ponerAsa(elemento, sel) {
    const d = documento();
    const w = ventana();
    const r = elemento.getBoundingClientRect();
    const c = elemento.closest(".content").getBoundingClientRect();
    const asa = d.createElement("div");
    asa.className = "f-asa";
    asa.draggable = true;
    asa.title = "Arrastra para mover el bloque";
    asa.dataset.bloque = sel.sid + ":" + sel.bid;
    asa.textContent = "⋮⋮";
    asa.style.top = (r.top + w.scrollY) + "px";
    asa.style.left = (c.left + w.scrollX - 26) + "px";
    d.body.appendChild(asa);
  }

  /* ---------- edicion de texto en la hoja ----------
     Se edita el texto con su sintaxis (`codigo`, **negrita**, [texto](url)), sin numeros.
     Enter confirma, Mayus+Enter agrega un salto de linea, Esc cancela. */
  function editarTexto(ref, textoCrudo, alTerminar) {
    const h = elementoDe(ref);
    if (!h) return;
    const d = documento();
    h.textContent = textoCrudo;
    h.contentEditable = "plaintext-only";
    h.classList.add("f-editando");
    h.style.whiteSpace = "pre-wrap";
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
      const texto = h.textContent.replace(/\r/g, "").replace(/^\n+|\n+$/g, "");
      h.contentEditable = "false";
      h.classList.remove("f-editando");
      h.style.whiteSpace = "";
      alTerminar(confirmar ? texto : null);
    };
    h.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); terminar(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); terminar(false); }
      ev.stopPropagation();
    });
    h.addEventListener("blur", () => terminar(true));
  }

  function editarTitulo(id, textoCrudo) {
    editarTexto("s:" + id, textoCrudo, (texto) => F.Editor.titulo(id, texto ? texto.replace(/\s+/g, " ").trim() : null));
  }

  function editarBloque(sid, bid, textoCrudo) {
    editarTexto("b:" + sid + ":" + bid, textoCrudo, (texto) => F.Editor.texto(sid, bid, texto));
  }

  /* ---------- soltar encima de la hoja ----------
     Secciones: antes del primer titulo que queda debajo del cursor (o al final).
     Bloques: antes del primer titulo o bloque que queda debajo del cursor; antes de un titulo
     significa al final de la seccion anterior; sin nada debajo, al final de la ultima. */
  function destinoSoltar(ev, arrastrado) {
    return arrastrado.clase === "bloque" || (arrastrado.clase === "nuevo" && arrastrado.tipo !== "seccion")
      ? destinoBloque(ev) : destinoSeccion(ev);
  }

  function destinoSeccion(ev) {
    const d = documento();
    const y = ev.clientY;
    const titulos = Array.from(d.querySelectorAll('[data-ref^="s:"]'));
    for (const h of titulos) {
      const r = h.getBoundingClientRect();
      if (r.top + r.height / 2 >= y) return { zona: "antes", ref: h.dataset.ref.slice(2), elemento: h };
    }
    return { zona: "fin", ref: null, elemento: null };
  }

  function destinoBloque(ev) {
    const d = documento();
    const modelo = F.Editor.modelo();
    const y = ev.clientY;
    const candidatos = Array.from(d.querySelectorAll('[data-ref^="s:"],[data-ref^="b:"]'));
    let previa = null;                    // seccion del ultimo elemento que quedo arriba
    for (const e of candidatos) {
      const ref = e.dataset.ref;
      const r = e.getBoundingClientRect();
      const esTitulo = ref.startsWith("s:");
      if (r.top + r.height / 2 >= y) {
        if (esTitulo) return previa ? { bloque: true, sid: previa, indice: null, elemento: e } : null;
        const partes = ref.split(":");
        const o = modelo.bloqueDe(partes[1], partes[2]);
        return o ? { bloque: true, sid: partes[1], indice: o.indice, elemento: e } : null;
      }
      previa = esTitulo ? ref.slice(2) : ref.split(":")[1];
    }
    return previa ? { bloque: true, sid: previa, indice: null, elemento: null } : null;
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
    editarBloque: editarBloque,
    ocultarLinea: ocultarLinea,
    enfocar: () => { if (marcoListo) ventana().focus(); },
  };
})(window.Folium = window.Folium || {});
