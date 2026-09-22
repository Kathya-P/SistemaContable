import "dotenv/config";
import cors from "cors";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { validarPartidaDoble } from "./contabilidad.js";
import { calcularEstadoResultados, inventarioDelMayor } from "./Estadoresultados.js";
import { calcularBalanceGeneral } from "./balanceGeneral.js";
import { calcularRatios } from "./ratiosFinancieros.js";

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
app.use(express.json());

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

async function cargarCuentas(ids) {
    const { data, error } = await supabase
        .from("cuentas")
        .select("id, codigo, nombre, nivel, cuenta_padre_id")
        .in("id", ids);

    if (error) {
        throw error;
    }

    return data || [];
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

apiRouter.get("/cuentas", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_catalogo");

        const { data, error } = await supabase
            .from("cuentas")
            .select("*")
            .order("codigo");

        if (error) {
            throw error;
        }

        return res.json(data || []);
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
        const usuario = await obtenerUsuarioAutenticado(req);
        const [{ data: permisos, error: errorPermisos }, { data: empresa, error: errorEmpresa }] = await Promise.all([
            supabase
                .from("roles_permisos")
                .select("*")
                .eq("rol", usuario.rol)
                .maybeSingle(),
            supabase
                .from("empresas")
                .select("id, nombre_empresa, nit, estado")
                .eq("id", usuario.empresa_id)
                .maybeSingle()
        ]);

        if (errorPermisos) throw errorPermisos;
        if (errorEmpresa) throw errorEmpresa;

        return res.json({
            usuario,
            empresa,
            permisos: permisos || {}
        });
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/usuarios", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_administrar_usuarios");

        const { data, error } = await supabase
            .from("usuarios")
            .select("id, nombre, correo, rol, estado, creado_en")
            .eq("empresa_id", usuario.empresa_id)
            .order("id");

        if (error) throw error;
        return res.json(data || []);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.post("/usuarios", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const administrador = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(administrador, "puede_administrar_usuarios");

        const { nombre, correo, contrasena, rol } = req.body || {};
        if (!nombre || !correo || !contrasena || !rol) {
            throw new Error("Nombre, correo, contraseña y rol son obligatorios.");
        }
        if (!ROLES_VALIDOS.includes(rol)) {
            throw new Error(`Rol inválido. Debe ser uno de: ${ROLES_VALIDOS.join(", ")}.`);
        }
        if (contrasena.length < 6) {
            throw new Error("La contraseña temporal debe tener al menos 6 caracteres.");
        }

        const { data: authData, error: errorAuth } = await supabase.auth.admin.createUser({
            email: correo.trim().toLowerCase(),
            password: contrasena,
            email_confirm: true,
            user_metadata: { nombre: nombre.trim(), empresa_id: administrador.empresa_id, rol }
        });

        if (errorAuth) throw errorAuth;

        const { data: usuarioCreado, error: errorUsuario } = await supabase
            .from("usuarios")
            .insert({
                auth_id: authData.user.id,
                empresa_id: administrador.empresa_id,
                nombre: nombre.trim(),
                correo: correo.trim().toLowerCase(),
                rol,
                estado: true
            })
            .select("id, nombre, correo, rol, estado, creado_en")
            .single();

        if (errorUsuario) {
            await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
            throw errorUsuario;
        }

        return res.status(201).json(usuarioCreado);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.patch("/usuarios/:id", async (req, res) => {
    try {
        exigirClaveDeEscritura();
        const administrador = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(administrador, "puede_administrar_usuarios");

        const cambios = {};
        if (req.body?.rol !== undefined) {
            if (!ROLES_VALIDOS.includes(req.body.rol)) {
                throw new Error(`Rol inválido. Debe ser uno de: ${ROLES_VALIDOS.join(", ")}.`);
            }
            cambios.rol = req.body.rol;
        }
        if (req.body?.estado !== undefined) {
            cambios.estado = Boolean(req.body.estado);
        }
        if (req.body?.nombre !== undefined) {
            cambios.nombre = String(req.body.nombre).trim();
        }

        const { data: objetivo, error: errorObjetivo } = await supabase
            .from("usuarios")
            .select("id, rol, estado")
            .eq("id", req.params.id)
            .eq("empresa_id", administrador.empresa_id)
            .maybeSingle();

        if (errorObjetivo) throw errorObjetivo;
        if (!objetivo) {
            const error = new Error("No se encontró ese usuario en tu empresa.");
            error.statusCode = 404;
            throw error;
        }

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

        if (error) throw error;
        return res.json(data);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.post("/asientos/validar", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_crear_asientos");

        const detalles = req.body?.detalles || [];
        const ids = [...new Set(detalles.map(detalle => detalle.cuenta_id).filter(Boolean))];
        const cuentas = await cargarCuentas(ids);
        return res.json(validarPartidaDoble(detalles, cuentas));
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
            p_detalles: detalles.map(d => ({
                cuenta_id: Number(d.cuenta_id),
                debe: Number(d.debe || 0),
                haber: Number(d.haber || 0),
                descripcion: d.descripcion ? String(d.descripcion).trim() : null
            })),
            p_numero_partida: asiento.numero_partida ? Number(asiento.numero_partida) : null
        });

        if (error) throw error;
        return res.status(201).json(data);
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/libro-diario", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const anioActual = new Date().getFullYear();
        const desde = req.query.desde || `${anioActual}-01-01`;
        const hasta = req.query.hasta || `${anioActual}-12-31`;

        const [{ data: partidas, error: errorPartidas }, { data: empresa, error: errorEmpresa }] = await Promise.all([
            supabase.rpc("libro_diario", {
                p_empresa_id: usuario.empresa_id,
                p_desde: desde,
                p_hasta: hasta
            }),
            supabase
                .from("empresas")
                .select("nombre_empresa")
                .eq("id", usuario.empresa_id)
                .maybeSingle()
        ]);

        if (errorPartidas) throw errorPartidas;
        if (errorEmpresa) throw errorEmpresa;

        return res.json({
            empresa: empresa?.nombre_empresa || "",
            desde,
            hasta,
            partidas: partidas || []
        });
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/libro-mayor", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const anioActual = new Date().getFullYear();
        const desde = req.query.desde || `${anioActual}-01-01`;
        const hasta = req.query.hasta || `${anioActual}-12-31`;

        const [{ data: cuentas, error: errorMayor }, { data: empresa, error: errorEmpresa }] = await Promise.all([
            supabase.rpc("libro_mayor", {
                p_empresa_id: usuario.empresa_id,
                p_desde: desde,
                p_hasta: hasta
            }),
            supabase
                .from("empresas")
                .select("nombre_empresa")
                .eq("id", usuario.empresa_id)
                .maybeSingle()
        ]);

        if (errorMayor) throw errorMayor;
        if (errorEmpresa) throw errorEmpresa;

        return res.json({
            empresa: empresa?.nombre_empresa || "",
            desde,
            hasta,
            cuentas: cuentas || []
        });
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/kardex", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const anioActual = new Date().getFullYear();
        const desde = req.query.desde || `${anioActual}-01-01`;
        const hasta = req.query.hasta || `${anioActual}-12-31`;
        const productoId = req.query.producto_id || null;

        const { data, error } = await supabase.rpc("kardex_peps", {
            p_empresa_id: usuario.empresa_id,
            p_desde: desde,
            p_hasta: hasta,
            p_producto_id: productoId ? Number(productoId) : null
        });

        if (error) throw error;
        return res.json(data || {});
    } catch (error) {
        return responderError(res, error);
    }
});

apiRouter.get("/estado-resultados", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const anioActual = new Date().getFullYear();
        const desde = req.query.desde || `${anioActual}-01-01`;
        const hasta = req.query.hasta || `${anioActual}-12-31`;

        const [{ data: mayorPeriodo, error: errorMayor }, { data: mayorInicial, error: errorInicial }, { data: empresa, error: errorEmpresa }] = await Promise.all([
            supabase.rpc("libro_mayor", {
                p_empresa_id: usuario.empresa_id,
                p_desde: desde,
                p_hasta: hasta
            }),
            supabase.rpc("libro_mayor", {
                p_empresa_id: usuario.empresa_id,
                p_desde: "1900-01-01",
                p_hasta: desde
            }),
            supabase
                .from("empresas")
                .select("nombre_empresa")
                .eq("id", usuario.empresa_id)
                .maybeSingle()
        ]);

        if (errorMayor) throw errorMayor;
        if (errorInicial) throw errorInicial;
        if (errorEmpresa) throw errorEmpresa;

        const inventarioInicial = inventarioDelMayor(mayorInicial || []);
        let inventarioFinal = Number(req.query.inventario_final ?? req.query.inventarioFinal ?? 0);
        if (!Number.isFinite(inventarioFinal) || inventarioFinal < 0) {
            inventarioFinal = 0;
        }

        const resultado = calcularEstadoResultados(
            mayorPeriodo || [],
            inventarioInicial,
            inventarioFinal
        );

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

apiRouter.get("/balance-general", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const anioActual = new Date().getFullYear();
        const desde = req.query.desde || `${anioActual}-01-01`;
        const hasta = req.query.hasta || `${anioActual}-12-31`;

        const [{ data: mayorAcumulado, error: errorAcumulado }, { data: mayorPeriodo, error: errorPeriodo }, { data: mayorInicial, error: errorInicial }] = await Promise.all([
            supabase.rpc("libro_mayor", {
                p_empresa_id: usuario.empresa_id,
                p_desde: "1900-01-01",
                p_hasta: hasta
            }),
            supabase.rpc("libro_mayor", {
                p_empresa_id: usuario.empresa_id,
                p_desde: desde,
                p_hasta: hasta
            }),
            supabase.rpc("libro_mayor", {
                p_empresa_id: usuario.empresa_id,
                p_desde: "1900-01-01",
                p_hasta: desde
            })
        ]);

        if (errorAcumulado) throw errorAcumulado;
        if (errorPeriodo) throw errorPeriodo;
        if (errorInicial) throw errorInicial;

        const inventarioInicial = inventarioDelMayor(mayorInicial || []);
        let inventarioFinal = Number(req.query.inventario_final ?? req.query.inventarioFinal ?? 0);
        if (!Number.isFinite(inventarioFinal) || inventarioFinal < 0) {
            inventarioFinal = 0;
        }

        const { data: empresa, error: errorEmpresa } = await supabase
            .from("empresas")
            .select("nombre_empresa")
            .eq("id", usuario.empresa_id)
            .maybeSingle();
        if (errorEmpresa) throw errorEmpresa;

        const resultado = calcularBalanceGeneral(
            mayorAcumulado || [],
            mayorPeriodo || [],
            inventarioInicial,
            inventarioFinal
        );

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

// ==========================================
// Ratios Financieros
// ==========================================
apiRouter.get("/ratios-financieros", async (req, res) => {
    try {
        const usuario = await obtenerUsuarioAutenticado(req);
        await exigirPermiso(usuario, "puede_ver_reportes");

        const anioActual = new Date().getFullYear();
        const desde = req.query.desde || `${anioActual}-01-01`;
        const hasta = req.query.hasta || `${anioActual}-12-31`;

        let inventarioFinal = Number(req.query.inventario_final ?? req.query.inventarioFinal ?? 0);
        if (!Number.isFinite(inventarioFinal) || inventarioFinal < 0) {
            inventarioFinal = 0;
        }

        // 1. Mayor del período filtrado (para flujos: ventas, costos, gastos)
        const { data: mayorPeriodo, error: errorPeriodo } = await supabase.rpc("libro_mayor", {
            p_empresa_id: usuario.empresa_id,
            p_desde: desde,
            p_hasta: hasta
        });
        if (errorPeriodo) throw errorPeriodo;

        // 2. Mayor acumulado hasta la fecha fin (para saldos acumulados de balance)
        const { data: mayorAcumuladoFin, error: errorAcumuladoFin } = await supabase.rpc("libro_mayor", {
            p_empresa_id: usuario.empresa_id,
            p_desde: "1900-01-01",
            p_hasta: hasta
        });
        if (errorAcumuladoFin) throw errorAcumuladoFin;

        // 3. Mayor acumulado hasta fecha inicio (para saldos iniciales de promedios)
        let mayorAcumuladoInicio = [];
        try {
            const { data: mInicio, error: errorInicio } = await supabase.rpc("libro_mayor", {
                p_empresa_id: usuario.empresa_id,
                p_desde: "1900-01-01",
                p_hasta: desde
            });
            if (!errorInicio && mInicio) mayorAcumuladoInicio = mInicio;
        } catch {
            mayorAcumuladoInicio = [];
        }

        const inventarioInicial = req.query.inventario_inicial !== undefined
            ? Number(req.query.inventario_inicial)
            : inventarioDelMayor(mayorAcumuladoInicio || []);

        const inventarioFinalCalculado = inventarioFinal > 0
            ? inventarioFinal
            : inventarioDelMayor(mayorAcumuladoFin || []);

        const { data: empresa } = await supabase
            .from("empresas")
            .select("nombre_empresa")
            .eq("id", usuario.empresa_id)
            .maybeSingle();

        // 4. Tendencia histórica de los últimos 6 meses
        const historicosMensuales = [];
        try {
            const fechaFinDate = new Date(hasta.includes("T") ? hasta : `${hasta}T12:00:00`);
            const anioFin = fechaFinDate.getFullYear();
            const mesFin = fechaFinDate.getMonth();
            const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

            const mesesCorte = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(anioFin, mesFin - i, 1);
                const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                const mesStr = String(d.getMonth() + 1).padStart(2, "0");
                mesesCorte.push({
                    etiqueta: `${nombresMeses[d.getMonth()]}`,
                    corteIso: `${d.getFullYear()}-${mesStr}-${String(ultimoDia).padStart(2, "0")}`,
                    inicioMesIso: `${d.getFullYear()}-${mesStr}-01`
                });
            }

            const cortesResultados = await Promise.all(
                mesesCorte.map(async ({ etiqueta, corteIso, inicioMesIso }) => {
                    try {
                        const [{ data: mMes }, { data: mAcum }] = await Promise.all([
                            supabase.rpc("libro_mayor", { p_empresa_id: usuario.empresa_id, p_desde: inicioMesIso, p_hasta: corteIso }),
                            supabase.rpc("libro_mayor", { p_empresa_id: usuario.empresa_id, p_desde: "1900-01-01", p_hasta: corteIso })
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

// Registrar rutas tanto en /api como en la raíz del enrutador
app.use("/api", apiRouter);
app.use(apiRouter);

export { app, apiRouter };
export default app;

const isDirectRun = process.argv[1] && (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server.ts"));
if (isDirectRun && !process.env.VERCEL) {
    app.listen(puerto, "0.0.0.0", () => {
        console.log(`API contable escuchando en http://localhost:${puerto}`);
    });
}
