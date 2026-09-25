import { solicitarApi } from "./api";
import { supabase } from "../lib/supabase";

export const CATALOGO_PREDETERMINADO = [
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
export const TIPOS_VALIDOS = ["ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "GASTO", "ORDEN", "CONTINGENTE", "COSTO"];
export const NIVELES_VALIDOS = ["GRUPO", "SUBGRUPO", "CUENTA", "SUBCUENTA"];

/**
 * Normaliza sinónimos, plurales, categorías numéricas oficiales (1..7 SSF/BCR/Gobierno) y formatos de tipos de cuenta.
 */
export function normalizarTipo(tipo, codigo = "", nombre = "") {
    const cod = String(codigo || "").trim().toUpperCase();
    const nom = String(nombre || "").trim().toUpperCase();
    const t = String(tipo !== undefined && tipo !== null ? tipo : "").trim().toUpperCase();

    // 1. Mapeo directo por categoría numérica (Formato oficial El Salvador / SSF / BCR / Hacienda)
    if (t === "1" || t === "01") return "ACTIVO";
    if (t === "2" || t === "02") return "PASIVO";
    if (t === "3" || t === "03") return "PATRIMONIO";
    if (t === "4" || t === "04") {
        if (nom.includes("INGRESO") || nom.includes("VENTA")) return "INGRESO";
        return "GASTO";
    }
    if (t === "5" || t === "05") {
        if (nom.includes("GASTO") || nom.includes("COSTO")) return "GASTO";
        return "INGRESO";
    }
    if (t === "6" || t === "06" || t === "7" || t === "07") return "ORDEN";

    // 2. Textos y sinónimos
    if (t.includes("ACTIVO")) return "ACTIVO";
    if (t.includes("PASIVO")) return "PASIVO";
    if (t.includes("PATRIMONIO") || t.includes("CAPITAL")) return "PATRIMONIO";
    if (t.includes("INGRESO") || t.includes("VENTA")) return "INGRESO";
    if (t.includes("GASTO")) return "GASTO";
    if (t.includes("COSTO")) return "COSTO";
    if (t.includes("ORDEN") || t.includes("CONTINGENTE")) return "ORDEN";

    // 3. Inferencia por código si falta el tipo
    if (cod) {
        const primerChar = cod.replace(/[^0-9A-Z]/g, "")[0];
        if (primerChar === "1") return "ACTIVO";
        if (primerChar === "2") return "PASIVO";
        if (primerChar === "3") return "PATRIMONIO";
        if (primerChar === "4") {
            if (nom.includes("INGRESO") || nom.includes("VENTA")) return "INGRESO";
            return "GASTO";
        }
        if (primerChar === "5") {
            if (nom.includes("GASTO") || nom.includes("COSTO")) return "GASTO";
            return "INGRESO";
        }
        if (primerChar === "6" || primerChar === "7") return "ORDEN";
    }

    return "ACTIVO";
}

/**
 * Normaliza sinónimos, números de nivel (1..6) y jerarquías oficiales (Elemento, Rubro, Agrupación, Cuenta, Subcuenta, Subsubcuenta).
 */
export function normalizarNivel(nivel, codigo = "") {
    const n = String(nivel !== undefined && nivel !== null ? nivel : "").trim().toUpperCase().replace(/[\s\-_]+/g, " ");

    if (n === "1" || n.includes("ELEMENTO") || n === "GRUPO" || n === "GRUPOS") return "GRUPO";
    if (n === "2" || n.includes("RUBRO") || n === "SUBGRUPO" || n === "SUBGRUPOS") return "SUBGRUPO";
    if (n === "3" || n.includes("AGRUPACI") || n.includes("MAYOR 1")) return "SUBGRUPO";
    if (n === "4" || (n.includes("CUENTA") && !n.includes("SUB")) || n === "MAYOR") return "CUENTA";
    if (n === "5" || n.includes("SUBCUENTA") || n === "6" || n.includes("SUBSUB") || n.includes("AUXILIAR") || n.includes("DETALLE")) return "SUBCUENTA";

    // Inferencia por longitud si falta
    if (codigo) {
        const clean = String(codigo).replace(/[^0-9A-Za-z]/g, "");
        if (clean.length <= 1) return "GRUPO";
        if (clean.length === 2) return "SUBGRUPO";
        if (clean.length <= 4) return "CUENTA";
        return "SUBCUENTA";
    }

    return "CUENTA";
}

/**
 * Deriva la naturaleza contable (Deudora o Acreedora) a partir del tipo, operación (+ o -) y código.
 */
export function obtenerNaturaleza(tipo, operacion = "", codigo = "") {
    const op = String(operacion || "").trim();
    if (op === "-") return "ACREEDORA";
    if (op === "+") return "DEUDORA";

    const t = String(tipo || "").trim().toUpperCase();
    if (t === "ACTIVO" || t === "GASTO" || t === "COSTO") {
        return "DEUDORA";
    }
    if (t === "PASIVO" || t === "PATRIMONIO" || t === "INGRESO") {
        return "ACREEDORA";
    }
    if (t === "ORDEN" || t === "CONTINGENTE") {
        if (String(codigo).trim().startsWith("7")) return "ACREEDORA";
        return "DEUDORA";
    }
    return "DEUDORA";
}

/**
 * Obtiene todas las cuentas contables registradas y las anota con su estado de movimientos.
 */
export async function obtenerCuentas(empresaId) {
    try {
        const cuentas = await solicitarApi("/cuentas");
        return normalizarCuentas(cuentas);
    } catch (errorApi) {
        if (supabase) {
            let query = supabase.from("cuentas").select("*").order("codigo");
            if (empresaId) query = query.eq("empresa_id", empresaId);

            const { data: cuentas, error } = await query;
            if (error) throw error;

            let cuentasConMovimientos = new Set();
            try {
                const { data: detalles } = await supabase
                    .from("detalle_asientos")
                    .select("cuenta_id");
                if (detalles) {
                    cuentasConMovimientos = new Set(detalles.map(d => String(d.cuenta_id)));
                }
            } catch {
                // Silently ignore if detalle_asientos is not accessible
            }

            return (cuentas || []).map(c => ({
                ...c,
                tiene_movimientos: cuentasConMovimientos.has(String(c.id)),
                naturaleza: obtenerNaturaleza(c.tipo)
            }));
        }
        throw errorApi;
    }
}

function normalizarCuentas(cuentas = []) {
    return (cuentas || []).map(c => ({
        ...c,
        tiene_movimientos: Boolean(c.tiene_movimientos),
        naturaleza: obtenerNaturaleza(c.tipo)
    }));
}

/**
 * Obtiene el conjunto de IDs de cuentas que tienen movimientos en detalle_asientos.
 */
export async function obtenerCuentasConMovimientos() {
    try {
        return await solicitarApi("/cuentas/movimientos");
    } catch {
        if (supabase) {
            try {
                const { data } = await supabase
                    .from("detalle_asientos")
                    .select("cuenta_id");
                return [...new Set((data || []).map(d => String(d.cuenta_id)))];
            } catch {
                return [];
            }
        }
        return [];
    }
}

/**
 * Valida las reglas de negocio para una cuenta antes de guardarla.
 */
export function validarCuenta(cuenta, cuentasExistentes = [], cuentaActualId = null, tieneMovimientos = false) {
    const errores = [];

    const codigo = String(cuenta.codigo || "").trim();
    const nombre = String(cuenta.nombre || "").trim();
    const tipo = String(cuenta.tipo || "").trim().toUpperCase();
    const nivel = String(cuenta.nivel || "").trim().toUpperCase();
    const cuentaPadreId = cuenta.cuenta_padre_id ? String(cuenta.cuenta_padre_id) : null;
    const permiteMovimientos = Boolean(cuenta.permite_movimientos);

    // 1. Código obligatorio y único
    if (!codigo) {
        errores.push("El código de la cuenta es obligatorio.");
    } else {
        const codigoDuplicado = cuentasExistentes.some(c => 
            String(c.id) !== String(cuentaActualId) && 
            String(c.codigo).trim().toLowerCase() === codigo.toLowerCase()
        );
        if (codigoDuplicado) {
            errores.push(`El código "${codigo}" ya está registrado en el catálogo.`);
        }
    }

    // 2. Nombre obligatorio
    if (!nombre) {
        errores.push("El nombre de la cuenta es obligatorio.");
    }

    // 3. Tipo válido
    if (!TIPOS_VALIDOS.includes(tipo)) {
        errores.push(`El tipo "${tipo}" no es válido. Debe ser uno de: ${TIPOS_VALIDOS.join(", ")}.`);
    }

    // 4. Nivel válido
    if (!NIVELES_VALIDOS.includes(nivel)) {
        errores.push(`El nivel "${nivel}" no es válido. Debe ser uno de: ${NIVELES_VALIDOS.join(", ")}.`);
    }

    // 5. Regla de negocio: permite_movimientos solo en CUENTA o SUBCUENTA
    if (permiteMovimientos && (nivel === "GRUPO" || nivel === "SUBGRUPO")) {
        errores.push("Las cuentas de nivel GRUPO y SUBGRUPO son agrupadoras y no pueden permitir movimientos directos.");
    }

    // 6. Regla de negocio: cuenta padre
    if (cuentaPadreId) {
        const padre = cuentasExistentes.find(c => String(c.id) === cuentaPadreId);
        if (!padre) {
            errores.push("La cuenta padre seleccionada no existe.");
        } else if (String(padre.tipo).toUpperCase() !== tipo) {
            errores.push(`La cuenta padre "${padre.codigo} - ${padre.nombre}" es de tipo ${padre.tipo}, pero la cuenta es de tipo ${tipo}. Deben coincidir.`);
        }
    }

    // 7. Si es SUBCUENTA, cuenta_padre es requerida
    if (nivel === "SUBCUENTA" && !cuentaPadreId) {
        errores.push("Una subcuenta debe tener obligatoriamente una cuenta padre asociada.");
    }

    // 8. Regla de negocio si ya tiene movimientos
    if (tieneMovimientos && cuentaActualId) {
        const anterior = cuentasExistentes.find(c => String(c.id) === String(cuentaActualId));
        if (anterior) {
            if (String(anterior.tipo).toUpperCase() !== tipo) {
                errores.push("No se puede modificar el tipo de una cuenta que ya tiene movimientos contables registrados.");
            }
            if (String(anterior.codigo).trim() !== codigo) {
                errores.push("No se puede cambiar el código de una cuenta que ya tiene movimientos contables registrados.");
            }
            if (String(anterior.nivel).toUpperCase() !== nivel) {
                errores.push("No se puede cambiar el nivel de una cuenta que ya tiene movimientos contables registrados.");
            }
        }
    }

    return errores;
}

/**
 * Crea una cuenta contable validando reglas de negocio.
 */
export async function crearCuenta(cuenta, cuentasExistentes = [], empresaId) {
    const errores = validarCuenta(cuenta, cuentasExistentes, null, false);
    if (errores.length > 0) {
        throw new Error(errores.join(" "));
    }

    const payload = {
        codigo: String(cuenta.codigo).trim(),
        nombre: String(cuenta.nombre).trim(),
        tipo: String(cuenta.tipo).trim().toUpperCase(),
        nivel: String(cuenta.nivel).trim().toUpperCase(),
        cuenta_padre_id: cuenta.cuenta_padre_id ? Number(cuenta.cuenta_padre_id) : null,
        permite_movimientos: (cuenta.nivel === "GRUPO" || cuenta.nivel === "SUBGRUPO") ? false : Boolean(cuenta.permite_movimientos),
        estado: cuenta.estado !== false
    };

    try {
        return await solicitarApi("/cuentas", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    } catch (errorApi) {
        if (supabase) {
            const { data, error } = await supabase
                .from("cuentas")
                .insert([{ ...payload, empresa_id: empresaId }])
                .select()
                .single();
            if (error) throw error;
            return data;
        }
        throw errorApi;
    }
}

/**
 * Actualiza una cuenta contable aplicando las restricciones de movimientos.
 */
export async function actualizarCuenta(id, datos, cuentasExistentes = [], tieneMovimientos = false) {
    const errores = validarCuenta(datos, cuentasExistentes, id, tieneMovimientos);
    if (errores.length > 0) {
        throw new Error(errores.join(" "));
    }

    const payload = {
        nombre: String(datos.nombre).trim(),
        estado: datos.estado !== false
    };

    // Solo permitir editar código, tipo, nivel y padre si NO tiene movimientos
    if (!tieneMovimientos) {
        payload.codigo = String(datos.codigo).trim();
        payload.tipo = String(datos.tipo).trim().toUpperCase();
        payload.nivel = String(datos.nivel).trim().toUpperCase();
        payload.cuenta_padre_id = datos.cuenta_padre_id ? Number(datos.cuenta_padre_id) : null;
        payload.permite_movimientos = (payload.nivel === "GRUPO" || payload.nivel === "SUBGRUPO") ? false : Boolean(datos.permite_movimientos);
    } else {
        // Si tiene movimientos, solo se puede permitir movimientos si es CUENTA o SUBCUENTA
        if (datos.nivel === "CUENTA" || datos.nivel === "SUBCUENTA") {
            payload.permite_movimientos = Boolean(datos.permite_movimientos);
        }
    }

    try {
        return await solicitarApi(`/cuentas/${id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
    } catch (errorApi) {
        if (supabase) {
            const { data, error } = await supabase
                .from("cuentas")
                .update(payload)
                .eq("id", id)
                .select()
                .single();
            if (error) throw error;
            return data;
        }
        throw errorApi;
    }
}

/**
 * Inactiva una cuenta (estado = false). Siempre permitido incluso si tiene movimientos.
 */
export async function inactivarCuenta(id) {
    try {
        return await solicitarApi(`/cuentas/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ estado: false })
        });
    } catch (errorApi) {
        if (supabase) {
            const { data, error } = await supabase
                .from("cuentas")
                .update({ estado: false })
                .eq("id", id)
                .select()
                .single();
            if (error) throw error;
            return data;
        }
        throw errorApi;
    }
}

/**
 * Activa una cuenta (estado = true).
 */
export async function activarCuenta(id) {
    try {
        return await solicitarApi(`/cuentas/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ estado: true })
        });
    } catch (errorApi) {
        if (supabase) {
            const { data, error } = await supabase
                .from("cuentas")
                .update({ estado: true })
                .eq("id", id)
                .select()
                .single();
            if (error) throw error;
            return data;
        }
        throw errorApi;
    }
}

/**
 * Elimina una cuenta solo si no tiene movimientos ni subcuentas dependientes.
 */
export async function eliminarCuenta(id, tieneMovimientos = false, subcuentasCount = 0) {
    if (tieneMovimientos) {
        throw new Error("No se puede eliminar la cuenta porque ya registra movimientos en asientos contables. Solo puedes inactivarla.");
    }
    if (subcuentasCount > 0) {
        throw new Error(`No se puede eliminar la cuenta porque tiene ${subcuentasCount} subcuenta(s) dependiente(s). Reasigna o elimina las subcuentas primero.`);
    }

    try {
        return await solicitarApi(`/cuentas/${id}`, {
            method: "DELETE"
        });
    } catch (errorApi) {
        if (supabase) {
            const { error } = await supabase
                .from("cuentas")
                .delete()
                .eq("id", id);
            if (error) throw error;
            return { ok: true };
        }
        throw errorApi;
    }
}

/**
 * Importación en bloque del catálogo (agregar o reemplazar).
 */
export async function importarCatalogo({ cuentas = [], modo = "agregar" }, empresaId) {
    if (!cuentas || cuentas.length === 0) {
        throw new Error("No hay cuentas válidas para importar.");
    }

    try {
        return await solicitarApi("/cuentas/importar", {
            method: "POST",
            body: JSON.stringify({ cuentas, modo })
        });
    } catch (errorApi) {
        if (supabase) {
            return await importarCatalogoClienteDirecto(cuentas, modo, empresaId);
        }
        throw errorApi;
    }
}

async function importarCatalogoClienteDirecto(cuentas = [], modo = "agregar", empresaId) {
    let idEmpresaFinal = empresaId;

    if (!idEmpresaFinal && supabase) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id) {
                const { data: u } = await supabase
                    .from("usuarios")
                    .select("empresa_id")
                    .eq("auth_id", user.id)
                    .maybeSingle();
                if (u?.empresa_id) {
                    idEmpresaFinal = u.empresa_id;
                }
            }
        } catch {
            // Silencioso
        }

        if (!idEmpresaFinal) {
            try {
                const { data: primeraEmpresa } = await supabase
                    .from("empresas")
                    .select("id")
                    .limit(1)
                    .maybeSingle();
                if (primeraEmpresa?.id) {
                    idEmpresaFinal = primeraEmpresa.id;
                }
            } catch {
                // Silencioso
            }
        }
    }

    if (!idEmpresaFinal) {
        throw new Error("No se pudo determinar la empresa asignada a tu usuario. Asegúrate de tener una empresa creada o asignada.");
    }

    if (modo === "reemplazar") {
        const { data: asientosEmpresa } = await supabase
            .from("asientos")
            .select("id")
            .eq("empresa_id", idEmpresaFinal);

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

        await supabase.from("cuentas").delete().eq("empresa_id", idEmpresaFinal);
    }

    const { data: existentes } = await supabase
        .from("cuentas")
        .select("id, codigo, tipo")
        .eq("empresa_id", idEmpresaFinal);
    const mapaCodigoId = new Map((existentes || []).map(c => [String(c.codigo).trim().toUpperCase(), { id: c.id, tipo: c.tipo }]));

    const ordenNiveles = { GRUPO: 1, SUBGRUPO: 2, CUENTA: 3, SUBCUENTA: 4 };
    const cuentasOrdenadas = [...cuentas].sort((a, b) => {
        const ordA = ordenNiveles[String(a.nivel).toUpperCase()] || 5;
        const ordB = ordenNiveles[String(b.nivel).toUpperCase()] || 5;
        return ordA - ordB;
    });

    const resultados = [];
    for (const c of cuentasOrdenadas) {
        const codigoTrim = String(c.codigo).trim().toUpperCase();
        let cuentaPadreId = null;

        if (c.cuenta_padre_codigo && mapaCodigoId.has(String(c.cuenta_padre_codigo).trim().toUpperCase())) {
            cuentaPadreId = mapaCodigoId.get(String(c.cuenta_padre_codigo).trim().toUpperCase()).id;
        } else if (c.nivel !== "GRUPO") {
            for (let len = codigoTrim.length - 1; len >= 1; len--) {
                const prefijo = codigoTrim.slice(0, len);
                if (mapaCodigoId.has(prefijo)) {
                    cuentaPadreId = mapaCodigoId.get(prefijo).id;
                    break;
                }
            }
        }

        const registro = {
            codigo: String(c.codigo).trim(),
            nombre: String(c.nombre).trim(),
            tipo: String(c.tipo).trim().toUpperCase(),
            nivel: String(c.nivel).trim().toUpperCase(),
            cuenta_padre_id: cuentaPadreId,
            permite_movimientos: (c.nivel === "GRUPO" || c.nivel === "SUBGRUPO") ? false : Boolean(c.permite_movimientos),
            estado: c.estado !== false,
            empresa_id: idEmpresaFinal
        };

        if (mapaCodigoId.has(codigoTrim)) {
            const idExistente = mapaCodigoId.get(codigoTrim).id;
            await supabase
                .from("cuentas")
                .update({ nombre: registro.nombre, estado: registro.estado })
                .eq("id", idExistente);
            continue;
        }

        const { data: creada, error: errCrear } = await supabase
            .from("cuentas")
            .insert([registro])
            .select()
            .single();

        if (errCrear) throw errCrear;
        mapaCodigoId.set(codigoTrim, { id: creada.id, tipo: creada.tipo });
        resultados.push(creada);
    }

    return {
        mensaje: `Se procesaron las cuentas con éxito.`,
        insertadas: resultados.length
    };
}

export async function cargarCatalogoPredeterminado(forzar = false, empresaId) {
    try {
        return await solicitarApi("/cuentas/catalogo-predeterminado", {
            method: "POST",
            body: JSON.stringify({ forzar })
        });
    } catch (errorApi) {
        if (supabase) {
            return await cargarCatalogoPredeterminadoClienteDirecto(forzar, empresaId);
        }
        throw errorApi;
    }
}

async function cargarCatalogoPredeterminadoClienteDirecto(forzar, empresaId) {
    const { count } = await supabase
        .from("cuentas")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresaId);

    if (count && count > 0 && !forzar) {
        const error = new Error("Tu empresa ya tiene cuentas en el catálogo. Si querés cargar el predeterminado de todas formas, confirmá la acción.");
        error.statusCode = 409;
        throw error;
    }

    const mapaCodigos = new Map();
    const resultados = [];
    const jerarquia = { GRUPO: 1, SUBGRUPO: 2, CUENTA: 3, SUBCUENTA: 4 };
    const ordenadas = [...CATALOGO_PREDETERMINADO].sort((a, b) => jerarquia[a.nivel] - jerarquia[b.nivel]);
    const tienesHijos = new Set(CATALOGO_PREDETERMINADO.map(c => c.padre).filter(Boolean));

    const { data: existentesPrevias } = await supabase
    .from("cuentas")
    .select("id, codigo")
    .eq("empresa_id", empresaId);
const codigosExistentes = new Map((existentesPrevias || []).map(c => [String(c.codigo).trim(), c.id]));

for (const fila of ordenadas) {
    const esHoja = !tienesHijos.has(fila.codigo);
    const permiteMov = (fila.nivel === "CUENTA" || fila.nivel === "SUBCUENTA") && esHoja;

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
        empresa_id: empresaId
    };

    const { data: creada, error } = await supabase
        .from("cuentas")
        .insert([registro])
        .select()
        .single();

    if (error) throw error;
    mapaCodigos.set(fila.codigo, creada.id);
    resultados.push(creada);
}
    return { mensaje: `Catálogo predeterminado cargado (${resultados.length} cuentas).`, total: resultados.length };
}

/**
 * Reconstruye jerarquías, resuelve cuentas padre por prefijo contable y calcula permisos de movimiento.
 * Permite importar catálogos gubernamentales o de cualquier formato sin ser estricto.
 */
export function autoResolverJerarquiaYPadres(filas = [], cuentasExistentes = []) {
    if (!filas || filas.length === 0) return [];

    const codigosExistentes = new Set(
        cuentasExistentes.map(c => String(c.codigo).trim().toUpperCase())
    );
    const codigosEnLote = new Set(
        filas.map(f => String(f.codigo || "").trim().toUpperCase()).filter(Boolean)
    );

    // Detección de cuentas raíz 4 y 5 para calibrar si 4 es GASTO (gobierno) o INGRESO (comercial)
    let root4IsGasto = true;
    for (const f of filas) {
        const cod = String(f.codigo || "").trim();
        const nom = String(f.nombre || "").toUpperCase();
        if (cod === "4" && (nom.includes("INGRESO") || nom.includes("VENTA"))) {
            root4IsGasto = false;
            break;
        }
    }

    // 1. Normalizar código, nombre, tipo, nivel y operación
    const procesadas = filas.map((fila, idx) => {
        const codigo = String(fila.codigo || "").trim();
        const nombre = String(fila.nombre || "").trim();
        let tipo = normalizarTipo(fila.tipo, codigo, nombre);
        if (codigo.startsWith("4") && !root4IsGasto) {
            tipo = "INGRESO";
        }
        const nivel = normalizarNivel(fila.nivel, codigo);
        const operacion = String(fila.operacion || fila["operación"] || "").trim();

        return {
            ...fila,
            _idxOriginal: idx,
            codigo,
            nombre,
            tipo,
            nivel,
            operacion,
            cuenta_padre_codigo: fila.cuenta_padre_codigo ? String(fila.cuenta_padre_codigo).trim().toUpperCase() : ""
        };
    });

    // 2. Detectar qué cuentas tienen subcuentas dependientes dentro del mismo lote (cuentas agrupadoras)
    const codigosConHijos = new Set();
    const todosLosCodigos = procesadas.map(p => p.codigo.toUpperCase());

    for (let i = 0; i < todosLosCodigos.length; i++) {
        const codA = todosLosCodigos[i];
        if (!codA) continue;
        for (let j = 0; j < todosLosCodigos.length; j++) {
            if (i === j) continue;
            const codB = todosLosCodigos[j];
            if (codB.startsWith(codA) && codB.length > codA.length) {
                codigosConHijos.add(codA);
                break;
            }
        }
    }

    // 3. Auto-inferir cuenta_padre_codigo por prefijo contable y derivar permite_movimientos
    return procesadas.map(cuenta => {
        const codigoUpper = cuenta.codigo.toUpperCase();
        let padre = cuenta.cuenta_padre_codigo;

        if (!padre && cuenta.nivel !== "GRUPO") {
            // Buscar el prefijo más largo existente
            for (let len = codigoUpper.length - 1; len >= 1; len--) {
                const candidato = codigoUpper.slice(0, len);
                if (codigosEnLote.has(candidato) || codigosExistentes.has(candidato)) {
                    padre = candidato;
                    break;
                }
            }
        }

        // Si aún no tiene padre y no es grupo, vincular con la raíz si existe
        if (!padre && cuenta.nivel !== "GRUPO" && codigoUpper.length > 1) {
            const raiz = codigoUpper[0];
            if (codigosEnLote.has(raiz) || codigosExistentes.has(raiz)) {
                padre = raiz;
            }
        }

        // Cuentas hoja de nivel CUENTA o SUBCUENTA reciben movimientos contables
        let permiteMov = false;
        if (cuenta.nivel !== "GRUPO" && cuenta.nivel !== "SUBGRUPO") {
            if (!codigosConHijos.has(codigoUpper)) {
                // Es cuenta terminal sin subcuentas
                permiteMov = true;
            }
        }

        if (cuenta.permite_movimientos !== undefined && cuenta.permite_movimientos !== null && String(cuenta.permite_movimientos).trim() !== "") {
            if (cuenta.nivel === "CUENTA" || cuenta.nivel === "SUBCUENTA") {
                const s = String(cuenta.permite_movimientos).trim().toLowerCase();
                permiteMov = s === "true" || s === "1" || s === "si" || s === "sí" || s === "s";
            }
        }

        return {
            ...cuenta,
            cuenta_padre_codigo: padre || null,
            permite_movimientos: permiteMov,
            naturaleza: obtenerNaturaleza(cuenta.tipo, cuenta.operacion, cuenta.codigo)
        };
    });
}

/**
 * Parsea texto copiado directamente desde Word, PDF, Excel o páginas web.
 * Soporta tablas copiadas con tabuladores, comas, punto y comas, o formato oficial de gobierno de 6 columnas.
 * Infiere inteligentemente el tipo, nivel y cuenta padre.
 */
export function parsearTextoPegadoWordPDF(texto) {
    if (!texto || !texto.trim()) return [];

    const lineas = texto.split(/\r\n|\n|\r/).map(l => l.trim()).filter(l => l.length > 0);
    if (lineas.length === 0) return [];

    const filasBrutas = [];

    lineas.forEach(linea => {
        const min = linea.toLowerCase();
        // Ignorar encabezados comunes si vienen en la copia
        if (
            min.startsWith("id_cuenta") || 
            min.startsWith("codigo") || 
            min.startsWith("código") || 
            min.startsWith("cuenta\tnombre") ||
            min.startsWith("id\tnombre")
        ) {
            return;
        }

        // 1. Formato oficial salvadoreño (Gobierno / SSF / BCR / Hacienda)
        // Ejemplo: "11000000 CAJA GENERAL 1 5 Subcuenta +"
        // Ejemplo: "11040199 AJUSTES A INVERSIONES EN ACTIVOS FINANCIEROS A COSTO AMORTIZADO (CR) 1 5 Subcuenta -"
        const matchGob = linea.match(/^([0-9A-Za-z._-]+)\s+(.+?)\s+([1-7])\s+([1-6])\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)(?:\s+([+-]))?$/);
        if (matchGob) {
            filasBrutas.push({
                codigo: matchGob[1].trim(),
                nombre: matchGob[2].trim(),
                tipo: matchGob[3].trim(),
                nivel: matchGob[5].trim() || matchGob[4].trim(),
                cuenta_padre_codigo: "",
                operacion: matchGob[6] || "+"
            });
            return;
        }

        // 2. Separación por tabulaciones (\t)
        if (linea.includes("\t")) {
            const cols = linea.split("\t").map(c => c.trim()).filter(c => c.length > 0);
            if (cols.length >= 2) {
                // Si viene en 5 o 6 columnas de catálogo oficial:
                // [0] id_cuenta, [1] nombre_cuenta, [2] categoria, [3] nivel, [4] descripcion_nivel, [5] operacion
                if (cols.length >= 4 && (String(cols[2]).match(/^[1-7]$/) || String(cols[3]).match(/^[1-6]$/))) {
                    filasBrutas.push({
                        codigo: cols[0],
                        nombre: cols[1],
                        tipo: cols[2],
                        nivel: cols[4] || cols[3],
                        cuenta_padre_codigo: "",
                        operacion: cols[5] || "+"
                    });
                } else {
                    filasBrutas.push({
                        codigo: cols[0],
                        nombre: cols[1],
                        tipo: cols[2] || "",
                        nivel: cols[3] || "",
                        cuenta_padre_codigo: cols[4] || ""
                    });
                }
                return;
            }
        }

        // 3. Separación por punto y coma o coma
        if (linea.includes(";") || (linea.match(/,/g) || []).length >= 2) {
            const sep = linea.includes(";") ? ";" : ",";
            const cols = linea.split(sep).map(c => c.replace(/^["']|["']$/g, "").trim());
            if (cols.length >= 2 && cols[0]) {
                if (cols.length >= 4 && (String(cols[2]).match(/^[1-7]$/) || String(cols[3]).match(/^[1-6]$/))) {
                    filasBrutas.push({
                        codigo: cols[0],
                        nombre: cols[1],
                        tipo: cols[2],
                        nivel: cols[4] || cols[3],
                        cuenta_padre_codigo: "",
                        operacion: cols[5] || "+"
                    });
                } else {
                    filasBrutas.push({
                        codigo: cols[0],
                        nombre: cols[1],
                        tipo: cols[2] || "",
                        nivel: cols[3] || "",
                        cuenta_padre_codigo: cols[4] || ""
                    });
                }
                return;
            }
        }

        // 4. Texto libre: Código + Nombre (ej: "110101 Caja General de Oficina")
        const match = linea.match(/^([A-Za-z0-9._-]+)\s+(.+)$/);
        if (match) {
            filasBrutas.push({
                codigo: match[1].trim(),
                nombre: match[2].trim(),
                tipo: "",
                nivel: "",
                cuenta_padre_codigo: ""
            });
            return;
        }
    });

    if (filasBrutas.length === 0) return [];

    return autoResolverJerarquiaYPadres(filasBrutas);
}

/**
 * Validador inteligente de catálogo con modo flexible.
 * Auto-ajusta jerarquías y categorías para evitar rechazos innecesarios.
 */
export function validarArchivoCatalogo(filas = [], cuentasExistentes = [], modo = "agregar", opciones = { flexible: true }) {
    // 1. Auto-resolver jerarquías, padres por prefijo y permisos de movimientos
    const filasAutoResueltas = autoResolverJerarquiaYPadres(filas, cuentasExistentes);

    const filasValidas = [];
    const filasInvalidas = [];
    const todosLosErrores = [];
    const avisosAjuste = [];

    const codigosVistos = new Set();
    const codigosEnBD = new Map(
        cuentasExistentes.map(c => [String(c.codigo).trim().toUpperCase(), { id: c.id, tipo: String(c.tipo).toUpperCase() }])
    );

    filasAutoResueltas.forEach((fila, index) => {
        const numFila = index + 2;
        const erroresFila = [];

        const codigo = String(fila.codigo || "").trim();
        const codigoUpper = codigo.toUpperCase();
        const nombre = String(fila.nombre || "").trim();
        const tipo = fila.tipo;
        const nivel = fila.nivel;
        const cuentaPadreCodigo = fila.cuenta_padre_codigo;

        // Validación de Código
        if (!codigo) {
            erroresFila.push("Falta el código de la cuenta.");
        } else {
            // Manejo de duplicados dentro del archivo
            if (codigosVistos.has(codigoUpper)) {
                if (opciones.flexible) {
                    avisosAjuste.push(`Fila ${numFila}: El código "${codigo}" aparece repetido en el archivo. Se procesará la última versión.`);
                } else {
                    erroresFila.push(`Código "${codigo}" duplicado dentro del mismo archivo.`);
                }
            } else {
                codigosVistos.add(codigoUpper);
            }

            // Manejo de códigos existentes en BD en modo agregar
            if (modo === "agregar" && codigosEnBD.has(codigoUpper)) {
                if (opciones.flexible) {
                    avisosAjuste.push(`Fila ${numFila}: El código "${codigo}" ya existe en el catálogo. Se actualizará con los nuevos datos.`);
                } else {
                    erroresFila.push(`Código "${codigo}" ya existe actualmente en la base de datos.`);
                }
            }
        }

        // Validación de Nombre
        if (!nombre) {
            erroresFila.push("Falta el nombre de la cuenta.");
        }

        // En modo flexible, Tipo y Nivel ya están 100% resueltos e imputados.
        // Si no es flexible, validar contra listas estrictas
        if (!opciones.flexible) {
            if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
                erroresFila.push(`Tipo "${tipo}" no permitido.`);
            }
            if (!nivel || !NIVELES_VALIDOS.includes(nivel)) {
                erroresFila.push(`Nivel "${nivel}" no permitido.`);
            }
        }

        const filaProcesada = {
            numFila,
            codigo,
            nombre,
            tipo,
            nivel,
            cuenta_padre_codigo: cuentaPadreCodigo || null,
            permite_movimientos: fila.permite_movimientos,
            estado: true,
            naturaleza: fila.naturaleza,
            errores: erroresFila
        };

        if (erroresFila.length === 0) {
            filasValidas.push(filaProcesada);
        } else {
            filasInvalidas.push(filaProcesada);
            erroresFila.forEach(err => {
                todosLosErrores.push({
                    fila: numFila,
                    codigo: codigo || "(vacío)",
                    nombre: nombre || "(vacío)",
                    error: err
                });
            });
        }
    });

    return {
        totalFilas: filas.length,
        filasValidas,
        filasInvalidas,
        errores: todosLosErrores,
        avisos: avisosAjuste,
        esValido: todosLosErrores.length === 0
    };
}

/**
 * Descarga una plantilla CSV compatible con Excel (separador punto y coma ';' con UTF-8 BOM).
 * Ya NO requiere la columna permite_movimientos (el sistema la calcula automáticamente).
 */
export function descargarPlantillaCSV(separador = ";") {
    const sep = separador === "," ? "," : ";";
    // Columnas limpias y esenciales con lleva_iva opcional
    const encabezados = ["codigo", "nombre", "tipo", "nivel", "cuenta_padre_codigo", "lleva_iva"].join(sep);
    
    const filas = [
        ["1101", "EFECTIVO Y EQUIVALENTES DE EFECTIVO", "ACTIVO", "CUENTA", "", "NO"],
        ["110101", "Caja General", "ACTIVO", "SUBCUENTA", "1101", "NO"],
        ["1105", "IVA CRÉDITO FISCAL", "ACTIVO", "CUENTA", "", "NO"],
        ["110501", "IVA Crédito Fiscal", "ACTIVO", "SUBCUENTA", "1105", "NO"],
        ["2102", "IVA DÉBITO FISCAL", "PASIVO", "CUENTA", "", "NO"],
        ["210201", "IVA Débito Fiscal", "PASIVO", "SUBCUENTA", "2102", "NO"],
        ["4101", "COMPRAS", "GASTO", "CUENTA", "", "SI"],
        ["410101", "Compras Locales", "GASTO", "SUBCUENTA", "4101", "SI"],
        ["5101", "VENTAS", "INGRESO", "CUENTA", "", "SI"],
        ["510101", "Ventas Locales", "INGRESO", "SUBCUENTA", "5101", "SI"]
    ].map(f => f.join(sep));

    const contenido = "\uFEFF" + [encabezados, ...filas].join("\r\n");
    const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "plantilla_catalogo_cuentas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
