'use strict';

const API_URL = 'https://buscadorpvp.carlos-moreno.workers.dev';

const zonaEscaner = document.getElementById('zona-escaner');
const resultado = document.getElementById('resultado');
const codigoLeido = document.getElementById('codigo-leido');
const infoProducto = document.getElementById('info-producto');
const enlaceDirecto = document.getElementById('enlace-directo');
const lectorDiv = document.getElementById('lector');
const video = document.getElementById('video');
const estadoCamara = document.getElementById('estado-camara');

let controlesVideo = null;
let procesandoLectura = false;

// @zxing/browser usa el espacio de nombres ZXingBrowser.
const lectorZXing = new ZXingBrowser.BrowserMultiFormatReader(undefined, {
  delayBetweenScanAttempts: 150,
  delayBetweenScanSuccess: 600
});

document.getElementById('btn-escanear').addEventListener('click', iniciarEscaner);
document.getElementById('btn-parar').addEventListener('click', detenerEscaner);
document.getElementById('btn-nuevo').addEventListener('click', reiniciar);
document.getElementById('btn-manual').addEventListener('click', buscarManual);
document.getElementById('input-foto').addEventListener('change', escanearDesdeFoto);
document.getElementById('input-manual').addEventListener('keydown', e => {
  if (e.key === 'Enter') buscarManual();
});

function normalizarCodigo(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function esCodigoValido(codigo) {
  return /^(\d{8}|\d{12}|\d{13})$/.test(codigo);
}

function mostrarCargando(texto) {
  infoProducto.innerHTML = `<div class="cargando"><div class="spinner"></div><p>${texto}</p></div>`;
}

function buscarManual() {
  const codigo = normalizarCodigo(document.getElementById('input-manual').value);
  if (!esCodigoValido(codigo)) {
    alert('Introduce un EAN de 8 o 13 dígitos, o un UPC de 12 dígitos.');
    return;
  }
  procesarCodigo(codigo);
}

async function iniciarEscaner() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    alert('La cámara necesita HTTPS y permiso de Safari.');
    return;
  }

  procesandoLectura = false;
  lectorDiv.style.display = 'block';
  document.getElementById('btn-escanear').style.display = 'none';
  document.getElementById('btn-parar').style.display = 'block';
  estadoCamara.textContent = 'Solicitando permiso para usar la cámara…';

  try {
    // No enumeramos cámaras antes de pedir permiso: en iPhone es más fiable
    // solicitar directamente la cámara trasera.
    controlesVideo = await lectorZXing.decodeFromConstraints(
      {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      },
      video,
      (result, error) => {
        if (result && !procesandoLectura) {
          const codigo = normalizarCodigo(result.getText());
          if (!esCodigoValido(codigo)) return;
          procesandoLectura = true;
          if (navigator.vibrate) navigator.vibrate(80);
          detenerEscaner();
          procesarCodigo(codigo);
        } else if (error && error.name !== 'NotFoundException') {
          console.warn('Error de lectura:', error);
        }
      }
    );
    estadoCamara.textContent = 'Coloca las barras en horizontal, ocupa casi todo el ancho y mantén el móvil quieto.';
  } catch (error) {
    console.error(error);
    detenerEscaner();
    alert(`No se pudo abrir la cámara: ${error.message || error}`);
  }
}

function detenerEscaner() {
  try { controlesVideo?.stop(); } catch (_) {}
  controlesVideo = null;
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  lectorDiv.style.display = 'none';
  document.getElementById('btn-escanear').style.display = 'block';
  document.getElementById('btn-parar').style.display = 'none';
}

async function escanearDesdeFoto(evento) {
  const archivo = evento.target.files?.[0];
  evento.target.value = '';
  if (!archivo) return;

  zonaEscaner.classList.add('oculto');
  resultado.classList.remove('oculto');
  codigoLeido.textContent = 'Analizando…';
  mostrarCargando('Preparando y analizando la fotografía…');

  try {
    const imagen = await cargarImagen(archivo);
    const codigo = await leerImagenConVariantes(imagen);
    if (!esCodigoValido(codigo)) throw new Error('No se detectó un EAN válido');
    await procesarCodigo(codigo);
  } catch (error) {
    console.error(error);
    codigoLeido.textContent = 'No detectado';
    infoProducto.innerHTML = `<p>No se ha podido reconocer el código.</p><p style="margin-top:10px;font-size:.95rem">Recorta visualmente el encuadre: barras horizontales, buena luz, sin reflejos y ocupando casi todo el ancho.</p>`;
  }
}

function cargarImagen(archivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen')); };
    img.src = url;
  });
}

async function leerImagenConVariantes(img) {
  const variantes = [
    { giro: 0, contraste: false },
    { giro: 0, contraste: true },
    { giro: 90, contraste: false },
    { giro: -90, contraste: false },
    { giro: 180, contraste: false }
  ];

  let ultimoError;
  for (const variante of variantes) {
    const canvas = prepararCanvas(img, variante.giro, variante.contraste);
    try {
      const lectura = await lectorZXing.decodeFromCanvas(canvas);
      const codigo = normalizarCodigo(lectura.getText());
      if (esCodigoValido(codigo)) return codigo;
    } catch (error) {
      ultimoError = error;
    }
  }
  throw ultimoError || new Error('Código no encontrado');
}

function prepararCanvas(img, giro, altoContraste) {
  const maxLado = 2200;
  const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const intercambiar = Math.abs(giro) === 90;

  const canvas = document.createElement('canvas');
  canvas.width = intercambiar ? h : w;
  canvas.height = intercambiar ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(giro * Math.PI / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  if (altoContraste) {
    const datos = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const p = datos.data;
    for (let i = 0; i < p.length; i += 4) {
      const gris = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      const valor = gris < 150 ? 0 : 255;
      p[i] = p[i + 1] = p[i + 2] = valor;
    }
    ctx.putImageData(datos, 0, 0);
  }
  return canvas;
}

async function procesarCodigo(codigo) {
  detenerEscaner();
  codigo = normalizarCodigo(codigo);
  codigoLeido.textContent = codigo;
  zonaEscaner.classList.add('oculto');
  resultado.classList.remove('oculto');
  mostrarCargando('Buscando el PVP en comicstores.es…');

  // Respaldo útil: abre una búsqueda por EAN, no la portada.
  enlaceDirecto.href = `https://comicstores.es/busqueda/listaLibros.php?tipoBus=full&palabrasBusqueda=${encodeURIComponent(codigo)}`;
  enlaceDirecto.style.display = 'block';

  try {
    const endpoint = `${API_URL.replace(/\/$/, '')}/?ean=${encodeURIComponent(codigo)}`;
    const respuesta = await fetch(endpoint, { method: 'GET', mode: 'cors', cache: 'no-store' });
    const texto = await respuesta.text();
    let datos;
    try { datos = JSON.parse(texto); }
    catch (_) { throw new Error(`El Worker no devolvió JSON (HTTP ${respuesta.status})`); }
    if (!respuesta.ok) throw new Error(datos.error || `Error HTTP ${respuesta.status}`);

    enlaceDirecto.href = datos.url || enlaceDirecto.href;
    infoProducto.innerHTML = `
      <p class="titulo-prod">${escapar(datos.titulo)}</p>
      <p class="pvp">${formatearPrecio(datos.pvp)}</p>
      ${datos.precioWeb != null ? `<p class="precio-web">Precio web: ${formatearPrecio(datos.precioWeb)}</p>` : ''}
    `;
  } catch (error) {
    console.error(error);
    infoProducto.innerHTML = `<p>No se pudo obtener el PVP automáticamente.</p><p style="margin-top:10px;font-size:.9rem">${escapar(error.message || String(error))}</p><p style="margin-top:10px;font-size:.85rem;opacity:.75">Comprueba abriendo directamente el Worker con <code>?ean=${codigo}</code>.</p>`;
  }
}

function formatearPrecio(valor) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(valor));
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function reiniciar() {
  detenerEscaner();
  procesandoLectura = false;
  resultado.classList.add('oculto');
  zonaEscaner.classList.remove('oculto');
  infoProducto.innerHTML = '';
  enlaceDirecto.style.display = 'none';
  document.getElementById('input-manual').value = '';
}
