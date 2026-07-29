export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405, cors);

    const ean = new URL(request.url).searchParams.get('ean')?.replace(/\D/g, '');
    if (!ean || !/^(\d{8}|\d{12}|\d{13})$/.test(ean)) {
      return json({ error: 'Añade un EAN válido: ?ean=8437012332577' }, 400, cors);
    }

    try {
      const candidatos = [
        `https://comicstores.es/busqueda/listaLibros.php?tipoBus=full&palabrasBusqueda=${encodeURIComponent(ean)}`,
        `https://comicstores.es/buscar?controller=search&s=${encodeURIComponent(ean)}`,
        `https://comicstores.es/search?query=${encodeURIComponent(ean)}`
      ];

      let searchHtml = '';
      let searchFinalUrl = '';
      let productUrl = '';

      for (const url of candidatos) {
        const r = await pedirHtml(url);
        const html = await r.text();
        const enlaces = extraerEnlacesProducto(html);
        const coincide = html.includes(ean);
        if (enlaces.length || coincide) {
          searchHtml = html;
          searchFinalUrl = r.url;
          productUrl = enlaces[0] || '';
          break;
        }
      }

      if (!searchHtml) return json({ error: 'Comic Stores no devolvió resultados para ese EAN' }, 404, cors);

      let productHtml = searchHtml;
      if (productUrl) {
        const r = await pedirHtml(productUrl);
        productHtml = await r.text();
      } else {
        productUrl = searchFinalUrl;
      }

      const texto = htmlATexto(productHtml);
      if (!texto.includes(ean)) {
        return json({ error: 'La ficha encontrada no coincide con el EAN solicitado' }, 404, cors);
      }

      const titulo = extraerTitulo(productHtml) || 'Producto encontrado';
      const precios = [...texto.matchAll(/(\d{1,4}(?:\.\d{3})*,\d{2})\s*€/g)]
        .map(m => Number(m[1].replace(/\./g, '').replace(',', '.')))
        .filter(n => Number.isFinite(n) && n > 0 && n < 100000);

      if (!precios.length) return json({ error: 'Producto encontrado, pero no se pudo leer el precio' }, 422, cors);

      const valores = [...new Set(precios)];
      const pvp = Math.max(...valores);
      const precioWeb = valores.length > 1 ? Math.min(...valores) : null;
      return json({ ean, titulo, pvp, precioWeb, url: productUrl }, 200, cors);
    } catch (error) {
      return json({ error: `Error consultando Comic Stores: ${error.message || error}` }, 502, cors);
    }
  }
};

async function pedirHtml(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PVPComicStores/2.1)',
      'Accept': 'text/html,application/xhtml+xml'
    },
    redirect: 'follow'
  });
  if (!r.ok) throw new Error(`Comic Stores respondió HTTP ${r.status}`);
  return r;
}

function extraerEnlacesProducto(html) {
  const encontrados = [...String(html).matchAll(/href=["'](?:https?:\/\/comicstores\.es)?(\/producto\/[^"'#?]+)["']/gi)]
    .map(m => `https://comicstores.es${m[1].replace(/&amp;/g, '&')}`);
  return [...new Set(encontrados)];
}

function extraerTitulo(html) {
  const h1 = String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return htmlATexto(h1 || title || '').replace(/\s*[-|].*Comic Stores.*$/i, '').trim();
}

function htmlATexto(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&euro;|&#8364;/gi, '€')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}
