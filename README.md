# 📘 Sistema Contable

Sistema web contable desarrollado para la gestión de procesos contables básicos, permitiendo administrar cuentas contables, registrar movimientos financieros y consultar información mediante un Libro Diario.

El proyecto está construido utilizando **React** para el frontend y **Supabase (PostgreSQL)** como backend y base de datos.

---

# 🚀 Tecnologías utilizadas

## Frontend

- React 19
- Vite
- JavaScript
- CSS

## Backend / Base de datos

- Supabase
- PostgreSQL
- Row Level Security (RLS)

## Librerías principales

- @supabase/supabase-js

---

# 📂 Estructura del proyecto
SistemaContable
│
├── public
│
├── src
│   │
│   ├── assets
│   │
│   ├── components
│   │   │
│   │   └── LibroDiario.jsx
│   │
│   ├── lib
│   │   │
│   │   └── supabase.js
│   │
│   ├── services
│   │   │
│   │   ├── asientosService.js
│   │   ├── cuentasService.js
│   │   ├── empresasService.js
│   │   └── libroDiarioService.js
│   │
│   ├── App.jsx
│   ├── App.css
│   ├── index.css
│   └── main.jsx
│
├── .env
├── package.json
├── README.md
└── vite.config.js

---

# 🗄️ Arquitectura de Base de Datos

La base de datos fue diseñada utilizando una estructura contable tradicional.

## Tablas principales

---

# 🏢 empresas

Almacena la información de las empresas registradas en el sistema.

Campos principales:

- id
- nombre
- datos generales

---

# 📚 cuentas

Contiene el catálogo contable utilizado para registrar movimientos.

La estructura permite manejar niveles jerárquicos:
GRUPO
 |
 └── SUBGRUPO
       |
       └── CUENTA
             |
             └── SUBCUENTA


Ejemplo:
1  ACTIVO
11 ACTIVO CORRIENTE
1101 Efectivo y equivalentes de efectivo
110102 Bancos

Las cuentas finales permiten realizar movimientos contables.

---

# 📝 asientos

Contiene la cabecera de cada partida contable.

Ejemplo:

Número de partida:
1
Fecha:
2026-09-18
Concepto:
Aporte inicial de capital

Campos principales:

- id
- empresa_id
- numero_partida
- fecha
- concepto
- usuario_id
- estado

---

# 📑 detalle_asientos

Contiene el detalle de cada movimiento contable.

Relaciona:

Asiento
   |
   |
Detalle
   |
   |
Cuenta contable

Campos principales:

- asiento_id
- cuenta_id
- descripcion
- debe
- haber

Ejemplo:

| Cuenta | Debe | Haber |
|---|---:|---:|
| Bancos | 50,000 | 0 |
| Capital Social | 0 | 50,000 |

---

# 🔐 Seguridad

La base de datos utiliza Row Level Security (RLS) de Supabase.

Las políticas permiten controlar el acceso a la información desde el frontend.

Actualmente se configuraron permisos de lectura para:

- asientos
- detalle_asientos
- cuentas
- empresas

---

# ⚙️ Configuración del proyecto

## 1. Clonar repositorio

git clone URL_DEL_REPOSITORIO

---

## 2. Instalar dependencias

Dentro del proyecto ejecutar:

npm install

---

## 3. Variables de entorno

Crear un archivo:

.env

Agregar:

VITE_SUPABASE_URL=URL_DEL_PROYECTO_SUPABASE
VITE_SUPABASE_ANON_KEY=CLAVE_PUBLICA_SUPABASE

---

## 4. Ejecutar aplicación

npm run dev

La aplicación estará disponible en:

http://localhost:5173/

---

# 🔌 Conexión con Supabase

La conexión se realiza mediante:

src/lib/supabase.js

Ejemplo:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY


export const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey
)
🛠️ Servicios creados
Los servicios separan la lógica de conexión con la base de datos.
asientosService.js
Funciones principales:
- Obtener asientos
- Obtener asiento por ID
- Crear asiento contable
cuentasService.js
Funciones relacionadas al catálogo contable.
Permite consultar:
- Código
- Nombre
- Nivel
- Jerarquía contable
empresasService.js
Manejo de información de empresas.
libroDiarioService.js
Consulta la información necesaria para construir el Libro Diario.
Realiza la relación:
asientos

+

detalle_asientos

+

cuentas
📖 Libro Diario
Actualmente el sistema permite visualizar los movimientos contables registrados.
Información mostrada:
- Fecha
- Número de partida
- Código contable
- Cuenta
- Descripción
- Debe
- Haber
Ejemplo:
Fecha: 18/09/2026

Partida: 1

Concepto:
Aporte inicial de capital


110102 Bancos

Debe:
50,000


3101 Capital Social

Haber:
50,000
✅ Funcionalidades actuales
- Proyecto React configurado
- Conexión con Supabase
- Variables de entorno configuradas
- Base de datos PostgreSQL creada
- Catálogo contable creado
- Relaciones entre tablas funcionando
- Registro de asientos contables
- Validación de partidas cuadradas
- Consulta de Libro Diario
- Integración frontend - base de datos
📌 Próximas mejoras
Módulo de cuentas
- Crear cuentas
- Editar cuentas
- Eliminar cuentas
- Visualizar árbol contable
Módulo de asientos
- Formulario para crear partidas
- Selección dinámica de cuentas
- Validación automática Debe/Haber
- Numeración automática de partidas
Reportes contables
- Mayor general
- Balance de comprobación
- Estado de resultados
- Balance general
👨‍💻 Equipo de desarrollo
Proyecto académico:
Sistema Contable
Tecnologías:
React + Supabase
Año:
2026
     