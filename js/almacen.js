// Dónde se guardan los registros: Firebase (cuenta de Google) o el navegador (modo demo).
// Las dos opciones tienen la misma forma: cargar(), marcar(clave, tomado) y salir().

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { esClaveValida, registrosDeEjemplo } from './registro.js';

const COLECCION = 'creatine_users';   // mismo nombre que la v1: los datos anteriores se conservan

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Caché local persistente: se puede registrar sin internet y se sincroniza al volver la conexión.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export function alCambiarSesion(callback) {
  getRedirectResult(auth).catch((e) => console.warn('Inicio de sesión por redirección:', e.code));
  return onAuthStateChanged(auth, callback);
}

export async function iniciarSesion() {
  const proveedor = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, proveedor);
  } catch (e) {
    // Algunos navegadores móviles bloquean la ventana emergente: se usa redirección.
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
      await signInWithRedirect(auth, proveedor);
      return;
    }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    throw e;
  }
}

/** Registros guardados en Firestore: un documento por usuario con la lista de días. */
export function almacenFirebase(usuario) {
  const ref = doc(db, COLECCION, usuario.uid);
  return {
    tipo: 'firebase',
    async cargar() {
      const snap = await getDoc(ref);
      const logs = snap.exists() ? snap.data().logs ?? [] : [];
      return new Set(logs.filter(esClaveValida));
    },
    // arrayUnion/arrayRemove cambian un solo día: dos teléfonos no se pisan los datos.
    async marcar(clave, tomado) {
      await setDoc(ref, { logs: tomado ? arrayUnion(clave) : arrayRemove(clave) }, { merge: true });
    },
    salir: () => signOut(auth),
  };
}

/** Modo demo: datos de ejemplo en localStorage, sin cuenta. */
export function almacenDemo() {
  const LLAVE = 'creatina-demo';
  const leer = () => {
    try {
      const guardado = JSON.parse(localStorage.getItem(LLAVE));
      if (Array.isArray(guardado)) return new Set(guardado.filter(esClaveValida));
    } catch { /* sin almacenamiento: se usan datos nuevos */ }
    return registrosDeEjemplo();
  };
  let registros = leer();
  const guardar = () => {
    try { localStorage.setItem(LLAVE, JSON.stringify([...registros])); } catch { /* modo privado */ }
  };
  return {
    tipo: 'demo',
    async cargar() { return new Set(registros); },
    async marcar(clave, tomado) {
      if (tomado) registros.add(clave); else registros.delete(clave);
      guardar();
    },
    async salir() {
      try { localStorage.removeItem(LLAVE); } catch { /* nada */ }
      registros = registrosDeEjemplo();
    },
  };
}
