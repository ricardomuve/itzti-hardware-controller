# Documento de Requisitos — Soporte de Buses I2C y SPI

## Introducción

Este documento define los requisitos para extender la aplicación Tauri de control de hardware con soporte para buses I2C y SPI. Actualmente la aplicación se comunica con dispositivos únicamente a través de USB/Serial y lectura ADC. Esta extensión permite conectar sensores y periféricos adicionales (BME280, ADS1115, BMP280, displays, DACs, ADCs de alta velocidad) mediante los buses I2C y SPI disponibles en plataformas Linux embebidas como Raspberry Pi (a través de `/dev/i2c-*` y `/dev/spidev*`). Las operaciones I2C/SPI se exponen como comandos Tauri al frontend y se integran con el store de señales existente para visualización en tiempo real.

## Glosario

- **App**: La aplicación Tauri que funciona como escritorio y como web.
- **Bus_I2C**: Bus de comunicación Inter-Integrated Circuit accesible en Linux a través de dispositivos `/dev/i2c-*`.
- **Bus_SPI**: Bus de comunicación Serial Peripheral Interface accesible en Linux a través de dispositivos `/dev/spidev*`.
- **Dispositivo_I2C**: Sensor o periférico conectado al Bus_I2C, identificado por una dirección de 7 o 10 bits.
- **Dispositivo_SPI**: Periférico conectado al Bus_SPI, seleccionado mediante una línea Chip Select (CS).
- **Driver_I2C**: Módulo Rust del backend que gestiona la comunicación con el Bus_I2C.
- **Driver_SPI**: Módulo Rust del backend que gestiona la comunicación con el Bus_SPI.
- **Configuración_I2C**: Parámetros del Bus_I2C: velocidad de reloj (clock speed) y modo de direccionamiento (7 bits o 10 bits).
- **Configuración_SPI**: Parámetros del Bus_SPI: velocidad de reloj, polaridad de reloj (CPOL), fase de reloj (CPHA) y orden de bits.
- **Modo_SPI**: Combinación de CPOL y CPHA que define el comportamiento de la señal de reloj SPI (Modo 0, 1, 2 o 3).
- **Escaneo_I2C**: Proceso de detección de Dispositivos_I2C presentes en el Bus_I2C mediante sondeo de todas las direcciones válidas.
- **Transacción_I2C**: Operación de lectura o escritura de bytes hacia un Dispositivo_I2C en una dirección específica.
- **Transacción_SPI**: Operación de transferencia full-duplex de bytes con un Dispositivo_SPI.
- **Lectura_Sensor**: Dato obtenido de un Dispositivo_I2C o Dispositivo_SPI que representa una magnitud física (temperatura, presión, humedad, voltaje, etc.).
- **Comando_Tauri**: Función Rust expuesta al frontend mediante el mecanismo `#[tauri::command]`.
- **Store_Señales**: Store Zustand existente (`signal-store.ts`) que almacena canales de señales analógicas y sus muestras.
- **Dashboard**: Vista principal de la App que muestra métricas, gráficos y controles.

## Requisitos

### Requisito 1: Descubrimiento de Buses I2C y SPI Disponibles

**Historia de Usuario:** Como usuario, quiero descubrir qué buses I2C y SPI están disponibles en el sistema, para poder seleccionar el bus correcto para mis dispositivos.

#### Criterios de Aceptación

1. WHEN el usuario solicita listar buses disponibles, THE Driver_I2C SHALL enumerar todos los dispositivos `/dev/i2c-*` presentes en el sistema y retornar su número de bus y ruta.
2. WHEN el usuario solicita listar buses disponibles, THE Driver_SPI SHALL enumerar todos los dispositivos `/dev/spidev*` presentes en el sistema y retornar su número de bus, número de chip select y ruta.
3. IF un bus I2C o SPI listado no tiene permisos de lectura/escritura para el usuario actual, THEN THE App SHALL indicar el bus como no accesible junto con un mensaje descriptivo del error de permisos.
4. THE App SHALL exponer la enumeración de buses I2C y SPI como Comandos_Tauri invocables desde el frontend.

### Requisito 2: Escaneo de Dispositivos en Bus I2C

**Historia de Usuario:** Como usuario, quiero escanear el bus I2C para descubrir qué sensores y periféricos están conectados, para poder identificarlos y configurarlos.

#### Criterios de Aceptación

1. WHEN el usuario inicia un Escaneo_I2C en un bus específico, THE Driver_I2C SHALL sondear todas las direcciones válidas (0x03–0x77 en modo 7 bits) y retornar la lista de direcciones que respondieron.
2. WHEN el Escaneo_I2C finaliza, THE App SHALL mostrar en el Dashboard la lista de direcciones detectadas con su representación hexadecimal.
3. IF el bus I2C especificado no existe o no es accesible, THEN THE Driver_I2C SHALL retornar un error descriptivo indicando la causa (bus no encontrado o permisos insuficientes).
4. THE App SHALL exponer el Escaneo_I2C como un Comando_Tauri invocable desde el frontend.

### Requisito 3: Configuración del Bus I2C

**Historia de Usuario:** Como usuario, quiero configurar los parámetros del bus I2C, para poder comunicarme correctamente con sensores que requieren configuraciones específicas.

#### Criterios de Aceptación

1. WHEN el usuario establece la velocidad de reloj del Bus_I2C, THE Driver_I2C SHALL configurar la velocidad de comunicación al valor especificado (rango válido: 100 kHz, 400 kHz o 1 MHz).
2. WHEN el usuario selecciona el modo de direccionamiento, THE Driver_I2C SHALL utilizar direccionamiento de 7 bits o 10 bits según la selección del usuario.
3. IF el usuario especifica una velocidad de reloj fuera del rango válido, THEN THE Driver_I2C SHALL rechazar la configuración y retornar un error indicando las velocidades válidas.
4. THE App SHALL persistir la última Configuración_I2C utilizada para cada bus durante la sesión activa.

### Requisito 4: Configuración del Bus SPI

**Historia de Usuario:** Como usuario, quiero configurar los parámetros del bus SPI, para poder comunicarme correctamente con periféricos que requieren modos SPI específicos.

#### Criterios de Aceptación

1. WHEN el usuario establece la velocidad de reloj del Bus_SPI, THE Driver_SPI SHALL configurar la velocidad de comunicación al valor especificado (rango válido: 100 kHz a 50 MHz).
2. WHEN el usuario selecciona un Modo_SPI (0, 1, 2 o 3), THE Driver_SPI SHALL configurar la polaridad de reloj (CPOL) y la fase de reloj (CPHA) correspondientes al modo seleccionado.
3. WHEN el usuario selecciona el orden de bits, THE Driver_SPI SHALL transmitir los datos en orden MSB-first o LSB-first según la selección del usuario.
4. IF el usuario especifica una velocidad de reloj fuera del rango válido, THEN THE Driver_SPI SHALL rechazar la configuración y retornar un error indicando el rango permitido.
5. THE App SHALL persistir la última Configuración_SPI utilizada para cada bus y chip select durante la sesión activa.

### Requisito 5: Operaciones de Lectura y Escritura I2C

**Historia de Usuario:** Como usuario, quiero leer y escribir datos en dispositivos I2C, para poder obtener lecturas de sensores y configurar registros de periféricos.

#### Criterios de Aceptación

1. WHEN el usuario solicita una lectura I2C, THE Driver_I2C SHALL leer la cantidad de bytes especificada desde la dirección del Dispositivo_I2C indicado y retornar los datos leídos.
2. WHEN el usuario solicita una escritura I2C, THE Driver_I2C SHALL escribir los bytes proporcionados en la dirección del Dispositivo_I2C indicado.
3. WHEN el usuario solicita una operación de escritura seguida de lectura (write-then-read), THE Driver_I2C SHALL ejecutar ambas operaciones como una transacción atómica sin liberar el bus entre ellas.
4. IF un Dispositivo_I2C no responde a una Transacción_I2C dentro de un plazo de 1 segundo, THEN THE Driver_I2C SHALL retornar un error de timeout indicando la dirección del dispositivo que no respondió.
5. THE App SHALL exponer las operaciones de lectura, escritura y escritura-lectura I2C como Comandos_Tauri invocables desde el frontend.
6. THE App SHALL serializar las respuestas de Transacciones_I2C como arrays de bytes en formato JSON para el frontend.
7. FOR ALL secuencias de bytes válidas, escribir datos en un registro de un Dispositivo_I2C y luego leer el mismo registro SHALL retornar datos equivalentes a los escritos (propiedad de ida y vuelta, aplicable a registros de lectura/escritura).

### Requisito 6: Operaciones de Transferencia SPI

**Historia de Usuario:** Como usuario, quiero transferir datos con dispositivos SPI, para poder comunicarme con displays, DACs y ADCs de alta velocidad.

#### Criterios de Aceptación

1. WHEN el usuario solicita una transferencia SPI, THE Driver_SPI SHALL ejecutar una transferencia full-duplex enviando los bytes proporcionados y retornando los bytes recibidos simultáneamente.
2. WHEN el usuario solicita una escritura SPI sin lectura, THE Driver_SPI SHALL enviar los bytes proporcionados al Dispositivo_SPI descartando los datos recibidos.
3. WHEN el usuario solicita una lectura SPI, THE Driver_SPI SHALL enviar bytes cero y retornar los datos recibidos del Dispositivo_SPI.
4. IF la transferencia SPI falla por un error del bus, THEN THE Driver_SPI SHALL retornar un error descriptivo indicando la causa del fallo.
5. THE App SHALL exponer las operaciones de transferencia SPI como Comandos_Tauri invocables desde el frontend.
6. THE App SHALL serializar las respuestas de Transacciones_SPI como arrays de bytes en formato JSON para el frontend.

### Requisito 7: Lectura Continua de Sensores I2C/SPI

**Historia de Usuario:** Como usuario, quiero leer sensores conectados por I2C o SPI de forma continua, para poder monitorear variables físicas en tiempo real.

#### Criterios de Aceptación

1. WHEN el usuario inicia una lectura continua de un sensor, THE App SHALL leer el Dispositivo_I2C o Dispositivo_SPI a la frecuencia de muestreo configurada y emitir cada Lectura_Sensor como un evento Tauri.
2. THE App SHALL soportar frecuencias de muestreo configurables para lecturas continuas de sensores (mínimo 1 Hz, máximo 1000 Hz para I2C; mínimo 1 Hz, máximo 10000 Hz para SPI).
3. WHEN el usuario detiene la lectura continua de un sensor, THE App SHALL cesar las operaciones de lectura en el bus correspondiente y dejar de emitir eventos.
4. IF una lectura continua falla en tres intentos consecutivos, THEN THE App SHALL detener la lectura continua y emitir un evento de error indicando el sensor y la causa del fallo.
5. THE App SHALL ejecutar las lecturas continuas en un hilo de fondo (background thread) para evitar bloquear el hilo principal de la aplicación.

### Requisito 8: Integración con Store de Señales

**Historia de Usuario:** Como usuario, quiero ver los datos de sensores I2C/SPI en los gráficos en tiempo real existentes, para poder analizar las lecturas junto con las señales ADC.

#### Criterios de Aceptación

1. WHEN la App recibe una Lectura_Sensor de un Dispositivo_I2C o Dispositivo_SPI, THE App SHALL crear un canal en el Store_Señales con el identificador del sensor, la unidad de medida correspondiente y la frecuencia de muestreo configurada.
2. WHEN una nueva Lectura_Sensor es recibida, THE App SHALL insertar la muestra en el canal correspondiente del Store_Señales con su timestamp y valor convertido a la unidad de medida.
3. THE App SHALL convertir los datos crudos de cada sensor a unidades de medida estándar (°C, Pa, %, V) según el tipo de sensor configurado.
4. WHILE un canal de sensor I2C/SPI está activo en el Store_Señales, THE App SHALL mostrar los datos en un Gráfico_Tiempo_Real en el Dashboard, utilizando los mismos componentes de visualización que las señales ADC existentes.
5. IF el valor de una Lectura_Sensor excede un umbral configurado por el usuario, THEN THE App SHALL generar una alerta visual en el Dashboard, utilizando el mismo mecanismo de alertas existente.

### Requisito 9: Serialización de Configuraciones I2C/SPI

**Historia de Usuario:** Como usuario, quiero que las configuraciones de buses I2C/SPI se transmitan de forma confiable entre frontend y backend, para evitar errores de comunicación interna.

#### Criterios de Aceptación

1. THE App SHALL serializar las estructuras de Configuración_I2C y Configuración_SPI en formato JSON para la comunicación entre frontend y backend vía Comandos_Tauri.
2. THE App SHALL deserializar las configuraciones JSON recibidas del frontend en las estructuras Rust correspondientes, validando todos los campos obligatorios.
3. THE App SHALL formatear (pretty-print) las configuraciones I2C/SPI en formato legible para depuración en el panel de log existente.
4. FOR ALL configuraciones I2C válidas, serializar a JSON y luego deserializar SHALL producir una estructura equivalente a la original (propiedad de ida y vuelta).
5. FOR ALL configuraciones SPI válidas, serializar a JSON y luego deserializar SHALL producir una estructura equivalente a la original (propiedad de ida y vuelta).
6. IF el frontend envía una configuración JSON con campos faltantes o valores inválidos, THEN THE App SHALL retornar un error descriptivo indicando los campos problemáticos.

### Requisito 10: Manejo de Errores de Bus

**Historia de Usuario:** Como usuario, quiero recibir mensajes de error claros cuando ocurran problemas con los buses I2C o SPI, para poder diagnosticar y resolver los problemas de conexión.

#### Criterios de Aceptación

1. IF el Driver_I2C o Driver_SPI encuentra un error de acceso al bus (permisos, bus ocupado, dispositivo no encontrado), THEN THE App SHALL retornar un error con un código identificable y un mensaje descriptivo en español.
2. IF una Transacción_I2C recibe un NACK (no acknowledgment) del dispositivo, THEN THE Driver_I2C SHALL retornar un error indicando que el dispositivo en la dirección especificada no respondió.
3. IF el bus I2C o SPI se desconecta durante una operación, THEN THE App SHALL detectar la desconexión, detener las lecturas continuas activas y notificar al frontend mediante un evento de error.
4. THE App SHALL registrar todos los errores de bus I2C y SPI en el panel de log existente con timestamp, tipo de bus, dirección o chip select del dispositivo, y descripción del error.
