const API_RECIBIDOS = 'https://api.resend.com/emails/receiving';

export const obtenerCorreoRecibido = async (emailId) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY no configurada');
  }

  const respuesta = await fetch(`${API_RECIBIDOS}/${encodeURIComponent(emailId)}`, {
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`
    }
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`Resend respondió ${respuesta.status}: ${detalle}`);
  }

  return respuesta.json();
};
