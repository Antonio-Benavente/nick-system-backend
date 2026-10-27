import cron from 'node-cron';

const TIMEOUT_PING_MS = 10000;
const HORARIO_POR_DEFECTO = '08:00-22:00';
const ZONA_HORIZONTE = 'America/Lima';

const aMinutos = (texto) => {
  const coincidencia = /^(\d{1,2}):(\d{2})$/.exec(String(texto || '').trim());
  if (!coincidencia) return null;
  const hora = Number(coincidencia[1]);
  const minuto = Number(coincidencia[2]);
  if (hora > 24 || minuto > 59) return null;
  return hora * 60 + minuto;
};

const horaLima = () => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const valor = (tipo) => Number(partes.find((parte) => parte.type === tipo)?.value ?? 0);

  return valor('hour') * 60 + valor('minute');
};

const dentroDelHorario = (rango) => {
  const [desde, hasta] = String(rango).split('-');
  const inicio = aMinutos(desde);
  const fin = aMinutos(hasta);

  if (inicio === null || fin === null) return true;

  const ahora = horaLima();

  if (fin >= inicio) return ahora >= inicio && ahora <= fin;
  return ahora >= inicio || ahora <= fin;
};

const urlObjetivo = () => {
  if (process.env.WARMUP_URL) return process.env.WARMUP_URL;

  const externa = process.env.RENDER_EXTERNAL_URL;
  if (externa) return `${externa.replace(/\/+$/, '')}/health`;

  return null;
};

const ejecutar = async (url) => {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_PING_MS);
  if (typeof temporizador.unref === 'function') temporizador.unref();

  try {
    const respuesta = await fetch(url, { signal: control.signal });

    if (!respuesta.ok) {
      console.warn(`⚠️ El ping de mantenimiento respondió ${respuesta.status}`);
    }

    await respuesta.arrayBuffer();
  } catch (error) {
    console.warn('⚠️ Falló el ping de mantenimiento:', error.message);
  } finally {
    clearTimeout(temporizador);
  }
};

export const iniciarWarmup = () => {
  const url = urlObjetivo();

  if (!url) {
    console.log('ℹ️ Mantenimiento automático desactivado: define WARMUP_URL o RENDER_EXTERNAL_URL');
    return null;
  }

  const minutos = Number(process.env.WARMUP_MINUTOS ?? 10);

  if (!Number.isFinite(minutos) || minutos <= 0) {
    console.log('ℹ️ Mantenimiento automático desactivado: WARMUP_MINUTOS es 0');
    return null;
  }

  const horario = process.env.WARMUP_HORARIO || HORARIO_POR_DEFECTO;

  // `dentroDelHorario` resuelve rangos arbitrarios ("HH:MM-HH:MM") que un campo
  // de hora de cron no puede expresar, así que la expresión solo fija el paso.
  const tareas = [
    cron.schedule(`*/${Math.max(1, Math.floor(minutos))} * * * *`, () => {
      if (!dentroDelHorario(horario)) return;
      void ejecutar(url);
    }, { timezone: ZONA_HORIZONTE })
  ];

  // Ping fijo a la hora de apertura del horario: tras la noche el servidor pudo
  // quedar dormido, y este es el encendido garantizado del día laboral.
  const [inicio] = String(horario).split('-');
  const apertura = /^(\d{1,2}):(\d{2})$/.exec(String(inicio || '').trim());

  if (apertura) {
    const [, hora, minuto] = apertura;
    tareas.push(cron.schedule(`${minuto} ${hora} * * *`, () => void ejecutar(url), {
      timezone: ZONA_HORIZONTE
    }));
  }

  console.log(
    `🔄 Mantenimiento automático cada ${minutos} min contra ${url} (horario ${horario}, hora de Lima)`
    + (apertura ? `; ping fijo diario a las ${apertura[0]}` : '')
  );

  return tareas;
};