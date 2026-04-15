# Documento de Requisitos — Controlador de Hardware con Tauri

## Introducción

Este documento define los requisitos para una aplicación de escritorio y web construida con Tauri, diseñada para controlar y monitorear dispositivos de hardware (luces, actuadores, audio) y leer señales analógicas (temperatura, voltaje, corriente, audio, presión, entre otras). La aplicación se comunica con el hardware a través de USB/Serial o ADC, ofrece una interfaz con gráficos en tiempo real, controles tipo perilla/slider y dashboards con métricas. Funciona como aplicación de escritorio en Windows, Mac y Linux, y también como aplicación web desplegada en AWS S3 + CloudFront, donde la comunicación con hardware se realiza mediante Web Serial API o WebUSB.

## Glosario

- **App**: La aplicación Tauri que funciona como escritorio y como web.
- **Dispositivo**: Cualquier hardware conectado (luces, actuadores, módulos de audio).
- **Señal_Analógica**: Dato de entrada proveniente de un sensor (temperatura, voltaje, corriente, audio, presión, etc.).
- **Canal_Serial**: Conexión USB/Serial entre la App y un Dispositivo.
- **Canal_ADC**: Conexión mediante convertidor analógico-digital para lectura de Señales_Analógicas.
- **Dashboard**: Vista principal de la App que muestra métricas, gráficos y controles.
- **Gráfico_Tiempo_Real**: Componente visual que muestra datos de Señales_Analógicas actualizados continuamente.
- **Control_Perilla**: Componente de interfaz tipo perilla rotativa para ajustar parámetros del Dispositivo.
- **Control_Slider**: Componente de interfaz tipo deslizador para ajustar parámetros del Dispositivo.
- **Web_Serial_API**: API del navegador que permite comunicación serial desde la versión web.
- **WebUSB**: API del navegador que permite comunicación USB desde la versión web.
- **Comando_Hardware**: Instrucción enviada desde la App hacia un Dispositivo para modificar su estado.

## Requisitos

### Requisito 1: Descubrimiento y Conexión de Dispositivos

**Historia de Usuario:** Como usuario, quiero descubrir y conectar dispositivos de hardware, para poder controlarlos y monitorearlos desde la App.

#### Criterios de Aceptación

1. WHEN el usuario inicia un escaneo de puertos, THE App SHALL listar todos los Dispositivos disponibles en los puertos USB/Serial del sistema.
2. WHEN el usuario selecciona un Dispositivo de la lista, THE App SHALL establecer una conexión a través del Canal_Serial correspondiente.
3. WHILE la App mantiene una conexión activa con un Dispositivo, THE App SHALL mostrar el estado de conexión como "Conectado" en el Dashboard.
4. IF la conexión con un Dispositivo se pierde inesperadamente, THEN THE App SHALL mostrar una notificación de desconexión y actualizar el estado a "Desconectado" en un plazo de 2 segundos.
5. WHEN el usuario solicita desconectar un Dispositivo, THE App SHALL cerrar el Canal_Serial y liberar el puerto correspondiente.

### Requisito 2: Control de Luces

**Historia de Usuario:** Como usuario, quiero controlar luces conectadas, para poder ajustar su brillo e intensidad desde la App.

#### Criterios de Aceptación

1. WHEN el usuario ajusta un Control_Slider de brillo, THE App SHALL enviar un Comando_Hardware al Dispositivo de luces con el valor de brillo seleccionado (rango 0–100%).
2. WHEN el Dispositivo de luces confirma la recepción del Comando_Hardware, THE App SHALL actualizar el valor mostrado en el Control_Slider para reflejar el estado real del Dispositivo.
3. WHEN el usuario activa o desactiva una luz mediante un botón de encendido/apagado, THE App SHALL enviar el Comando_Hardware correspondiente al Dispositivo.
4. IF el Dispositivo de luces no responde al Comando_Hardware en un plazo de 3 segundos, THEN THE App SHALL mostrar un mensaje de error indicando que el Dispositivo no respondió.

### Requisito 3: Control de Actuadores

**Historia de Usuario:** Como usuario, quiero controlar actuadores conectados, para poder ajustar su posición o velocidad desde la App.

#### Criterios de Aceptación

1. WHEN el usuario ajusta un Control_Perilla o Control_Slider de un actuador, THE App SHALL enviar un Comando_Hardware con el valor de posición o velocidad seleccionado al Dispositivo correspondiente.
2. WHILE un actuador está en movimiento, THE App SHALL mostrar el estado actual de posición o velocidad en el Dashboard, actualizado cada 100 milisegundos.
3. WHEN el usuario establece un valor límite para un actuador, THE App SHALL restringir los valores enviados al Dispositivo dentro del rango definido por el usuario.
4. IF un actuador reporta una condición de sobrecarga, THEN THE App SHALL detener el envío de Comandos_Hardware al actuador y mostrar una alerta de sobrecarga en el Dashboard.

### Requisito 4: Control de Audio

**Historia de Usuario:** Como usuario, quiero controlar módulos de audio conectados, para poder ajustar volumen y parámetros de audio desde la App.

#### Criterios de Aceptación

1. WHEN el usuario ajusta un Control_Slider de volumen, THE App SHALL enviar un Comando_Hardware con el nivel de volumen seleccionado al Dispositivo de audio.
2. WHEN el usuario selecciona una fuente de audio o canal, THE App SHALL enviar el Comando_Hardware de selección al Dispositivo de audio.
3. WHILE el Dispositivo de audio está reproduciendo, THE App SHALL mostrar el nivel de señal de audio en un Gráfico_Tiempo_Real en el Dashboard.
4. IF el Dispositivo de audio reporta un error de reproducción, THEN THE App SHALL mostrar un mensaje de error descriptivo en el Dashboard.

### Requisito 5: Lectura de Señales Analógicas

**Historia de Usuario:** Como usuario, quiero leer señales analógicas de sensores, para poder monitorear variables físicas como temperatura, voltaje, corriente, audio y presión.

#### Criterios de Aceptación

1. WHEN un Canal_ADC está conectado, THE App SHALL leer las Señales_Analógicas disponibles y mostrar sus valores en el Dashboard.
2. THE App SHALL muestrear cada Señal_Analógica a una frecuencia configurable por el usuario (mínimo 1 Hz, máximo 10 kHz).
3. WHEN una nueva muestra de Señal_Analógica es recibida, THE App SHALL actualizar el Gráfico_Tiempo_Real correspondiente con el nuevo valor.
4. THE App SHALL mostrar las unidades de medida correctas para cada tipo de Señal_Analógica (°C para temperatura, V para voltaje, A para corriente, Pa para presión, dB para audio).
5. IF el valor de una Señal_Analógica excede un umbral configurado por el usuario, THEN THE App SHALL generar una alerta visual en el Dashboard.

### Requisito 6: Gráficos en Tiempo Real

**Historia de Usuario:** Como usuario, quiero ver gráficos en tiempo real de las señales y estados del hardware, para poder analizar el comportamiento de los dispositivos.

#### Criterios de Aceptación

1. THE App SHALL renderizar Gráficos_Tiempo_Real con una latencia de visualización inferior a 200 milisegundos desde la recepción de datos.
2. WHEN el usuario selecciona un rango de tiempo en un Gráfico_Tiempo_Real, THE App SHALL ajustar el eje temporal para mostrar únicamente los datos dentro del rango seleccionado.
3. THE App SHALL permitir al usuario superponer múltiples Señales_Analógicas en un mismo Gráfico_Tiempo_Real.
4. WHEN el usuario pausa un Gráfico_Tiempo_Real, THE App SHALL detener la actualización visual y mantener los datos visibles en el último estado capturado.
5. WHEN el usuario reanuda un Gráfico_Tiempo_Real pausado, THE App SHALL continuar la actualización visual desde el punto actual de datos en tiempo real.

### Requisito 7: Dashboard y Métricas

**Historia de Usuario:** Como usuario, quiero un dashboard con métricas consolidadas, para poder tener una vista general del estado de todos los dispositivos y señales.

#### Criterios de Aceptación

1. THE App SHALL mostrar en el Dashboard el estado de conexión de cada Dispositivo registrado.
2. THE App SHALL mostrar en el Dashboard los valores actuales de todas las Señales_Analógicas activas.
3. WHEN el usuario agrega o remueve un widget del Dashboard, THE App SHALL persistir la configuración del layout para sesiones futuras.
4. THE App SHALL calcular y mostrar métricas derivadas (valor mínimo, máximo y promedio) para cada Señal_Analógica durante la sesión activa.
5. WHEN el usuario exporta los datos del Dashboard, THE App SHALL generar un archivo en formato CSV con los datos de las Señales_Analógicas y marcas de tiempo.

### Requisito 8: Compatibilidad Multiplataforma (Escritorio)

**Historia de Usuario:** Como usuario, quiero usar la aplicación en Windows, Mac y Linux, para poder trabajar desde cualquier sistema operativo de escritorio.

#### Criterios de Aceptación

1. THE App SHALL compilar y ejecutar como aplicación nativa en Windows 10 o superior, macOS 12 o superior, y distribuciones Linux con soporte para GTK 3.
2. THE App SHALL acceder a puertos USB/Serial del sistema operativo anfitrión mediante las APIs nativas de Tauri.
3. WHILE la App se ejecuta en modo escritorio, THE App SHALL utilizar el backend de Rust de Tauri para la comunicación con Dispositivos a través de Canal_Serial y Canal_ADC.

### Requisito 9: Compatibilidad Web

**Historia de Usuario:** Como usuario, quiero usar la aplicación desde un navegador web, para poder monitorear y controlar hardware sin instalar software adicional.

#### Criterios de Aceptación

1. THE App SHALL funcionar como aplicación web accesible desde navegadores compatibles con Web_Serial_API (Chrome 89 o superior, Edge 89 o superior).
2. WHEN el usuario accede a la versión web, THE App SHALL solicitar permisos del navegador para acceder a Web_Serial_API o WebUSB antes de intentar la conexión con un Dispositivo.
3. WHILE la App se ejecuta en modo web, THE App SHALL utilizar Web_Serial_API o WebUSB para la comunicación con Dispositivos.
4. THE App SHALL ser desplegable como sitio estático en AWS S3 con distribución CloudFront.
5. IF el navegador del usuario no soporta Web_Serial_API ni WebUSB, THEN THE App SHALL mostrar un mensaje informativo indicando los navegadores compatibles.

### Requisito 10: Capa de Comunicación Unificada

**Historia de Usuario:** Como usuario, quiero que la aplicación funcione de manera consistente tanto en escritorio como en web, para no tener que aprender dos interfaces diferentes.

#### Criterios de Aceptación

1. THE App SHALL exponer una interfaz de comunicación abstracta que encapsule las diferencias entre Canal_Serial nativo (Tauri/Rust) y Web_Serial_API/WebUSB.
2. WHEN la App detecta el entorno de ejecución (escritorio o web), THE App SHALL seleccionar automáticamente el adaptador de comunicación correspondiente sin intervención del usuario.
3. THE App SHALL garantizar que los Comandos_Hardware enviados produzcan el mismo resultado independientemente del entorno de ejecución (escritorio o web).

### Requisito 11: Serialización y Deserialización de Comandos

**Historia de Usuario:** Como usuario, quiero que los comandos enviados al hardware sean confiables y consistentes, para evitar errores de comunicación.

#### Criterios de Aceptación

1. THE App SHALL serializar cada Comando_Hardware en un formato binario definido antes de enviarlo al Dispositivo a través del Canal_Serial.
2. WHEN la App recibe una respuesta del Dispositivo, THE App SHALL deserializar la respuesta binaria en una estructura de datos interpretable.
3. THE App SHALL formatear (pretty-print) las estructuras de Comando_Hardware en formato legible para depuración en un panel de log.
4. FOR ALL Comandos_Hardware válidos, serializar y luego deserializar un Comando_Hardware SHALL producir un objeto equivalente al original (propiedad de ida y vuelta).
5. IF la App recibe datos del Dispositivo que no corresponden a un formato válido, THEN THE App SHALL registrar el error en el panel de log y descartar los datos corruptos.
