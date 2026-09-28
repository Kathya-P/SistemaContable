# 📘 ContaCabal

Sistema web contable para la gestión de procesos contables básicos: administración de catálogo de cuentas, registro de asientos (partidas), Libro Diario, Libro Mayor, Cuentas T y Estado de Resultados.

**Demo en producción:** https://contacabal.vercel.app

---

## 📑 Contenido

1. [Tecnologías](#-tecnologías)
2. [Estructura del proyecto](#-estructura-del-proyecto)
3. [Manual de instalación](#-manual-de-instalación)
4. [Base de datos (scripts SQL)](#-base-de-datos-scripts-sql)
5. [Accesos](#-accesos)
6. [Tabla de roles](#-tabla-de-roles)
7. [Funcionalidades](#-funcionalidades)
8. [Seguridad](#-seguridad)
9. [Historial Git](#-historial-git)
10. [Equipo](#-equipo)

---

## 🚀 Tecnologías

| Capa | Tecnología |
| --- | --- |
| Frontend | React 19, Vite, JavaScript, CSS |
| Backend | Node.js + Express (`backend/server.js`) |
| Base de datos | Supabase (PostgreSQL) con Row Level Security |
| Autenticación | Supabase Auth |
| Despliegue | Vercel (`vercel.json`) |
| Librería principal | `@supabase/supabase-js` |

---

## 📂 Estructura del proyecto

```
SistemaContable
├── .github/workflows     # Integración continua
├── api                   # Funciones serverless (Vercel)
├── backend               # Servidor Express
├── database              # Scripts SQL: schema.sql y data.sql
├── public
├── src
│   ├── assets
│   ├── components        # LibroDiario.jsx, etc.
│   ├── lib               # supabase.js
│   ├── services          # asientos, cuentas, empresas, libroDiario
│   ├── App.jsx
│   └── main.jsx
├── supabase/migrations   # Migraciones SQL
├── .env.example
├── package.json
├── vercel.json
└── vite.config.js
```

---

## ⚙️ Manual de instalación

### Requisitos previos

- Node.js (versión indicada en `.nvmrc`)
- npm
- Git
- Una cuenta de [Supabase](https://supabase.com) con un proyecto creado

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

1. `database/schema.sql` (esquema: tablas, relaciones, funciones y políticas RLS)
2. `database/data.sql` (catálogo de cuentas y datos iniciales)

Detalle en la sección [Base de datos](#-base-de-datos-scripts-sql).

### Paso 4. Variables de entorno

Copiar `.env.example` como `.env` y completar los valores desde **Project Settings > API** en Supabase:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon-publica
SUPABASE_SERVICE_ROLE_KEY=tu-clave-service-role-privada
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` solo la usa el backend Node. Nunca debe llevar prefijo `VITE_` ni publicarse en el frontend ni en Git.

### Paso 5. Ejecutar la aplicación

Frontend:

```bash
npm run dev
```

Disponible en http://localhost:5173/ (si el puerto está ocupado, Vite usará otro, por ejemplo 5174).

Backend (en otra terminal):

```bash
node backend/server.js
```

### Paso 6. Compilar para producción

```bash
npm run build
```

### Solución de problemas

| Problema | Solución |
| --- | --- |
| Pantalla en blanco o error de conexión | Revisar que las variables de `.env` estén completas y reiniciar `npm run dev` |
| Error de permisos al consultar tablas | Verificar que `schema.sql` se ejecutó completo (incluye políticas RLS) |
| Puerto 5173 ocupado | Vite asigna otro puerto automáticamente; usar el que muestre la consola |

---

## 🗄️ Base de datos (scripts SQL)

| Script | Contenido |
| --- | --- |
| `database/schema.sql` | Esquema completo: tablas, llaves foráneas, funciones (por ejemplo `libro_mayor`) y políticas RLS |
| `database/data.sql` | Catálogo de cuentas y datos iniciales |

### Tablas principales

- **empresas**: empresas registradas en el sistema.
- **cuentas**: catálogo contable jerárquico (Grupo > Subgrupo > Cuenta > Subcuenta). Solo las cuentas finales admiten movimientos.
- **asientos**: cabecera de cada partida (`empresa_id`, `numero_partida`, `fecha`, `concepto`, `usuario_id`, `estado`).
- **detalle_asientos**: movimientos de cada partida (`asiento_id`, `cuenta_id`, `descripcion`, `debe`, `haber`).

Ejemplo de jerarquía del catálogo:

```
1       ACTIVO
11      ACTIVO CORRIENTE
1101    Efectivo y equivalentes de efectivo
110102  Bancos
```

Ejemplo de partida:

| Cuenta | Debe | Haber |
| --- | --- | --- |
| Bancos | 50,000 | 0 |
| Capital Social | 0 | 50,000 |

---

## 🔑 Accesos

| Recurso | URL / dato |
| --- | --- |
| Aplicación en producción | https://contacabal.vercel.app |
| Aplicación local | http://localhost:5173/ |
| Repositorio | https://github.com/Kathya-P/SistemaContable |
| Base de datos | Panel de Supabase del proyecto (Project Settings > API) |

## 👥 Tabla de roles

| Módulo / Acción | Administrador | Contador | Consulta |
| --- | :---: | :---: | :---: |
| Iniciar sesión / registro | ✅ | ✅ | ✅ |
| Gestión de usuarios y roles | ✅ | ❌ | ❌ |
| Catálogo de cuentas (crear / editar) | ✅ | ✅ | ❌ |
| Catálogo de cuentas (consultar) | ✅ | ✅ | ✅ |
| Registrar asientos (Nuevo asiento) | ✅ | ✅ | ❌ |
| Libro Diario | ✅ | ✅ | ✅ |
| Libro Mayor y Cuentas T | ✅ | ✅ | ✅ |
| Estado de Resultados | ✅ | ✅ | ✅ |

> Ajustar la tabla a los roles y permisos que realmente maneja el módulo de usuarios.

---

## ✅ Funcionalidades

- Login y registro de usuarios
- Gestión de usuarios y roles
- Catálogo de cuentas jerárquico
- Nuevo asiento con IVA automático (13%)
- Validación de partidas cuadradas (Debe = Haber)
- Libro Diario
- Libro Mayor (función SQL `libro_mayor`)
- Cuentas T
- Estado de Resultados
- Balance General
- Kardex
- Ratios Financieros
- Auditoria
- Modulo Administrador

## 🔐 Seguridad

- Row Level Security (RLS) de Supabase para controlar el acceso a `asientos`, `detalle_asientos`, `cuentas` y `empresas`.
- La clave `service_role` se usa únicamente en el backend.
- El archivo `.env` está en `.gitignore`.

---

## 🕓 Historial Git

El historial completo del proyecto (más de 200 commits) está disponible en:

https://github.com/Kathya-P/SistemaContable/commits/main

---

## 👨‍💻 Equipo

Proyecto académico **ContaCabal** · UNICAES · React + Supabase · 2026
