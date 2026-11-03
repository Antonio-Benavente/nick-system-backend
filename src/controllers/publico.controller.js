import { config } from '../config/env.js';

export const infoAppTecnicos = (req, res) => {
  res.set('Cache-Control', 'no-store').json({
    version_minima: config.APP_TECNICOS_VERSION_MINIMA,
    url_descarga: config.APP_TECNICOS_URL_DESCARGA || null
  });
};
