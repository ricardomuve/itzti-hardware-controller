# Documento de Requisitos — Roles de Usuario

## Introducción

Este documento define los requisitos para el sistema de roles de usuario en la aplicación de escritorio Tauri para control de hardware de tanques de flotación. El sistema establece dos roles diferenciados — Experto y Usuario Final — con autenticación local mediante PIN, permitiendo al experto configurar completamente el hardware y crear presets de sesión, mientras que el usuario final opera la aplicación de forma simplificada seleccionando presets predefinidos.

## Glosario

- **Aplicación**: La aplicación de escritorio Tauri para control de hardware (i2c-spi-support).
- **Rol_Experto**: Rol con acceso completo a configuración de hardware, actuadores, umbrales, presets y logs de depuración.
- **Rol_Usuario**: Rol con vista simplificada limitada a selección de presets, visualización de gráficos en tiempo real, inicio/parada de sesiones y visualización de alertas.
- **PIN**: Código numérico local de 4 a 8 dígitos utilizado para autenticar al Rol_Experto.
- **Sesión_Experto**: Período durante el cual la Aplicación opera en Rol_Experto tras autenticación exitosa con PIN.
- **Preset_Sesión**: Configuración predefinida que agrupa sensores, tasas de muestreo, umbrales de alerta y valores de actuadores, creada por el Rol_Experto.
- **Almacén_Presets**: Archivo JSON en el sistema de archivos local gestionado mediante la API fs de Tauri.
- **Auth_Store**: Store de Zustand que gestiona el estado de autenticación y el rol activo.
- **BusPanel**: Componente de la interfaz que controla buses I2C/SPI.
- **Dashboard**: Componente principal que muestra el estado de dispositivos y señales.
- **Serializador_Presets**: Módulo que convierte objetos Preset_Sesión a formato JSON y viceversa.

## Requisitos

### Requisito 1: Gestión de Roles

**Historia de Usuario:** Como administrador del sistema de flotación, quiero que existan dos roles diferenciados (Experto y Usuario Final), para que cada tipo de operador tenga acceso solo a las funciones apropiadas a su nivel de conocimiento.

#### Criterios de Aceptación

1. THE Aplicación SHALL iniciar en Rol_Usuario como rol predeterminado.
2. THE Aplicación SHALL soportar exactamente dos roles: Rol_Experto y Rol_Usuario.
3. THE Auth_Store SHALL mantener el rol activo actual como parte del estado global de la Aplicación.
4. WHEN el rol activo cambia, THE Aplicación SHALL actualizar la interfaz de usuario para reflejar los permisos del nuevo rol en un tiempo inferior a 200ms.

### Requisito 2: Autenticación Local con PIN

**Historia de Usuario:** Como experto, quiero autenticarme con un PIN local para acceder al modo experto, sin depender de servidores externos ni conexión a internet.

#### Criterios de Aceptación

1. WHEN el Rol_Usuario introduce un PIN válido, THE Auth_Store SHALL cambiar el rol activo a Rol_Experto.
2. WHEN el Rol_Usuario introduce un PIN inválido, THE Auth_Store SHALL mantener el rol activo como Rol_Usuario y mostrar un mensaje de error descriptivo.
3. THE Aplicación SHALL almacenar el hash del PIN en el sistema de archivos local mediante la API fs de Tauri.
4. THE Aplicación SHALL aceptar PINs con una longitud entre 4 y 8 dígitos numéricos.
5. IF no existe un PIN configurado al iniciar la Aplicación por primera vez, THEN THE Aplicación SHALL solicitar al Rol_Experto que establezca un PIN inicial.
6. WHEN el Rol_Experto solicita cambiar el PIN, THE Aplicación SHALL requerir el PIN actual antes de aceptar el nuevo PIN.

### Requisito 3: Cierre de Sesión de Experto

**Historia de Usuario:** Como experto, quiero poder cerrar mi sesión para que la aplicación vuelva al modo usuario, protegiendo la configuración de accesos no autorizados.

#### Criterios de Aceptación

1. WHEN el Rol_Experto cierra la Sesión_Experto, THE Auth_Store SHALL cambiar el rol activo a Rol_Usuario.
2. WHEN la Aplicación se cierra, THE Auth_Store SHALL descartar la Sesión_Experto activa sin persistirla.
3. WHEN la Aplicación se reinicia, THE Aplicación SHALL iniciar en Rol_Usuario independientemente del estado anterior.

### Requisito 4: Permisos del Rol Experto

**Historia de Usuario:** Como experto, quiero tener acceso completo a todas las funciones de configuración de hardware, para poder ajustar el sistema de flotación según las necesidades técnicas.

#### Criterios de Aceptación

1. WHILE la Aplicación opera en Rol_Experto, THE BusPanel SHALL estar visible y completamente funcional, permitiendo configurar buses I2C/SPI.
2. WHILE la Aplicación opera en Rol_Experto, THE Dashboard SHALL permitir ajustar manualmente los valores de actuadores mediante KnobControl y SliderControl.
3. WHILE la Aplicación opera en Rol_Experto, THE Aplicación SHALL permitir modificar umbrales de alerta en los canales de señal.
4. WHILE la Aplicación opera en Rol_Experto, THE Aplicación SHALL permitir crear, editar y eliminar objetos Preset_Sesión.
5. WHILE la Aplicación opera en Rol_Experto, THE LogPanel SHALL estar visible mostrando los logs de depuración.
6. WHILE la Aplicación opera en Rol_Experto, THE Aplicación SHALL permitir cambiar el PIN de autenticación.

### Requisito 5: Restricciones del Rol Usuario

**Historia de Usuario:** Como usuario final del tanque de flotación, quiero una interfaz simplificada que me permita operar sesiones de forma segura sin riesgo de modificar la configuración del hardware.

#### Criterios de Aceptación

1. WHILE la Aplicación opera en Rol_Usuario, THE BusPanel SHALL estar oculto en la interfaz.
2. WHILE la Aplicación opera en Rol_Usuario, THE Aplicación SHALL ocultar los controles de modificación de umbrales de alerta.
3. WHILE la Aplicación opera en Rol_Usuario, THE Aplicación SHALL ocultar los controles manuales de actuadores (KnobControl y SliderControl para ajuste directo de hardware).
4. WHILE la Aplicación opera en Rol_Usuario, THE LogPanel SHALL estar oculto en la interfaz.
5. WHILE la Aplicación opera en Rol_Usuario, THE Dashboard SHALL mostrar gráficos de señales en tiempo real en modo solo lectura.
6. WHILE la Aplicación opera en Rol_Usuario, THE Aplicación SHALL permitir visualizar alertas activas en el AlertPanel.
7. WHILE la Aplicación opera en Rol_Usuario, THE Aplicación SHALL permitir iniciar y detener sesiones basadas en un Preset_Sesión seleccionado.

### Requisito 6: Gestión de Presets de Sesión

**Historia de Usuario:** Como experto, quiero crear presets de sesión que combinen configuraciones de sensores, tasas de muestreo, umbrales y actuadores, para que el usuario final pueda operar el tanque seleccionando configuraciones predefinidas.

#### Criterios de Aceptación

1. THE Preset_Sesión SHALL contener los siguientes campos: identificador único, nombre descriptivo, lista de canales de señal con sus tasas de muestreo, umbrales de alerta por canal (mínimo y máximo), y valores de actuadores.
2. WHEN el Rol_Experto crea un Preset_Sesión, THE Aplicación SHALL validar que todos los campos obligatorios estén presentes antes de guardar.
3. WHEN el Rol_Experto elimina un Preset_Sesión, THE Aplicación SHALL solicitar confirmación antes de proceder con la eliminación.
4. THE Aplicación SHALL impedir la creación de objetos Preset_Sesión con nombres duplicados.
5. WHILE la Aplicación opera en Rol_Usuario, THE Aplicación SHALL mostrar la lista de objetos Preset_Sesión disponibles en modo solo lectura.

### Requisito 7: Almacenamiento de Presets en JSON

**Historia de Usuario:** Como experto, quiero que los presets se almacenen como archivos JSON en el sistema de archivos local, para poder respaldarlos y transferirlos entre instalaciones.

#### Criterios de Aceptación

1. THE Almacén_Presets SHALL persistir los objetos Preset_Sesión como un archivo JSON en el directorio de datos de la Aplicación mediante la API fs de Tauri.
2. WHEN la Aplicación inicia, THE Almacén_Presets SHALL cargar los objetos Preset_Sesión desde el archivo JSON local.
3. IF el archivo JSON del Almacén_Presets no existe al iniciar, THEN THE Almacén_Presets SHALL crear un archivo vacío con una lista de presets vacía.
4. IF el archivo JSON del Almacén_Presets contiene datos corruptos o formato inválido, THEN THE Almacén_Presets SHALL registrar un error en el log y cargar una lista de presets vacía.
5. THE Serializador_Presets SHALL convertir objetos Preset_Sesión a formato JSON válido.
6. THE Serializador_Presets SHALL convertir cadenas JSON válidas a objetos Preset_Sesión.
7. FOR ALL objetos Preset_Sesión válidos, serializar y luego deserializar SHALL producir un objeto equivalente al original (propiedad de ida y vuelta).

### Requisito 8: Selección y Ejecución de Presets por el Usuario

**Historia de Usuario:** Como usuario final, quiero seleccionar un preset creado por el experto e iniciar una sesión de monitoreo, para operar el tanque de flotación de forma sencilla.

#### Criterios de Aceptación

1. WHILE la Aplicación opera en Rol_Usuario, THE Aplicación SHALL mostrar un selector con los nombres de todos los objetos Preset_Sesión disponibles.
2. WHEN el Rol_Usuario selecciona un Preset_Sesión e inicia una sesión, THE Aplicación SHALL aplicar la configuración de canales, umbrales y actuadores definidos en el Preset_Sesión.
3. WHEN el Rol_Usuario detiene una sesión activa, THE Aplicación SHALL detener la lectura de sensores y restablecer los actuadores a valores seguros.
4. WHILE una sesión está activa, THE Aplicación SHALL mostrar los gráficos de señales en tiempo real correspondientes a los canales definidos en el Preset_Sesión activo.
5. WHILE una sesión está activa, THE AlertPanel SHALL mostrar alertas cuando los valores de los canales excedan los umbrales definidos en el Preset_Sesión activo.
