# Roadmap

## App funcional entre celulares (en curso)
- [ ] Recuperar claves antiguas: `POSTGRES_URL` (base con cartas/fotos/música) y `BLOB_READ_WRITE_TOKEN` (archivos subidos). Bloqueado: el usuario debe guardarlas en el formulario seguro.
- [ ] Verificar que la nube vuelve a responder (`configured: true`) y que cartas, fotos, eventos y música se leen otra vez.
- [ ] Avisos reales celular a celular (Web Push con VAPID):
  - [ ] Generar claves VAPID y guardarlas como secretos.
  - [ ] Tabla/almacén de suscripciones push.
  - [ ] Service worker: evento `push` + `notificationclick`.
  - [ ] Botón "Activar avisos" que registra la suscripción.
  - [ ] Enviar aviso al guardar una carta nueva.
- [ ] Sincronización visible sin recargar: refrescar cartas, fotos, eventos y música cada pocos segundos en todas las pantallas.
- [ ] Service worker: no guardar en caché las llamadas de datos (`/_serverFn/`, `/api/`) para que la app instalada vea los cambios al instante.
- [ ] Probar en móvil instalado: escribir carta en un dispositivo → aviso y contenido en el otro.
