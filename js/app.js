// Interfaz: conecta la pantalla con el almacén de datos y la lógica de registro.
import { alCambiarSesion, iniciarSesion, almacenFirebase, almacenDemo } from './almacen.js';
import { claveDeFecha, fechaDeClave, calcularEstadisticas, celdasDelMes } from './registro.js';

const $ = (id) => document.getElementById(id);
const NOMBRES_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const parametros = new URLSearchParams(location.search);
// ?auto=true es el enlace que se graba en la etiqueta NFC (el mismo que usaba la v1).
let registroAutomaticoPendiente = parametros.get('auto') === 'true';
const ENLACE_NFC = new URL('./?auto=true', location.href).href;

let almacen = null;
let registros = new Set();
let mesVisible = new Date();
let ocupado = false;

$('fecha-hoy').textContent = new Date().toLocaleDateString('es-ES', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});
$('enlace-nfc').textContent = ENLACE_NFC;
if (registroAutomaticoPendiente) $('aviso-nfc-login').classList.remove('oculto');

// ---------------------------------------------------------------- avisos
let temporizadorAviso;
function avisar(texto, esError = false) {
  const aviso = $('aviso');
  aviso.textContent = texto;
  aviso.classList.toggle('error', esError);
  aviso.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), esError ? 5000 : 3000);
}

// ---------------------------------------------------------------- sesión
function mostrarLogin() {
  almacen = null;
  $('vista-app').classList.add('oculto');
  $('vista-login').classList.remove('oculto');
}

async function entrar(nuevoAlmacen, nombre, foto) {
  almacen = nuevoAlmacen;
  $('usuario-nombre').textContent = nombre;
  $('usuario-foto').src = foto || 'img/icono.svg';
  $('etiqueta-demo').classList.toggle('oculto', almacen.tipo !== 'demo');
  $('btn-salir').textContent = almacen.tipo === 'demo' ? 'Salir del modo demo' : 'Cerrar sesión';
  $('vista-login').classList.add('oculto');
  $('vista-app').classList.remove('oculto');

  try {
    registros = await almacen.cargar();
  } catch (e) {
    console.error('Error al cargar los registros:', e);
    avisar('No se pudieron cargar tus registros. Revisa tu conexión.', true);
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
    avisar('La creatina de hoy ya estaba registrada ✅');
  } else if (await marcar(hoy, true)) {
    avisar('¡Registrada desde la etiqueta NFC! 💊');
  }
}

$('btn-login').addEventListener('click', async () => {
  try {
    await iniciarSesion();
  } catch (e) {
    console.error(e);
    avisar(e.code === 'auth/unauthorized-domain'
      ? 'Este dominio no está autorizado en Firebase Authentication.'
      : 'No se pudo iniciar sesión. Inténtalo de nuevo.', true);
  }
});

$('btn-demo').addEventListener('click', () => entrar(almacenDemo(), 'Usuario de prueba', null));

$('btn-salir').addEventListener('click', async () => {
  await almacen?.salir();
  if (almacen?.tipo === 'demo') mostrarLogin();
});

alCambiarSesion((usuario) => {
  if (usuario) {
    entrar(almacenFirebase(usuario), usuario.displayName || usuario.email, usuario.photoURL);
  } else if (!almacen || almacen.tipo !== 'demo') {
    mostrarLogin();
  }
});

if (parametros.has('demo')) entrar(almacenDemo(), 'Usuario de prueba', null);

// ---------------------------------------------------------------- registrar
/** Cambia un día y lo guarda. Si falla, deshace el cambio en pantalla. */
async function marcar(clave, tomado) {
  if (!almacen || ocupado) return false;
  ocupado = true;
  $('btn-hoy').disabled = true;
  const antes = new Set(registros);
  if (tomado) registros.add(clave); else registros.delete(clave);
  actualizar();
  try {
    await almacen.marcar(clave, tomado);
    return true;
  } catch (e) {
    console.error('Error al guardar:', e);
    registros = antes;
    actualizar();
    avisar('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.', true);
    return false;
  } finally {
    ocupado = false;
    $('btn-hoy').disabled = false;
  }
}

$('btn-hoy').addEventListener('click', () => {
  const hoy = claveDeFecha(new Date());
  marcar(hoy, !registros.has(hoy));
});

// ---------------------------------------------------------------- pantalla
function actualizar() {
  const e = calcularEstadisticas(registros);
  const estado = $('estado-hoy');
  estado.className = `estado ${e.tomadoHoy ? 'completado' : 'pendiente'}`;
  estado.textContent = e.tomadoHoy ? '¡Creatina de hoy registrada! 💊' : 'Pendiente por tomar hoy ⏳';
  $('btn-hoy').textContent = e.tomadoHoy ? 'Marcar hoy como no tomada' : 'Registrar creatina de hoy';

  $('dato-racha').textContent = e.racha;
  $('dato-mejor').textContent = e.mejorRacha;
  $('dato-cumplimiento').textContent = `${e.cumplimiento}%`;
  $('dato-tomados').textContent = e.tomados;
  $('dato-no-tomados').textContent = e.noTomados;
  $('dato-primera').textContent = e.primera
    ? fechaDeClave(e.primera).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
    : '--';
  dibujarCalendario();
}

function dibujarCalendario() {
  const anio = mesVisible.getFullYear();
  const mes = mesVisible.getMonth();
  const titulo = new Date(anio, mes).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  $('mes-titulo').textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);

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
      const fecha = fechaDeClave(celda.clave).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
      const tomado = celda.estado === 'tomado';
      el.setAttribute('aria-label', `${fecha}: ${tomado ? 'tomado' : 'no tomado'}`);
      el.addEventListener('click', () => {
        const pregunta = tomado ? `¿Marcar el ${fecha} como NO tomado?` : `¿Marcar el ${fecha} como tomado?`;
        if (celda.esHoy || confirm(pregunta)) marcar(celda.clave, !tomado);
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

// Si la página queda abierta pasada la medianoche, "hoy" cambia.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && almacen) actualizar();
});

// ---------------------------------------------------------------- NFC
$('btn-nfc').addEventListener('click', async () => {
  if (!('NDEFReader' in window)) {
    avisar('Tu navegador no puede grabar NFC. Usa Chrome en Android o copia el enlace de abajo.', true);
    return;
  }
  try {
    const lector = new window.NDEFReader();
    avisar('Acerca la etiqueta NFC a la parte trasera del teléfono…');
    await lector.write({ records: [{ recordType: 'url', data: ENLACE_NFC }] });
    avisar('¡Etiqueta grabada! Acércala al teléfono para registrar tu toma. 🎉');
  } catch (e) {
    console.error(e);
    avisar(e.name === 'NotAllowedError' ? 'Se necesita permiso para usar NFC.' : 'No se pudo grabar la etiqueta. Inténtalo de nuevo.', true);
  }
});
if (!('NDEFReader' in window)) $('nfc-ayuda').textContent = 'Este navegador no puede grabar etiquetas. Grábales este enlace con una app como NFC Tools (Android o iPhone):';

// ---------------------------------------------------------------- app instalable
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker:', e));
}
