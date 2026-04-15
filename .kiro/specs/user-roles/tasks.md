# Plan de Implementación: Roles de Usuario

## Visión General

Implementación incremental del sistema de roles de usuario para la aplicación Tauri de control de hardware de tanques de flotación. Se añaden dos stores Zustand (`auth-store`, `preset-store`), dos módulos utilitarios (`pin-hash`, `preset-serializer`), cuatro componentes React (`AuthGate`, `PinDialog`, `PresetSelector`, `PresetEditor`) y se integra todo con el Dashboard existente. Los tests usan Vitest + fast-check para propiedades y tests unitarios.

## Tareas

- [x] 1. Módulo utilitario de hash de PIN
  - [x] 1.1 Crear módulo `pin-hash.ts` con funciones de hash y validación
    - Crear archivo `src/utils/pin-hash.ts`
    - Implementar `hashPin(pin: string): Promise<string>` usando `crypto.subtle.digest('SHA-256', ...)` retornando hex string de 64 caracteres
    - Implementar `validatePinFormat(pin: string): boolean` que retorna `true` solo si el PIN consiste en 4-8 dígitos numéricos
    - Implementar `readPinHash(): Promise<string | null>` que lee el archivo `pin-hash.dat` vía Tauri fs API, retornando `null` si no existe
    - Implementar `writePinHash(hash: string): Promise<void>` que escribe el hash en `pin-hash.dat` vía Tauri fs API
    - _Requisitos: 2.3, 2.4, 2.5_

  - [x] 1.2 Test de propiedad: validación de formato de PIN
    - **Propiedad 2: Validación de formato de PIN**
    - Generar cadenas aleatorias (dígitos, letras, símbolos, longitudes variadas), verificar que `validatePinFormat` retorna `true` si y solo si la cadena consiste exclusivamente en dígitos 0-9 y tiene longitud entre 4 y 8 inclusive
    - **Valida: Requisito 2.4**

  - [x] 1.3 Test de propiedad: ida y vuelta de hash de PIN
    - **Propiedad 1: Ida y vuelta de autenticación por PIN**
    - Generar PINs válidos aleatorios (4-8 dígitos), hashear con `hashPin`, verificar que el mismo PIN produce el mismo hash y PINs diferentes producen hashes diferentes
    - **Valida: Requisitos 2.1, 2.2**

- [x] 2. Auth Store (Zustand) con gestión de roles
  - [x] 2.1 Crear `auth-store.ts` con estado y acciones de autenticación
    - Crear archivo `src/store/auth-store.ts`
    - Definir tipo `UserRole = 'expert' | 'user'`
    - Implementar store con estado: `role: UserRole` (inicial `'user'`), `pinHashExists: boolean` (inicial `false`)
    - Implementar `login(pin: string): Promise<boolean>` que hashea el PIN, lo compara con el hash almacenado, y cambia rol a `'expert'` si coincide; mantiene `'user'` si no coincide
    - Implementar `logout(): void` que restablece el rol a `'user'`
    - Implementar `setupPin(pin: string): Promise<void>` que valida formato, hashea y escribe el hash (solo cuando no existe PIN previo)
    - Implementar `changePin(currentPin: string, newPin: string): Promise<boolean>` que verifica el PIN actual antes de aceptar el nuevo
    - Implementar `loadPinStatus(): Promise<void>` que verifica si existe archivo de hash al iniciar
    - _Requisitos: 1.1, 1.2, 1.3, 2.1, 2.2, 2.5, 2.6, 3.1, 3.2, 3.3_

  - [x] 2.2 Test de propiedad: logout siempre restablece a rol usuario
    - **Propiedad 4: Logout siempre restablece a rol usuario**
    - Generar secuencias aleatorias de login/logout, verificar que después de cada `logout()` el rol es siempre `'user'`
    - **Valida: Requisitos 3.1, 3.3**

  - [x] 2.3 Test de propiedad: cambio de PIN requiere PIN actual correcto
    - **Propiedad 3: Cambio de PIN requiere PIN actual correcto**
    - Generar un PIN configurado y pares aleatorios (intento de PIN actual, nuevo PIN), verificar que `changePin` tiene éxito solo si el intento coincide con el PIN configurado
    - **Valida: Requisito 2.6**

  - [x] 2.4 Tests unitarios del auth-store
    - Test: estado inicial tiene `role === 'user'` (Req 1.1, 3.3)
    - Test: flujo de configuración inicial de PIN cuando `pinHashExists === false` (Req 2.5)
    - Test: login con PIN inválido mantiene rol `'user'` y retorna `false` (Req 2.2)
    - _Requisitos: 1.1, 2.2, 2.5, 3.3_

- [x] 3. Checkpoint — Verificar módulo PIN y auth store
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 4. Módulo serializador de presets
  - [x] 4.1 Crear tipos de datos para presets de sesión
    - Crear archivo `src/store/preset-types.ts`
    - Definir interfaces `PresetChannel`, `PresetActuator`, `SessionPreset` según el diseño
    - Definir interfaz `PresetsFile` con campos `version: number` y `presets: SessionPreset[]`
    - _Requisitos: 6.1_

  - [x] 4.2 Crear módulo `preset-serializer.ts` con funciones puras de serialización
    - Crear archivo `src/utils/preset-serializer.ts`
    - Implementar `serializePresets(presets: SessionPreset[]): string` que convierte a JSON con formato `{ version: 1, presets: [...] }`
    - Implementar `deserializePresets(json: string): SessionPreset[]` que parsea JSON y extrae la lista de presets
    - Implementar `validatePreset(preset: unknown): { valid: boolean; errors: string[] }` que verifica campos obligatorios (`name`, `channels` no vacío) y tipos correctos
    - Manejar JSON corrupto/inválido retornando lista vacía en `deserializePresets` y registrando error
    - _Requisitos: 6.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 4.3 Test de propiedad: ida y vuelta de serialización de presets
    - **Propiedad 8: Ida y vuelta de serialización de presets**
    - Generar objetos `SessionPreset` válidos aleatorios con canales y actuadores, serializar con `serializePresets` y deserializar con `deserializePresets`, verificar equivalencia profunda con el original
    - **Valida: Requisitos 7.5, 7.6, 7.7**

  - [x] 4.4 Test de propiedad: validación de preset rechaza campos obligatorios faltantes
    - **Propiedad 6: Validación de preset rechaza campos obligatorios faltantes**
    - Generar objetos parciales de preset donde al menos un campo obligatorio (`name`, `channels`) esté ausente o vacío, verificar que `validatePreset` retorna `{ valid: false }` con errores descriptivos
    - **Valida: Requisito 6.2**

- [x] 5. Preset Store (Zustand) con operaciones CRUD
  - [x] 5.1 Crear `preset-store.ts` con estado y acciones de presets
    - Crear archivo `src/store/preset-store.ts`
    - Implementar store con estado: `presets: SessionPreset[]`, `activePresetId: string | null`, `sessionActive: boolean`, `loading: boolean`, `error: string | null`
    - Implementar `loadPresets(): Promise<void>` que lee el archivo JSON vía Tauri fs API; si no existe, crea archivo vacío; si es corrupto, carga lista vacía
    - Implementar `createPreset(preset: Omit<SessionPreset, 'id'>): Promise<boolean>` que valida campos, verifica nombre no duplicado, genera UUID, y persiste
    - Implementar `updatePreset(id, updates): Promise<boolean>` que valida y persiste cambios
    - Implementar `deletePreset(id): Promise<boolean>` que elimina y persiste (la confirmación se maneja en la UI)
    - Implementar `startSession(presetId): void` que aplica configuración del preset a `signal-store` y `device-store`
    - Implementar `stopSession(): void` que detiene lecturas y restablece actuadores a valores seguros
    - _Requisitos: 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.2, 8.3_

  - [x] 5.2 Test de propiedad: no se permiten presets con nombres duplicados
    - **Propiedad 7: No se permiten presets con nombres duplicados**
    - Generar listas de presets existentes y un nuevo preset cuyo nombre coincida con uno existente, verificar que `createPreset` rechaza la creación y la lista permanece sin cambios
    - **Valida: Requisito 6.4**

  - [x] 5.3 Test de propiedad: iniciar sesión aplica configuración del preset
    - **Propiedad 9: Iniciar sesión aplica configuración del preset**
    - Generar presets válidos con canales y actuadores, invocar `startSession`, verificar que los canales del `signal-store` reflejan las tasas de muestreo y umbrales del preset, y los parámetros del `device-store` reflejan los valores de actuadores
    - **Valida: Requisito 8.2**

  - [x] 5.4 Tests unitarios del preset-store
    - Test: carga de `presets.json` inexistente crea archivo vacío (Req 7.3)
    - Test: carga de `presets.json` corrupto retorna lista vacía (Req 7.4)
    - Test: detener sesión restablece actuadores a valores seguros (Req 8.3)
    - _Requisitos: 7.3, 7.4, 8.3_

- [x] 6. Checkpoint — Verificar stores y serialización
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 7. Componente AuthGate para renderizado condicional por rol
  - [x] 7.1 Crear componente `AuthGate.tsx`
    - Crear archivo `src/components/AuthGate.tsx`
    - Leer `role` del `auth-store`
    - Renderizar condicionalmente componentes hijos según el rol activo:
      - Rol `'expert'`: Dashboard completo, BusPanel, LogPanel, KnobControl, SliderControl, PresetEditor, controles de umbrales
      - Rol `'user'`: PresetSelector, gráficos en tiempo real (solo lectura), AlertPanel, controles de sesión
      - Ambos roles: AlertPanel, botón de login/logout
    - _Requisitos: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 7.2 Test de propiedad: visibilidad de componentes según rol
    - **Propiedad 5: Visibilidad de componentes según rol**
    - Para cada rol (`'expert'`, `'user'`), verificar que la visibilidad de cada componente coincide con la tabla de permisos del diseño
    - **Valida: Requisitos 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4**

- [x] 8. Componente PinDialog para entrada y gestión de PIN
  - [x] 8.1 Crear componente `PinDialog.tsx`
    - Crear archivo `src/components/PinDialog.tsx`
    - Implementar diálogo modal con tres modos: login, setup (primera vez), cambio de PIN
    - Modo login: campo de PIN + botón de verificar, muestra error si PIN incorrecto
    - Modo setup: campo de nuevo PIN + confirmación, valida formato antes de guardar
    - Modo cambio: campo de PIN actual + nuevo PIN + confirmación, verifica PIN actual antes de aceptar
    - Integrar con `auth-store` para las acciones `login`, `setupPin`, `changePin`
    - _Requisitos: 2.1, 2.2, 2.4, 2.5, 2.6_

- [x] 9. Componente PresetSelector para rol usuario
  - [x] 9.1 Crear componente `PresetSelector.tsx`
    - Crear archivo `src/components/PresetSelector.tsx`
    - Mostrar lista de presets disponibles en modo solo lectura con nombre descriptivo
    - Botón para iniciar sesión con el preset seleccionado
    - Botón para detener sesión activa
    - Indicador visual de sesión activa y preset en uso
    - Integrar con `preset-store` para leer presets y controlar sesiones
    - _Requisitos: 5.7, 6.5, 8.1, 8.2, 8.3, 8.4_

- [x] 10. Componente PresetEditor para rol experto
  - [x] 10.1 Crear componente `PresetEditor.tsx`
    - Crear archivo `src/components/PresetEditor.tsx`
    - Formulario para crear nuevo preset: nombre, canales (channelId, name, unit, sampleRateHz, thresholdMin, thresholdMax), actuadores (deviceId, paramName, value)
    - Editar preset existente con los mismos campos
    - Eliminar preset con diálogo de confirmación antes de proceder
    - Validación de campos obligatorios usando `validatePreset` del serializador
    - Integrar con `preset-store` para operaciones CRUD
    - _Requisitos: 4.4, 4.6, 6.1, 6.2, 6.3, 6.4_

- [x] 11. Checkpoint — Verificar componentes de UI
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 12. Integración con Dashboard y App
  - [x] 12.1 Integrar AuthGate en App.tsx
    - Envolver el contenido principal de `App.tsx` con `AuthGate`
    - Añadir `PinDialog` accesible desde ambos roles (botón login/logout en la barra superior)
    - Llamar a `auth-store.loadPinStatus()` al montar la app para detectar si existe PIN configurado
    - Llamar a `preset-store.loadPresets()` al montar la app para cargar presets desde JSON
    - Si no existe PIN, mostrar `PinDialog` en modo setup automáticamente
    - _Requisitos: 1.1, 2.5, 3.2, 7.2_

  - [x] 12.2 Modificar Dashboard para respetar el rol activo
    - Ocultar BusPanel, LogPanel, KnobControl, SliderControl y controles de umbrales cuando el rol es `'user'`
    - Mostrar gráficos de señales en modo solo lectura para rol `'user'`
    - Mostrar PresetSelector para rol `'user'` y PresetEditor para rol `'expert'`
    - _Requisitos: 4.1, 4.2, 4.3, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 12.3 Test de propiedad: alertas de umbral coinciden con umbrales del preset
    - **Propiedad 10: Alertas de umbral coinciden con umbrales del preset**
    - Generar canales con umbrales definidos y valores de señal aleatorios, verificar que se genera alerta si y solo si el valor excede el umbral mínimo o máximo del preset
    - **Valida: Requisito 8.5**

  - [x] 12.4 Tests unitarios de integración
    - Test: PresetSelector muestra lista de presets en modo solo lectura (Req 6.5, 8.1)
    - Test: confirmación requerida antes de eliminar preset (Req 6.3)
    - Test: sesión activa muestra gráficos correspondientes a canales del preset (Req 8.4)
    - _Requisitos: 6.3, 6.5, 8.1, 8.4_

- [x] 13. Checkpoint final — Verificar integración completa
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido.
- Cada tarea referencia los requisitos específicos para trazabilidad.
- Los checkpoints aseguran validación incremental.
- Los tests de propiedades validan las 10 propiedades universales de correctitud definidas en el diseño.
- Los tests unitarios validan ejemplos específicos y casos borde.
- El `auth-store` no persiste la sesión — al reiniciar la app siempre inicia en rol `'user'` (Req 3.2, 3.3).
- El módulo `preset-serializer` es una colección de funciones puras sin estado ni efectos secundarios.
- La API fs de Tauri se mockea en tests para aislar la lógica del sistema de archivos real.
