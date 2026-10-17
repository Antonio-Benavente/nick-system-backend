export const limiteExcedido = (mensaje) => (req, res) => {
  console.warn(
    `429 ${req.method} ${req.originalUrl} excedió el límite de peticiones (ip ${req.ip})`
  );

  res.status(429).json({ message: mensaje });
};