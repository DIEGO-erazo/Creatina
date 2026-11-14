# Historial de versiones

## [2.0.0] - 2026-11-14

### Añadido
- Grabar la etiqueta NFC desde la app (Web NFC API), con el enlace a la vista para otros teléfonos.
- Aviso al registrar desde la etiqueta. El parámetro `?auto=true` se quita de la dirección para que recargar la página no vuelva a marcar el día.
- Corregir días pasados tocándolos en el calendario.
- Estadísticas nuevas: mejor racha y porcentaje de cumplimiento.
- Modo demo sin cuenta (`?demo` o el botón *Probar sin cuenta*).
- App instalable (manifest e íconos) y apertura sin internet (service worker).
- Caché local de Firestore: se puede registrar sin conexión.
- Reglas de seguridad de Firestore (`firestore.rules`).
- Pruebas automáticas de la lógica y GitHub Actions.
- README, licencia e historial.

### Corregido
- **Día equivocado por la noche.** Las fechas se calculaban en UTC (`toISOString`), así que en El Salvador, después de las 6 p. m., se marcaba el día siguiente. Ahora todo usa la hora local.
- La primera fecha se leía con `new Date('AAAA-MM-DD')`, que la interpreta en UTC y la mostraba un día antes.
- Hoy aparecía en rojo (no tomado) antes de terminar el día. Ahora se muestra como pendiente.
- Guardar reescribía la lista completa de días. Con dos dispositivos abiertos, uno podía borrar lo del otro. Ahora se cambia un solo día con `arrayUnion` y `arrayRemove`.
- Si guardar fallaba, la pantalla mostraba el día como registrado igual. Ahora se deshace el cambio y se avisa.
- En navegadores que bloquean la ventana emergente de Google se usa la redirección.

### Cambiado
- El código se separó en módulos: lógica pura (`registro.js`), datos (`almacen.js`) e interfaz (`app.js`).
- La app vive en la raíz (`/Creatina/`). La dirección antigua `creatina/creatinav1.html` redirige a la nueva, así que las etiquetas ya grabadas siguen funcionando.

## [1.0.0] - 2026-08-21

- Inicio de sesión con Google y registro diario en Cloud Firestore.
- Registro automático con `?auto=true`, el enlace que se graba en la etiqueta NFC.
- Racha actual, días tomados y no tomados, y calendario mensual.
