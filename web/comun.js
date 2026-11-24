/* Utilidades compartidas de la interfaz. */
(function (F) {
  "use strict";

  /* Crea un elemento. props: atributos (texto = textContent); hijos: nodos o textos. */
  F.el = function (tag, props, hijos) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === "texto") e.textContent = v; else e.setAttribute(k, v); });
    (hijos || []).forEach((h) => e.appendChild(typeof h === "string" ? document.createTextNode(h) : h));
    return e;
  };

  /* Llamada al servidor. Con cuerpo es POST con JSON; si falla lanza Error con el mensaje. */
  F.api = async function (ruta, cuerpo) {
    const opciones = cuerpo === undefined ? {} :
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) };
    const r = await fetch(ruta, opciones);
    const datos = await r.json();
    if (!r.ok) throw new Error(datos.error || "Error inesperado");
    return datos;
  };

  /* Aviso breve abajo en el centro. */
  let temporizador = null;
  F.avisar = function (texto) {
    const t = document.getElementById("aviso-flotante");
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { t.hidden = true; }, 4500);
  };

  /* Confirmacion con dialogo. Devuelve una promesa con true o false. */
  F.confirmar = function (titulo, mensajes, textoBoton) {
    const dlg = document.getElementById("dlg-confirmar");
    document.getElementById("confirmar-titulo").textContent = titulo;
    const cuerpo = document.getElementById("confirmar-cuerpo");
    cuerpo.textContent = "";
    mensajes.forEach((m) => cuerpo.appendChild(F.el("p", { texto: m })));
    document.getElementById("confirmar-si").textContent = textoBoton || "Aceptar";
    return new Promise((resolver) => {
      const cerrar = (valor) => {
        document.getElementById("confirmar-si").onclick = null;
        document.getElementById("confirmar-no").onclick = null;
        dlg.onclose = null;
        if (dlg.open) dlg.close();
        resolver(valor);
      };
      document.getElementById("confirmar-si").onclick = () => cerrar(true);
      document.getElementById("confirmar-no").onclick = () => cerrar(false);
      dlg.onclose = () => cerrar(false);
      dlg.showModal();
    });
  };

  /* Plural simple: texto(1, "bloque", "bloques") */
  F.cantidad = function (n, singular, plural) { return n + " " + (n === 1 ? singular : plural); };
})(window.Folium = window.Folium || {});
