const MAXIMO_POR_PAGINA = 500;
const MAXIMO_SIN_PAGINAR = 5000;

const entero = (valor) => {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const leerPaginacion = (query = {}) => {
  const pagina = entero(query.pagina);
  const porPagina = entero(query.por_pagina);

  if (!pagina && !porPagina) {
    return { activa: false, limite: MAXIMO_SIN_PAGINAR, offset: 0 };
  }

  const limite = Math.min(porPagina || 25, MAXIMO_POR_PAGINA);
  const offset = (Math.max(pagina || 1, 1) - 1) * limite;

  return { activa: true, limite, offset };
};

export const cabeceraPaginacion = (res, { total, limite, offset }) => {
  res.set('X-Total-Count', String(total));
  res.set('X-Page-Size', String(limite));
  res.set('X-Page-Offset', String(offset));
  return res;
};

export const contar = async (client, query, params) => {
  const [[fila]] = await client.query(query, params);
  return Number(fila?.total || 0);
};