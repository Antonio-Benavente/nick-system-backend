const normalizar = (valor) => String(valor || '').trim().slice(0, 100);

export const categoriaActiva = async (client, nombre) => {
  const limpio = normalizar(nombre);

  const [cat] = await client.query(
    "SELECT id FROM categorias WHERE nombre = ? AND estado = 'activo'",
    [limpio]
  );

  return cat.length > 0;
};

export const obtenerOCrearCategoria = async (client, nombre) => {
  const limpio = normalizar(nombre);

  if (!limpio) {
    throw new Error('La categoría es requerida');
  }

  const [cat] = await client.query(
    'SELECT id, nombre FROM categorias WHERE nombre = ? AND estado = ?',
    [limpio, 'activo']
  );

  if (cat.length > 0) {
    return { ...cat[0], creada: false };
  }

  const [creada] = await client.query(
    "INSERT INTO categorias (nombre, estado) VALUES (?, 'activo')",
    [limpio]
  );

  return { id: creada.insertId, nombre: limpio, creada: true };
};