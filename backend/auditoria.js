/**
 * Módulo de Auditoría para ContaCabal
 * Gestiona el registro y consulta de acciones realizadas por los usuarios en el sistema.
 */

// Búfer en memoria como salvaguarda ante latencia o mientras se aplica la migración en Supabase
const _logsEnMemoria = [];
let _idMemoriaAutoincremental = 1000;
let _tablaSupabaseExiste = null; // null: no verificado, true: existe, false: no existe

/**
 * Sanitiza y trunca objetos JSON para no guardar contraseñas y no saturar la base de datos
 * Límite estricto de 5000 caracteres por campo JSON.
 */
export function sanitizarYTruncar(objeto, limiteCaracteres = 5000) {
    if (!objeto || typeof objeto !== "object") return null;

    try {
        // Clonar profundamente para no mutar el objeto original
        const copia = JSON.parse(JSON.stringify(objeto));

        // Eliminar o enmascarar campos sensibles
        const enmascararSensibles = (obj) => {
            if (!obj || typeof obj !== "object") return;
            for (const clave of Object.keys(obj)) {
                const claveMin = clave.toLowerCase();
                if (
                    claveMin.includes("password") ||
                    claveMin.includes("contrasena") ||
                    claveMin.includes("clave") ||
                    claveMin.includes("secret") ||
                    claveMin.includes("token")
                ) {
                    obj[clave] = "********";
                } else if (typeof obj[clave] === "object" && obj[clave] !== null) {
                    enmascararSensibles(obj[clave]);
                }
            }
        };

        enmascararSensibles(copia);

        let jsonString = JSON.stringify(copia);
        if (jsonString.length > limiteCaracteres) {
            jsonString = jsonString.slice(0, limiteCaracteres - 20) + '..."[TRUNCADO]"}';
            try {
                return JSON.parse(jsonString);
            } catch {
                return { aviso: "Objeto truncado por exceder límite de 5000 caracteres." };
            }
        }

        return copia;
    } catch {
        return null;
    }
}

/**
 * Extrae la dirección IP del cliente desde los encabezados de la petición
 */
export function obtenerIpCliente(req) {
    if (!req) return "127.0.0.1";
    const xForwardedFor = req.headers?.["x-forwarded-for"];
    if (xForwardedFor) {
        return String(xForwardedFor).split(",")[0].trim();
    }
    return req.headers?.["x-real-ip"] || req.socket?.remoteAddress || req.ip || "127.0.0.1";
}

/**
 * Registra una acción de auditoría en la base de datos o en memoria
 */
export async function registrarAuditoria({
    supabaseClient,
    empresa_id = 1,
    usuario_id = null,
    usuario_nombre = "Sistema",
    tipo_accion, // "crear", "editar", "eliminar", "ver", "descargar"
    entidad_afectada, // "Asiento", "Usuario", "Cuenta", "Cliente", "Proveedor", "Configuracion", "Reporte"
    entidad_id = null,
    descripcion,
    datos_anteriores = null,
    datos_nuevos = null,
    ip_usuario = null,
    resultado = "exitoso", // "exitoso", "error", "denegado por permisos"
    detalles_error = null,
    req = null
}) {
    const ipFinal = ip_usuario || obtenerIpCliente(req);
    const ahora = new Date().toISOString();

    const registroLimpio = {
        empresa_id: empresa_id ? Number(empresa_id) : 1,
        usuario_id: usuario_id ? Number(usuario_id) : null,
        usuario_nombre: String(usuario_nombre || "Usuario").trim(),
        tipo_accion: String(tipo_accion || "ver").toLowerCase(),
        entidad_afectada: String(entidad_afectada || "General"),
        entidad_id: entidad_id !== null && entidad_id !== undefined ? String(entidad_id) : null,
        descripcion: String(descripcion || "").trim().slice(0, 500),
        datos_anteriores: sanitizarYTruncar(datos_anteriores),
        datos_nuevos: sanitizarYTruncar(datos_nuevos),
        ip_usuario: ipFinal,
        fecha_hora: ahora,
        resultado: ["exitoso", "error", "denegado por permisos"].includes(resultado) ? resultado : "exitoso",
        detalles_error: detalles_error ? String(detalles_error).slice(0, 1000) : null
    };

    // Intentar guardar en Supabase si no sabemos que la tabla no existe
    if (supabaseClient && _tablaSupabaseExiste !== false) {
        try {
            const { data, error } = await supabaseClient
                .from("logs_auditoria")
                .insert([registroLimpio])
                .select("id")
                .single();

            if (!error && data) {
                _tablaSupabaseExiste = true;
                return { ok: true, id: data.id, persistidoEnBD: true };
            }

            if (error) {
                if (
                    error.code === "PGRST204" ||
                    error.code === "PGRST202" ||
                    error.message?.includes("schema cache") ||
                    error.message?.includes("does not exist") ||
                    error.message?.includes("logs_auditoria")
                ) {
                    _tablaSupabaseExiste = false;
                }
                console.warn("[Auditoria] No se pudo escribir en logs_auditoria en Supabase, guardando en memoria:", error.message);
            }
        } catch (errSupabase) {
            console.warn("[Auditoria] Excepción al guardar en logs_auditoria:", errSupabase.message);
        }
    }

    // Salvaguarda en memoria (máximo 1000 registros para evitar consumo de memoria)
    _idMemoriaAutoincremental += 1;
    const registroMemoria = {
        id: _idMemoriaAutoincremental,
        ...registroLimpio
    };

    _logsEnMemoria.unshift(registroMemoria);
    if (_logsEnMemoria.length > 1000) {
        _logsEnMemoria.pop();
    }

    return { ok: true, id: registroMemoria.id, persistidoEnBD: false };
}

/**
 * Consulta y pagina los logs de auditoría con filtros avanzados y métricas para gráficos
 */
export async function consultarLogsAuditoria({
    supabaseClient,
    empresa_id = 1,
    desde = null,
    hasta = null,
    usuario_id = null,
    tipo_accion = null,
    entidad_afectada = null,
    resultado = null,
    buscar = "",
    excluir_usuario_id = null,
    pagina = 1,
    limite = 50,
    orden_campo = "fecha_hora",
    orden_dir = "desc"
}) {
    const numPagina = Math.max(1, parseInt(pagina, 10) || 1);
    const numLimite = Math.max(1, Math.min(100, parseInt(limite, 10) || 50));
    const offset = (numPagina - 1) * numLimite;

    let registros = [];
    let total = 0;
    let usaBaseDeDatos = false;

    // Intentar consultar desde Supabase
    if (supabaseClient && _tablaSupabaseExiste !== false) {
        try {
            let query = supabaseClient
                .from("logs_auditoria")
                .select("*", { count: "exact" })
                .eq("empresa_id", empresa_id);

            if (desde) {
                const desdeIso = desde.includes("T") ? desde : `${desde}T00:00:00.000Z`;
                query = query.gte("fecha_hora", desdeIso);
            }
            if (hasta) {
                const hastaIso = hasta.includes("T") ? hasta : `${hasta}T23:59:59.999Z`;
                query = query.lte("fecha_hora", hastaIso);
            }
            if (usuario_id && usuario_id !== "todos") {
                query = query.eq("usuario_id", Number(usuario_id));
            }
            if (excluir_usuario_id) {
                query = query.neq("usuario_id", Number(excluir_usuario_id));
            }
            if (tipo_accion && tipo_accion !== "todos") {
                query = query.eq("tipo_accion", tipo_accion.toLowerCase());
            }
            if (entidad_afectada && entidad_afectada !== "todas") {
                query = query.eq("entidad_afectada", entidad_afectada);
            }
            if (resultado && resultado !== "todos") {
                query = query.eq("resultado", resultado);
            }
            if (buscar && String(buscar).trim()) {
                const termino = `%${String(buscar).trim()}%`;
                query = query.or(`descripcion.ilike.${termino},usuario_nombre.ilike.${termino},entidad_id.ilike.${termino}`);
            }

            const ascendente = String(orden_dir).toLowerCase() === "asc";
            const campoValido = ["fecha_hora", "usuario_nombre", "tipo_accion", "entidad_afectada", "id"].includes(orden_campo)
                ? orden_campo
                : "fecha_hora";

            query = query.order(campoValido, { ascending: ascendente });
            query = query.range(offset, offset + numLimite - 1);

            const { data, count, error } = await query;

            if (!error && data) {
                _tablaSupabaseExiste = true;
                registros = data;
                total = count !== null ? count : data.length;
                usaBaseDeDatos = true;
            } else if (error) {
                if (
                    error.code === "PGRST204" ||
                    error.code === "PGRST202" ||
                    error.message?.includes("schema cache") ||
                    error.message?.includes("does not exist") ||
                    error.message?.includes("logs_auditoria")
                ) {
                    _tablaSupabaseExiste = false;
                }
            }
        } catch (errQ) {
            console.warn("[Auditoria] Error al consultar Supabase:", errQ.message);
        }
    }

    // Si Supabase no tiene la tabla aún, filtrar el búfer en memoria
    if (!usaBaseDeDatos) {
        let filtrados = [..._logsEnMemoria].filter(l => l.empresa_id === Number(empresa_id));

        if (desde) {
            const desdeTime = new Date(desde.includes("T") ? desde : `${desde}T00:00:00.000Z`).getTime();
            filtrados = filtrados.filter(l => new Date(l.fecha_hora).getTime() >= desdeTime);
        }
        if (hasta) {
            const hastaTime = new Date(hasta.includes("T") ? hasta : `${hasta}T23:59:59.999Z`).getTime();
            filtrados = filtrados.filter(l => new Date(l.fecha_hora).getTime() <= hastaTime);
        }
        if (usuario_id && usuario_id !== "todos") {
            filtrados = filtrados.filter(l => String(l.usuario_id) === String(usuario_id));
        }
        if (excluir_usuario_id) {
            filtrados = filtrados.filter(l => String(l.usuario_id) !== String(excluir_usuario_id));
        }
        if (tipo_accion && tipo_accion !== "todos") {
            filtrados = filtrados.filter(l => String(l.tipo_accion).toLowerCase() === String(tipo_accion).toLowerCase());
        }
        if (entidad_afectada && entidad_afectada !== "todas") {
            filtrados = filtrados.filter(l => String(l.entidad_afectada).toLowerCase() === String(entidad_afectada).toLowerCase());
        }
        if (resultado && resultado !== "todos") {
            filtrados = filtrados.filter(l => String(l.resultado) === String(resultado));
        }
        if (buscar && String(buscar).trim()) {
            const b = String(buscar).trim().toLowerCase();
            filtrados = filtrados.filter(l =>
                (l.descripcion && l.descripcion.toLowerCase().includes(b)) ||
                (l.usuario_nombre && l.usuario_nombre.toLowerCase().includes(b)) ||
                (l.entidad_id && String(l.entidad_id).toLowerCase().includes(b))
            );
        }

        const ascendente = String(orden_dir).toLowerCase() === "asc";
        filtrados.sort((a, b) => {
            let valA = a[orden_campo] || "";
            let valB = b[orden_campo] || "";
            if (orden_campo === "fecha_hora") {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            }
            if (valA < valB) return ascendente ? -1 : 1;
            if (valA > valB) return ascendente ? 1 : -1;
            return 0;
        });

        total = filtrados.length;
        registros = filtrados.slice(offset, offset + numLimite);
    }

    // Calcular estadísticas y series de tiempo para los gráficos (últimos 30 días)
    const resumen = await calcularResumenAuditoria({
        supabaseClient,
        empresa_id,
        usaBaseDeDatos,
        excluir_usuario_id
    });

    return {
        logs: registros,
        total,
        pagina: numPagina,
        limite: numLimite,
        totalPaginas: Math.ceil(total / numLimite) || 1,
        tablaExisteEnBD: _tablaSupabaseExiste === true,
        resumen
    };
}

/**
 * Genera el resumen para los mini gráficos:
 * 1. Acciones por día (últimos 30 días)
 * 2. % de acciones por tipo (crear, editar, eliminar, etc.)
 */
async function calcularResumenAuditoria({ supabaseClient, empresa_id, usaBaseDeDatos, excluir_usuario_id }) {
    const ahora = new Date();
    const hace30Dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const hace30DiasIso = hace30Dias.toISOString();

    let registros30 = [];

    if (usaBaseDeDatos && supabaseClient) {
        try {
            let q = supabaseClient
                .from("logs_auditoria")
                .select("id, tipo_accion, fecha_hora, resultado, usuario_id")
                .eq("empresa_id", empresa_id)
                .gte("fecha_hora", hace30DiasIso);

            if (excluir_usuario_id) {
                q = q.neq("usuario_id", Number(excluir_usuario_id));
            }

            const { data } = await q;
            if (data) registros30 = data;
        } catch {
            registros30 = [];
        }
    } else {
        registros30 = _logsEnMemoria.filter(l => {
            if (l.empresa_id !== Number(empresa_id)) return false;
            if (excluir_usuario_id && String(l.usuario_id) === String(excluir_usuario_id)) return false;
            return new Date(l.fecha_hora).getTime() >= hace30Dias.getTime();
        });
    }

    // 1. Acciones por día (30 slots continuos)
    const diasMapa = new Map();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const claveFecha = `${yyyy}-${mm}-${dd}`;
        const diaNombre = d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });

        diasMapa.set(claveFecha, {
            fecha: claveFecha,
            etiqueta: diaNombre,
            total: 0,
            crear: 0,
            editar: 0,
            eliminar: 0,
            otros: 0
        });
    }

    // 2. Conteo por tipo de acción
    const tiposConteo = {
        crear: 0,
        editar: 0,
        eliminar: 0,
        ver: 0,
        descargar: 0
    };

    let totalAcciones = 0;
    let totalExitosos = 0;
    let totalErrores = 0;
    let totalDenegados = 0;

    for (const r of registros30) {
        totalAcciones += 1;
        const res = String(r.resultado || "").toLowerCase();
        if (res === "exitoso") totalExitosos += 1;
        else if (res === "error") totalErrores += 1;
        else if (res.includes("denegado")) totalDenegados += 1;

        const tipo = String(r.tipo_accion || "").toLowerCase();
        if (tiposConteo[tipo] !== undefined) {
            tiposConteo[tipo] += 1;
        }

        const f = String(r.fecha_hora || "").slice(0, 10);
        if (diasMapa.has(f)) {
            const dObj = diasMapa.get(f);
            dObj.total += 1;
            if (tipo === "crear") dObj.crear += 1;
            else if (tipo === "editar") dObj.editar += 1;
            else if (tipo === "eliminar") dObj.eliminar += 1;
            else dObj.otros += 1;
        }
    }

    const accionesPorDia = Array.from(diasMapa.values());

    const accionesPorTipo = [
        { tipo: "crear", etiqueta: "Creación", cantidad: tiposConteo.crear, color: "#047857" },
        { tipo: "editar", etiqueta: "Edición", cantidad: tiposConteo.editar, color: "#059669" },
        { tipo: "eliminar", etiqueta: "Eliminación", cantidad: tiposConteo.eliminar, color: "#10b981" },
        { tipo: "descargar", etiqueta: "Descarga", cantidad: tiposConteo.descargar, color: "#34d399" }
    ].map(item => ({
        ...item,
        porcentaje: totalAcciones > 0 ? Number(((item.cantidad / totalAcciones) * 100).toFixed(1)) : 0
    }));

    return {
        accionesPorDia,
        accionesPorTipo,
        totales: {
            totalAcciones,
            totalExitosos,
            totalErrores,
            totalDenegados,
            ...tiposConteo
        }
    };
}
