/**
 * Devuelve un objeto nuevo con solo los campos definidos de `origen`.
 * Se usa para armar actualizaciones parciales sin repetir el mismo reduce
 * en cada controller.
 */
export const soloDefinidos = (origen, campos) =>
  campos.reduce((acc, campo) => {
    if (origen[campo] !== undefined) acc[campo] = origen[campo];
    return acc;
  }, {});

export default soloDefinidos;
