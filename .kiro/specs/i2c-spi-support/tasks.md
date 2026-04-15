# Plan de Implementación: Soporte de Buses I2C y SPI

## Visión General

Implementación incremental del soporte I2C y SPI para la aplicación Tauri de control de hardware. Se añaden dos módulos Rust (`i2c_driver.rs` y `spi_driver.rs`) que utilizan las crates `i2cdev` y `spidev` para comunicarse con dispositivos en plataformas Linux embebidas. Los módulos se exponen como comandos Tauri y se integran con el signal-store existente para visualización en tiempo real. Los tests usan Vitest + fast-check en el frontend y `#[cfg(test)]` en Rust.

## Tareas

- [x] 1. Dependencias y estructura base
  - [x] 1.1 Añadir dependencias Rust para I2C y SPI
    - Añadir `i2cdev` y `spidev` en `src-tauri/Cargo.toml` bajo `[dependencies]`
    - Crear archivos vacíos `src-tauri/src/i2c_driver.rs` y `src-tauri/src/spi_driver.rs`
    - Registrar los nuevos módulos en `src-tauri/src/main.rs` con `mod i2c_driver;` y `mod spi_driver;`
    - _Requisitos: 1.1, 1.2_

  - [x] 1.2 Definir tipos de error y estructuras base I2C en Rust
    - Crear `I2cError` con campos `code` y `message` (Serialize, Deserialize)
    - Crear `I2cBusInfo`, `I2cConfig`, `I2cAddressMode`, `I2cSensorReading`
    - Crear `I2cState` con `configs` HashMap y `continuous_readers` HashMap
    - Definir `SharedI2c` como `Arc<Mutex<I2cState>>` y función `create_shared_i2c()`
    - Definir constantes de códigos de error (`ERR_BUS_NOT_FOUND`, `ERR_PERMISSION_DENIED`, etc.)
    - _Requisitos: 1.1, 3.1, 10.1_

  - [x] 1.3 Definir tipos de error y estructuras base SPI en Rust
    - Crear `SpiError` con campos `code` y `message` (Serialize, Deserialize)
    - Crear `SpiBusInfo`, `SpiConfig`, `SpiMode`, `SpiBitOrder`, `SpiTransferResult`
    - Crear `SpiState` con `configs` HashMap y `continuous_readers` HashMap
    - Definir `SharedSpi` como `Arc<Mutex<SpiState>>` y función `create_shared_spi()`
    - Definir constantes de códigos de error
    - _Requisitos: 1.2, 4.1, 10.1_

- [x] 2. Driver I2C — Enumeración, escaneo y configuración
  - [x] 2.1 Implementar enumeración de buses I2C
    - Implementar `list_i2c_buses()` que enumera `/dev/i2c-*` usando `std::fs`
    - Extraer número de bus del sufijo numérico de la ruta
    - Verificar permisos de lectura/escritura y marcar `accessible` con mensaje de error si no es accesible
    - _Requisitos: 1.1, 1.3_

  - [x] 2.2 Implementar escaneo de dispositivos I2C
    - Implementar `scan_i2c_bus(bus: u8)` que sondea direcciones 0x03–0x77
    - Retornar lista de direcciones que respondieron
    - Retornar error descriptivo si el bus no existe o no es accesible
    - _Requisitos: 2.1, 2.3_

  - [x] 2.3 Implementar configuración del bus I2C
    - Implementar `configure_i2c(shared, config)` que valida velocidad de reloj (100, 400, 1000 kHz)
    - Validar modo de direccionamiento (7 bits o 10 bits)
    - Persistir configuración en el estado compartido
    - Retornar error con velocidades válidas si la velocidad es inválida
    - _Requisitos: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Driver SPI — Enumeración y configuración
  - [x] 3.1 Implementar enumeración de buses SPI
    - Implementar `list_spi_buses()` que enumera `/dev/spidev*` usando `std::fs`
    - Extraer número de bus y chip select del patrón `spidevB.C`
    - Verificar permisos y marcar accesibilidad
    - _Requisitos: 1.2, 1.3_

  - [x] 3.2 Implementar configuración del bus SPI
    - Implementar `configure_spi(shared, config)` que valida velocidad de reloj (100 kHz – 50 MHz)
    - Mapear `SpiMode` (0-3) a CPOL/CPHA correspondientes
    - Validar orden de bits (MSB/LSB first)
    - Persistir configuración en el estado compartido
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 4. Checkpoint — Verificar estructuras base y configuración
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 5. Operaciones de lectura y escritura I2C
  - [x] 5.1 Implementar operaciones I2C (read, write, write-then-read)
    - Implementar `i2c_read(bus, address, length)` usando `i2cdev`
    - Implementar `i2c_write(bus, address, data)` usando `i2cdev`
    - Implementar `i2c_write_read(bus, address, write_data, read_length)` como transacción atómica
    - Implementar timeout de 1 segundo para dispositivos que no responden
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.7_

  - [x] 5.2 Implementar tests unitarios Rust para operaciones I2C
    - Test de timeout retornando error `TIMEOUT` con dirección del dispositivo
    - Test de NACK retornando error `DEVICE_NACK` con dirección
    - Test de validación de parámetros de lectura/escritura
    - _Requisitos: 5.4, 10.2_

- [x] 6. Operaciones de transferencia SPI
  - [x] 6.1 Implementar operaciones SPI (transfer, write, read)
    - Implementar `spi_transfer(bus, cs, tx_data)` como transferencia full-duplex usando `spidev`
    - Implementar `spi_write(bus, cs, data)` descartando datos recibidos
    - Implementar `spi_read(bus, cs, length)` enviando bytes cero y retornando datos recibidos
    - Retornar error descriptivo si la transferencia falla
    - _Requisitos: 6.1, 6.2, 6.3, 6.4_

  - [x] 6.2 Implementar tests unitarios Rust para operaciones SPI
    - Test de transferencia full-duplex con datos conocidos
    - Test de error de bus retornando código `BUS_ERROR`
    - Test de lectura generando buffer TX de ceros
    - _Requisitos: 6.3, 6.4_

- [x] 7. Lecturas continuas I2C y SPI
  - [x] 7.1 Implementar lectura continua I2C con hilo de fondo
    - Implementar `start_continuous_reading()` que spawn un `std::thread`
    - Leer dispositivo a la frecuencia de muestreo configurada (1–1000 Hz para I2C)
    - Emitir evento Tauri `i2c-sensor-data` con cada lectura
    - Implementar contador de fallos consecutivos: detener tras 3 fallos y emitir `i2c-continuous-stopped`
    - Implementar `stop_continuous_reading()` que señaliza al hilo para detenerse
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 7.2 Implementar lectura continua SPI con hilo de fondo
    - Implementar `start_continuous_reading()` para SPI con frecuencia 1–10000 Hz
    - Emitir evento Tauri `spi-sensor-data` con cada lectura
    - Implementar mismo patrón de 3 fallos consecutivos y evento `spi-continuous-stopped`
    - Implementar `stop_continuous_reading()` para SPI
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Comandos Tauri — Exponer I2C y SPI al frontend
  - [x] 8.1 Añadir comandos Tauri para I2C en `commands.rs`
    - Añadir comandos: `list_i2c_buses`, `scan_i2c`, `configure_i2c`, `i2c_read`, `i2c_write`, `i2c_write_read`, `start_i2c_continuous`, `stop_i2c_continuous`
    - Cada comando retorna `Result<T, String>` mapeando errores del driver
    - _Requisitos: 1.4, 2.4, 5.5, 5.6_

  - [x] 8.2 Añadir comandos Tauri para SPI en `commands.rs`
    - Añadir comandos: `list_spi_buses`, `configure_spi`, `spi_transfer`, `spi_write`, `spi_read`, `start_spi_continuous`, `stop_spi_continuous`
    - Cada comando retorna `Result<T, String>` mapeando errores del driver
    - _Requisitos: 6.5, 6.6_

  - [x] 8.3 Registrar nuevos módulos y comandos en `main.rs`
    - Crear estados compartidos `SharedI2c` y `SharedSpi` en `main()`
    - Registrar con `.manage()` y añadir todos los comandos nuevos al `invoke_handler`
    - _Requisitos: 1.4, 2.4, 5.5, 6.5_

- [ ] 9. Checkpoint — Verificar backend Rust completo
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [ ] 10. Tipos TypeScript y funciones de validación I2C/SPI
  - [x] 10.1 Añadir tipos TypeScript para I2C y SPI en `types.ts`
    - Añadir interfaces `I2cBusInfo`, `I2cConfig`, `I2cAddressMode`, `I2cSensorReading`
    - Añadir interfaces `SpiBusInfo`, `SpiConfig`, `SpiMode`, `SpiBitOrder`, `SpiTransferResult`
    - _Requisitos: 9.1, 9.2_

  - [x] 10.2 Añadir funciones de validación I2C/SPI en `validation.ts`
    - Implementar `validateI2cClockSpeed(speedKhz)` que acepta solo {100, 400, 1000}
    - Implementar `validateSpiClockSpeed(speedHz)` que acepta [100_000, 50_000_000]
    - Implementar `validateI2cSampleRate(rate)` que acepta [1, 1000]
    - Implementar `validateSpiSampleRate(rate)` que acepta [1, 10000]
    - Implementar `validateI2cAddress7Bit(address)` que acepta [0x03, 0x77]
    - Implementar `validateSpiMode(mode)` que acepta {0, 1, 2, 3}
    - _Requisitos: 3.1, 3.3, 4.1, 4.4, 7.2_

  - [x] 10.3 Implementar funciones de formateo hexadecimal y pretty-print
    - Implementar `formatI2cAddress(address)` que retorna string con prefijo "0x" y 2 dígitos hex
    - Implementar `prettyPrintI2cConfig(config)` con bus, velocidad y modo de direccionamiento
    - Implementar `prettyPrintSpiConfig(config)` con bus, CS, velocidad, modo y orden de bits
    - _Requisitos: 2.2, 9.3_

  - [x] 10.4 Implementar función de conversión de datos crudos de sensor
    - Implementar `convertRawToValue(data, sensorType)` para convertir bytes crudos a unidades estándar
    - Soportar conversión de temperatura (2 bytes big-endian) a °C en rango [-40, 125]
    - Conversión determinista: mismos bytes → mismo valor
    - _Requisitos: 8.3_

  - [x] 10.5 Test de propiedad: parsing de rutas de bus I2C y SPI
    - **Propiedad 1: Parsing de rutas de bus I2C y SPI**
    - Generar conjuntos aleatorios de rutas `/dev/i2c-N` y `/dev/spidevB.C`, ejecutar funciones de parsing, verificar que los números de bus y chip select se extraen correctamente
    - **Valida: Requisitos 1.1, 1.2**

  - [x] 10.6 Test de propiedad: escaneo I2C retorna direcciones en rango válido
    - **Propiedad 2: Escaneo I2C retorna direcciones en rango válido**
    - Generar conjuntos aleatorios de direcciones I2C (incluyendo fuera de rango), simular un escaneo, verificar que todas las direcciones retornadas están en [0x03, 0x77]
    - **Valida: Requisito 2.1**

  - [x] 10.7 Test de propiedad: formateo hexadecimal de direcciones I2C
    - **Propiedad 3: Formateo hexadecimal de direcciones I2C**
    - Generar direcciones I2C aleatorias en [0x03, 0x77], formatear a hex, verificar que el string contiene "0x" y la representación hexadecimal correcta de 2 dígitos
    - **Valida: Requisito 2.2**

  - [x] 10.8 Test de propiedad: validación de velocidad de reloj I2C
    - **Propiedad 4: Validación de velocidad de reloj I2C**
    - Generar enteros aleatorios (incluyendo negativos y valores grandes), verificar que `validateI2cClockSpeed` retorna `true` solo para {100, 400, 1000}
    - **Valida: Requisitos 3.1, 3.3**

  - [x] 10.9 Test de propiedad: validación de velocidad de reloj SPI
    - **Propiedad 5: Validación de velocidad de reloj SPI**
    - Generar enteros aleatorios, verificar que `validateSpiClockSpeed` retorna `true` solo para valores en [100_000, 50_000_000]
    - **Valida: Requisitos 4.1, 4.4**

  - [x] 10.10 Test de propiedad: validación de frecuencia de muestreo I2C y SPI
    - **Propiedad 6: Validación de frecuencia de muestreo I2C y SPI**
    - Generar enteros aleatorios, verificar que `validateI2cSampleRate` acepta [1, 1000] y `validateSpiSampleRate` acepta [1, 10000]
    - **Valida: Requisito 7.2**

  - [x] 10.11 Test de propiedad: lectura SPI genera buffer TX de ceros
    - **Propiedad 7: Lectura SPI genera buffer TX de ceros**
    - Generar longitudes aleatorias N ∈ [1, 4096], crear el buffer TX para lectura SPI, verificar que tiene longitud N y todos los bytes son 0x00
    - **Valida: Requisito 6.3**

- [ ] 11. Checkpoint — Verificar tipos y validaciones TypeScript
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 12. Serialización JSON y pretty-print de configuraciones
  - [x] 12.1 Implementar serialización/deserialización de configuraciones I2C/SPI
    - Verificar que las estructuras Rust con Serde y los tipos TypeScript producen JSON compatible
    - Implementar validación de campos obligatorios al deserializar en el frontend
    - Retornar error `INVALID_CONFIG` con campos problemáticos si el JSON es inválido
    - _Requisitos: 9.1, 9.2, 9.6_

  - [x] 12.2 Test de propiedad: round-trip de serialización JSON de configuración I2C
    - **Propiedad 8: Round-trip de serialización JSON de configuración I2C**
    - Generar `I2cConfig` aleatorias válidas, serializar a JSON con `JSON.stringify`, deserializar con `JSON.parse`, verificar equivalencia profunda
    - **Valida: Requisitos 9.1, 9.2, 9.4**

  - [x] 12.3 Test de propiedad: round-trip de serialización JSON de configuración SPI
    - **Propiedad 9: Round-trip de serialización JSON de configuración SPI**
    - Generar `SpiConfig` aleatorias válidas, serializar a JSON con `JSON.stringify`, deserializar con `JSON.parse`, verificar equivalencia profunda
    - **Valida: Requisitos 9.1, 9.2, 9.5**

  - [x] 12.4 Test de propiedad: pretty-print de configuraciones contiene todos los campos
    - **Propiedad 10: Pretty-print de configuraciones contiene todos los campos**
    - Generar configuraciones I2C y SPI aleatorias, ejecutar pretty-print, verificar que el string contiene todos los campos relevantes (bus, velocidad, modo, etc.)
    - **Valida: Requisitos 9.3, 10.4**

  - [x] 12.5 Test de propiedad: errores de bus contienen código y mensaje descriptivo
    - **Propiedad 11: Errores de bus contienen código y mensaje descriptivo**
    - Generar errores I2C/SPI aleatorios con códigos y mensajes, verificar que ambos campos son no vacíos y que el mensaje contiene información contextual (bus, dirección o CS)
    - **Valida: Requisitos 10.1, 10.4**

- [ ] 13. Checkpoint — Verificar serialización y pretty-print
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 14. Integración frontend — Desktop Adapter y Signal Store
  - [x] 14.1 Extender Desktop Adapter con listeners para eventos I2C/SPI
    - Registrar listeners para eventos Tauri: `i2c-sensor-data`, `spi-sensor-data`, `i2c-error`, `spi-error`, `i2c-continuous-stopped`, `spi-continuous-stopped`
    - Implementar funciones wrapper para invocar comandos Tauri I2C/SPI desde el frontend
    - _Requisitos: 1.4, 2.4, 5.5, 6.5_

  - [x] 14.2 Implementar integración de lecturas de sensor con signal-store
    - Implementar handler `handleI2cSensorData` que crea canal con ID `i2c-{bus}-0x{addr}` y pushea muestras
    - Implementar handler `handleSpiSensorData` que crea canal con ID `spi-{bus}-{cs}` y pushea muestras
    - Usar `convertRawToValue` para convertir datos crudos a unidades de medida estándar
    - Conectar con el mecanismo de alertas existente para umbrales
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 14.3 Test de propiedad: integración de lectura de sensor con signal store
    - **Propiedad 12: Integración de lectura de sensor con signal store**
    - Generar lecturas de sensor aleatorias, procesarlas e insertarlas en el signal store, verificar que el canal existe con el ID correcto (`i2c-{bus}-0x{addr}` o `spi-{bus}-{cs}`) y la muestra está presente
    - **Valida: Requisitos 8.1, 8.2**

  - [x] 14.4 Test de propiedad: conversión de datos crudos de sensor
    - **Propiedad 13: Conversión de datos crudos de sensor**
    - Generar arrays de 2 bytes aleatorios representando datos de temperatura, aplicar la función de conversión, verificar que el resultado está en [-40, 125] °C y es determinista
    - **Valida: Requisito 8.3**

- [x] 15. Integración UI — Componentes del Dashboard
  - [x] 15.1 Extender Dashboard con sección de buses I2C/SPI
    - Añadir sección en el Dashboard para mostrar buses I2C y SPI disponibles
    - Mostrar estado de accesibilidad de cada bus
    - Botón para escanear dispositivos I2C en un bus seleccionado
    - Mostrar lista de direcciones detectadas con representación hexadecimal
    - _Requisitos: 1.1, 1.2, 1.3, 2.2_

  - [x] 15.2 Añadir controles de configuración I2C/SPI en el Dashboard
    - Controles para seleccionar velocidad de reloj I2C (100/400/1000 kHz)
    - Controles para seleccionar modo de direccionamiento I2C (7/10 bits)
    - Controles para configurar bus SPI (velocidad, modo 0-3, orden de bits)
    - Validación de entradas usando funciones de `validation.ts`
    - _Requisitos: 3.1, 3.2, 4.1, 4.2, 4.3_

  - [x] 15.3 Añadir controles de lectura/escritura I2C y transferencia SPI
    - Formulario para lectura I2C (bus, dirección, longitud)
    - Formulario para escritura I2C (bus, dirección, datos en hex)
    - Formulario para transferencia SPI (bus, CS, datos TX en hex)
    - Mostrar resultados como arrays de bytes en formato hex
    - _Requisitos: 5.1, 5.2, 5.5, 5.6, 6.1, 6.5, 6.6_

  - [x] 15.4 Añadir controles de lectura continua de sensores
    - Botón para iniciar/detener lectura continua I2C (con selector de frecuencia de muestreo)
    - Botón para iniciar/detener lectura continua SPI (con selector de frecuencia de muestreo)
    - Los datos de sensores se muestran en los gráficos en tiempo real existentes via signal-store
    - _Requisitos: 7.1, 7.2, 7.3, 8.4_

  - [x] 15.5 Integrar errores I2C/SPI con LogPanel y AlertPanel
    - Registrar errores de bus en el LogPanel existente con timestamp, tipo de bus, dirección/CS y descripción
    - Mostrar alertas de umbral de sensores I2C/SPI en el AlertPanel existente
    - Mostrar notificación cuando una lectura continua se detiene por error
    - _Requisitos: 10.1, 10.2, 10.3, 10.4_

- [ ] 16. Checkpoint final — Verificar integración completa
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido.
- Cada tarea referencia los requisitos específicos para trazabilidad.
- Los checkpoints aseguran validación incremental.
- Los tests de propiedades validan las 13 propiedades universales de correctitud definidas en el diseño.
- Los tests unitarios validan ejemplos específicos y casos borde.
- Los drivers de hardware (`i2cdev`, `spidev`) se mockean en tests para aislar la lógica de la comunicación real con buses.
- El signal-store existente se reutiliza sin cambios — los sensores I2C/SPI se integran como canales adicionales.
