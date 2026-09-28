# 📘 ContaCabal – Sistema Contable

Sistema web contable para la gestión de procesos contables: catálogo de cuentas, registro y contabilización de asientos (partidas), libros contables, Kardex, estados financieros, ratios, gestión de usuarios con roles y auditoría.

- **Demo en producción:** https://contacabal.vercel.app
- **Repositorio:** https://github.com/Kathya-P/SistemaContable
- **Historial de commits:** https://github.com/Kathya-P/SistemaContable/commits/main

---

## 📑 Contenido

1. [Tecnologías](#-tecnologías)
2. [Estructura del proyecto](#-estructura-del-proyecto)
3. [Manual de instalación](#-manual-de-instalación)
4. [Base de datos (scripts SQL)](#-base-de-datos-scripts-sql)
5. [Accesos](#-accesos)
6. [Tabla de roles](#-tabla-de-roles)
7. [Módulos y funcionalidades](#-módulos-y-funcionalidades)
8. [API REST](#-api-rest)
9. [Seguridad](#-seguridad)
10. [Historial Git](#-historial-git)
11. [Video explicativo](#-video-explicativo)
12. [Equipo](#-equipo)

---

## 🚀 Tecnologías

| Capa | Tecnología |
| --- | --- |
| Frontend | React 19, Vite, JavaScript, CSS |
| Backend | Node.js 22 + Express 5 (`backend/server.js`) |
| Base de datos | Supabase (PostgreSQL) con Row Level Security |
| Autenticación | Supabase Auth |
| Exportación | jsPDF + jspdf-autotable (PDF), ExcelJS y SheetJS (Excel) |
| Despliegue | Vercel (`vercel.json` + `api/index.js`) |

---

## 📂 Estructura del proyecto

```
SistemaContable
├── .github/workflows          # Workflow de configuración (Node según .nvmrc)
├── api
│   └── index.js               # Punto de entrada serverless en Vercel (usa backend/server.js)
├── backend
│   ├── server.js              # API Express (rutas /api)
│   ├── contabilidad.js
│   ├── Estadoresultados.js
│   ├── balanceGeneral.js
│   ├── ratiosFinancieros.js
│   └── auditoria.js
├── public                     # Logos e íconos
├── src
│   ├── components             # Vistas: Dashboard, LibroDiario, LibroMayor, CuentaT,
│   │                          # KardexPage, Estadoresultados, BalanceGeneral,
│   │                          # TablaComparativa, RatiosFinancieros, Gestionusuarios,
│   │                          # AuditoriaPage, NuevoAsiento, CatalogoCuentas, Login...
│   ├── services               # Acceso a la API (api.js) y lógica por módulo
│   ├── utils                  # asientoIva, configuracionIva, kardexCalculos
│   ├── lib/supabase.js        # Cliente Supabase
│   ├── App.jsx                # Navegación y permisos por rol
│   └── main.jsx
├── supabase/migrations        # Migraciones SQL (asientos recurrentes)
├── database                   # schema.sql y data.sql (ver sección de base de datos)
├── .nvmrc                     # Node 22
├── package.json
├── vercel.json
└── vite.config.js             # Proxy /api -> http://localhost:3001
```

---

## ⚙️ Manual de instalación

### Requisitos previos

- Node.js **22** (indicado en `.nvmrc`) y npm
- Git
- Un proyecto en [Supabase](https://supabase.com)

### Paso 1. Clonar el repositorio

```bash
git clone https://github.com/Kathya-P/SistemaContable.git
cd SistemaContable
```

### Paso 2. Instalar dependencias

```bash
npm install
```

### Paso 3. Crear la base de datos

En el **SQL Editor** de Supabase ejecutar, en este orden:

1. `database/schema.sql`: esquema (tablas, relaciones, funciones y políticas RLS).
2. `supabase/migrations/20260925_asientos_recurrentes.sql`: tablas de asientos recurrentes (si el esquema no las incluye).
3. `database/data.sql`: catálogo de cuentas y datos iniciales.

### Paso 4. Variables de entorno

Crear un archivo `.env` en la raíz con los valores de **Project Settings > API** de Supabase:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon-publica
SUPABASE_SERVICE_ROLE_KEY=tu-clave-service-role-privada
```

Opcionales: `PORT` (por defecto `3001`) y `SUPABASE_URL` (si no se define, el backend usa `VITE_SUPABASE_URL`).

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` la usa solo el backend. Nunca debe llevar prefijo `VITE_`, ni subirse a Git ni publicarse en el frontend.

Si no se configuran las variables de Supabase, el frontend arranca en **modo demostración** con un usuario ADMIN simulado, y sin datos reales.

### Paso 5. Ejecutar la aplicación

Se necesitan dos terminales:

```bash
# Terminal 1: API (http://localhost:3001)
npm run server

# Terminal 2: Frontend (http://localhost:5173)
npm run dev
```

Vite redirige automáticamente las peticiones `/api` al backend en el puerto 3001. Para desarrollo con recarga del backend: `npm run dev:server`.

### Paso 6. Compilar para producción

```bash
npm run build      # genera /dist
npm run preview    # vista previa local
```

### Despliegue en Vercel

1. Importar el repositorio en Vercel.
2. Definir las variables de entorno del Paso 4 en el proyecto.
3. `vercel.json` ya enruta `/api/*` a `api/index.js` y el resto a `index.html`.

### Solución de problemas

| Problema | Solución |
| --- | --- |
| Entra como "Contador Principal" sin iniciar sesión | Faltan `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; revisar `.env` y reiniciar `npm run dev` |
| Errores `/api` o "no se pudo completar la operación" | Verificar que el backend esté corriendo (`npm run server`) y que exista `SUPABASE_SERVICE_ROLE_KEY` |
| Error de permisos al consultar tablas | Confirmar que el esquema se ejecutó completo, incluyendo políticas RLS |
| Puerto 5173 ocupado | Vite usará otro automáticamente; abrir el que indique la consola |

---

## 🗄️ Base de datos (scripts SQL)

| Script | Contenido |
| --- | --- |
| `database/schema.sql` | Esquema de la base de datos: tablas, llaves foráneas, funciones y políticas RLS |
| `database/data.sql` | Catálogo de cuentas y datos iniciales |
| `supabase/migrations/20260925_asientos_recurrentes.sql` | Tablas de asientos recurrentes con RLS |

### Tablas utilizadas por el sistema

| Tabla | Descripción |
| --- | --- |
| `empresas` | Empresas registradas |
| `usuarios` | Usuarios del sistema (nombre, rol, empresa, estado) |
| `roles_permisos` | Permisos por rol |
| `cuentas` | Catálogo contable jerárquico |
| `asientos` | Cabecera de cada partida (estado, fecha, concepto, usuario) |
| `detalle_asientos` | Movimientos Debe/Haber de cada partida |
| `asientos_guardados` | Plantillas de asientos guardadas |
| `asientos_recurrentes` | Plantillas de asientos mensuales recurrentes |
| `detalle_asientos_recurrentes` | Detalle de las plantillas recurrentes |
| `asientos_recurrentes_ocurrencias` | Control de ocurrencias (PENDIENTE, REGISTRADO, OMITIDO) |

Funciones SQL (RPC): `guardar_asiento` y `libro_mayor`.

Ejemplo de jerarquía del catálogo:

```
1       ACTIVO
11      ACTIVO CORRIENTE
1101    Efectivo y equivalentes de efectivo
110102  Bancos
```

---

## 🔑 Accesos

| Recurso | URL |
| --- | --- |
| Aplicación en producción | https://contacabal.vercel.app |
| Aplicación local | http://localhost:5173 |
| API local | http://localhost:3001/api |
| Verificación de la API | `GET /api/health` |
| Repositorio | https://github.com/Kathya-P/SistemaContable |
| Base de datos | Panel de Supabase del proyecto |

### Usuarios de prueba

| Rol | Correo | Contraseña |
| --- | --- | --- |
| ADMIN | `admin@ejemplo.com` | `********` |
| CONTADOR | `contador@ejemplo.com` | `********` |
| AUXILIAR | `auxiliar@ejemplo.com` | `********` |

> Reemplazar por las credenciales reales de prueba del proyecto.

---

## 👥 Tabla de roles

| Rol | Catálogo | Registrar asientos | Contabilizar | Anular | Reportes | Usuarios y auditoría |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| **ADMIN** | Ver y editar | Sí | Sí | Sí | Sí | Sí |
| **CONTADOR** | Ver y editar | Sí | Sí | Sí | Sí | No |
| **AUXILIAR** | Solo ver | Sí | No | No | Sí | No |

Notas:

- Los asientos creados por un **AUXILIAR** quedan en estado `PENDIENTE` hasta que un CONTADOR o ADMIN los contabilice.
- Los asientos de ADMIN y CONTADOR se guardan directamente como `CONTABILIZADO`.
- Los módulos de **Usuarios** y **Auditoría** requieren el permiso `puede_gestionar_usuarios`.
- **Reportes** incluye Libro Diario, Mayor, Cuentas T, Kardex, Estado de Resultados, Balance General, Tabla Comparativa y Ratios.

---

## ✅ Módulos y funcionalidades

| Menú | Módulo | Descripción |
| --- | --- | --- |
| Inicio | Dashboard | Resumen general |
| Contabilidad | Catálogo de cuentas | Crear, editar, eliminar; importar catálogo; catálogo predeterminado |
| Contabilidad | Nuevo asiento | Partida doble validada, cálculo automático de IVA, asientos guardados y recurrentes, liquidación de IVA |
| Contabilidad | Libro Diario | Consulta de partidas por período |
| Contabilidad | Libro Mayor | Movimientos por cuenta (función SQL `libro_mayor`) y Cuentas T |
| Inventario | Kardex | Control de movimientos y costos |
| Reportes | Estado de Resultados | Ingresos, costos y gastos por período |
| Reportes | Balance General | Situación financiera con validación de balance |
| Herramientas | Tabla Comparativa | Comparación entre períodos |
| Herramientas | Ratios Financieros | Indicadores financieros |
| Administración | Usuarios | Alta, edición, baja y cambio de contraseña |
| Administración | Auditoría | Bitácora de acciones |

Otras características: tema claro/oscuro, menú colapsable, exportación a PDF y Excel, rectificación, anulación y contabilización de asientos.

---

## 🔌 API REST

Todas las rutas están bajo `/api`.

| Recurso | Endpoints principales |
| --- | --- |
| Estado | `GET /health` |
| Cuentas | `GET/POST /cuentas`, `PATCH/DELETE /cuentas/:id`, `POST /cuentas/importar`, `POST /cuentas/catalogo-predeterminado` |
| Asientos | `POST /asientos`, `GET /asientos/:id`, `POST /asientos/validar`, `PUT /asientos/:id/rectificar`, `PUT /asientos/:id/contabilizar`, `DELETE /asientos/:id` |
| Plantillas | `GET/POST /asientos-guardados`, `DELETE /asientos-guardados/:id` |
| Libros | `GET /libro-diario`, `GET /libro-mayor`, `GET /libro-mayor/movimientos`, `GET /kardex` |
| Reportes | `GET /estado-resultados`, `GET /balance-general`, `GET /ratios-financieros` |
| Usuarios | `GET/POST /usuarios`, `PATCH/DELETE /usuarios/:id`, `POST /usuarios/:id/cambiar-password`, `POST /registro`, `GET /permisos` |
| Otros | `GET/POST /empresas`, `GET/POST /auditoria` |

---

## 🔐 Seguridad

- Autenticación con Supabase Auth; el frontend envía el token en `Authorization: Bearer`.
- Control de acceso por rol en el frontend (menú y vistas) y permisos en la tabla `roles_permisos`.
- Row Level Security (RLS) activo en las tablas; las plantillas recurrentes solo son gestionables por `service_role`.
- `SUPABASE_SERVICE_ROLE_KEY` se usa únicamente en el backend y no debe subirse al repositorio.

---

## 🕓 Historial Git

Historial completo de commits:

**https://github.com/Kathya-P/SistemaContable/commits/main**

---

## 🎥 Video explicativo

**Enlace:** https://youtu.be/2iuGn6HetJE?si=f9ZLu4bSCY4JiWZz

Por el límite de espacio de la entrega, el video no pudo adjuntarse como archivo, por lo que se subió a YouTube y se comparte mediante este enlace.

---

## 👨‍💻 Equipo
- Kathya Perez
- Daniela Monge
- Justin Ramirez
- Brandon Valdez
  
Proyecto académico **ContaCabal** · UNICAES · React + Supabase · 2026
