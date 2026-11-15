// Interfaz: conecta la pantalla con el almacén de datos y la lógica de registro.
import { alCambiarSesion, iniciarSesion, almacenFirebase, almacenDemo } from './almacen.js';
import { claveDeFecha, fechaDeClave, calcularEstadisticas, celdasDelMes, ultimosDias } from './registro.js';

const $ = (id) => document.getElementById(id);
const NOMBRES_DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const parametros = new URLSearchParams(location.search);
// ?auto=true es el enlace que se graba en la etiqueta NFC (el mismo que usaba la v1).
let registroAutomaticoPendiente = parametros.get('auto') === 'true';
const ENLACE_NFC = new URL('./?auto=true', location.href).href;

let almacen = null;
let registros = new Set();
let mesVisible = new Date();
let ocupado = false;

const vibrar = (ms) => { try { navigator.vibrate?.(ms); } catch { /* sin vibración */ } };
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fechaLarga = (clave) => fechaDeClave(clave).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

$('fecha-hoy').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
if (registroAutomaticoPendiente) $('aviso-nfc-login').classList.remove('oculto');

// ---------------------------------------------------------------- avisos y hoja de confirmación
let temporizadorAviso;
function avisar(texto, esError = false) {
  const aviso = $('aviso');
  aviso.textContent = texto;
  aviso.classList.toggle('error', esError);
  aviso.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), esError ? 4500 : 2600);
}

function confirmar(titulo, texto, accion, peligro = false) {
  const hoja = $('hoja');
  if (typeof hoja.showModal !== 'function') return Promise.resolve(window.confirm(`${titulo}\n${texto}`));
  $('hoja-titulo').textContent = titulo;
  $('hoja-texto').textContent = texto;
  $('hoja-si').textContent = accion;
  $('hoja-si').classList.toggle('boton-peligro', peligro);
  hoja.returnValue = '';
  hoja.showModal();
  return new Promise((resolver) => {
    hoja.addEventListener('close', () => resolver(hoja.returnValue === 'si'), { once: true });
  });
}
// Tocar fuera de la hoja la cierra.
$('hoja').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close('no'); });

// ---------------------------------------------------------------- pestañas
function irA(nombre) {
  for (const seccion of document.querySelectorAll('.pestana')) {
    seccion.classList.toggle('oculto', seccion.id !== `pestana-${nombre}`);
  }
  for (const boton of document.querySelectorAll('.pestana-boton')) {
    const activa = boton.dataset.pestana === nombre;
    boton.classList.toggle('activa', activa);
    if (activa) boton.setAttribute('aria-current', 'page'); else boton.removeAttribute('aria-current');
  }
  $('titulo-pestana').textContent = $(`pestana-${nombre}`).dataset.titulo;
  window.scrollTo({ top: 0 });
}
for (const boton of document.querySelectorAll('.pestana-boton')) {
  boton.addEventListener('click', () => irA(boton.dataset.pestana));
}
$('btn-avatar').addEventListener('click', () => irA('ajustes'));

// ---------------------------------------------------------------- sesión
function mostrarLogin() {
  almacen = null;
  $('vista-app').classList.add('oculto');
  $('vista-login').classList.remove('oculto');
}

async function entrar(nuevoAlmacen, nombre, detalle, foto) {
  almacen = nuevoAlmacen;
  const esDemo = almacen.tipo === 'demo';
  $('usuario-nombre').textContent = nombre;
  $('usuario-detalle').textContent = detalle;
  $('usuario-foto').src = foto || 'img/icono.svg';
  $('cuenta-foto').src = foto || 'img/icono.svg';
  $('etiqueta-demo').classList.toggle('oculto', !esDemo);
  $('btn-salir').textContent = esDemo ? 'Salir del modo demo' : 'Cerrar sesión';
  $('vista-login').classList.add('oculto');
  $('vista-app').classList.remove('oculto');
  irA('hoy');

  try {
    registros = await almacen.cargar();
  } catch (e) {
    console.error('Error al cargar los registros:', e);
    avisar('No se pudieron cargar tus registros', true);
  }
  $('btn-hoy').disabled = false;
  actualizar();
  await registrarDesdeNfc();
}

async function registrarDesdeNfc() {
  if (!registroAutomaticoPendiente || !almacen) return;
  registroAutomaticoPendiente = false;
  // Quita ?auto=true de la barra para que recargar la página no vuelva a marcar el día.
  history.replaceState(null, '', location.pathname);
  const hoy = claveDeFecha(new Date());
  if (registros.has(hoy)) {
    avisar('Hoy ya estaba registrado');
  } else if (await marcar(hoy, true)) {
    avisar('Registrado desde la etiqueta NFC');
  }
}

$('btn-login').addEventListener('click', async () => {
  try {
    await iniciarSesion();
  } catch (e) {
    console.error(e);
    avisar(e.code === 'auth/unauthorized-domain' ? 'Dominio no autorizado en Firebase' : 'No se pudo iniciar sesión', true);
  }
});

const entrarDemo = () => entrar(almacenDemo(), 'Usuario de prueba', 'Datos de ejemplo en este navegador', null);
$('btn-demo').addEventListener('click', entrarDemo);

$('btn-salir').addEventListener('click', async () => {
  const esDemo = almacen?.tipo === 'demo';
  const ok = await confirmar(esDemo ? '¿Salir del modo demo?' : '¿Cerrar sesión?',
    esDemo ? 'Se borrarán los datos de ejemplo.' : 'Tus registros quedan guardados en tu cuenta.',
    esDemo ? 'Salir' : 'Cerrar sesión', true);
  if (!ok) return;
  await almacen?.salir();
  if (esDemo) mostrarLogin();
});

alCambiarSesion((usuario) => {
  if (usuario) {
    entrar(almacenFirebase(usuario), usuario.displayName || 'Mi cuenta', usuario.email || 'Cuenta de Google', usuario.photoURL);
  } else if (!almacen || almacen.tipo !== 'demo') {
    mostrarLogin();
  }
});

if (parametros.has('demo')) entrarDemo();

// ---------------------------------------------------------------- registrar
/** Cambia un día y lo guarda. Si falla, deshace el cambio en pantalla. */
async function marcar(clave, tomado) {
  if (!almacen || ocupado) return false;
  ocupado = true;
  const antes = new Set(registros);
  if (tomado) registros.add(clave); else registros.delete(clave);
  actualizar();
  if (tomado) vibrar(18);
  try {
    await almacen.marcar(clave, tomado);
    return true;
  } catch (e) {
    console.error('Error al guardar:', e);
    registros = antes;
    actualizar();
    avisar('No se pudo guardar. Revisa tu conexión', true);
    return false;
  } finally {
    ocupado = false;
  }
}

$('btn-hoy').addEventListener('click', async () => {
  const hoy = claveDeFecha(new Date());
  if (!registros.has(hoy)) {
    marcar(hoy, true);
  } else if (await confirmar('¿Quitar el registro de hoy?', 'El día quedará como pendiente.', 'Quitar registro', true)) {
    marcar(hoy, false);
  }
});

// ---------------------------------------------------------------- pantalla
function actualizar() {
  const e = calcularEstadisticas(registros);

  const anillo = $('btn-hoy');
  anillo.classList.toggle('hecho', e.tomadoHoy);
  anillo.setAttribute('aria-pressed', String(e.tomadoHoy));
  anillo.setAttribute('aria-label', e.tomadoHoy ? 'Creatina de hoy registrada. Tocar para quitar el registro' : 'Registrar la creatina de hoy');
  $('estado-hoy').textContent = e.tomadoHoy ? 'Registrada hoy' : 'Pendiente';
  $('estado-detalle').textContent = e.tomadoHoy
    ? (e.racha > 1 ? `Llevas ${e.racha} días seguidos` : 'Buen comienzo')
    : 'Toca el círculo o acerca tu etiqueta NFC';

  $('dato-racha').textContent = e.racha;
  $('dato-mejor').textContent = e.mejorRacha;
  $('dato-cumplimiento').textContent = `${e.cumplimiento} %`;
  $('barra-cumplimiento').style.width = `${e.cumplimiento}%`;
  $('dato-tomados').textContent = e.tomados;
  $('dato-no-tomados').textContent = e.noTomados;
  $('dato-primera').textContent = e.primera
    ? fechaDeClave(e.primera).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  dibujarSemana();
  dibujarCalendario();
}

function dibujarSemana() {
  $('semana').replaceChildren(...ultimosDias(registros).map((d) => {
    const el = document.createElement('div');
    el.className = `dia-semana ${d.estado}${d.esHoy ? ' hoy' : ''}`;
    el.innerHTML = `<span>${d.inicial}</span><span class="burbuja">${d.dia}</span>`;
    el.setAttribute('aria-label', `${fechaLarga(d.clave)}: ${d.estado.replace('-', ' ')}`);
    return el;
  }));
}

function dibujarCalendario() {
  const anio = mesVisible.getFullYear();
  const mes = mesVisible.getMonth();
  $('mes-titulo').textContent = mayuscula(new Date(anio, mes).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));

  const hoy = new Date();
  $('mes-siguiente').disabled = anio > hoy.getFullYear() || (anio === hoy.getFullYear() && mes >= hoy.getMonth());

  const contenedor = $('calendario');
  contenedor.replaceChildren(...NOMBRES_DIAS.map((nombre) => {
    const div = document.createElement('div');
    div.className = 'nombre-dia';
    div.textContent = nombre;
    return div;
  }));

  for (const celda of celdasDelMes(anio, mes, registros)) {
    const el = document.createElement(celda.editable ? 'button' : 'div');
    el.className = `dia ${celda.estado}${celda.esHoy ? ' hoy' : ''}`;
    if (celda.dia) el.textContent = celda.dia;
    if (celda.editable) {
      el.type = 'button';
      const tomado = celda.estado === 'tomado';
      const fecha = fechaLarga(celda.clave);
      el.setAttribute('aria-label', `${fecha}: ${tomado ? 'tomado' : 'no tomado'}`);
      el.addEventListener('click', async () => {
        const ok = await confirmar(mayuscula(fecha),
          tomado ? 'Este día está registrado como tomado.' : 'Este día no tiene registro.',
          tomado ? 'Marcar como no tomado' : 'Marcar como tomado', tomado);
        if (ok) marcar(celda.clave, !tomado);
      });
    }
    contenedor.appendChild(el);
  }
}

$('mes-anterior').addEventListener('click', () => {
  mesVisible = new Date(mesVisible.getFullYear(), mesVisible.getMonth() - 1, 1);
  dibujarCalendario();
});
$('mes-siguiente').addEventListener('click', () => {
  mesVisible = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 1);
  dibujarCalendario();
});

// Si la app queda abierta pasada la medianoche, "hoy" cambia.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && almacen) actualizar();
});

// ---------------------------------------------------------------- NFC
$('btn-nfc').addEventListener('click', async () => {
  if (!('NDEFReader' in window)) {
    avisar('Este navegador no graba NFC. Copia el enlace', true);
    return;
  }
  try {
    const lector = new window.NDEFReader();
    avisar('Acerca la etiqueta al teléfono…');
    await lector.write({ records: [{ recordType: 'url', data: ENLACE_NFC }] });
    vibrar([20, 60, 20]);
    avisar('Etiqueta grabada');
  } catch (e) {
    console.error(e);
    avisar(e.name === 'NotAllowedError' ? 'Se necesita permiso para usar NFC' : 'No se pudo grabar la etiqueta', true);
  }
});

$('btn-copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(ENLACE_NFC);
    avisar('Enlace copiado');
  } catch {
    window.prompt('Copia este enlace:', ENLACE_NFC);
  }
});

// ---------------------------------------------------------------- app instalable
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker:', e));
}
