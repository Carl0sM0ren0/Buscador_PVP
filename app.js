// PVP Comic Stores - versión 1.4
console.log("PVP Comic Stores v1.4 cargada");

let lectorHtml5 = null;
let escaneando = false;

const zonaEscaner = document.getElementById("zona-escaner");
const resultado = document.getElementById("resultado");
const codigoLeido = document.getElementById("codigo-leido");
const infoProducto = document.getElementById("info-producto");
const enlaceDirecto = document.getElementById("enlace-directo");
const lectorDiv = document.getElementById("lector");

document.getElementById("btn-escanear").addEventListener("click", iniciarEscaner);
document.getElementById("btn-parar").addEventListener("click", detenerEscaner);
document.getElementById("btn-nuevo").addEventListener("click", reiniciar);
document.getElementById("btn-manual").addEventListener("click", buscarManual);
document.getElementById("input-foto").addEventListener("change", escanearDesdeFoto);

function mostrarCargando(texto = "Buscando el PVP en comicstores.es…") {
  infoProducto.innerHTML = `
    <div class="cargando">
      <div class="spinner"></div>
      <p>${texto}</p>
    </div>
  `;
}

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
  lectorDiv.innerHTML = ""; // limpiar

  lectorHtml5 = new Html5Qrcode("lector");

  const config = {
    fps: 12,
    qrbox: { width: 300, height: 120 },
    aspectRatio: 1.777,
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
    alert("No se pudo iniciar la cámara. Usa escribir el código o la foto.");
    reiniciar();
  }
}

function detenerEscaner() {
  escaneando = false;
  if (lectorHtml5) {
    lectorHtml5.stop().then(() => {
      try { lectorHtml5.clear(); } catch(e) {}
      lectorHtml5 = null;
      lectorDiv.innerHTML = ""; // importante para evitar pantalla negra
    }).catch(() => {
      lectorHtml5 = null;
      lectorDiv.innerHTML = "";
    });
  } else {
    lectorDiv.innerHTML = "";
  }
  document.getElementById("btn-escanear").style.display = "block";
  document.getElementById("btn-parar").style.display = "none";
}

function reiniciar() {
  detenerEscaner();
  resultado.classList.add("oculto");
  zonaEscaner.classList.remove("oculto");
  infoProducto.innerHTML = "";
  enlaceDirecto.style.display = "none";
  document.getElementById("input-manual").value = "";
  lectorDiv.innerHTML = "";
  escaneando = false;
}

async function escanearDesdeFoto(e) {
  const archivo = e.target.files?.[0];
  if (!archivo) return;
  e.target.value = "";

  zonaEscaner.classList.add("oculto");
  resultado.classList.remove("oculto");
  mostrarCargando("Analizando la foto…");

  try {
    const scanner = new Html5Qrcode("lector");
    const codigo = await scanner.scanFile(archivo, false);
    procesarCodigo(codigo);
  } catch (err) {
    console.error(err);
    infoProducto.innerHTML = `
      <p>No se pudo leer el código en la foto.</p>
      <p style="margin-top:12px;font-size:0.95rem">
        En iPhone es frecuente. Lo más fiable es <strong>escribir el código a mano</strong>.
      </p>
    `;
    enlaceDirecto.style.display = "none";
  }
}

async function procesarCodigo(codigo) {
  codigo = String(codigo).trim();
  codigoLeido.textContent = codigo;

  zonaEscaner.classList.add("oculto");
  resultado.classList.remove("oculto");
  mostrarCargando("Buscando el PVP en comicstores.es…");

  const urlBusqueda = `https://comicstores.es/busqueda/listaLibros.php?tipoBus=full&palabrasBusqueda=${encodeURIComponent(codigo)}`;

  // Varios proxies
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(urlBusqueda)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(urlBusqueda)}`,
    `https://corsproxy.io/?${encodeURIComponent(urlBusqueda)}`
  ];

  let html = null;
  for (const proxy of proxies) {
    try {
      const resp = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const texto = await resp.text();
        if (texto && texto.length > 500 && texto.includes("€")) {
          html = texto;
          break;
        }
      }
    } catch (e) {
      console.warn("Proxy falló", e);
    }
  }

  // Siempre enseñamos el enlace
  enlaceDirecto.href = urlBusqueda;
  enlaceDirecto.style.display = "block";
  enlaceDirecto.textContent = "Ver ficha / precio en Comic Stores";

  if (!html) {
    infoProducto.innerHTML = `
      <p>No se pudo leer el precio automáticamente.</p>
      <p style="margin-top:12px">Código: <strong>${codigo}</strong></p>
      <p style="margin-top:10px;font-size:0.95rem">
        Pulsa el botón de abajo para ver el PVP en Comic Stores.
      </p>
    `;
    return;
  }

  // Extraer precios
  const matches = [...html.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/g)];
  const precios = matches.map(m => m[1]);

  if (precios.length >= 1) {
    const numeros = precios.map(p => parseFloat(p.replace(/\./g, "").replace(",", ".")));
    const pvp = Math.max(...numeros);
    const web = Math.min(...numeros);

    let titulo = "Producto encontrado";
    const mTitulo = html.match(/\[([^\]]{5,90})\]\(\/libro\//);
    if (mTitulo) titulo = mTitulo[1].trim();

    infoProducto.innerHTML = `
      <p class="titulo-prod">${titulo}</p>
      <p class="pvp">${pvp.toFixed(2).replace(".", ",")} €</p>
      <p class="precio-web">Precio web: ${web.toFixed(2).replace(".", ",")} €</p>
      <p style="font-size:0.85rem;opacity:0.65;margin-top:10px">
        PVP = precio sin el descuento de la web
      </p>
    `;
  } else {
    infoProducto.innerHTML = `
      <p>No se pudo leer el precio automáticamente.</p>
      <p style="margin-top:12px">Código: <strong>${codigo}</strong></p>
      <p style="margin-top:10px;font-size:0.95rem">
        Pulsa el botón de abajo para ver el PVP en Comic Stores.
      </p>
    `;
  }
}
