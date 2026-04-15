# Plan de Implementación: Controlador de Hardware con Tauri

## Visión General

Implementación incremental de una aplicación Tauri v2 con frontend React + TypeScript y backend Rust para control de hardware y monitoreo de señales analógicas. Se sigue el patrón adaptador para la capa de comunicación unificada, con Zustand para estado global, uPlot para gráficos en tiempo real, y serialización binaria custom para comandos de hardware. Los tests usan Vitest + fast-check.

## Tareas

- [x] 1. Estructura del proyecto e interfaces base
  - [x] 1.1 Crear estructura de directorios y archivos base del proyecto
    - Inicializar proyecto Tauri v2 con React + TypeScript + Vite
    - Crear directorios: `src/communication/`, `src/store/`, `src/components/`, `src/utils/`, `src/__tests__/`
    - Instalar dependencias: `zustand`, `uplot`, `fast-check`, `vitest`, `@testing-library/react`
    - Configurar `vitest` en `vite.config.ts`
    - _Requisitos: 8.1, 9.4_

  - [x] 1.2 Definir tipos e interfaces compartidas de comunicación
    - Crear `src/communication/types.ts` con `CommandType` enum, `HardwareCommand`, `PortInfo`
    - Crear `src/communication/hardware-port.ts` con la interfaz `IHardwarePort` (listPorts, connect, disconnect, write, onData, onError, onDisconnect, isConnected)
    - _Requisitos: 10.1, 11.1_

  - [x] 1.3 Definir tipos de estado de dispositivos y señales
    - Crear tipos `ConnectionStatus`, `DeviceState` en `src/store/device-store.ts`
    - Crear tipos `SignalUnit`, `SignalChannel`, `SignalSample`, `SignalMetrics` en `src/store/signal-store.ts`
    - Crear tipo `DashboardLayout` con estructura de widgets
    - _Requisitos: 1.3, 5.4, 7.1_

- [x] 2. Serialización binaria de comandos
  - [x] 2.1 Implementar funciones de serialización y deserialización
    - Crear `src/communication/serialization.ts` con `serialize()`, `deserialize()` y `prettyPrint()`
    - Formato binario: [1 byte tipo] [2 bytes longitud payload big-endian] [N bytes payload]
    - Validar datos insuficientes y payload incompleto en `deserialize`, lanzando errores descriptivos
    - _Requisitos: 11.1, 11.2, 11.5_

  - [x] 2.2 Test de propiedad: round-trip de serialización
    - **Propiedad 1: Round-trip de serialización de comandos**
    - Generar `HardwareCommand` aleatorios con tipos y payloads válidos, verificar que `deserialize(serialize(cmd))` produce un objeto equivalente al original
    - **Valida: Requisitos 11.1, 11.2, 11.4**

  - [x] 2.3 Test de propiedad: construcción correcta de comandos
    - **Propiedad 2: Construcción correcta de comandos para cualquier tipo y valor de parámetro**
    - Generar valores aleatorios para cada tipo de comando (brillo 0–100, posición uint16, velocidad uint16, volumen 0–100, canal audio, toggle), construir el comando, verificar que el payload contiene el valor correcto
    - **Valida: Requisitos 2.1, 3.1, 4.1**

  - [x] 2.4 Test de propiedad: pretty-print contiene tipo y payload
    - **Propiedad 10: Pretty-print de comandos contiene tipo y payload**
    - Generar comandos aleatorios, ejecutar `prettyPrint`, verificar que el string contiene el nombre del tipo y los bytes hex del payload
    - **Valida: Requisito 11.3**

  - [x] 2.5 Test de propiedad: datos inválidos producen error
    - **Propiedad 11: Datos binarios inválidos producen error de deserialización**
    - Generar secuencias de bytes inválidas (< 3 bytes, payload incompleto), verificar que `deserialize` lanza error descriptivo
    - **Valida: Requisito 11.5**

- [x] 3. Checkpoint — Verificar serialización
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 4. Capa de comunicación unificada
  - [x] 4.1 Implementar detector de entorno y factory de adaptadores
    - Crear `src/communication/environment.ts` con `detectEnvironment()` y `createHardwarePort()`
    - Detectar `window.__TAURI__` para escritorio, `navigator.serial` para Web Serial, `navigator.usb` para WebUSB
    - Lanzar error descriptivo si ninguna API está disponible
    - _Requisitos: 10.2, 9.5_

  - [x] 4.2 Test de propiedad: selección correcta de adaptador según entorno
    - **Propiedad 12: Selección correcta de adaptador según entorno**
    - Generar combinaciones aleatorias de flags de entorno (`__TAURI__`, `navigator.serial`, `navigator.usb`), verificar que se selecciona el adaptador correcto o se lanza error
    - **Valida: Requisito 10.2**

  - [x] 4.3 Implementar adaptador de escritorio (DesktopAdapter)
    - Crear `src/communication/desktop-adapter.ts` que implementa `IHardwarePort`
    - Usar `@tauri-apps/api` para invocar comandos Rust (`invoke`)
    - Implementar listPorts, connect, disconnect, write usando Tauri commands
    - Registrar listeners para datos entrantes y eventos de desconexión
    - _Requisitos: 8.2, 8.3, 10.1_

  - [x] 4.4 Implementar adaptador Web Serial (WebSerialAdapter)
    - Crear `src/communication/web-serial-adapter.ts` que implementa `IHardwarePort`
    - Usar `navigator.serial` para solicitar permisos, abrir puerto, leer/escribir datos
    - Manejar solicitud de permisos del navegador antes de conectar
    - _Requisitos: 9.1, 9.2, 9.3_

  - [x] 4.5 Implementar adaptador WebUSB (WebUSBAdapter)
    - Crear `src/communication/web-usb-adapter.ts` que implementa `IHardwarePort`
    - Usar `navigator.usb` para solicitar permisos, abrir dispositivo, transferir datos
    - _Requisitos: 9.2, 9.3_

- [x] 5. Backend Rust — Comandos Tauri
  - [x] 5.1 Implementar comunicación serial nativa en Rust
    - Crear `src-tauri/src/serial_port.rs` con funciones para listar puertos, abrir, cerrar, leer y escribir usando la crate `serialport`
    - _Requisitos: 1.1, 1.2, 1.5, 8.2_

  - [x] 5.2 Implementar driver ADC nativo en Rust
    - Crear `src-tauri/src/adc_driver.rs` con funciones para leer señales analógicas desde ADC
    - _Requisitos: 5.1, 8.3_

  - [x] 5.3 Exponer comandos Tauri al frontend
    - Crear `src-tauri/src/commands.rs` con comandos Tauri: `list_ports`, `connect_port`, `disconnect_port`, `write_data`, `read_adc`
    - Registrar comandos en `src-tauri/src/main.rs`
    - Implementar emisión de eventos Tauri para datos entrantes y desconexión
    - _Requisitos: 8.2, 8.3, 10.1_

- [x] 6. Checkpoint — Verificar capa de comunicación
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 7. Stores de estado (Zustand)
  - [x] 7.1 Implementar store de dispositivos
    - Crear `src/store/device-store.ts` con Zustand store
    - Acciones: `addDevice`, `removeDevice`, `updateDeviceStatus`, `updateDeviceParam`, `setDeviceError`
    - Integrar con la capa de comunicación para enviar comandos al cambiar parámetros
    - Manejar timeout de 3 segundos para respuestas de dispositivos
    - _Requisitos: 1.3, 1.4, 2.2, 2.4_

  - [x] 7.2 Implementar store de señales analógicas
    - Crear `src/store/signal-store.ts` con Zustand store
    - Acciones: `addChannel`, `removeChannel`, `pushSample`, `setThresholds`, `setSampleRate`
    - Implementar buffer circular para muestras (limitar tamaño en memoria)
    - _Requisitos: 5.1, 5.2, 5.3_

  - [x] 7.3 Implementar funciones de validación y clamping
    - Crear función `clampValue(value, min, max)` para restringir valores de actuadores dentro de límites
    - Crear función `validateSampleRate(rate)` para validar frecuencia de muestreo [1, 10000] Hz
    - Crear función `checkThreshold(value, min, max)` para detección de alertas por umbral
    - Crear función `filterByTimeRange(samples, tStart, tEnd)` para filtrado temporal
    - _Requisitos: 3.3, 5.2, 5.5, 6.2_

  - [x] 7.4 Test de propiedad: clamping de valores de actuador
    - **Propiedad 3: Clamping de valores de actuador dentro de límites**
    - Generar valores numéricos y rangos `[min, max]` aleatorios, verificar que `clampValue` retorna un valor dentro del rango
    - **Valida: Requisito 3.3**

  - [x] 7.5 Test de propiedad: validación de frecuencia de muestreo
    - **Propiedad 4: Validación de frecuencia de muestreo**
    - Generar frecuencias aleatorias (incluyendo fuera de rango), verificar que solo se aceptan valores entre 1 y 10000 Hz
    - **Valida: Requisito 5.2**

  - [x] 7.6 Test de propiedad: detección de umbral genera alerta
    - **Propiedad 5: Detección de umbral genera alerta**
    - Generar valores de señal y umbrales aleatorios, verificar que la alerta se genera si y solo si el valor excede los umbrales
    - **Valida: Requisito 5.5**

  - [x] 7.7 Test de propiedad: filtrado de datos por rango temporal
    - **Propiedad 6: Filtrado de datos por rango temporal**
    - Generar arrays de muestras con timestamps aleatorios y rangos de tiempo, verificar que solo se incluyen muestras dentro del rango
    - **Valida: Requisito 6.2**

- [x] 8. Checkpoint — Verificar stores y validaciones
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 9. Utilidades: métricas y exportación CSV
  - [x] 9.1 Implementar cálculo de métricas
    - Crear `src/utils/metrics.ts` con `computeMetrics(values)` que retorna `{ min, max, avg }`
    - Manejar caso de array vacío retornando `{ min: 0, max: 0, avg: 0 }`
    - _Requisito: 7.4_

  - [x] 9.2 Test de propiedad: correctitud de métricas derivadas
    - **Propiedad 7: Correctitud de métricas derivadas (min, max, promedio)**
    - Generar arrays de números aleatorios, verificar que min <= todos los valores, max >= todos, avg = sum/count
    - **Valida: Requisito 7.4**

  - [x] 9.3 Implementar exportación a CSV
    - Crear `src/utils/csv-export.ts` con `exportToCSV(channels)` que genera string CSV
    - Header con nombres de canales y unidades, filas con timestamps y valores
    - Implementar descarga del archivo usando `Blob` API
    - _Requisito: 7.5_

  - [x] 9.4 Test de propiedad: exportación CSV contiene todos los datos
    - **Propiedad 9: Exportación CSV contiene todos los datos**
    - Generar canales con muestras aleatorias, exportar a CSV, parsear el CSV, verificar que contiene todos los timestamps y valores
    - **Valida: Requisito 7.5**

- [x] 10. Componentes UI del Dashboard
  - [x] 10.1 Implementar componente Dashboard principal
    - Crear `src/components/Dashboard.tsx` con layout de widgets configurable
    - Mostrar estado de conexión de cada dispositivo registrado
    - Mostrar valores actuales de señales analógicas activas
    - Implementar persistencia de layout en `localStorage`
    - _Requisitos: 7.1, 7.2, 7.3_

  - [x] 10.2 Test de propiedad: round-trip de persistencia de layout
    - **Propiedad 8: Round-trip de persistencia de layout del dashboard**
    - Generar layouts de dashboard aleatorios, guardar en localStorage (mock), leer, verificar equivalencia
    - **Valida: Requisito 7.3**

  - [x] 10.3 Implementar componente de lista de dispositivos
    - Crear `src/components/DeviceList.tsx` que muestra dispositivos disponibles y conectados
    - Botones para escanear puertos, conectar y desconectar
    - Mostrar estado de conexión con indicador visual
    - _Requisitos: 1.1, 1.2, 1.3, 1.5_

  - [x] 10.4 Implementar componentes de control (Knob y Slider)
    - Crear `src/components/KnobControl.tsx` con control rotativo SVG/Canvas para ajustar parámetros
    - Crear `src/components/SliderControl.tsx` con control deslizador para brillo, volumen, posición
    - Conectar controles al device-store para enviar comandos al cambiar valores
    - _Requisitos: 2.1, 3.1, 4.1_

  - [x] 10.5 Implementar componente de gráfico en tiempo real
    - Crear `src/components/RealTimeChart.tsx` usando uPlot
    - Soportar múltiples series de datos superpuestas
    - Implementar selección de rango temporal
    - Implementar pausa y reanudación del gráfico
    - Latencia de visualización inferior a 200ms
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 10.6 Implementar panel de alertas y panel de log
    - Crear `src/components/AlertPanel.tsx` para mostrar alertas de umbral, sobrecarga y errores
    - Crear `src/components/LogPanel.tsx` para mostrar log de depuración con errores de serialización (timestamp, bytes hex, descripción)
    - _Requisitos: 3.4, 4.4, 5.5, 11.3, 11.5_

- [x] 11. Integración y cableado de componentes
  - [x] 11.1 Integrar capa de comunicación con stores
    - Conectar `createHardwarePort()` con el device-store
    - Registrar callbacks `onData` para deserializar respuestas y actualizar stores
    - Registrar callbacks `onError` y `onDisconnect` para manejar errores y desconexiones
    - Implementar flujo completo: UI → Store → Comunicación → Dispositivo → Store → UI
    - _Requisitos: 1.4, 2.2, 10.2, 10.3_

  - [x] 11.2 Integrar señales analógicas con gráficos y métricas
    - Conectar signal-store con RealTimeChart para actualización continua
    - Conectar signal-store con Dashboard para mostrar métricas (min, max, avg)
    - Conectar alertas de umbral con AlertPanel
    - Integrar exportación CSV con botón en Dashboard
    - _Requisitos: 5.3, 7.2, 7.4, 7.5_

  - [x] 11.3 Ensamblar App.tsx con todos los componentes
    - Crear `src/App.tsx` con layout principal que incluye Dashboard, DeviceList, controles, gráficos, alertas y log
    - Inicializar detección de entorno y creación de adaptador al montar la app
    - Manejar caso de navegador no compatible (mostrar mensaje informativo)
    - _Requisitos: 9.5, 10.2_

- [x] 12. Checkpoint final — Verificar integración completa
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido.
- Cada tarea referencia los requisitos específicos para trazabilidad.
- Los checkpoints aseguran validación incremental.
- Los tests de propiedades validan propiedades universales de correctitud definidas en el diseño.
- Los tests unitarios validan ejemplos específicos y casos borde.
- Los adaptadores de hardware se mockean en tests para aislar la lógica de comunicación real.
