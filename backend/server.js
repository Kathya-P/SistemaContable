import "dotenv/config";
import cors from "cors";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { validarPartidaDoble } from "./contabilidad.js";
import { calcularEstadoResultados, inventarioDelMayor } from "./Estadoresultados.js";
import { calcularBalanceGeneral } from "./balanceGeneral.js";
import { calcularRatios } from "./ratiosFinancieros.js";
import { registrarAuditoria, consultarLogsAuditoria } from "./auditoria.js";

const app = express();
const puerto = Number(process.env.PORT || 3001);

function getSupabaseUrl() {
    return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function getSupabaseKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
}

function tieneClaveServidor() {
    return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let _supabase = null;
function getSupabaseClient() {
    const url = getSupabaseUrl();
    const key = getSupabaseKey();
    if (!url || !key) {
        const error = new Error("Faltan variables de entorno para Supabase: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
        error.statusCode = 500;
        throw error;
    }
    if (!_supabase) {
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const supabase = new Proxy({}, {
    get(_target, prop) {
        return getSupabaseClient()[prop];
    }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const ROLES_VALIDOS = ["ADMIN", "CONTADOR", "AUXILIAR"];

function responderError(res, error) {
    console.error(error);
    if (error.code === "23505" && error.message?.includes("uq_numero_partida_empresa")) {
        return res.status(409).json({ error: "Ese número de partida ya existe para la empresa seleccionada. Usa el siguiente número disponible." });
    }
    return res.status(error.statusCode || 400).json({ error: error.message || "Error interno." });
}

function exigirClaveDeEscritura() {
    if (!tieneClaveServidor()) {
        const error = new Error("El backend no puede escribir todavía: agrega SUPABASE_SERVICE_ROLE_KEY al entorno. La clave anon solo tiene permisos de lectura.");
        error.statusCode = 503;
        throw error;
    }
}

async function obtenerUsuarioAutenticado(req) {
    const encabezado = req.headers.authorization || "";
    const token = encabezado.startsWith("Bearer ") ? encabezado.slice(7) : "";

    if (token) {
        try {
            const { data: usuarioAuth, error: errorAuth } = await supabase.auth.getUser(token);
            if (!errorAuth && usuarioAuth?.user?.email) {
                const { data: usuario, error } = await supabase
                    .from("usuarios")
                    .select("id, empresa_id, nombre, correo, rol, estado")
                    .eq("auth_id", usuarioAuth.user.id)
                    .eq("estado", true)
                    .maybeSingle();

                if (!error && usuario) {
                    return usuario;
                }
            }
        } catch {
            // Continúa a fallback
        }
    }

    // Soporte para selección de usuario en modo vista previa / desarrollo
    const headerUserId = req.headers["x-usuario-id"];
    if (headerUserId) {
        try {
            const { data: usuarioPorId } = await supabase
                .from("usuarios")
                .select("id, empresa_id, nombre, correo, rol, estado")
                .eq("id", headerUserId)
                .eq("estado", true)
                .maybeSingle();
            if (usuarioPorId) {
                return usuarioPorId;
            }
        } catch {}
    }

    // Fallback: empresa principal activa en base de datos (Ferretería El Martillo)
    try {
        const { data: usuarioDefault, error: errDef } = await supabase
            .from("usuarios")
            .select("id, empresa_id, nombre, correo, rol, estado")
            .eq("estado", true)
            .order("id")
            .limit(1)
            .maybeSingle();

        if (!errDef && usuarioDefault) {
            return usuarioDefault;
        }
    } catch {
        // Continúa a error
    }

    const error = new Error("Sesión requerida.");
    error.statusCode = 401;
    throw error;
}

// Lee la tabla roles_permisos y bloquea la acción si el rol no la tiene.
async function exigirPermiso(usuario, permiso) {
    const { data, error } = await supabase
        .from("roles_permisos")
        .select(permiso)
        .eq("rol", usuario.rol)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (data?.[permiso] !== true) {
        const errorPermiso = new Error("Tu rol no tiene permiso para realizar esta acción.");
        errorPermiso.statusCode = 403;
        throw errorPermiso;
    }
}

function exigirEmpresaDelUsuario(usuario, empresaId) {
    if (String(usuario.empresa_id) !== String(empresaId)) {
        const error = new Error("No tienes acceso a esa empresa.");
        error.statusCode = 403;
        throw error;
    }
}

async function cargarCuentas(ids, empresaId) {
    const { data, error } = await supabase
        .from("cuentas")
        .select("id, codigo, nombre, nivel, cuenta_padre_id")
        .in("id", ids)
        .eq("empresa_id", empresaId);

    if (error) {
        throw error;
    }

    return data || [];
}

function fechaValida(valor) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""));
}

function primerDiaDelMes(fecha) {
    return `${String(fecha).slice(0, 7)}-01`;
}

function fechaMensual(anio, mes, dia) {
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const diaValido = Math.min(Number(dia), ultimoDia);
    return `${anio}-${String(mes).padStart(2, "0")}-${String(diaValido).padStart(2, "0")}`;
}

function siguienteFechaMensual(fecha, dia) {
    const base = new Date(`${fecha}T00:00:00Z`);
    const siguienteMes = base.getUTCMonth() + 2;
    const anio = base.getUTCFullYear() + (siguienteMes > 12 ? 1 : 0);
    const mes = siguienteMes > 12 ? 1 : siguienteMes;
    return fechaMensual(anio, mes, dia);
}

function hoyIso() {
    return new Date().toISOString().slice(0, 10);
}

async function obtenerRecurrenteDeEmpresa(id, empresaId) {
    const { data, error } = await supabase
        .from("asientos_recurrentes")
        .select("id, empresa_id, usuario_id, concepto, fecha_base, dia_recurrencia, modo_iva, activo, proxima_fecha")
        .eq("id", id)
        .eq("empresa_id", empresaId)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        const errorNoEncontrado = new Error("Asiento recurrente no encontrado.");
        errorNoEncontrado.statusCode = 404;
        throw errorNoEncontrado;
    }
    return data;
}

async function obtenerOcurrenciaDeEmpresa(id, empresaId) {
    const { data, error } = await supabase
        .from("asientos_recurrentes_ocurrencias")
        .select("id, asiento_recurrente_id, fecha_propuesta, mes_propuesta, estado, asiento_id")
        .eq("id", id)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        const errorNoEncontrado = new Error("Ocurrencia recurrente no encontrada.");
        errorNoEncontrado.statusCode = 404;
        throw errorNoEncontrado;
    }
    await obtenerRecurrenteDeEmpresa(data.asiento_recurrente_id, empresaId);
    return data;
}

const apiRouter = express.Router();

apiRouter.get("/health", (_req, res) => {
    res.json({
        ok: true,
        servicio: "contabilidad",
        supabaseConfigurado: Boolean(getSupabaseUrl() && getSupabaseKey()),
        claveServidor: tieneClaveServidor()
    });
});

const TIPOS_VALIDOS_CATALOGO = ["ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "GASTO", "COSTO"];
const NIVELES_VALIDOS_CATALOGO = ["GRUPO", "SUBGRUPO", "CUENTA", "SUBCUENTA"];
const CATALOGO_PREDETERMINADO = [
    { codigo: "1", nombre: "ACTIVO", tipo: "ACTIVO", nivel: "GRUPO", padre: null },
    { codigo: "11", nombre: "ACTIVO CORRIENTE", tipo: "ACTIVO", nivel: "SUBGRUPO", padre: "1" },
    { codigo: "1101", nombre: "Efectivo y equivalente", tipo: "ACTIVO", nivel: "CUENTA", padre: "11" },
    { codigo: "110101", nombre: "Caja", tipo: "ACTIVO", nivel: "SUBCUENTA", padre: "1101" },
    { codigo: "110102", nombre: "Bancos", tipo: "ACTIVO", nivel: "SUBCUENTA", padre: "1101" },
    { codigo: "1102", nombre: "Cuentas por cobrar", tipo: "ACTIVO", nivel: "CUENTA", padre: "11" },
    { codigo: "110201", nombre: "Clientes", tipo: "ACTIVO", nivel: "SUBCUENTA", padre: "1102" },
    { codigo: "1103", nombre: "Inventario de mercadería", tipo: "ACTIVO", nivel: "CUENTA", padre: "11" },
    { codigo: "1104", nombre: "Pagos anticipados", tipo: "ACTIVO", nivel: "CUENTA", padre: "11" },
    { codigo: "110401", nombre: "Papelería y útiles pagados anticipadamente", tipo: "ACTIVO", nivel: "SUBCUENTA", padre: "1104" },
    { codigo: "110402", nombre: "Alquileres pagados anticipadamente", tipo: "ACTIVO", nivel: "SUBCUENTA", padre: "1104" },
    { codigo: "1105", nombre: "IVA crédito fiscal", tipo: "ACTIVO", nivel: "CUENTA", padre: "11" },
    { codigo: "12", nombre: "ACTIVO NO CORRIENTE", tipo: "ACTIVO", nivel: "SUBGRUPO", padre: "1" },
    { codigo: "1201", nombre: "Propiedad, planta y equipo", tipo: "ACTIVO", nivel: "CUENTA", padre: "12" },
    { codigo: "120101", nombre: "Mobiliario y equipo de oficina", tipo: "ACTIVO", nivel: "SUBCUENTA", padre: "1201" },
    { codigo: "120102", nombre: "Equipo de oficina", tipo: "ACTIVO", nivel: "SUBCUENTA", padre: "1201" },
    { codigo: "120103", nombre: "Equipo de cómputo", tipo: "ACTIVO", nivel: "SUBCUENTA", padre: "1201" },
    { codigo: "120104", nombre: "Equipo de transporte", tipo: "ACTIVO", nivel: "SUBCUENTA", padre: "1201" },
    { codigo: "120105", nombre: "Edificios", tipo: "ACTIVO", nivel: "SUBCUENTA", padre: "1201" },

    { codigo: "2", nombre: "PASIVO", tipo: "PASIVO", nivel: "GRUPO", padre: null },
    { codigo: "21", nombre: "PASIVO CORRIENTE", tipo: "PASIVO", nivel: "SUBGRUPO", padre: "2" },
    { codigo: "2101", nombre: "Cuentas por pagar", tipo: "PASIVO", nivel: "CUENTA", padre: "21" },
    { codigo: "210101", nombre: "Proveedores", tipo: "PASIVO", nivel: "SUBCUENTA", padre: "2101" },
    { codigo: "210102", nombre: "Acreedores varios", tipo: "PASIVO", nivel: "SUBCUENTA", padre: "2101" },
    { codigo: "2102", nombre: "IVA débito fiscal", tipo: "PASIVO", nivel: "CUENTA", padre: "21" },
    { codigo: "2103", nombre: "Préstamos bancarios", tipo: "PASIVO", nivel: "CUENTA", padre: "21" },

    { codigo: "3", nombre: "CAPITAL CONTABLE", tipo: "PATRIMONIO", nivel: "GRUPO", padre: null },
    { codigo: "31", nombre: "CAPITAL", tipo: "PATRIMONIO", nivel: "SUBGRUPO", padre: "3" },
    { codigo: "3101", nombre: "Capital social", tipo: "PATRIMONIO", nivel: "CUENTA", padre: "31" },

    { codigo: "4", nombre: "COSTOS Y GASTOS", tipo: "GASTO", nivel: "GRUPO", padre: null },
    { codigo: "41", nombre: "COSTOS", tipo: "GASTO", nivel: "SUBGRUPO", padre: "4" },
    { codigo: "4101", nombre: "Compras", tipo: "GASTO", nivel: "CUENTA", padre: "41" },
    { codigo: "4102", nombre: "Devolución sobre compras", tipo: "GASTO", nivel: "CUENTA", padre: "41" },
    { codigo: "42", nombre: "GASTOS DE OPERACIÓN", tipo: "GASTO", nivel: "SUBGRUPO", padre: "4" },
    { codigo: "4201", nombre: "Gastos administrativos", tipo: "GASTO", nivel: "CUENTA", padre: "42" },
    { codigo: "420101", nombre: "Papelería y otros - administración", tipo: "GASTO", nivel: "SUBCUENTA", padre: "4201" },
    { codigo: "4202", nombre: "Gastos de venta", tipo: "GASTO", nivel: "CUENTA", padre: "42" },
    { codigo: "420201", nombre: "Papelería y otros - venta", tipo: "GASTO", nivel: "SUBCUENTA", padre: "4202" },
    { codigo: "4203", nombre: "Gastos financieros", tipo: "GASTO", nivel: "CUENTA", padre: "42" },
    { codigo: "420301", nombre: "Comisiones bancarias", tipo: "GASTO", nivel: "SUBCUENTA", padre: "4203" },

    { codigo: "5", nombre: "INGRESOS", tipo: "INGRESO", nivel: "GRUPO", padre: null },
    { codigo: "51", nombre: "INGRESOS OPERACIONALES", tipo: "INGRESO", nivel: "SUBGRUPO", padre: "5" },
    { codigo: "5101", nombre: "Ventas", tipo: "INGRESO", nivel: "CUENTA", padre: "51" },
    { codigo: "5102", nombre: "Devolución sobre ventas", tipo: "INGRESO", nivel: "CUENTA", padre: "51" }
];
function derivarNaturaleza(tipo) {
    const t = String(tipo || "").toUpperCase();
    if (t === "ACTIVO" || t === "GASTO" || t === "COSTO") return "DEUDORA";
    if (t === "PASIVO" || t === "PATRIMONIO" || t === "INGRESO") return "ACREEDORA";
    if (t === "ORDEN" || t === "CONTINGENTE") return "DEUDORA";
    return "DEUDORA";
}

apiRouter.get("/cuentas", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_catalogo");

        const { data: cuentas, error } = await supabase
            .from("cuentas")
            .select("*")
            .eq("empresa_id", usuario.empresa_id)
            .order("codigo");

        if (error) {
            throw error;
        }

        // Obtener qué cuentas tienen movimientos registrados en detalle_asientos
        let cuentasConMovimiento = new Set();
        try {
            const { data: movimientos } = await supabase
                .from("detalle_asientos")
                .select("cuenta_id");
            if (movimientos) {
                cuentasConMovimiento = new Set(movimientos.map(m => String(m.cuenta_id)));
            }
        } catch {}

        const cuentasEnriquecidas = (cuentas || []).map(cuenta => ({
            ...cuenta,
            tiene_movimientos: cuentasConMovimiento.has(String(cuenta.id)),
            naturaleza: derivarNaturaleza(cuenta.tipo)
        }));

        return res.json(cuentasEnriquecidas);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/cuentas/movimientos", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_catalogo");

        const { data: movimientos, error } = await supabase
            .from("detalle_asientos")
            .select("cuenta_id");

        if (error) throw error;
        const ids = [...new Set((movimientos || []).map(m => String(m.cuenta_id)))];
        return res.json(ids);
    } catch (error) {
        return responderError(res, error);
    }
});

// Crear cuenta contable en el catálogo
apiRouter.post("/cuentas", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");

        const { codigo, nombre, tipo, nivel, cuenta_padre_id, permite_movimientos, estado } = req.body || {};
        
        const codigoTrim = String(codigo || "").trim();
        const nombreTrim = String(nombre || "").trim();
        const tipoUpper = String(tipo || "").trim().toUpperCase();
        const nivelUpper = String(nivel || "").trim().toUpperCase();

        if (!codigoTrim) throw new Error("El código de la cuenta es obligatorio.");
        if (!nombreTrim) throw new Error("El nombre de la cuenta es obligatorio.");
        if (!TIPOS_VALIDOS_CATALOGO.includes(tipoUpper)) {
            throw new Error(`Tipo no válido. Debe ser: ${TIPOS_VALIDOS_CATALOGO.join(", ")}.`);
        }
        if (!NIVELES_VALIDOS_CATALOGO.includes(nivelUpper)) {
            throw new Error(`Nivel no válido. Debe ser: ${NIVELES_VALIDOS_CATALOGO.join(", ")}.`);
        }

        // Regla: permite_movimientos solo válido en CUENTA o SUBCUENTA
        let movPermitido = Boolean(permite_movimientos);
        if (nivelUpper === "GRUPO" || nivelUpper === "SUBGRUPO") {
            if (movPermitido) {
                throw new Error("Las cuentas de nivel GRUPO y SUBGRUPO son agrupadoras y no pueden permitir movimientos directos.");
            }
            movPermitido = false;
        }

        // Regla: cuenta padre existente y del mismo tipo
        let padreId = cuenta_padre_id ? Number(cuenta_padre_id) : null;
        if (padreId) {
            const { data: padre, error: errorPadre } = await supabase
                .from("cuentas")
                .select("id, codigo, nombre, tipo")
                .eq("id", padreId)
                .maybeSingle();

            if (errorPadre || !padre) {
                throw new Error("La cuenta padre especificada no existe.");
            }
            if (String(padre.tipo).toUpperCase() !== tipoUpper) {
                throw new Error(`La cuenta padre (${padre.codigo}) es de tipo ${padre.tipo}, pero la cuenta nueva es ${tipoUpper}. Deben coincidir en tipo.`);
            }
        } else if (nivelUpper === "SUBCUENTA") {
            throw new Error("Una subcuenta debe tener obligatoriamente una cuenta padre asociada.");
        }

        const { data: existeCodigo } = await supabase
            .from("cuentas")
            .select("id")
            .eq("codigo", codigoTrim)
            .eq("empresa_id", usuario.empresa_id)
            .maybeSingle();

        if (existeCodigo) {
            throw new Error(`El código ${codigoTrim} ya está registrado en el catálogo.`);
        }

        const nuevoRegistro = {
            codigo: codigoTrim,
            nombre: nombreTrim,
            tipo: tipoUpper,
            nivel: nivelUpper,
            cuenta_padre_id: padreId,
            permite_movimientos: movPermitido,
            estado: estado !== false,
            empresa_id: usuario.empresa_id
        };

        const { data, error } = await supabase
            .from("cuentas")
            .insert([nuevoRegistro])
            .select()
            .single();

        if (error) throw error;

        // Registrar auditoría de creación de cuenta
        await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: usuario.empresa_id,
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            tipo_accion: "crear",
            entidad_afectada: "Cuenta",
            entidad_id: data.codigo || data.id,
            descripcion: `Creó cuenta ${data.codigo} - ${data.nombre} (${data.tipo} - ${data.nivel})`,
            datos_nuevos: data,
            resultado: "exitoso",
            req
        }).catch(() => {});

        return res.status(201).json({
            ...data,
            tiene_movimientos: false,
            naturaleza: derivarNaturaleza(data.tipo)
        });
    } catch (error) {
        return responderError(res, error);
    }
});

// Editar cuenta contable
apiRouter.patch("/cuentas/:id", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");

        const cuentaId = req.params.id;

        const { data: anterior, error: errorAnterior } = await supabase
            .from("cuentas")
            .select("*")
            .eq("id", cuentaId)
            .eq("empresa_id", usuario.empresa_id)
            .maybeSingle();

        if (errorAnterior || !anterior) {
            const err = new Error("Cuenta contable no encontrada.");
            err.statusCode = 404;
            throw err;
        }

        // Comprobar si la cuenta tiene movimientos en detalle_asientos
        const { count: movimientosCount } = await supabase
            .from("detalle_asientos")
            .select("id", { count: "exact", head: true })
            .eq("cuenta_id", cuentaId);

        const tieneMovimientos = Boolean(movimientosCount && movimientosCount > 0);

        const cambios = {};

        // Si ya tiene movimientos: no permitir cambiar tipo ni código ni nivel; solo permitir inactivar (estado = false) o cambiar nombre
        if (tieneMovimientos) {
            if (req.body.tipo !== undefined && String(req.body.tipo).toUpperCase() !== String(anterior.tipo).toUpperCase()) {
                throw new Error("No se puede cambiar el tipo de una cuenta que ya tiene movimientos contables registrados.");
            }
            if (req.body.codigo !== undefined && String(req.body.codigo).trim() !== String(anterior.codigo).trim()) {
                throw new Error("No se puede cambiar el código de una cuenta que ya tiene movimientos contables registrados.");
            }
            if (req.body.nivel !== undefined && String(req.body.nivel).toUpperCase() !== String(anterior.nivel).toUpperCase()) {
                throw new Error("No se puede cambiar el nivel de una cuenta que ya tiene movimientos contables registrados.");
            }

            if (req.body.nombre !== undefined) {
                cambios.nombre = String(req.body.nombre).trim();
            }
            if (req.body.estado !== undefined) {
                cambios.estado = Boolean(req.body.estado);
            }
            if (req.body.permite_movimientos !== undefined && (anterior.nivel === "CUENTA" || anterior.nivel === "SUBCUENTA")) {
                cambios.permite_movimientos = Boolean(req.body.permite_movimientos);
            }
                } else {
            // Editar libremente si NO tiene movimientos
            if (req.body.nombre !== undefined) {
                const nombreTrim = String(req.body.nombre).trim();
                if (!nombreTrim) throw new Error("El nombre de la cuenta no puede estar vacío.");
                cambios.nombre = nombreTrim;
            }

            if (req.body.codigo !== undefined) {
                const codigoTrim = String(req.body.codigo).trim();
                if (!codigoTrim) throw new Error("El código de la cuenta no puede estar vacío.");
                if (codigoTrim !== anterior.codigo) {
                    const { data: existeCodigo } = await supabase
                        .from("cuentas")
                        .select("id")
                        .eq("codigo", codigoTrim)
                        .eq("empresa_id", usuario.empresa_id)
                        .maybeSingle();
                    if (existeCodigo) {
                        throw new Error(`El código ${codigoTrim} ya está en uso por otra cuenta.`);
                    }
                }
                cambios.codigo = codigoTrim;
            }

            let tipoFinal = anterior.tipo;
            if (req.body.tipo !== undefined) {
                const tipoUpper = String(req.body.tipo).trim().toUpperCase();
                if (!TIPOS_VALIDOS_CATALOGO.includes(tipoUpper)) {
                    throw new Error(`Tipo no válido: ${tipoUpper}.`);
                }
                tipoFinal = tipoUpper;
                cambios.tipo = tipoUpper;
            }

            let nivelFinal = anterior.nivel;
            if (req.body.nivel !== undefined) {
                const nivelUpper = String(req.body.nivel).trim().toUpperCase();
                if (!NIVELES_VALIDOS_CATALOGO.includes(nivelUpper)) {
                    throw new Error(`Nivel no válido: ${nivelUpper}.`);
                }
                nivelFinal = nivelUpper;
                cambios.nivel = nivelUpper;
            }

            if (req.body.cuenta_padre_id !== undefined) {
                const padreId = req.body.cuenta_padre_id ? Number(req.body.cuenta_padre_id) : null;
                if (padreId) {
                    if (String(padreId) === String(cuentaId)) {
                        throw new Error("Una cuenta no puede ser su propio padre.");
                    }
                    const { data: padre } = await supabase
                        .from("cuentas")
                        .select("id, codigo, tipo")
                        .eq("id", padreId)
                        .eq("empresa_id", usuario.empresa_id)
                        .maybeSingle();

                    if (!padre) throw new Error("La cuenta padre no existe.");
                    if (String(padre.tipo).toUpperCase() !== String(tipoFinal).toUpperCase()) {
                        throw new Error(`La cuenta padre es de tipo ${padre.tipo}, debe coincidir con ${tipoFinal}.`);
                    }
                } else if (nivelFinal === "SUBCUENTA") {
                    throw new Error("Una subcuenta requiere obligatoriamente una cuenta padre.");
                }
                cambios.cuenta_padre_id = padreId;
            }

            if (req.body.permite_movimientos !== undefined) {
                if (Boolean(req.body.permite_movimientos) && (nivelFinal === "GRUPO" || nivelFinal === "SUBGRUPO")) {
                    throw new Error("Las cuentas de nivel GRUPO y SUBGRUPO no pueden permitir movimientos directos.");
                }
                cambios.permite_movimientos = (nivelFinal === "GRUPO" || nivelFinal === "SUBGRUPO") ? false : Boolean(req.body.permite_movimientos);
            }

            if (req.body.estado !== undefined) {
                cambios.estado = Boolean(req.body.estado);
            }
        }

        const { data, error } = await supabase
            .from("cuentas")
            .update(cambios)
            .eq("id", cuentaId)
            .select()
            .single();

        if (error) throw error;

        // Registrar auditoría de edición de cuenta
        await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: usuario.empresa_id,
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            tipo_accion: "editar",
            entidad_afectada: "Cuenta",
            entidad_id: data.codigo || data.id,
            descripcion: `Editó cuenta ${data.codigo} - ${data.nombre}`,
            datos_anteriores: anterior,
            datos_nuevos: data,
            resultado: "exitoso",
            req
        }).catch(() => {});

        return res.json({
            ...data,
            tiene_movimientos: tieneMovimientos,
            naturaleza: derivarNaturaleza(data.tipo)
        });
    } catch (error) {
        return responderError(res, error);
    }
});

// Eliminar cuenta contable
apiRouter.delete("/cuentas/:id", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");

        const cuentaId = req.params.id;
        const { data: anterior } = await supabase
            .from("cuentas")
            .select("*")
            .eq("id", cuentaId)
            .eq("empresa_id", usuario.empresa_id)
            .maybeSingle();

        if (!anterior) {
            const err = new Error("Cuenta no encontrada.");
            err.statusCode = 404;
            throw err;
        }

        // Regla: Si ya tiene movimientos, NO eliminar; solo permitir inactivar
        const { count: movimientosCount } = await supabase
            .from("detalle_asientos")
            .select("id", { count: "exact", head: true })
            .eq("cuenta_id", cuentaId);

        if (movimientosCount && movimientosCount > 0) {
            throw new Error("No se puede eliminar la cuenta porque ya registra movimientos en asientos contables. Solo puedes inactivarla.");
        }

        // Verificar subcuentas dependientes
        const { count: subcuentasCount } = await supabase
            .from("cuentas")
            .select("id", { count: "exact", head: true })
            .eq("cuenta_padre_id", cuentaId);

        if (subcuentasCount && subcuentasCount > 0) {
            throw new Error(`No se puede eliminar la cuenta porque tiene ${subcuentasCount} subcuenta(s) dependiente(s). Reasigna o elimina las subcuentas primero.`);
        }

        const { error } = await supabase
            .from("cuentas")
            .delete()
            .eq("id", cuentaId);

        if (error) throw error;

        // Registrar auditoría de eliminación de cuenta
        await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: usuario.empresa_id,
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            tipo_accion: "eliminar",
            entidad_afectada: "Cuenta",
            entidad_id: anterior.codigo || anterior.id,
            descripcion: `Eliminó cuenta ${anterior.codigo} - ${anterior.nombre}`,
            datos_anteriores: anterior,
            resultado: "exitoso",
            req
        }).catch(() => {});

        return res.json({ mensaje: "Cuenta eliminada con éxito." });
    } catch (error) {
        return responderError(res, error);
    }
});

// Importación en bloque del catálogo (agregar o reemplazar)
apiRouter.post("/cuentas/importar", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");

        const { cuentas = [], modo = "agregar" } = req.body || {};
        if (!Array.isArray(cuentas) || cuentas.length === 0) {
            throw new Error("No se recibieron cuentas para importar.");
        }

        if (modo === "reemplazar") {
            const { data: asientosEmpresa } = await supabase
                .from("asientos")
                .select("id")
                .eq("empresa_id", usuario.empresa_id);

            const idsAsientos = (asientosEmpresa || []).map(a => a.id);
            let totalMovimientos = 0;
            if (idsAsientos.length > 0) {
                const { count } = await supabase
                    .from("detalle_asientos")
                    .select("id", { count: "exact", head: true })
                    .in("asiento_id", idsAsientos);
                totalMovimientos = count || 0;
            }

            if (totalMovimientos > 0) {
                throw new Error("No se puede reemplazar el catálogo completo porque ya existen asientos contables registrados con movimientos. Elige la opción 'Agregar al existente'.");
            }

            await supabase.from("cuentas").delete().eq("empresa_id", usuario.empresa_id);
        }

        // Mapa de cuentas existentes para resolver cuentas padre
        const { data: existentes } = await supabase
    .from("cuentas")
    .select("id, codigo, tipo")
    .eq("empresa_id", usuario.empresa_id);
        const mapaCodigos = new Map((existentes || []).map(c => [String(c.codigo).trim().toUpperCase(), { id: c.id, tipo: c.tipo }]));

        // Orden jerárquico para insertar padres antes de subcuentas
        const jerarquia = { GRUPO: 1, SUBGRUPO: 2, CUENTA: 3, SUBCUENTA: 4 };
        const ordenadas = [...cuentas].sort((a, b) => {
            const nivelA = jerarquia[String(a.nivel || "").toUpperCase()] || 5;
            const nivelB = jerarquia[String(b.nivel || "").toUpperCase()] || 5;
            return nivelA - nivelB;
        });

        const insertadas = [];
        for (const fila of ordenadas) {
            const codigo = String(fila.codigo || "").trim();
            const codigoUpper = codigo.toUpperCase();
            const nombre = String(fila.nombre || "").trim();
            const tipo = String(fila.tipo || "").trim().toUpperCase();
            const nivel = String(fila.nivel || "").trim().toUpperCase();
            const padreCodigo = fila.cuenta_padre_codigo ? String(fila.cuenta_padre_codigo).trim().toUpperCase() : null;

            // Si ya existe en base de datos en modo agregar, actualizar datos básicos y continuar
            if (mapaCodigos.has(codigoUpper)) {
                const idExistente = mapaCodigos.get(codigoUpper).id;
                await supabase
                    .from("cuentas")
                    .update({
                        nombre,
                        estado: fila.estado !== false
                    })
                    .eq("id", idExistente);
                continue;
            }

            let cuentaPadreId = null;
            if (padreCodigo && mapaCodigos.has(padreCodigo)) {
                cuentaPadreId = mapaCodigos.get(padreCodigo).id;
            } else if (nivel !== "GRUPO") {
                // Resolución automática de padre por prefijo contable
                for (let len = codigoUpper.length - 1; len >= 1; len--) {
                    const prefijo = codigoUpper.slice(0, len);
                    if (mapaCodigos.has(prefijo)) {
                        cuentaPadreId = mapaCodigos.get(prefijo).id;
                        break;
                    }
                }
            }

            const permiteMov = (nivel === "GRUPO" || nivel === "SUBGRUPO") ? false : Boolean(fila.permite_movimientos);

            const registro = {
                codigo,
                nombre,
                tipo,
                nivel,
                cuenta_padre_id: cuentaPadreId,
                permite_movimientos: permiteMov,
                estado: fila.estado !== false,
                empresa_id: usuario.empresa_id
            };

            const { data: creada, error: errCrear } = await supabase
                .from("cuentas")
                .insert([registro])
                .select()
                .single();

            if (errCrear) throw errCrear;

            mapaCodigos.set(codigoUpper, { id: creada.id, tipo: creada.tipo });
            insertadas.push(creada);
        }

        // Auditoría
        await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: usuario.empresa_id,
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            tipo_accion: "crear",
            entidad_afectada: "Cuenta",
            entidad_id: `Importación (${modo})`,
            descripcion: `Importó ${insertadas.length} cuentas al catálogo en modo "${modo}"`,
            datos_nuevos: { cantidad: insertadas.length, modo },
            resultado: "exitoso",
            req
        }).catch(() => {});

        return res.status(201).json({
            mensaje: `Catálogo importado exitosamente (${insertadas.length} cuentas creadas).`,
            total: insertadas.length
        });
    } catch (error) {
        return responderError(res, error);
    }
});

// Cargar el catálogo predeterminado del sistema para la empresa del usuario
apiRouter.post("/cuentas/catalogo-predeterminado", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");

        const { data: existentesCount } = await supabase
            .from("cuentas")
            .select("id", { count: "exact", head: true })
            .eq("empresa_id", usuario.empresa_id);

        if (existentesCount && existentesCount > 0 && req.body?.forzar !== true) {
            const error = new Error("Tu empresa ya tiene cuentas en el catálogo. Si querés cargar el predeterminado de todas formas, confirmá la acción.");
            error.statusCode = 409;
            throw error;
        }

        const mapaCodigos = new Map();
        const insertadas = [];

        // Insertar en orden jerárquico: grupo, subgrupo, cuenta, subcuenta
        const jerarquia = { GRUPO: 1, SUBGRUPO: 2, CUENTA: 3, SUBCUENTA: 4 };
        const ordenadas = [...CATALOGO_PREDETERMINADO].sort((a, b) => jerarquia[a.nivel] - jerarquia[b.nivel]);

        // Determinar cuáles son "hoja" (sin hijos) para permite_movimientos
        const tienesHijos = new Set(CATALOGO_PREDETERMINADO.map(c => c.padre).filter(Boolean));

        // Cargar cuentas existentes de la empresa para no duplicar códigos
const { data: existentesPrevias } = await supabase
    .from("cuentas")
    .select("id, codigo")
    .eq("empresa_id", usuario.empresa_id);
const codigosExistentes = new Map((existentesPrevias || []).map(c => [String(c.codigo).trim(), c.id]));

for (const fila of ordenadas) {
    const esHoja = !tienesHijos.has(fila.codigo);
    const permiteMov = (fila.nivel === "CUENTA" || fila.nivel === "SUBCUENTA") && esHoja;

    // Si el código ya existe para esta empresa, lo saltamos (no lo duplicamos)
    if (codigosExistentes.has(fila.codigo)) {
        mapaCodigos.set(fila.codigo, codigosExistentes.get(fila.codigo));
        continue;
    }

    const registro = {
        codigo: fila.codigo,
        nombre: fila.nombre,
        tipo: fila.tipo,
        nivel: fila.nivel,
        cuenta_padre_id: fila.padre ? mapaCodigos.get(fila.padre) : null,
        permite_movimientos: permiteMov,
        estado: true,
        empresa_id: usuario.empresa_id
    };

    const { data: creada, error } = await supabase
        .from("cuentas")
        .insert([registro])
        .select()
        .single();

    if (error) throw error;

    mapaCodigos.set(fila.codigo, creada.id);
    insertadas.push(creada);
}

        await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: usuario.empresa_id,
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            tipo_accion: "crear",
            entidad_afectada: "Cuenta",
            entidad_id: "Catálogo predeterminado",
            descripcion: `Cargó el catálogo de cuentas predeterminado (${insertadas.length} cuentas)`,
            resultado: "exitoso",
            req
        }).catch(() => {});

        return res.status(201).json({
            mensaje: `Catálogo predeterminado cargado (${insertadas.length} cuentas).`,
            total: insertadas.length
        });
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/empresas", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        const { data, error } = await supabase
            .from("empresas")
            .select("*")
            .eq("id", usuario.empresa_id)
            .eq("estado", true)
            .order("nombre_empresa");

        if (error) {
            throw error;
        }

        return res.json(data || []);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/usuario-actual", async (req, res) => {
    try {
        return res.json(await obtenerUsuarioAutenticado(req));
    } catch (error) {
        return responderError(res, error);
    }
});

// Permisos del rol del usuario logueado (el front los usa para mostrar u ocultar el menú).
apiRouter.get("/permisos", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);

        const { data, error } = await supabase
            .from("roles_permisos")
            .select("*")
            .eq("rol", usuario.rol)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return res.json(data || {});
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/asientos/siguiente-numero", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);

        const { data, error } = await supabase
            .from("asientos")
            .select("numero_partida")
            .eq("empresa_id", usuario.empresa_id)
            .order("numero_partida", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return res.json({ siguiente: Number(data?.numero_partida || 0) + 1 });
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.post("/empresas", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);

        if (usuario.rol !== "ADMIN") {
            const error = new Error("Solo un usuario ADMIN puede crear empresas.");
            error.statusCode = 403;
            throw error;
        }

        const nombre = String(req.body?.nombre_empresa || req.body?.nombre || "").trim();

        if (!nombre) {
            throw new Error("El nombre de la empresa es obligatorio.");
        }

        const { data, error } = await supabase
            .from("empresas")
            .insert([{ nombre_empresa: nombre }])
            .select()
            .single();

        if (error) {
            throw error;
        }

        return res.status(201).json(data);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.post("/registro", async (req, res) => {
    try {
        exigirClaveDeEscritura();

        const nombre = String(req.body?.nombre || "").trim();
        const nombreEmpresa = String(req.body?.nombre_empresa || "").trim();
        const correo = String(req.body?.correo || "").trim().toLowerCase();
        const password = String(req.body?.password || "");

        if (!nombre) throw new Error("Tu nombre es obligatorio.");
        if (!nombreEmpresa) throw new Error("El nombre de la empresa es obligatorio.");
        if (!correo) throw new Error("El correo es obligatorio.");
        if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");

        const { data: usuarioExistente } = await supabase
            .from("usuarios")
            .select("id")
            .ilike("correo", correo)
            .maybeSingle();

        if (usuarioExistente) {
            const error = new Error("Ya existe un usuario registrado con ese correo.");
            error.statusCode = 409;
            throw error;
        }

        let { data: empresa, error: errorBuscarEmpresa } = await supabase
            .from("empresas")
            .select("id")
            .ilike("nombre_empresa", nombreEmpresa)
            .maybeSingle();

        if (errorBuscarEmpresa) throw errorBuscarEmpresa;

        if (empresa) {
            const { count } = await supabase
                .from("usuarios")
                .select("id", { count: "exact", head: true })
                .eq("empresa_id", empresa.id);

            if (count > 0) {
                const error = new Error("Esa empresa ya está registrada. Pídele a su administrador que te cree un usuario.");
                error.statusCode = 409;
                throw error;
            }
        }

        if (!empresa) {
            const { data: empresaCreada, error: errorCrearEmpresa } = await supabase
                .from("empresas")
                .insert([{ nombre_empresa: nombreEmpresa, estado: true }])
                .select("id")
                .single();

            if (errorCrearEmpresa) throw errorCrearEmpresa;
            empresa = empresaCreada;
        }

        const { data: usuarioAuthCreado, error: errorAuthCrear } = await supabase.auth.admin.createUser({
            email: correo,
            password,
            email_confirm: true
        });

        if (errorAuthCrear) {
            const error = new Error(errorAuthCrear.message?.includes("already been registered")
                ? "Ese correo ya está registrado en Authentication."
                : errorAuthCrear.message || "No se pudo crear el usuario de autenticación.");
            error.statusCode = 409;
            throw error;
        }

        const { data: usuarioCreado, error: errorCrearUsuario } = await supabase
            .from("usuarios")
            .insert([{
                empresa_id: empresa.id,
                nombre,
                correo,
                rol: "ADMIN",
                estado: true,
                auth_id: usuarioAuthCreado.user.id
            }])
            .select("id, empresa_id, nombre, correo, rol, estado")
            .single();

        if (errorCrearUsuario) {
            await supabase.auth.admin.deleteUser(usuarioAuthCreado.user.id);
            throw errorCrearUsuario;
        }

        return res.status(201).json(usuarioCreado);
    } catch (error) {
        return responderError(res, error);
    }
});

// ==========================================================
// Gestión de usuarios de la empresa (solo roles con puede_gestionar_usuarios)
// ==========================================================

// Usuarios de la empresa del usuario logueado.
apiRouter.get("/usuarios", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_gestionar_usuarios");

        const { data, error } = await supabase
            .from("usuarios")
            .select("id, nombre, correo, rol, estado")
            .eq("empresa_id", usuario.empresa_id)
            .order("id", { ascending: true });

        if (error) {
            throw error;
        }

        return res.json(data || []);
    } catch (error) {
        return responderError(res, error);
    }
});

// Crea un usuario nuevo con acceso a la empresa del administrador.
apiRouter.post("/usuarios", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const administrador = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(administrador, "puede_gestionar_usuarios");

        const nombre = String(req.body?.nombre || "").trim();
        const correo = String(req.body?.correo || "").trim().toLowerCase();
        const password = String(req.body?.password || "");
        const rol = String(req.body?.rol || "");

        if (!nombre) throw new Error("El nombre es obligatorio.");
        if (!correo) throw new Error("El correo es obligatorio.");
        if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
        if (!ROLES_VALIDOS.includes(rol)) throw new Error("El rol no es válido.");

        const { data: usuarioExistente } = await supabase
            .from("usuarios")
            .select("id")
            .ilike("correo", correo)
            .maybeSingle();

        if (usuarioExistente) {
            const error = new Error("Ya existe un usuario registrado con ese correo.");
            error.statusCode = 409;
            throw error;
        }

        const { data: usuarioAuth, error: errorAuth } = await supabase.auth.admin.createUser({
            email: correo,
            password,
            email_confirm: true
        });

        if (errorAuth) {
            const error = new Error(errorAuth.message?.includes("already been registered")
                ? "Ese correo ya está registrado en Authentication."
                : errorAuth.message || "No se pudo crear el usuario de autenticación.");
            error.statusCode = 409;
            throw error;
        }

        // el usuario queda en la empresa del administrador, nunca en otra
        const { data: usuarioCreado, error: errorUsuario } = await supabase
            .from("usuarios")
            .insert([{
                empresa_id: administrador.empresa_id,
                nombre,
                correo,
                rol,
                estado: true,
                auth_id: usuarioAuth.user.id
            }])
            .select("id, nombre, correo, rol, estado")
            .single();

        if (errorUsuario) {
            // no deja un usuario huérfano en Authentication
            await supabase.auth.admin.deleteUser(usuarioAuth.user.id);
            throw errorUsuario;
        }

        // Registrar auditoría de creación de usuario (sin guardar contraseña)
        await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: administrador.empresa_id,
            usuario_id: administrador.id,
            usuario_nombre: administrador.nombre,
            tipo_accion: "crear",
            entidad_afectada: "Usuario",
            entidad_id: usuarioCreado.id,
            descripcion: `Creó usuario ${usuarioCreado.nombre} (${usuarioCreado.correo}) con rol ${usuarioCreado.rol}`,
            datos_nuevos: {
                id: usuarioCreado.id,
                nombre: usuarioCreado.nombre,
                correo: usuarioCreado.correo,
                rol: usuarioCreado.rol,
                estado: usuarioCreado.estado
            },
            resultado: "exitoso",
            req
        }).catch(e => console.warn("Error log auditoria:", e.message));

        return res.status(201).json(usuarioCreado);
    } catch (error) {
        // Registrar error en auditoría si es posible
        if (req?.usuario) {
            registrarAuditoria({
                supabaseClient: supabase,
                empresa_id: req.usuario.empresa_id,
                usuario_id: req.usuario.id,
                usuario_nombre: req.usuario.nombre,
                tipo_accion: "crear",
                entidad_afectada: "Usuario",
                descripcion: `Intento fallido de crear usuario ${req.body?.nombre || ""} (${req.body?.correo || ""})`,
                resultado: error.statusCode === 403 ? "denegado por permisos" : "error",
                detalles_error: error.message,
                req
            }).catch(() => {});
        }
        return responderError(res, error);
    }
});

// Cambia el rol o activa/desactiva a un usuario de la misma empresa.
apiRouter.patch("/usuarios/:id", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const administrador = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(administrador, "puede_gestionar_usuarios");

        const cambios = {};

        if (req.body?.rol !== undefined) {
            if (!ROLES_VALIDOS.includes(req.body.rol)) throw new Error("El rol no es válido.");
            cambios.rol = req.body.rol;
        }

        if (req.body?.estado !== undefined) {
            cambios.estado = Boolean(req.body.estado);
        }

        if (!Object.keys(cambios).length) {
            throw new Error("No hay cambios que aplicar.");
        }

        // solo puede tocar usuarios de su propia empresa
        const { data: objetivo, error: errorObjetivo } = await supabase
            .from("usuarios")
            .select("id, nombre, correo, rol, estado")
            .eq("id", req.params.id)
            .eq("empresa_id", administrador.empresa_id)
            .maybeSingle();

        if (errorObjetivo) {
            throw errorObjetivo;
        }

        if (!objetivo) {
            const error = new Error("No se encontró ese usuario en tu empresa.");
            error.statusCode = 404;
            throw error;
        }

        // la empresa nunca se puede quedar sin un ADMIN activo
        const seguiraSiendoAdminActivo = (cambios.rol ?? objetivo.rol) === "ADMIN" && (cambios.estado ?? objetivo.estado);

        if (objetivo.rol === "ADMIN" && objetivo.estado && !seguiraSiendoAdminActivo) {
            const { count } = await supabase
                .from("usuarios")
                .select("id", { count: "exact", head: true })
                .eq("empresa_id", administrador.empresa_id)
                .eq("rol", "ADMIN")
                .eq("estado", true);

            if ((count || 0) <= 1) {
                throw new Error("La empresa debe tener al menos un ADMIN activo.");
            }
        }

        const { data, error } = await supabase
            .from("usuarios")
            .update(cambios)
            .eq("id", objetivo.id)
            .select("id, nombre, correo, rol, estado")
            .single();

        if (error) {
            throw error;
        }

        // Registrar auditoría de edición de usuario
        const detallesCambios = [];
        if (cambios.rol !== undefined && cambios.rol !== objetivo.rol) detallesCambios.push(`rol: ${objetivo.rol} → ${cambios.rol}`);
        if (cambios.estado !== undefined && cambios.estado !== objetivo.estado) detallesCambios.push(`estado: ${objetivo.estado ? "Activo" : "Inactivo"} → ${cambios.estado ? "Activo" : "Inactivo"}`);

        await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: administrador.empresa_id,
            usuario_id: administrador.id,
            usuario_nombre: administrador.nombre,
            tipo_accion: "editar",
            entidad_afectada: "Usuario",
            entidad_id: objetivo.id,
            descripcion: `Editó usuario ${objetivo.nombre} (${detallesCambios.join(", ") || "actualización"})`,
            datos_anteriores: { rol: objetivo.rol, estado: objetivo.estado },
            datos_nuevos: { rol: data.rol, estado: data.estado },
            resultado: "exitoso",
            req
        }).catch(e => console.warn("Error log auditoria:", e.message));

        return res.json(data);
    } catch (error) {
        return responderError(res, error);
    }
});

// Eliminar usuario
apiRouter.delete("/usuarios/:id", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const administrador = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(administrador, "puede_gestionar_usuarios");

        const { data: objetivo, error: errorObjetivo } = await supabase
            .from("usuarios")
            .select("id, nombre, correo, rol, estado, auth_id")
            .eq("id", req.params.id)
            .eq("empresa_id", administrador.empresa_id)
            .maybeSingle();

        if (errorObjetivo) throw errorObjetivo;
        if (!objetivo) {
            const error = new Error("No se encontró ese usuario.");
            error.statusCode = 404;
            throw error;
        }

        if (objetivo.id === administrador.id) {
            throw new Error("No puedes eliminar tu propia cuenta de usuario.");
        }

        if (objetivo.auth_id) {
            await supabase.auth.admin.deleteUser(objetivo.auth_id).catch(() => {});
        }

        const { error: errorBorrar } = await supabase
            .from("usuarios")
            .delete()
            .eq("id", objetivo.id);

        if (errorBorrar) throw errorBorrar;

        // Registrar auditoría de eliminación de usuario
        await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: administrador.empresa_id,
            usuario_id: administrador.id,
            usuario_nombre: administrador.nombre,
            tipo_accion: "eliminar",
            entidad_afectada: "Usuario",
            entidad_id: objetivo.id,
            descripcion: `Eliminó usuario ${objetivo.nombre} (${objetivo.correo})`,
            datos_anteriores: {
                id: objetivo.id,
                nombre: objetivo.nombre,
                correo: objetivo.correo,
                rol: objetivo.rol,
                estado: objetivo.estado
            },
            resultado: "exitoso",
            req
        }).catch(() => {});

        return res.json({ mensaje: "Usuario eliminado con éxito.", id: objetivo.id });
    } catch (error) {
        return responderError(res, error);
    }
});

// Cambiar contraseña de un usuario
apiRouter.post("/usuarios/:id/cambiar-password", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const administrador = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(administrador, "puede_gestionar_usuarios");

        const nuevaPassword = String(req.body?.password || "");
        if (nuevaPassword.length < 6) throw new Error("La nueva contraseña debe tener al menos 6 caracteres.");

        const { data: objetivo } = await supabase
            .from("usuarios")
            .select("id, nombre, correo, auth_id")
            .eq("id", req.params.id)
            .eq("empresa_id", administrador.empresa_id)
            .maybeSingle();

        if (!objetivo) {
            const error = new Error("Usuario no encontrado.");
            error.statusCode = 404;
            throw error;
        }

        if (objetivo.auth_id) {
            await supabase.auth.admin.updateUserById(objetivo.auth_id, { password: nuevaPassword });
        }

        // Registrar auditoría de cambio de contraseña (SIN detalles de contraseña)
        await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: administrador.empresa_id,
            usuario_id: administrador.id,
            usuario_nombre: administrador.nombre,
            tipo_accion: "editar",
            entidad_afectada: "Usuario",
            entidad_id: objetivo.id,
            descripcion: `Cambió contraseña del usuario ${objetivo.nombre}`,
            resultado: "exitoso",
            req
        }).catch(() => {});

        return res.json({ mensaje: "Contraseña actualizada con éxito." });
    } catch (error) {
        return responderError(res, error);
    }
});

// ==========================================================
// Asientos y libros
// ==========================================================

apiRouter.post("/asientos/validar", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");

        const detalles = req.body?.detalles || [];
        const ids = [...new Set(detalles.map(detalle => detalle.cuenta_id).filter(Boolean))];
        const cuentas = await cargarCuentas(ids, usuario.empresa_id);
        return res.json(validarPartidaDoble(detalles, cuentas));
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.post("/asientos-recurrentes", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");

        const recurrente = req.body?.recurrente || {};
        exigirEmpresaDelUsuario(usuario, recurrente.empresa_id);

        const fechaBase = String(recurrente.fecha_base || "");
        const concepto = String(recurrente.concepto || "").trim();
        const modoIva = String(recurrente.modo_iva || "incluido");
        const detalles = Array.isArray(recurrente.detalles) ? recurrente.detalles : [];
        const diaRecurrencia = Number(recurrente.dia_recurrencia || fechaBase.slice(-2));

        if (!fechaValida(fechaBase)) throw new Error("La fecha base de la recurrencia no es válida.");
        if (!concepto) throw new Error("El concepto de la recurrencia es obligatorio.");
        if (!['incluido', 'mas', 'sin'].includes(modoIva)) throw new Error("El modo de IVA no es válido.");
        if (!Number.isInteger(diaRecurrencia) || diaRecurrencia < 1 || diaRecurrencia > 31) {
            throw new Error("El día de recurrencia debe estar entre 1 y 31.");
        }
        if (detalles.length < 2 || detalles.some(detalle => !detalle.cuenta_id)) {
            throw new Error("La recurrencia debe conservar al menos dos cuentas válidas.");
        }

        const ids = [...new Set(detalles.map(detalle => detalle.cuenta_id).filter(Boolean))];
        const cuentas = await cargarCuentas(ids, usuario.empresa_id);
        if (cuentas.length !== ids.length || cuentas.some(cuenta => cuenta.permite_movimientos !== true)) {
            throw new Error("La recurrencia contiene cuentas inexistentes o no movibles.");
        }

        const detallesValidados = detalles.map((detalle, indice) => {
            const debe = Number(detalle.debe || 0);
            const haber = Number(detalle.haber || 0);
            if (!Number.isFinite(debe) || !Number.isFinite(haber) || debe < 0 || haber < 0 || (debe > 0 && haber > 0)) {
                throw new Error(`La línea recurrente ${indice + 1} tiene importes inválidos.`);
            }
            return {
                cuenta_id: detalle.cuenta_id,
                descripcion: String(detalle.descripcion || ""),
                debe,
                haber,
                orden: indice
            };
        });

        const { data: plantilla, error: errorPlantilla } = await supabase
            .from("asientos_recurrentes")
            .insert({
                empresa_id: Number(usuario.empresa_id),
                usuario_id: usuario.id,
                concepto,
                fecha_base: fechaBase,
                dia_recurrencia: diaRecurrencia,
                modo_iva: modoIva,
                proxima_fecha: siguienteFechaMensual(fechaBase, diaRecurrencia)
            })
            .select("id, empresa_id, concepto, fecha_base, dia_recurrencia, modo_iva, activo, proxima_fecha")
            .single();

        if (errorPlantilla) throw errorPlantilla;

        const { error: errorDetalles } = await supabase
            .from("detalle_asientos_recurrentes")
            .insert(detallesValidados.map(detalle => ({
                ...detalle,
                asiento_recurrente_id: plantilla.id
            })));

        if (errorDetalles) {
            await supabase.from("asientos_recurrentes").delete().eq("id", plantilla.id);
            throw errorDetalles;
        }

        return res.status(201).json(plantilla);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/asientos-recurrentes/pendientes", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");

        const fechaConsulta = fechaValida(req.query.fecha) ? req.query.fecha : hoyIso();
        const { data: plantillas, error: errorPlantillas } = await supabase
            .from("asientos_recurrentes")
            .select("id, empresa_id, concepto, modo_iva, dia_recurrencia, proxima_fecha")
            .eq("empresa_id", usuario.empresa_id)
            .eq("activo", true)
            .lte("proxima_fecha", fechaConsulta);

        if (errorPlantillas) throw errorPlantillas;
        if (!plantillas?.length) return res.json([]);

        const ids = plantillas.map(plantilla => plantilla.id);
        await supabase
            .from("asientos_recurrentes_ocurrencias")
            .upsert(plantillas.map(plantilla => ({
                asiento_recurrente_id: plantilla.id,
                fecha_propuesta: plantilla.proxima_fecha,
                mes_propuesta: primerDiaDelMes(plantilla.proxima_fecha)
            })), { onConflict: "asiento_recurrente_id,mes_propuesta", ignoreDuplicates: true });

        const [{ data: ocurrencias, error: errorOcurrencias }, { data: detalles, error: errorDetalles }] = await Promise.all([
            supabase
                .from("asientos_recurrentes_ocurrencias")
                .select("id, asiento_recurrente_id, fecha_propuesta, estado")
                .in("asiento_recurrente_id", ids)
                .eq("estado", "PENDIENTE")
                .lte("fecha_propuesta", fechaConsulta)
                .order("fecha_propuesta", { ascending: true }),
            supabase
                .from("detalle_asientos_recurrentes")
                .select("asiento_recurrente_id, cuenta_id, descripcion, debe, haber, orden")
                .in("asiento_recurrente_id", ids)
                .order("orden", { ascending: true })
        ]);

        if (errorOcurrencias) throw errorOcurrencias;
        if (errorDetalles) throw errorDetalles;

        const plantillasPorId = new Map(plantillas.map(plantilla => [String(plantilla.id), plantilla]));
        const detallesPorPlantilla = new Map();
        for (const detalle of detalles || []) {
            const clave = String(detalle.asiento_recurrente_id);
            const lista = detallesPorPlantilla.get(clave) || [];
            lista.push({
                cuenta_id: String(detalle.cuenta_id),
                descripcion: detalle.descripcion || "",
                debe: String(detalle.debe ?? ""),
                haber: String(detalle.haber ?? "")
            });
            detallesPorPlantilla.set(clave, lista);
        }

        return res.json((ocurrencias || []).map(ocurrencia => {
            const plantilla = plantillasPorId.get(String(ocurrencia.asiento_recurrente_id));
            const lineas = detallesPorPlantilla.get(String(ocurrencia.asiento_recurrente_id)) || [];
            return {
                id: ocurrencia.id,
                recurrente_id: ocurrencia.asiento_recurrente_id,
                empresa_id: plantilla.empresa_id,
                fecha_propuesta: ocurrencia.fecha_propuesta,
                concepto: plantilla.concepto,
                modo_iva: plantilla.modo_iva,
                detalles: lineas,
                total_debe: lineas.reduce((total, linea) => total + Number(linea.debe || 0), 0),
                total_haber: lineas.reduce((total, linea) => total + Number(linea.haber || 0), 0)
            };
        }));
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.post("/asientos-recurrentes/ocurrencias/:id/procesar", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");
        const ocurrencia = await obtenerOcurrenciaDeEmpresa(req.params.id, usuario.empresa_id);
        if (ocurrencia.estado !== "PENDIENTE") throw new Error("La propuesta recurrente ya fue procesada.");

        const { data: marcada, error: errorMarcada } = await supabase
            .from("asientos_recurrentes_ocurrencias")
            .update({
                estado: "REGISTRADO",
                asiento_id: req.body?.asiento_id || null,
                usuario_procesamiento_id: usuario.id,
                fecha_procesamiento: new Date().toISOString()
            })
            .eq("id", ocurrencia.id)
            .eq("estado", "PENDIENTE")
            .select("id, estado, fecha_propuesta")
            .maybeSingle();

        if (errorMarcada) throw errorMarcada;
        if (!marcada) throw new Error("La propuesta recurrente ya fue procesada por otra acción.");

        const plantilla = await obtenerRecurrenteDeEmpresa(ocurrencia.asiento_recurrente_id, usuario.empresa_id);
        const { error: errorSiguiente } = await supabase
            .from("asientos_recurrentes")
            .update({
                proxima_fecha: siguienteFechaMensual(ocurrencia.fecha_propuesta, plantilla.dia_recurrencia),
                fecha_actualizacion: new Date().toISOString()
            })
            .eq("id", plantilla.id);

        if (errorSiguiente) throw errorSiguiente;
        return res.json({ ok: true, ocurrencia: marcada });
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.post("/asientos-recurrentes/ocurrencias/:id/omitir", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");
        const ocurrencia = await obtenerOcurrenciaDeEmpresa(req.params.id, usuario.empresa_id);
        if (ocurrencia.estado !== "PENDIENTE") throw new Error("La propuesta recurrente ya fue procesada.");

        const { data: marcada, error: errorMarcada } = await supabase
            .from("asientos_recurrentes_ocurrencias")
            .update({
                estado: "OMITIDO",
                usuario_procesamiento_id: usuario.id,
                fecha_procesamiento: new Date().toISOString()
            })
            .eq("id", ocurrencia.id)
            .eq("estado", "PENDIENTE")
            .select("id, estado, fecha_propuesta")
            .maybeSingle();

        if (errorMarcada) throw errorMarcada;
        if (!marcada) throw new Error("La propuesta recurrente ya fue procesada por otra acción.");

        const plantilla = await obtenerRecurrenteDeEmpresa(ocurrencia.asiento_recurrente_id, usuario.empresa_id);
        const { error: errorSiguiente } = await supabase
            .from("asientos_recurrentes")
            .update({
                proxima_fecha: siguienteFechaMensual(ocurrencia.fecha_propuesta, plantilla.dia_recurrencia),
                fecha_actualizacion: new Date().toISOString()
            })
            .eq("id", plantilla.id);

        if (errorSiguiente) throw errorSiguiente;
        return res.json({ ok: true, ocurrencia: marcada });
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.patch("/asientos-recurrentes/ocurrencias/:id/desactivar", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");
        const ocurrencia = await obtenerOcurrenciaDeEmpresa(req.params.id, usuario.empresa_id);
        const plantilla = await obtenerRecurrenteDeEmpresa(ocurrencia.asiento_recurrente_id, usuario.empresa_id);

        const { error: errorPlantilla } = await supabase
            .from("asientos_recurrentes")
            .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
            .eq("id", plantilla.id);

        if (errorPlantilla) throw errorPlantilla;
        if (ocurrencia.estado === "PENDIENTE") {
            await supabase
                .from("asientos_recurrentes_ocurrencias")
                .update({
                    estado: "OMITIDO",
                    usuario_procesamiento_id: usuario.id,
                    fecha_procesamiento: new Date().toISOString()
                })
                .eq("id", ocurrencia.id)
                .eq("estado", "PENDIENTE");
        }
        return res.json({ ok: true });
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.post("/asientos", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");

        const asiento = req.body?.asiento || {};
        const detalles = req.body?.detalles || [];

        exigirEmpresaDelUsuario(usuario, asiento.empresa_id);

        if (!asiento.fecha) throw new Error("La fecha es obligatoria.");
        if (!String(asiento.concepto || "").trim()) throw new Error("El concepto es obligatorio.");

        const ids = [...new Set(detalles.map(d => d.cuenta_id).filter(Boolean))];
        const { data: cuentas, error: errorCuentas } = await supabase
            .from("cuentas")
            .select("id, codigo, nombre, permite_movimientos")
            .in("id", ids);

        if (errorCuentas) throw errorCuentas;

        const invalidas = cuentas.filter(c => c.permite_movimientos !== true);
        if (invalidas.length || cuentas.length !== ids.length) {
            throw new Error("Hay cuentas inexistentes o que no permiten movimiento.");
        }

        const { data, error } = await supabase.rpc("guardar_asiento", {
            p_empresa_id: Number(asiento.empresa_id),
            p_fecha: asiento.fecha,
            p_concepto: String(asiento.concepto || "").trim(),
            p_usuario_id: usuario.id,
            p_lineas: detalles.map(detalle => ({
                cuenta_id: detalle.cuenta_id,
                descripcion: detalle.descripcion || "",
                debe: Number(detalle.debe || 0),
                haber: Number(detalle.haber || 0)
            }))
        });

        if (error) throw error;

        // Registrar auditoría de creación de asiento contable
        const numPartida = data?.numero_partida || data?.id || "";
        await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: usuario.empresa_id,
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            tipo_accion: "crear",
            entidad_afectada: "Asiento",
            entidad_id: numPartida,
            descripcion: `Creó asiento #${numPartida}: ${asiento.concepto}`,
            datos_nuevos: {
                numero_partida: numPartida,
                fecha: asiento.fecha,
                concepto: asiento.concepto,
                total_debe: detalles.reduce((acc, d) => acc + Number(d.debe || 0), 0),
                total_haber: detalles.reduce((acc, d) => acc + Number(d.haber || 0), 0),
                movimientos: detalles.map(d => ({
                    cuenta_id: d.cuenta_id,
                    descripcion: d.descripcion,
                    debe: Number(d.debe || 0),
                    haber: Number(d.haber || 0)
                }))
            },
            resultado: "exitoso",
            req
        }).catch(e => console.warn("Error log auditoria asiento:", e.message));

        return res.status(201).json(data);
    } catch (error) {
        if (req?.usuario) {
            registrarAuditoria({
                supabaseClient: supabase,
                empresa_id: req.usuario.empresa_id,
                usuario_id: req.usuario.id,
                usuario_nombre: req.usuario.nombre,
                tipo_accion: "crear",
                entidad_afectada: "Asiento",
                descripcion: `Intento fallido de crear asiento: ${req.body?.asiento?.concepto || "Sin concepto"}`,
                resultado: error.statusCode === 403 ? "denegado por permisos" : "error",
                detalles_error: error.message,
                req
            }).catch(() => {});
        }
        return responderError(res, error);
    }
});

// Ver detalle de un asiento específico (auditoría "ver")
apiRouter.get("/asientos/:id", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const { data, error } = await supabase
            .from("asientos")
            .select(`
                id,
                fecha,
                numero_partida,
                concepto,
                estado,
                detalle_asientos(
                    cuenta_id,
                    descripcion,
                    debe,
                    haber,
                    cuentas(id, codigo, nombre)
                )
            `)
            .eq("id", req.params.id)
            .eq("empresa_id", usuario.empresa_id)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            const err = new Error("Asiento no encontrado.");
            err.statusCode = 404;
            throw err;
        }

        // Registrar auditoría de visualización de asiento
        registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: usuario.empresa_id,
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            tipo_accion: "ver",
            entidad_afectada: "Asiento",
            entidad_id: data.numero_partida || data.id,
            descripcion: `Consultó detalle del asiento #${data.numero_partida || data.id}`,
            resultado: "exitoso",
            req
        }).catch(() => {});

        return res.json(data);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/libro-diario", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const { data: cuentas, error: errorCuentas } = await supabase
        .from("cuentas")
        .select("id, codigo, nombre, cuenta_padre_id")
        .eq("empresa_id", usuario.empresa_id);

        if (errorCuentas) {
            throw errorCuentas;
        }

        const cuentasPorId = new Map((cuentas || []).map(cuenta => [String(cuenta.id), cuenta]));
        const { data, error } = await supabase
            .from("asientos")
            .select(`
                id,
                fecha,
                numero_partida,
                concepto,
                estado,
                detalle_asientos(
                    cuenta_id,
                    descripcion,
                    debe,
                    haber,
                    cuentas(id, codigo, nombre, cuenta_padre_id)
                )
            `)
            .eq("empresa_id", usuario.empresa_id)
            .eq("estado", "CONTABILIZADO")
            .order("fecha", { ascending: true })
            .order("numero_partida", { ascending: true });

        if (error) {
            throw error;
        }

        const asientosConPadres = (data || []).map(asiento => ({
            ...asiento,
            detalle_asientos: (asiento.detalle_asientos || []).map(detalle => ({
                ...detalle,
                cuentas: {
                    ...detalle.cuentas,
                    cuenta_padre: cuentasPorId.get(String(detalle.cuentas?.cuenta_padre_id)) || null
                }
            }))
        }));

        return res.json(asientosConPadres);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/kardex", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        const { desde, hasta } = req.query;

        let query = supabase
            .from("asientos")
            .select(`
                id,
                fecha,
                numero_partida,
                concepto,
                estado,
                detalle_asientos(
                    cuenta_id,
                    descripcion,
                    debe,
                    haber,
                    cuentas(id, codigo, nombre, cuenta_padre_id)
                )
            `)
            .eq("empresa_id", usuario.empresa_id)
            .eq("estado", "CONTABILIZADO");

        if (desde) {
            query = query.gte("fecha", desde);
        }
        if (hasta) {
            query = query.lte("fecha", hasta);
        }

        const { data, error } = await query
            .order("fecha", { ascending: true })
            .order("numero_partida", { ascending: true });

        if (error) {
            throw error;
        }

        return res.json(data || []);
    } catch (error) {
        return responderError(res, error);
    }
});

// Calcula dinámicamente el saldo final valorizado del Kardex hasta una fecha de corte
async function calcularInventarioKardex(supabaseClient, empresaId, hasta) {
    try {
        let query = supabaseClient
            .from("asientos")
            .select(`
                id,
                fecha,
                numero_partida,
                concepto,
                estado,
                detalle_asientos(
                    cuenta_id,
                    descripcion,
                    debe,
                    haber,
                    cuentas(id, codigo, nombre)
                )
            `)
            .eq("empresa_id", empresaId)
            .eq("estado", "CONTABILIZADO");

        if (hasta) {
            query = query.lte("fecha", hasta);
        }

        const { data: asientos, error } = await query
            .order("fecha", { ascending: true })
            .order("numero_partida", { ascending: true });

        if (error || !asientos || asientos.length === 0) return 0;

        let existencias = 0;
        let saldoTotal = 0;
        let costoPromedio = 0;

        const CANTIDADES_DEFAULT = { 1: 678, 3: 1000, 4: 100, 5: 600, 12: 250, 13: 5 };

        for (const asiento of asientos) {
            const numPartida = Number(asiento.numero_partida || asiento.id || 0);
            const detalles = asiento.detalle_asientos || [];

            for (const det of detalles) {
                const cuenta = det.cuentas || {};
                const codigo = String(cuenta.codigo || "").trim();
                const nombre = String(cuenta.nombre || "").toLowerCase();
                const debe = Number(det.debe || 0);
                const haber = Number(det.haber || 0);

                let tipo = null;
                let monto = 0;

                if (numPartida === 1 && (codigo.startsWith("1103") || nombre.includes("inventario")) && debe > 0) {
                    tipo = "INVENTARIO_INICIAL";
                    monto = debe;
                } else if ((codigo.startsWith("4101") || nombre.includes("compra")) && debe > 0) {
                    tipo = "COMPRA";
                    monto = debe;
                } else if ((codigo.startsWith("4102") || (nombre.includes("devoluci") && nombre.includes("compra"))) && haber > 0) {
                    tipo = "DEVOLUCION_COMPRA";
                    monto = haber;
                } else if ((codigo.startsWith("5101") || (nombre.includes("venta") && !nombre.includes("devoluci"))) && haber > 0) {
                    tipo = "VENTA";
                    monto = haber;
                } else if ((codigo.startsWith("5102") || (nombre.includes("devoluci") && nombre.includes("venta"))) && debe > 0) {
                    tipo = "DEVOLUCION_VENTA";
                    monto = debe;
                } else if ((codigo.startsWith("1103") || nombre.includes("inventario")) && numPartida !== 1) {
                    if (debe > 0) { tipo = "COMPRA"; monto = debe; }
                    else if (haber > 0) { tipo = "VENTA"; monto = haber; }
                }

                if (!tipo) continue;

                let cantidad = CANTIDADES_DEFAULT[numPartida] || 0;
                if (!cantidad) {
                    const texto = `${asiento.concepto || ""} ${det.descripcion || ""}`;
                    const match = texto.match(/(\d+[\d,.]*)\s*(unidades|unid|uds|articulos|piezas|pares|cajas|quintales)/i)
                        || texto.match(/(?:compra|venta|devolución|devolucion|adquisición|saldo|inicio)\s+(?:de\s+)?(\d+[\d,.]*)/i)
                        || texto.match(/\b(\d{2,6})\b/);
                    if (match) cantidad = parseFloat(match[1].replace(/,/g, ""));
                }
                if (!cantidad || cantidad <= 0) cantidad = 1;

                if (tipo === "INVENTARIO_INICIAL" || tipo === "COMPRA") {
                    existencias += cantidad;
                    saldoTotal += monto;
                    costoPromedio = existencias > 0 ? (saldoTotal / existencias) : (monto / cantidad);
                } else if (tipo === "DEVOLUCION_COMPRA") {
                    const costoSalida = monto > 0 ? monto : Number((cantidad * costoPromedio).toFixed(2));
                    existencias = Math.max(0, existencias - cantidad);
                    saldoTotal = Math.max(0, Number((saldoTotal - costoSalida).toFixed(2)));
                    if (existencias > 0) costoPromedio = saldoTotal / existencias;
                } else if (tipo === "VENTA") {
                    const costoSalida = Number((cantidad * costoPromedio).toFixed(2));
                    existencias = Math.max(0, existencias - cantidad);
                    saldoTotal = Math.max(0, Number((saldoTotal - costoSalida).toFixed(2)));
                    if (existencias > 0) costoPromedio = saldoTotal / existencias;
                } else if (tipo === "DEVOLUCION_VENTA") {
                    const costoEntrada = Number((cantidad * costoPromedio).toFixed(2));
                    existencias += cantidad;
                    saldoTotal = Number((saldoTotal + costoEntrada).toFixed(2));
                    if (existencias > 0) costoPromedio = saldoTotal / existencias;
                }
            }
        }

        return Number(saldoTotal.toFixed(2));
    } catch (err) {
        console.warn("Error al calcular inventario Kardex en backend:", err);
        return 0;
    }
}

apiRouter.get("/libro-mayor", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const desde = req.query.desde;
        const hasta = req.query.hasta;

        if (!desde || !hasta) {
            return res.status(400).json({ error: "El Libro Mayor requiere fecha desde y fecha hasta." });
        }

        const { data, error } = await supabase.rpc("libro_mayor", {
            p_empresa_id: usuario.empresa_id,
            p_desde: desde,
            p_hasta: hasta
        });

        if (error) {
            throw error;
        }

        return res.json(data || []);
    } catch (error) {
        return responderError(res, error);
    }
});

// Movimientos del Libro Mayor, uno por línea de asiento (para las cuentas T).
apiRouter.get("/libro-mayor/movimientos", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const { desde, hasta } = req.query;

        if (!desde || !hasta) {
            return res.status(400).json({ error: "Se requiere fecha desde y fecha hasta." });
        }

        const { data: catalogo, error: errorCatalogo } = await supabase
    .from("cuentas")
    .select("id, codigo, nombre, nivel, cuenta_padre_id")
    .eq("empresa_id", usuario.empresa_id);

        if (errorCatalogo) throw errorCatalogo;

        const cuentasPorId = new Map((catalogo || []).map(c => [c.id, c]));

        const { data, error } = await supabase
            .from("asientos")
            .select("fecha, numero_partida, detalle_asientos(cuenta_id, debe, haber)")
            .eq("empresa_id", usuario.empresa_id)
            .eq("estado", "CONTABILIZADO")
            .gte("fecha", desde)
            .lte("fecha", hasta)
            .order("fecha", { ascending: true })
            .order("numero_partida", { ascending: true });

        if (error) throw error;

        const movimientos = [];

        for (const asiento of data || []) {
            for (const d of asiento.detalle_asientos || []) {
                const cuenta = cuentasPorId.get(d.cuenta_id);
                if (!cuenta) continue;

                // la cuenta mayor de una subcuenta es su padre
                const mayor = cuenta.nivel === "SUBCUENTA" && cuenta.cuenta_padre_id
                    ? cuentasPorId.get(cuenta.cuenta_padre_id) || cuenta
                    : cuenta;

                movimientos.push({
                    fecha: asiento.fecha,
                    partida: asiento.numero_partida,
                    debe: Number(d.debe),
                    haber: Number(d.haber),
                    cuenta: { id: cuenta.id, codigo: cuenta.codigo, nombre: cuenta.nombre },
                    mayor: { id: mayor.id, codigo: mayor.codigo, nombre: mayor.nombre }
                });
            }
        }

        return res.json(movimientos);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/estado-resultados", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const { desde, hasta } = req.query;

        if (!desde || !hasta) {
            return res.status(400).json({ error: "El Estado de Resultados requiere fecha desde y fecha hasta." });
        }

        // el inventario final lo calcula el kardex y lo manda el front
        const inventarioFinal = Number(req.query.inventario_final || 0);

        if (!Number.isFinite(inventarioFinal) || inventarioFinal < 0) {
            throw new Error("El inventario final no es válido.");
        }

        const { data: mayorPeriodo, error: errorPeriodo } = await supabase.rpc("libro_mayor", {
            p_empresa_id: usuario.empresa_id,
            p_desde: desde,
            p_hasta: hasta
        });

        if (errorPeriodo) throw errorPeriodo;

        // inventario inicial: lo que tiene la cuenta 1103 acumulado hasta la fecha final
        const { data: mayorAcumulado, error: errorAcumulado } = await supabase.rpc("libro_mayor", {
            p_empresa_id: usuario.empresa_id,
            p_desde: "1900-01-01",
            p_hasta: hasta
        });

        if (errorAcumulado) throw errorAcumulado;

        const inventarioInicial = req.query.inventario_inicial === undefined
            ? inventarioDelMayor(mayorAcumulado || [])
            : Number(req.query.inventario_inicial);

        if (!Number.isFinite(inventarioInicial) || inventarioInicial < 0) {
            throw new Error("El inventario inicial no es válido.");
        }

        const { data: empresa, error: errorEmpresa } = await supabase
            .from("empresas")
            .select("nombre_empresa")
            .eq("id", usuario.empresa_id)
            .maybeSingle();

        if (errorEmpresa) throw errorEmpresa;

        return res.json({
            empresa: empresa?.nombre_empresa || "",
            desde,
            hasta,
            inventarioInicial,
            inventarioFinal,
            estado: calcularEstadoResultados(mayorPeriodo || [], inventarioInicial, inventarioFinal)
        });
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/balance-general", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const { desde, hasta } = req.query;
        if (!desde || !hasta) {
            return res.status(400).json({ error: "El Balance General requiere fecha desde y fecha hasta (o fecha de corte)." });
        }

        let inventarioFinal = Number(req.query.inventario_final ?? req.query.inventarioFinal ?? 0);
        if (!Number.isFinite(inventarioFinal) || inventarioFinal <= 0) {
            inventarioFinal = await calcularInventarioKardex(supabase, usuario.empresa_id, hasta);
            if (!inventarioFinal || inventarioFinal <= 0) {
                inventarioFinal = 0;
            }
        }

        // Obtener catálogo de cuentas para nombres y niveles oficiales
        const { data: catalogo } = await supabase
        .from("cuentas")
        .select("id, codigo, nombre, nivel, cuenta_padre_id, permite_movimientos")
        .eq("empresa_id", usuario.empresa_id)
        .order("codigo");

        // Cuentas del período para el Estado de Resultados (utilidad del ejercicio)
        let mayorPeriodo = [];
        try {
            const { data: dataPeriodo, error: errorPeriodo } = await supabase.rpc("libro_mayor", {
                p_empresa_id: usuario.empresa_id,
                p_desde: desde,
                p_hasta: hasta
            });
            if (errorPeriodo) {
                console.warn("Advertencia en rpc libro_mayor (periodo):", errorPeriodo.message);
            } else {
                mayorPeriodo = dataPeriodo || [];
            }
        } catch (e) {
            console.warn("Excepción llamando rpc libro_mayor (periodo):", e.message);
        }

        // Cuentas acumuladas hasta la fecha de corte (balance acumulativo)
        let mayorAcumulado = [];
        try {
            const { data: dataAcumulado, error: errorAcumulado } = await supabase.rpc("libro_mayor", {
                p_empresa_id: usuario.empresa_id,
                p_desde: "1900-01-01",
                p_hasta: hasta
            });
            if (errorAcumulado) {
                console.warn("Advertencia en rpc libro_mayor (acumulado):", errorAcumulado.message);
            } else {
                mayorAcumulado = dataAcumulado || [];
            }
        } catch (e) {
            console.warn("Excepción llamando rpc libro_mayor (acumulado):", e.message);
        }

        // Respaldo de contingencia: si el RPC devolvió vacío o falló, construir el mayor desde asientos contabilizados
        if (!mayorAcumulado || mayorAcumulado.length === 0) {
            try {
                const { data: asientos, error: errAsientos } = await supabase
                    .from("asientos")
                    .select("id, fecha, detalle_asientos(cuenta_id, debe, haber)")
                    .eq("empresa_id", usuario.empresa_id)
                    .eq("estado", "CONTABILIZADO")
                    .lte("fecha", hasta);

                if (!errAsientos && asientos && asientos.length > 0) {
                    const mapSaldos = new Map();
                    const mapCatalogo = new Map((catalogo || []).map(c => [String(c.id), c]));

                    for (const a of asientos) {
                        for (const d of (a.detalle_asientos || [])) {
                            const cid = String(d.cuenta_id);
                            const cInfo = mapCatalogo.get(cid);
                            const cod = cInfo ? cInfo.codigo : cid;
                            const nom = cInfo ? cInfo.nombre : "";
                            if (!mapSaldos.has(cod)) {
                                mapSaldos.set(cod, {
                                    codigo: cod,
                                    nombre: nom,
                                    total_debe: 0,
                                    total_haber: 0
                                });
                            }
                            const obj = mapSaldos.get(cod);
                            obj.total_debe += Number(d.debe || 0);
                            obj.total_haber += Number(d.haber || 0);
                        }
                    }
                    mayorAcumulado = Array.from(mapSaldos.values());
                }
            } catch (fallbackErr) {
                console.warn("Error en fallback mayor acumulado:", fallbackErr);
            }
        }

        const inventarioInicial = req.query.inventario_inicial === undefined
            ? inventarioDelMayor(mayorAcumulado || [])
            : Number(req.query.inventario_inicial);

        const { data: empresa, error: errorEmpresa } = await supabase
            .from("empresas")
            .select("nombre_empresa")
            .eq("id", usuario.empresa_id)
            .maybeSingle();
        if (errorEmpresa) throw errorEmpresa;

        const resultado = calcularBalanceGeneral({
            filasMayorAcumulado: mayorAcumulado || [],
            catalogoCuentas: catalogo || [],
            inventarioFinalKardex: inventarioFinal,
            mayorPeriodo: mayorPeriodo || [],
            inventarioInicial
        });

        return res.json({
            empresa: empresa?.nombre_empresa || "",
            desde,
            hasta,
            ...resultado
        });
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/ratios-financieros", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const anioActual = new Date().getFullYear();
        const desde = req.query.desde || `${anioActual}-01-01`;
        const hasta = req.query.hasta || `${anioActual}-12-31`;

        let inventarioFinal = Number(req.query.inventario_final ?? req.query.inventarioFinal ?? 0);
        if (!Number.isFinite(inventarioFinal) || inventarioFinal <= 0) {
            inventarioFinal = await calcularInventarioKardex(supabase, usuario.empresa_id, hasta);
            if (!inventarioFinal || inventarioFinal <= 0) {
                inventarioFinal = 0;
            }
        }

        // 1. Mayor del período filtrado (para ratios de flujo: ventas, costos, gastos)
        const { data: mayorPeriodo, error: errorPeriodo } = await supabase.rpc("libro_mayor", {
            p_empresa_id: usuario.empresa_id,
            p_desde: desde,
            p_hasta: hasta
        });
        if (errorPeriodo) throw errorPeriodo;

        // 2. Mayor acumulado hasta la fecha fin (para ratios de saldo: activos, pasivos, patrimonio)
        const { data: mayorAcumuladoFin, error: errorAcumuladoFin } = await supabase.rpc("libro_mayor", {
            p_empresa_id: usuario.empresa_id,
            p_desde: "1900-01-01",
            p_hasta: hasta
        });
        if (errorAcumuladoFin) throw errorAcumuladoFin;

        // 3. Mayor acumulado hasta la fecha inicio (para calcular saldos iniciales de los promedios)
        let mayorAcumuladoInicio = [];
        try {
            const { data: mInicio, error: errorInicio } = await supabase.rpc("libro_mayor", {
                p_empresa_id: usuario.empresa_id,
                p_desde: "1900-01-01",
                p_hasta: desde
            });
            if (!errorInicio && mInicio) {
                mayorAcumuladoInicio = mInicio;
            }
        } catch {
            mayorAcumuladoInicio = [];
        }

        // Inventario inicial y final calculados dinámicamente
        let inventarioInicial = req.query.inventario_inicial !== undefined
            ? Number(req.query.inventario_inicial)
            : 0;

        if (!inventarioInicial || inventarioInicial <= 0) {
            const invMayorInicio = inventarioDelMayor(mayorAcumuladoInicio || []);
            if (invMayorInicio > 0) {
                inventarioInicial = invMayorInicio;
            } else {
                inventarioInicial = inventarioDelMayor(mayorAcumuladoFin || []);
            }
        }

        const inventarioFinalCalculado = inventarioFinal > 0
            ? inventarioFinal
            : inventarioDelMayor(mayorAcumuladoFin || []);

        // 4. Nombre de la empresa
        const { data: empresa } = await supabase
            .from("empresas")
            .select("nombre_empresa")
            .eq("id", usuario.empresa_id)
            .maybeSingle();

        // 5. Generar cortes para la tendencia mensual (últimos 6 meses hasta 'hasta')
        const historicosMensuales = [];
        try {
            const fechaFinDate = new Date(hasta.includes("T") ? hasta : `${hasta}T12:00:00`);
            const anioFin = fechaFinDate.getFullYear();
            const mesFin = fechaFinDate.getMonth(); // 0-11
            const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

            const mesesCorte = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(anioFin, mesFin - i, 1);
                const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                const mesStr = String(d.getMonth() + 1).padStart(2, "0");
                const corteIso = `${d.getFullYear()}-${mesStr}-${String(ultimoDia).padStart(2, "0")}`;
                const inicioMesIso = `${d.getFullYear()}-${mesStr}-01`;
                mesesCorte.push({
                    etiqueta: `${nombresMeses[d.getMonth()]}`,
                    corteIso,
                    inicioMesIso
                });
            }

            // Consultar en paralelo los cortes mensuales
            const cortesResultados = await Promise.all(
                mesesCorte.map(async ({ etiqueta, corteIso, inicioMesIso }) => {
                    try {
                        const [{ data: mMes }, { data: mAcum }] = await Promise.all([
                            supabase.rpc("libro_mayor", {
                                p_empresa_id: usuario.empresa_id,
                                p_desde: inicioMesIso,
                                p_hasta: corteIso
                            }),
                            supabase.rpc("libro_mayor", {
                                p_empresa_id: usuario.empresa_id,
                                p_desde: "1900-01-01",
                                p_hasta: corteIso
                            })
                        ]);

                        const invMes = inventarioDelMayor(mAcum || []);
                        const calc = calcularRatios({
                            mayorPeriodo: mMes || [],
                            mayorAcumuladoFin: mAcum || [],
                            mayorAcumuladoInicio: [],
                            inventarioInicial: invMes,
                            inventarioFinal: invMes,
                            desde: inicioMesIso,
                            hasta: corteIso,
                            historicosMensuales: []
                        });

                        const liq = calc.secciones?.liquidez?.ratios || [];
                        const rent = calc.secciones?.rentabilidad?.ratios || [];
                        const solv = calc.secciones?.solvencia?.ratios || [];
                        const efic = calc.secciones?.eficiencia?.ratios || [];

                        const buscar = (lista, id) => lista.find(r => r.id === id)?.valor || 0;

                        return {
                            mes: etiqueta,
                            razonCorriente: Number(buscar(liq, "razonCorriente") || 0),
                            pruebaAcida: Number(buscar(liq, "pruebaAcida") || 0),
                            capitalTrabajoNeto: Number(buscar(liq, "capitalTrabajoNeto") || 0),
                            margenBruto: Number(buscar(rent, "margenBruto") || 0),
                            margenOperativo: Number(buscar(rent, "margenOperativo") || 0),
                            margenNeto: Number(buscar(rent, "margenNeto") || 0),
                            roa: Number(buscar(rent, "roa") || 0),
                            roe: Number(buscar(rent, "roe") || 0),
                            razonDeudaTotal: Number(buscar(solv, "razonDeudaTotal") || 0),
                            deudaPatrimonio: Number(buscar(solv, "deudaPatrimonio") || 0),
                            coberturaIntereses: Number(buscar(solv, "coberturaIntereses") || 0),
                            rotacionInventario: Number(buscar(efic, "rotacionInventario") || 0),
                            diasInventario: Number(buscar(efic, "diasInventario") || 0),
                            rotacionCuentasCobrar: Number(buscar(efic, "rotacionCuentasCobrar") || 0),
                            periodoPromedioCobro: Number(buscar(efic, "periodoPromedioCobro") || 0),
                            rotacionActivosTotales: Number(buscar(efic, "rotacionActivosTotales") || 0),
                            cicloConversionEfectivo: Number(buscar(efic, "cicloConversionEfectivo") || 0)
                        };
                    } catch {
                        return { mes: etiqueta };
                    }
                })
            );

            historicosMensuales.push(...cortesResultados);
        } catch (errHist) {
            console.warn("No se pudo calcular la tendencia mensual completa:", errHist);
        }

        const resultado = calcularRatios({
            mayorPeriodo: mayorPeriodo || [],
            mayorAcumuladoFin: mayorAcumuladoFin || [],
            mayorAcumuladoInicio: mayorAcumuladoInicio || [],
            inventarioInicial,
            inventarioFinal: inventarioFinalCalculado,
            desde,
            hasta,
            historicosMensuales
        });

        return res.json({
            empresa: empresa?.nombre_empresa || "",
            ...resultado
        });
    } catch (error) {
        return responderError(res, error);
    }
});

// ==========================================================
// Módulo de Auditoría (Logs_Auditoria)
// ==========================================================

// Consulta el historial de logs de auditoría con paginación, filtros y resumen de métricas
apiRouter.get("/auditoria", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_gestionar_usuarios");

        // Si no activó "incluir_mis_acciones", excluimos sus propias acciones por defecto
        const excluirMisAcciones = req.query.incluir_mis_acciones !== "true";
        const excluirUsuarioId = excluirMisAcciones ? usuario.id : null;

        const resultado = await consultarLogsAuditoria({
            supabaseClient: supabase,
            empresa_id: usuario.empresa_id,
            desde: req.query.desde,
            hasta: req.query.hasta,
            usuario_id: req.query.usuario_id,
            tipo_accion: req.query.tipo_accion,
            entidad_afectada: req.query.entidad_afectada,
            resultado: req.query.resultado,
            buscar: req.query.buscar,
            excluir_usuario_id: excluirUsuarioId,
            pagina: req.query.pagina,
            limite: req.query.limite,
            orden_campo: req.query.orden_campo,
            orden_dir: req.query.orden_dir
        });

        return res.json(resultado);
    } catch (error) {
        return responderError(res, error);
    }
});

// Registrar un log de auditoría desde el cliente (ej. descarga de reportes, etc.)
apiRouter.post("/auditoria", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        const {
            tipo_accion,
            entidad_afectada,
            entidad_id,
            descripcion,
            datos_anteriores,
            datos_nuevos,
            resultado,
            detalles_error
        } = req.body || {};

        const logRegistrado = await registrarAuditoria({
            supabaseClient: supabase,
            empresa_id: usuario.empresa_id,
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            tipo_accion: tipo_accion || "ver",
            entidad_afectada: entidad_afectada || "General",
            entidad_id,
            descripcion: descripcion || "Acción registrada",
            datos_anteriores,
            datos_nuevos,
            resultado: resultado || "exitoso",
            detalles_error,
            req
        });

        return res.status(201).json(logRegistrado);
    } catch (error) {
        return responderError(res, error);
    }
});

// Registrar rutas tanto en /api como en la raíz del enrutador
app.use("/api", apiRouter);
app.use(apiRouter);

export { app, apiRouter };
export default app;

// Si se ejecuta directamente (ej. node backend/server.js) y no en Vercel, abrir puerto
const isDirectRun = process.argv[1] && (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server.ts"));
if (isDirectRun && !process.env.VERCEL) {
    app.listen(puerto, "0.0.0.0", () => {
        console.log(`API contable escuchando en http://localhost:${puerto}`);
    });
}
