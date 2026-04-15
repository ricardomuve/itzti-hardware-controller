# Documento de Requisitos

## Introducción

Este documento define los requisitos para el proceso de despliegue de un sitio web estático hacia una infraestructura AWS ya existente. La infraestructura (S3 bucket, CloudFront distribution, OAC, políticas de seguridad, HTTPS) ya está configurada y operativa. El alcance de este documento se limita al pipeline de subida de archivos al bucket S3 y la invalidación de caché en CloudFront tras cada despliegue.

## Glosario

- **S3_Bucket**: Contenedor de almacenamiento en Amazon S3 ya existente donde se alojan los archivos estáticos del proyecto.
- **CloudFront_Distribution**: Distribución de Amazon CloudFront ya existente que sirve el contenido del S3_Bucket como CDN.
- **Pipeline_de_Despliegue**: Proceso automatizado que sube los archivos del proyecto al S3_Bucket e invalida la caché de la CloudFront_Distribution.
- **Contenido_Estático**: Archivos HTML, CSS, JavaScript, imágenes y otros recursos que componen la aplicación web.
- **Carpeta_de_Build**: Directorio local que contiene los archivos generados listos para ser desplegados.
- **Proyecto**: Directorio raíz del proyecto local que contiene el código fuente, archivos de configuración y la Carpeta_de_Build.

## Requisitos

### Requisito 1: Sincronización de archivos al S3

**Historia de Usuario:** Como desarrollador, quiero subir los archivos de mi build al bucket S3 existente, para que el sitio web se actualice con los últimos cambios.

#### Criterios de Aceptación

1. THE Pipeline_de_Despliegue SHALL sincronizar los archivos de la Carpeta_de_Build con el S3_Bucket, subiendo archivos nuevos y actualizados.
2. THE Pipeline_de_Despliegue SHALL eliminar del S3_Bucket los archivos que ya no existan en la Carpeta_de_Build para mantener el contenido limpio.
3. WHEN la sincronización se completa con éxito, THE Pipeline_de_Despliegue SHALL mostrar un resumen con el número de archivos subidos, actualizados y eliminados.
4. IF la Carpeta_de_Build no existe o está vacía, THEN THE Pipeline_de_Despliegue SHALL abortar la ejecución y mostrar un mensaje de error descriptivo sin modificar el S3_Bucket.

### Requisito 2: Invalidación de caché en CloudFront

**Historia de Usuario:** Como desarrollador, quiero que la caché de CloudFront se invalide después de cada despliegue, para que los usuarios vean el contenido actualizado de inmediato.

#### Criterios de Aceptación

1. WHEN la sincronización al S3_Bucket se completa con éxito, THE Pipeline_de_Despliegue SHALL crear una invalidación en la CloudFront_Distribution para la ruta "/*".
2. IF la creación de la invalidación de caché falla, THEN THE Pipeline_de_Despliegue SHALL mostrar un mensaje de advertencia indicando que los archivos se subieron correctamente pero la invalidación falló.
3. WHEN la invalidación se crea con éxito, THE Pipeline_de_Despliegue SHALL mostrar el ID de la invalidación creada.

### Requisito 3: Manejo de errores en el despliegue

**Historia de Usuario:** Como desarrollador, quiero recibir mensajes claros cuando algo falle durante el despliegue, para poder diagnosticar y resolver problemas rápidamente.

#### Criterios de Aceptación

1. IF la sincronización al S3_Bucket falla, THEN THE Pipeline_de_Despliegue SHALL mostrar un mensaje de error descriptivo y detener la ejecución sin crear la invalidación de caché.
2. IF las credenciales de AWS no están configuradas o son inválidas, THEN THE Pipeline_de_Despliegue SHALL mostrar un mensaje de error indicando el problema de autenticación y detener la ejecución.
3. IF el S3_Bucket especificado no existe o no es accesible, THEN THE Pipeline_de_Despliegue SHALL mostrar un mensaje de error indicando que el bucket no fue encontrado y detener la ejecución.

### Requisito 4: Configuración del despliegue

**Historia de Usuario:** Como desarrollador, quiero poder configurar los parámetros del despliegue mediante un archivo `.env`, para mantener los datos sensibles fuera del código fuente y adaptar el proceso a distintos entornos o proyectos.

#### Criterios de Aceptación

1. THE Pipeline_de_Despliegue SHALL leer los parámetros de configuración (nombre del S3_Bucket, ID de la CloudFront_Distribution y ruta de la Carpeta_de_Build) desde un archivo `.env` ubicado en la raíz del proyecto.
2. THE Proyecto SHALL incluir un archivo `.env.example` con los nombres de las variables requeridas sin valores asignados, para que cualquier desarrollador conozca qué variables debe configurar.
3. IF el archivo `.env` no existe en la raíz del proyecto, THEN THE Pipeline_de_Despliegue SHALL mostrar un mensaje de error indicando que el archivo `.env` no fue encontrado y detener la ejecución.
4. IF alguna variable de configuración obligatoria no está definida o está vacía en el archivo `.env`, THEN THE Pipeline_de_Despliegue SHALL mostrar un mensaje de error indicando la variable faltante y detener la ejecución.

> **Consideración futura:** Cuando el proyecto adopte un sistema de control de versiones como Git, se deberá agregar el archivo `.env` al `.gitignore` para evitar que los datos sensibles se suban al repositorio. El archivo `.env.example` sí debe versionarse como referencia.
