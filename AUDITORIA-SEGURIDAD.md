# Auditoría de seguridad — Libro Digital de Inspectoría (INCOSAF)

Fecha: 2026-10-23
Rama: `seguridad` (sin publicar — ver nota al final)
Alcance: `index.html`, `intranet-alumnos/index.html`, `manifest.json`, `sw.js`, historial completo de Git.

Este documento es solo diagnóstico. No se modificó ningún archivo de funcionamiento.

---

## Confirmación del backend

El proyecto usa **Firebase** (Firestore) como base de datos, confirmado en el código:

- Proyecto principal (todos los datos de Inspectoría — matrícula, asistencia, libro de anotaciones, atrasos, suspensiones, funcionarios/PINs): `inspectoria-libro-digital`.
- Proyecto secundario (solo para Retiro de estudiantes y Accidente Escolar, compartido con la intranet Incosaf): `incosafintranet`.
- No se encontró Google Apps Script en ninguno de los dos módulos.

---

## Hallazgos, de más grave a menos grave

### 🔴 CRÍTICO — 1. El proyecto principal de Firebase no usa autenticación en absoluto — CONFIRMADO

**Confirmado el 2026-10-23**, con las reglas reales pegadas por el usuario desde Firebase Console (Firestore Database → Reglas), proyecto `inspectoria-libro-digital`:

```
rules_version = "2";
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

La propia consola de Firebase lo marca en rojo: *"Tus reglas de seguridad están definidas como públicas, por lo que cualquiera puede robar, modificar o borrar información de tu base de datos."* Esto confirma exactamente lo que el código hacía sospechar.

En todo `index.html`, el módulo principal (matrícula, asistencia, libro de anotaciones, atrasos, suspensiones, control de asistencia, funcionarios) **nunca llama a `firebase.auth()`**. Se conecta a Firestore así, apenas carga la página:

```js
firebase.initializeApp(firebaseConfig);
firestoreDb = firebase.firestore();
// ...de ahí en adelante, lecturas y escrituras directas, sin login:
firestoreDb.collection('store').doc(...).get()
firestoreDb.collection('atrasos-registros')...
```

El PIN de 4 dígitos que ves en la pantalla de ingreso **es solo una cortina en el navegador**: decide qué botones mostrar, pero nunca le prueba nada al servidor. Para que la aplicación funcione hoy en producción, las **reglas de Firestore del proyecto `inspectoria-libro-digital` tienen que estar permitiendo lectura y escritura sin sesión** (reglas abiertas o "modo de prueba"), porque si no lo estuvieran, la app ni siquiera cargaría los datos.

**Qué significa en la práctica:** cualquier persona en internet, sin pasar jamás por la pantalla de PIN, puede usar la `apiKey` y el `projectId` (que son públicos y están en el código — eso es normal y esperado) para leer o escribir directamente todos los documentos de Firestore: nombres y RUT de estudiantes, anotaciones, atrasos, suspensiones, PINs (hasheados), fichas de funcionarios. Esto se puede hacer con un par de líneas de JavaScript en la consola del navegador o con una llamada a la API REST de Firestore, sin usar la página en absoluto.

**No puedo confirmarlo al 100% sin ver el texto exacto de las reglas publicadas** (no vivo en este repositorio; se administran aparte, en la consola de Firebase). Pero la ausencia total de `firebase.auth()` en el código hace que sea casi seguro. Te voy a pedir que copies y pegues el contenido de esas reglas (no es secreto, son reglas de acceso, no una clave) para confirmarlo con certeza antes de tocar nada.

### 🔴 CRÍTICO — 2. El repositorio de GitHub es público

Confirmado por la API de GitHub: `"private": false`, `"visibility": "public"`.

Esto significa que cualquier persona puede ver:
- La nómina completa de funcionarios (nombres y cargos) escrita en el código.
- El hash SHA-256 del "código de gestión" (panel de administración) y del código "INCOSAF" (administrar Control de Asistencia).
- Toda la lógica de la aplicación — lo cual en sí no es grave (tú mismo lo señalaste: el código siempre es visible), pero combinado con el hallazgo #1, deja ver exactamente cómo están construidas las puertas, sin que haya cerradura real detrás.

### 🟠 GRAVE — 3. PIN de 4 dígitos, sin límite de intentos, igual al hallazgo de tu colega en otros proyectos del colegio

```js
const DEFAULT_PASSWORD = "0000";
async function staffPinMatches(slug, pass){
  const rec = AUTH[slug];
  if(rec && rec.passwordHash){
    return (await sha256(pass)) === rec.passwordHash;
  }
  return pass === DEFAULT_PASSWORD;   // ← cualquier funcionario sin PIN propio = "0000"
}
```

Problemas concretos:
- **10.000 combinaciones posibles** (4 dígitos), y no hay ningún bloqueo ni demora tras varios intentos fallidos en el navegador.
- El login **prueba el PIN ingresado contra TODOS los funcionarios, uno por uno**, hasta encontrar uno que coincida. Esto reduce aún más el esfuerzo real de adivinar: basta con que el PIN coincida con *cualquiera* de los funcionarios, no con uno en particular.
- Cualquier funcionario que **no se haya configurado un PIN propio todavía** sigue aceptando `"0000"` como entrada válida.
- Como ya viste en el hallazgo #1, aunque este PIN estuviera perfectamente protegido, hoy no es la verdadera puerta — la verdadera puerta (Firestore) parece no tener cerradura.

### 🟠 GRAVE — 4. Hashes de "clave maestra" sin sal (salt), con palabras del diccionario

```js
const GESTION_CODE_HASH = "9e6296be2bb963df7daa2b230a2a1f34b1bcd655c10fa6c1f6c05782fee95791";
// (panel de gestión de funcionarios)

const CONTROL_ASIS_ADMIN_HASH = "a440271cecec7a0c14582539fbc0d3fbf544425fdac9ab943c05640d35304e08";
// = sha256("INCOSAF")  (botón "Administrar" en Control de Asistencia)
```

Guardar el *hash* en vez del texto plano es mejor que nada, pero:
- No se usa "sal" (salt), así que cualquiera puede probar offline, en microsegundos, millones de palabras/combinaciones contra ese hash — no hace falta ni conexión a internet.
- `"INCOSAF"` es literalmente el nombre del colegio: es de las primeras 50 palabras que probaría cualquier herramienta de este tipo.
- Como el repositorio es público (hallazgo #2), estos hashes están a la vista de cualquiera, sin necesidad de inspeccionar nada en vivo.

### 🟡 MEDIO — 5. Texto libre insertado sin escapar en el HTML (riesgo de XSS almacenado)

Se encontraron **decenas** de lugares donde texto que vienen de campos libres (observaciones, motivos, detalles, descripciones) o nombres se insertan directamente en `innerHTML` sin pasar por ninguna función de escape. Ejemplo real, en la tabla de Atrasos (`index.html`, función de historial):

```js
tbody.innerHTML = list.map(a=>`
  <tr>
    ...
    <td>${a.observacion}</td>
    ...
  </tr>`).join('');
```

Si alguien lograra escribir un texto como `<img src=x onerror="...">` en un campo de observación (hoy en día esto es alcanzable por cualquier funcionario autenticado por PIN, y es **todavía más alcanzable** si el hallazgo #1 se confirma, porque no haría ni falta el PIN), ese código se ejecutaría en el navegador de cualquier otro funcionario que abra esa pantalla. Con eso se podría, por ejemplo, robar la sesión de un Inspector General o leer datos de otros estudiantes silenciosamente.

Nota positiva: en el módulo de Control de Asistencia sí existe una función de escape (`caEsc()`) y se usa de forma consistente ahí. Y en Retiro/Accidente Escolar también hay un `escapeHtml()` propio. El problema está concentrado en los módulos más antiguos: Atrasos, Libro de anotaciones, Suspensiones, Matrícula.

### 🟡 MEDIO — 6. No hay política de seguridad de contenido (CSP)

No existe ninguna etiqueta `<meta http-equiv="Content-Security-Policy">`. Sin CSP, si en algún momento se colara un script no autorizado (por el hallazgo #5, o por cualquier otra vía), el navegador no tiene ninguna barrera adicional que lo frene.

### 🟡 MEDIO — 7. Librerías externas cargadas sin verificación de integridad (SRI)

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js"></script>
```

Se cargan desde internet en cada visita, sin un atributo `integrity="sha384-..."` que compruebe que el archivo no fue alterado. Si alguna vez uno de esos proveedores fuera comprometido, el navegador ejecutaría lo que sea que llegue, sin aviso.

### 🟢 MENOR — 8. Falta `.gitignore`

No existe un archivo `.gitignore`. Revisé **todo el historial de Git, en todas las ramas**, buscando Excel, CSV, PDF, imágenes con datos, archivos `.env` o claves de servicio (`service-account`, `private_key`) — **no se encontró ninguno**. Esto es una buena noticia: nunca se subió un archivo con datos reales de estudiantes. Pero falta la barrera preventiva para que esto siga así en el futuro.

---

## Lo que NO se encontró (buenas noticias)

- ❌ Ninguna clave de servicio de Firebase (`service-account`, `private_key`) en el código ni en el historial.
- ❌ Ningún archivo Excel/CSV/PDF/imagen con datos reales de estudiantes, en el repositorio ni en su historial — **no aplica el protocolo de "detente y avísame" de la regla 7**.
- ❌ No se usa Google Apps Script en ningún módulo — no hay nada que endurecer ahí.
- ❌ La `apiKey` de Firebase, tal como corresponde, no es un secreto por diseño — su exposición en el código no es, por sí sola, un hallazgo.

---

## Resumen de gravedad

| # | Hallazgo | Gravedad | ¿Dato de estudiantes en riesgo? |
|---|---|---|---|
| 1 | Firestore del proyecto principal sin Authentication | 🔴 Crítico | Sí, directo |
| 2 | Repositorio público | 🔴 Crítico (amplifica el resto) | Indirecto |
| 3 | PIN de 4 dígitos sin límite de intentos | 🟠 Grave | Sí |
| 4 | Hashes sin sal de claves maestras | 🟠 Grave | Indirecto |
| 5 | HTML sin escapar (XSS almacenado) | 🟡 Medio | Sí, si se explota |
| 6 | Sin CSP | 🟡 Medio | Indirecto |
| 7 | Librerías externas sin SRI | 🟡 Medio | Indirecto |
| 8 | Sin `.gitignore` | 🟢 Menor | Preventivo |

**El hallazgo #1 es, por lejos, el más importante.** Los hallazgos #3, #4 y #5 son reales y hay que corregirlos, pero si las reglas de Firestore ya estuvieran bien puestas (autenticación obligatoria + permisos por rol), el impacto de todos los demás bajaría muchísimo, porque dejarían de ser la única barrera.

---

## Lo próximo (necesito una cosa tuya antes de seguir)

Para confirmar el hallazgo #1 con certeza y diseñar las reglas correctas (punto 4 de tu plan), necesito que me compartas el contenido actual de las reglas de Firestore de `inspectoria-libro-digital`. No es secreto — son reglas de acceso, no una clave — pero quiero que tú decidas copiarlas y pegarlas, en vez de que yo pruebe nada contra el proyecto real (como pediste en la regla 2).

**Cómo encontrarlas:**
1. Entra a https://console.firebase.google.com
2. Abre el proyecto **inspectoria-libro-digital**
3. En el menú lateral: **Firestore Database** → pestaña **Reglas** (Rules)
4. Copia todo el texto que aparece ahí y pégamelo

Con eso confirmo el hallazgo #1 y empezamos con el punto 2 de tu plan (autenticación) y el punto 4 (reglas estrictas), siempre en la rama `seguridad`, sin tocar nada real todavía.

---

## Nota sobre publicación de este informe

Esta rama (`seguridad`) **se mantiene solo en este entorno de trabajo, sin subir a GitHub**, a propósito: como el repositorio es público, publicar un documento que detalla exactamente las vulnerabilidades (incluyendo que el acceso a la base de datos parece estar abierto) sería anunciarlo al mundo antes de arreglarlo. Esta rama solo se sube cuando tú lo autorices explícitamente, y probablemente convenga hacerlo recién cuando las correcciones ya estén aplicadas.
