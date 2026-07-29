let lectorHtml5 = null;
let escaneando = false;

const zonaEscaner = document.getElementById("zona-escaner");
const resultado = document.getElementById("resultado");
const codigoLeido = document.getElementById("codigo-leido");
const infoProducto = document.getElementById("info-producto");
const enlaceDirecto = document.getElementById("enlace-directo");

// Eventos
document.getElementById("btn-escanear").addEventListener("click", iniciarEscaner);
document.getElementById("btn-parar").addEventListener("click", detenerEscaner);
document.getElementById("btn-nuevo").addEventListener("click", reiniciar);
document.getElementById("btn-manual").addEventListener("click", buscarManual);

// Botón de foto (arreglado para iOS)
const btnFoto = document.getElementById("btn-foto");
const inputFoto = document.getElementById("input-foto");

if (btnFoto && inputFoto) {
  btnFoto.addEventListener("click", () => {
    inputFoto.value = ""; // limpiar para poder elegir la misma foto otra vez
    inputFoto.click();
  });
  inputFoto.addEventListener("change", escanearDesdeFoto);
}

function buscarManual() {
  const codigo = document.getElementById("input-manual").value.trim().replace(/\s/g, "");
  if (codigo.length >= 8) {
    detenerEscaner();
    procesarCodigo(codigo);
  } else {
    alert("Escribe un código válido (mínimo 8 dígitos)");
  }
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
      let width = Math.floor(viewfinderWidth * 0.85);
      let height = Math.floor(width * 0.35);
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

  zonaEscaner.classList.add("oculto");
  resultado.classList.remove("oculto");
  infoProducto.innerHTML = `<p class="cargando">Analizando la foto…</p>`;

  try {
    const scanner = new Html5Qrcode("lector");
    const codigo = await scanner.scanFile(archivo, /* showImage= */ true);
    procesarCodigo(codigo);
  } catch (err) {
    console.error(err);
    infoProducto.innerHTML = `
      <p>No se pudo leer el código en la foto.</p>
      <p style="margin-top:10px;font-size:0.9rem">Prueba con más luz, más cerca o escribe el código a mano.</p>
    `;
  }
}

async function procesarCodigo(codigo) {
  codigo = String(codigo).trim();
  codigoLeido.textContent = codigo;
  infoProducto.innerHTML = `<p class="cargando">Buscando en comicstores.es…</p>`;

  // URL CORRECTA (la que funciona)
  const urlBusqueda = `https://comicstores.es/busqueda/listaLibros.php?tipoBus=full&palabrasBusqueda=${encodeURIComponent(codigo)}`;
  
  // Varios proxies por si uno falla
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(urlBusqueda)}`,
    `https://corsproxy.io/?${encodeURIComponent(urlBusqueda)}`
  ];

  let html = null;

  for (const proxy of proxies) {
    try {
      const resp = await fetch(proxy, { signal: AbortSignal.timeout(9000) });
      if (resp.ok) {
        html = await resp.text();
        if (html && html.length > 500) break;
      }
    } catch (e) {
      console.warn("Proxy falló:", proxy, e);
    }
  }

  // Siempre mostramos el enlace directo (aunque falle el parsing)
  enlaceDirecto.href = urlBusqueda;
  enlaceDirecto.style.display = "block";
  enlaceDirecto.textContent = "Abrir búsqueda en Comic Stores";

  if (!html) {
    mostrarFallback(codigo, urlBusqueda);
    return;
  }

  // Extraemos precios: busca patrones como 25,00 € **23,75 €**
  const preciosEncontrados = [...html.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/g)]
    .map(m => m[1]);

  if (preciosEncontrados.length >= 1) {
    const numeros = preciosEncontrados.map(p => 
      parseFloat(p.replace(/\./g, "").replace(",", "."))
    );
    const pvp = Math.max(...numeros);
    const web = Math.min(...numeros);

    // Intentamos sacar el título
    let titulo = "Producto encontrado";
    const matchTitulo = html.match(/\[([^\]]{5,80})\]\(\/libro\//) || 
                        html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (matchTitulo) titulo = matchTitulo[1].trim();

    infoProducto.innerHTML = `
      <p class="titulo-prod">${titulo}</p>
      <p class="pvp">${pvp.toFixed(2).replace(".", ",")} €</p>
      <p class="precio-web">Precio web: ${web.toFixed(2).replace(".", ",")} €</p>
      <p style="font-size:0.85rem;opacity:0.65;margin-top:8px">
        PVP = precio sin el descuento de la web
      </p>
    `;
  } else {
    mostrarFallback(codigo, urlBusqueda);
  }
}

function mostrarFallback(codigo, urlBusqueda) {
  infoProducto.innerHTML = `
    <p>No se pudo leer el precio automáticamente.</p>
    <p style="margin-top:12px">Código: <strong>${codigo}</strong></p>
    <p style="margin-top:8px;font-size:0.9rem">Pulsa el botón de abajo para verlo en Comic Stores.</p>
  `;
  enlaceDirecto.href = urlBusqueda || `https://comicstores.es/busqueda/listaLibros.php?tipoBus=full&palabrasBusqueda=${codigo}`;
  enlaceDirecto.style.display = "block";
  enlaceDirecto.textContent = "Ver en Comic Stores";
}
