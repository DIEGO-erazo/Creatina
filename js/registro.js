// Lógica pura del registro: fechas, estadísticas y calendario.
// No usa el DOM ni Firebase, así que se puede probar con `node --test`.
//
// Cada día se guarda como una clave 'AAAA-MM-DD' en la HORA LOCAL del usuario.
// (La versión anterior usaba toISOString(), que está en UTC: en El Salvador,
// después de las 6 p. m. ya marcaba el día siguiente.)

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Fecha local -> 'AAAA-MM-DD'. */
export function claveDeFecha(fecha) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

/** 'AAAA-MM-DD' -> fecha local a medianoche. (new Date('AAAA-MM-DD') la leería en UTC.) */
export function fechaDeClave(clave) {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function esClaveValida(clave) {
  if (typeof clave !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(clave)) return false;
  return claveDeFecha(fechaDeClave(clave)) === clave;
}

export function sumarDias(fecha, dias) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);
}

/** Días de calendario entre dos fechas (b - a), sin errores por horario de verano. */
export function diasEntre(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / MS_POR_DIA);
}

/**
 * Estadísticas a partir del conjunto de días registrados.
 * Hoy no cuenta como "no tomado" mientras no termine: queda pendiente.
 */
export function calcularEstadisticas(registros, hoy = new Date()) {
  const claveHoy = claveDeFecha(hoy);
  const pasadas = [...registros].filter((k) => esClaveValida(k) && k <= claveHoy).sort();
  const tomadoHoy = registros.has(claveHoy);

  if (pasadas.length === 0) {
    return { primera: null, tomados: 0, noTomados: 0, racha: 0, mejorRacha: 0, cumplimiento: 0, tomadoHoy };
  }

  const primera = pasadas[0];
  const diasDesdePrimera = diasEntre(fechaDeClave(primera), hoy) + 1;
  const diasCerrados = tomadoHoy ? diasDesdePrimera : diasDesdePrimera - 1;
  const tomados = pasadas.length;
  const noTomados = Math.max(0, diasCerrados - tomados);
  const cumplimiento = diasCerrados > 0 ? Math.round((tomados / diasCerrados) * 100) : 0;

  // Racha actual: desde hoy (o desde ayer, si hoy aún no se registra) hacia atrás.
  let dia = tomadoHoy ? hoy : sumarDias(hoy, -1);
  let racha = 0;
  while (registros.has(claveDeFecha(dia))) {
    racha += 1;
    dia = sumarDias(dia, -1);
  }

  let mejorRacha = 0;
  let actual = 0;
  let anterior = null;
  for (const clave of pasadas) {
    const fecha = fechaDeClave(clave);
    actual = anterior && diasEntre(anterior, fecha) === 1 ? actual + 1 : 1;
    mejorRacha = Math.max(mejorRacha, actual);
    anterior = fecha;
  }

  return { primera, tomados, noTomados, racha, mejorRacha, cumplimiento, tomadoHoy };
}

/**
 * Celdas de un mes para el calendario (semana empieza en domingo).
 * estado: 'vacio' (relleno), 'tomado', 'no-tomado', 'pendiente' (hoy sin registrar), 'sin-dato' (antes de empezar o futuro).
 */
export function celdasDelMes(anio, mes, registros, hoy = new Date()) {
  const claveHoy = claveDeFecha(hoy);
  const pasadas = [...registros].filter((k) => esClaveValida(k) && k <= claveHoy).sort();
  const primera = pasadas[0] ?? null;
  const celdas = [];

  const desfase = new Date(anio, mes, 1).getDay();
  for (let i = 0; i < desfase; i++) celdas.push({ estado: 'vacio' });

  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  for (let dia = 1; dia <= diasDelMes; dia++) {
    const clave = claveDeFecha(new Date(anio, mes, dia));
    let estado = 'sin-dato';
    if (registros.has(clave)) estado = 'tomado';
    else if (clave === claveHoy) estado = 'pendiente';
    else if (primera && clave > primera && clave < claveHoy) estado = 'no-tomado';
    celdas.push({ dia, clave, estado, editable: clave <= claveHoy, esHoy: clave === claveHoy });
  }
  return celdas;
}

/** Datos de ejemplo para el modo demo: ~6 semanas con algunos olvidos. */
export function registrosDeEjemplo(hoy = new Date()) {
  const olvidos = new Set([3, 9, 10, 17, 26, 33]);
  const registros = new Set();
  for (let i = 41; i >= 1; i--) {
    if (!olvidos.has(i)) registros.add(claveDeFecha(sumarDias(hoy, -i)));
  }
  return registros;
}

/** Los últimos `n` días hasta hoy, para la franja de la semana. */
export function ultimosDias(registros, n = 7, hoy = new Date()) {
  const claveHoy = claveDeFecha(hoy);
  const pasadas = [...registros].filter((k) => esClaveValida(k) && k <= claveHoy).sort();
  const primera = pasadas[0] ?? null;
  const iniciales = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const dias = [];
  for (let i = n - 1; i >= 0; i--) {
    const fecha = sumarDias(hoy, -i);
    const clave = claveDeFecha(fecha);
    let estado = 'sin-dato';
    if (registros.has(clave)) estado = 'tomado';
    else if (clave === claveHoy) estado = 'pendiente';
    else if (primera && clave > primera) estado = 'no-tomado';
    dias.push({ clave, dia: fecha.getDate(), inicial: iniciales[fecha.getDay()], estado, esHoy: clave === claveHoy });
  }
  return dias;
}
