# Guía de publicación — Autenticación real y reglas de Firestore

Esta guía asume que ya revisaste `AUDITORIA-SEGURIDAD.md` y que los cambios de código ya están en la rama `seguridad` (commits "Draft Firestore security rules", "Remove real student roster...", "Replace PIN login with real Firebase Authentication...").

**No cambies nada en orden distinto al de abajo.** Las reglas de Firestore se aplican al instante en todo internet — publicarlas antes de tiempo deja a todo el personal (incluido tú) sin poder entrar.

---

## Paso 0 — Respaldo (ya hecho, pero verifícalo)

Antes de seguir, confirma que tienes un respaldo reciente de tus datos reales. Si nunca has exportado la base de datos completa:
1. Firebase Console → `inspectoria-libro-digital` → Firestore Database
2. Menú ⋮ (arriba a la derecha) → **Exportar colección** (requiere plan Blaze para exportar a Cloud Storage) — **o**, más simple para un colegio de este tamaño: exporta manualmente desde cada pantalla de la app (Matrícula, Atrasos, etc. ya tienen botones de exportar/PDF) antes de seguir, como respaldo mínimo razonable.

## Paso 1 — Crear las 12 cuentas en Firebase Authentication

Ya te mandé el archivo `cuentas_nuevas.csv` con los 12 correos y contraseñas. Si todavía no lo hiciste:
1. Firebase Console → `inspectoria-libro-digital` → **Authentication** → **Sign-in method** → habilita "Correo electrónico/contraseña"
2. (Opcional pero recomendado) **Settings** → **Password policy** → activa la política con letras + números, mínimo 10 caracteres
3. Pestaña **Users** → **Add user**, uno por uno, con el correo y contraseña exactos del CSV

## Paso 2 — Subir los roles y restaurar la nómina de Retiro

Abre (doble clic, en tu computador) el archivo `herramienta_carga_inicial.html` que te mandé:
1. Botón **"1. Subir los 12 funcionarios (staff_roles)"** — crea el documento de rol de cada cuenta
2. Botón **"2. Restaurar la nómina de Retiro de estudiantes (asis-roster-baseline)"** — repone los ~628 alumnos que saqué del código público, pero esta vez en la base de datos, no en el archivo

Verifica en Firebase Console → Firestore Database → colección `staff_roles` que aparezcan los 12 documentos, y que `store/asis-roster-baseline` tenga el campo `value` con contenido.

**Borra `herramienta_carga_inicial.html` de tu computador cuando termines** (ya cumplió su función, y tiene los nombres de los 628 alumnos adentro).

## Paso 3 — Publicar el código nuevo (ramas `seguridad` → `main`)

Avísame cuando termines los pasos 1 y 2, y yo:
1. Pruebo una vez más que todo sigue bien
2. Subo la rama `seguridad` a GitHub y la fusiono en `main` (con tu autorización explícita en ese momento)

En este punto el sitio público YA usa el login nuevo, pero **las reglas de Firestore siguen abiertas todavía** — es intencional, es el único momento en que el código nuevo y las reglas abiertas conviven, para poder probarlo en vivo sin que nadie quede bloqueado.

## Paso 4 — Probar el login nuevo en producción

Con el código ya publicado:
1. Entra a `https://intranetinspectoria.incosafoficial.cl` (o el dominio que uses)
2. Prueba entrar con 2-3 cuentas distintas (un admin, un editor, el Director) usando los correos/contraseñas del CSV
3. Confirma que cada uno ve lo que le corresponde (el Director solo el resumen, un editor no ve "Agregar funcionario", etc.)
4. Prueba "Cambiar contraseña" con una cuenta
5. Prueba borrar un registro de prueba como admin y confirma que aparece en Firestore → colección `auditoria`

**No sigas al paso 5 hasta que esto funcione para todos.**

## Paso 5 — Publicar las reglas estrictas (el paso que cierra la puerta)

1. Firebase Console → `inspectoria-libro-digital` → Firestore Database → pestaña **Reglas**
2. Borra todo el contenido actual
3. Copia y pega el contenido completo de `firestore.rules` (está en la rama `seguridad`/`main` del repositorio)
4. **Publicar**

Desde este momento, cualquier acceso sin sesión válida (incluyendo el que usábamos para probar con la herramienta de carga) queda bloqueado. Esto es lo que resuelve el hallazgo más grave de la auditoría.

## Paso 6 — Comprobar que todo sigue funcionando

Repite el Paso 4 completo, ahora con las reglas estrictas activas. Si algo falla (por ejemplo, un módulo que yo no haya cubierto en las reglas), **no entres en pánico**: puedes volver atrás de inmediato (ver "Cómo deshacer esto" abajo), y me avisas para revisar qué falta.

---

## Cómo deshacer esto si algo sale mal

- **Las reglas de Firestore dan error/bloquean algo que debería funcionar:** vuelve a la pestaña Reglas en Firebase Console y pega de nuevo `allow read, write: if true;` dentro de `match /{document=**} { }` (igual que estaba antes). Esto reabre el acceso de inmediato mientras investigamos qué regla faltaba — es reversible al instante, sin perder datos.
- **El login nuevo no funciona para alguien:** esa persona puede seguir usando el sitio desde otro dispositivo donde ya tenía sesión PIN iniciada (si el código viejo todavía no se reemplazó ahí), o puedes revertir el commit de `main` en GitHub a la versión anterior (`git revert` del commit "Replace PIN login...") mientras se soluciona.
- **Pediste la limpieza del historial de Git hace unos días** — eso ya quedó hecho y confirmado, no necesita reversión.

---

## Lo que queda pendiente después de esto (ver informe final)

- Agregar los hashes de integridad (SRI) a los scripts de xlsx/jsPDF/Firebase — no pude calcularlos desde este entorno (sin salida a cdnjs/gstatic). Están documentados en el `<!-- comentario -->` junto a la CSP en `index.html`.
- Escapar los campos `nombre` en el HTML (hoy solo escapé los campos de texto libre: observación, motivo, detalle, descripción — que eran el riesgo principal).
- Si quieres migrar también el panel de "Portal Matrícula"/"Control de Atrasos" (sitios aparte) a este mismo esquema de cuentas, eso es trabajo nuevo, no incluido acá.
