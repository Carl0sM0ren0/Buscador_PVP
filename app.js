// PVP Comic Stores - versión 1.3
console.log("PVP Comic Stores v1.3 cargada");

let lectorHtml5 = null;
let escaneando = false;

const zonaEscaner = document.getElementById("zona-escaner");
const resultado = document.getElementById("resultado");
const codigoLeido = document.getElementById("codigo-leido");
const infoProducto = document.getElementById("info-producto");
const enlaceDirecto = document.getElementById("enlace-directo");

// Eventos principales
document.getElementById("btn-escanear").addEventListener("click", iniciarEscaner);
document.getElementById("btn-parar").addEventListener("click", detenerEscaner);
document.getElementById("btn-nuevo").addEventListener("click", reiniciar);
document.getElementById("btn-manual").addEventListener("click", buscarManual);

// Foto (usando label + change)
document.getElementById("input-foto").addEventListener("change", escanearDesdeFoto);

function buscarManual() {
  const codigo = document.getElementById("input-manual").value.trim().replace(/\s/g, "");
  if (codigo.length < 8) {
    alert("Escribe un código válido (mínimo 8 dígitos)");
    return;
  }
  detenerEscaner();
  procesarCodigo(codigo);
}

async function iniciarEscaner() {
  if (escaneando) return;
  escaneando = true;

  document.getElementById("btn-escanear").style.display = "none";
  document.getElementById("btn-parar").style.display = "block";

  lectorHtml5 = new Html5Qrcode("lector");

  const config = {
    fps: 15,
    qrbox: function(viewfinderWidth, viewfinderHeight) {
      const width = Math.floor(viewfinderWidth * 0.85);
      const height = Math.floor(width * 0.35);
      return { width, height };
    },
    aspectRatio: 1.777778,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128
    ]
  };

  try {
    await lectorHtml5.start(
      { facingMode: "environment" },
      config,
      (codigo) => {
        if (!escaneando) return;
        escaneando = false;
        if (navigator.vibrate) navigator.vibrate(80);
        detenerEscaner();
        procesarCodigo(codigo);
      },
      () => {}
    );
  } catch (err) {
    console.error(err);
    alert("No se pudo iniciar la cámara. Usa la entrada manual o la foto.");
    reiniciar();
  }
}

function detenerEscaner() {
  escaneando = false;
  if (lectorHtml5) {
    lectorHtml5.stop().then(() => {
      lectorHtml5.clear();
      lectorHtml5 = null;
    }).catch(() => {});
  }
  document.getElementById("btn-escanear").style.display = "block";
  document.getElementById("btn-parar").style.display = "none";
}

function reiniciar() {
  resultado.classList.add("oculto");
  zonaEscaner.classList.remove("oculto");
  infoProducto.innerHTML = "";
  enlaceDirecto.style.display = "none";
  document.getElementById("input-manual").value = "";
  escaneando = false;
}

async function escanearDesdeFoto(e) {
  const archivo = e.target.files?.[0];
  if (!archivo) return;

  // Limpiamos para poder elegir la misma foto otra vez
  e.target.value = "";

  zonaEscaner.classList.add("oculto");
  resultado.classList.remove("oculto");
  infoProducto.innerHTML = `<p class="cargando">Analizando la foto…</p>`;

  try {
    const scanner = new Html5Qrcode("lector");
    const codigo = await scanner.scanFile(archivo, true);
    procesarCodigo(codigo);
  } catch (err) {
    console.error(err);
    infoProducto.innerHTML = `
      <p>No se pudo leer el código en la foto.</p>
      <p style="margin-top:10px;font-size:0.9rem">
        Prueba con más luz, más cerca o escribe el código a mano.
      </p>
    `;
    enlaceDirecto.style.display = "none";
  }
}

async function procesarCodigo(codigo) {
  codigo = String(codigo).trim();
  codigoLeido.textContent = codigo;

  // Mensaje claro de búsqueda
  infoProducto.innerHTML = `<p class="cargando">Buscando el PVP en comicstores.es…</p>`;
  zonaEscaner.classList.add("oculto");
  resultado.classList.remove("oculto");

  const urlBusqueda = `https://comicstores.es/busqueda/listaLibros.php?tipoBus=full&palabrasBusqueda=${encodeURIComponent(codigo)}`;

  // Proxies de respaldo
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(urlBusqueda)}`,
    `https://corsproxy.io/?${encodeURIComponent(urlBusqueda)}`
  ];

  let html = null;

  for (const proxy of proxies) {
    try {
      const resp = await fetch(proxy, { signal: AbortSignal.timeout(9000) });
      if (resp.ok) {
        const texto = await resp.text();
        if (texto && texto.length > 400) {
          html = texto;
          break;
        }
      }
    } catch (e) {
      console.warn("Proxy falló:", e);
    }
  }

  // Siempre mostramos el enlace
  enlaceDirecto.href = urlBusqueda;
  enlaceDirecto.style.display = "block";
  enlaceDirecto.textContent = "Ver en Comic Stores";

  if (!html) {
    infoProducto.innerHTML = `
      <p>No se pudo obtener el precio automáticamente.</p>
      <p style="margin-top:10px">Código: <strong>${codigo}</strong></p>
      <p style="margin-top:8px;font-size:0.9rem">Pulsa el botón de abajo para verlo.</p>
    `;
    return;
  }

  // Extraemos precios
  const precios = [...html.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/g)].map(m => m[1]);

  if (precios.length >= 1) {
    const numeros = precios.map(p => parseFloat(p.replace(/\./g, "").replace(",", ".")));
    const pvp = Math.max(...numeros);
    const web = Math.min(...numeros);

    let titulo = "Producto encontrado";
    const matchTitulo = html.match(/\[([^\]]{5,90})\]\(\/libro\//) || html.match(/LOS CAZADORES[^<\n]{0,60}/i);
    if (matchTitulo) titulo = matchTitulo[1] ? matchTitulo[1].trim() : matchTitulo[0].trim();

    infoProducto.innerHTML = `
      <p class="titulo-prod">${titulo}</p>
      <p class="pvp">${pvp.toFixed(2).replace(".", ",")} €</p>
      <p class="precio-web">Precio web: ${web.toFixed(2).replace(".", ",")} €</p>
      <p style="font-size:0.85rem;opacity:0.65;margin-top:8px">
        PVP = precio sin el descuento de la web
      </p>
    `;
  } else {
    infoProducto.innerHTML = `
      <p>No se pudo leer el precio automáticamente.</p>
      <p style="margin-top:10px">Código: <strong>${codigo}</strong></p>
      <p style="margin-top:8px;font-size:0.9rem">Pulsa el botón de abajo para verlo en Comic Stores.</p>
    `;
  }
}
