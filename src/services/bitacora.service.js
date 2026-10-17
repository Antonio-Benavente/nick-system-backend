const SIN_DATO = '-';

const esVacio = (valor) => valor === undefined || valor === null || valor === '';

export const enmascararEmail = (valor) => {
  const texto = String(valor || '').trim();
  if (!texto) return SIN_DATO;

  const arroba = texto.lastIndexOf('@');
  if (arroba <= 0) return '***';

  return `${texto.slice(0, 1)}***@${texto.slice(arroba + 1)}`;
};

export const enmascararTelefono = (valor) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return SIN_DATO;
  if (digitos.length < 6) return '***';

  return `${digitos.slice(0, 3)}****${digitos.slice(-4)}`;
};

const recortar = (valor, max) => {
  const texto = String(valor).replace(/\s+/g, ' ').trim();
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
};

const formatearValor = (valor) => {
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);

  const texto = String(valor);
  return /\s/.test(texto) ? `"${recortar(texto, 160)}"` : recortar(texto, 120);
};

export const bitacora = (ambito, evento, detalle = {}) => {
  const partes = [`[${ambito}]`, new Date().toISOString(), evento];

  for (const [clave, valor] of Object.entries(detalle)) {
    if (esVacio(valor)) continue;
    partes.push(`${clave}=${formatearValor(valor)}`);
  }

  console.log(partes.join(' | '));
};

export const resumen = (detalle) => {
  const total = Number(detalle.total) || 0;
  const ok = Number(detalle.ok) || 0;

  return `${ok}/${total}`;
};