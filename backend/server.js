import "dotenv/config";
import cors from "cors";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { validarPartidaDoble } from "./contabilidad.js";

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

    if (!token) {
        const error = new Error("Sesión requerida.");
        error.statusCode = 401;
        throw error;
    }

    const { data: usuarioAuth, error: errorAuth } = await supabase.auth.getUser(token);

    if (errorAuth || !usuarioAuth.user?.email) {
        const error = new Error("La sesión no es válida o expiró.");
        error.statusCode = 401;
        throw error;
    }

    const { data: usuario, error } = await supabase
        .from("usuarios")
        .select("id, empresa_id, nombre, correo, rol, estado")
        .eq("auth_id", usuarioAuth.user.id)
        .eq("estado", true)
        .maybeSingle();

    if (error || !usuario) {
        const errorUsuario = new Error("Tu correo está autenticado, pero no existe un usuario activo en el sistema contable.");
        errorUsuario.statusCode = 403;
        throw errorUsuario;
    }

    return usuario;
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

        return res.status(201).json(usuarioCreado);
    } catch (error) {
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
            .select("id, rol, estado")
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

        return res.json(data);
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
            p_usuario_id: usuario.id,
            p_lineas: detalles.map(detalle => ({
                cuenta_id: detalle.cuenta_id,
                descripcion: detalle.descripcion || "",
                debe: Number(detalle.debe || 0),
                haber: Number(detalle.haber || 0)
            }))
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

        const { data: cuentas, error: errorCuentas } = await supabase
            .from("cuentas")
            .select("id, codigo, nombre, cuenta_padre_id");

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
            .select("id, codigo, nombre, nivel, cuenta_padre_id");

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