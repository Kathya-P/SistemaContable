// Configuración y persistencia del Costo Unitario y Precio de Venta Unitario para el Kardex
// Los valores se guardan por empresa en localStorage sin alterar la base de datos.

const STORAGE_PREFIX = "conta_config_kardex_empresa_";
export const EVENTO_CONFIG_KARDEX_ACTUALIZADA = "conta_kardex_config_actualizada";

/**
 * Obtiene la configuración de Kardex guardada (costo unitario y precio de venta unitario).
 * @param {string|number} [empresaId]
 * @returns {{ costoUnitario: number|null, precioVentaUnitario: number|null }}
 */
export function obtenerConfiguracionKardex(empresaId = null) {
    if (typeof localStorage === "undefined") {
        return { costoUnitario: null, precioVentaUnitario: null };
    }
    try {
        const id = empresaId || localStorage.getItem("conta_empresa_id") || "default";
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
        if (!raw) {
            // Intentar leer configuración global de respaldo si la empresa específica no tiene
            const rawDefault = localStorage.getItem(`${STORAGE_PREFIX}default`);
            if (!rawDefault) {
                return { costoUnitario: null, precioVentaUnitario: null };
            }
            const parsedDef = JSON.parse(rawDefault);
            return {
                costoUnitario: esNumeroValido(parsedDef.costoUnitario) ? Number(parsedDef.costoUnitario) : null,
                precioVentaUnitario: esNumeroValido(parsedDef.precioVentaUnitario) ? Number(parsedDef.precioVentaUnitario) : null
            };
        }
        const parsed = JSON.parse(raw);
        return {
            costoUnitario: esNumeroValido(parsed.costoUnitario) ? Number(parsed.costoUnitario) : null,
            precioVentaUnitario: esNumeroValido(parsed.precioVentaUnitario) ? Number(parsed.precioVentaUnitario) : null
        };
    } catch {
        return { costoUnitario: null, precioVentaUnitario: null };
    }
}

function esNumeroValido(val) {
    return val !== null && val !== undefined && val !== "" && !isNaN(Number(val)) && Number(val) > 0;
}

/**
 * Guarda la configuración de Kardex para una empresa y notifica a las vistas.
 * @param {string|number} empresaId
 * @param {{ costoUnitario: number|string|null, precioVentaUnitario: number|string|null }} config
 */
export function guardarConfiguracionKardex(empresaId, config = {}) {
    if (typeof localStorage === "undefined") return;
    try {
        const id = empresaId || localStorage.getItem("conta_empresa_id") || "default";
        const cUnit = esNumeroValido(config.costoUnitario) ? Number(config.costoUnitario) : null;
        const pVenta = esNumeroValido(config.precioVentaUnitario) ? Number(config.precioVentaUnitario) : null;

        const payload = {
            costoUnitario: cUnit,
            precioVentaUnitario: pVenta,
            actualizadoEn: new Date().toISOString()
        };

        localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(payload));
        // Guardar también en default para mantener sincronización entre vistas si cambia de contexto
        localStorage.setItem(`${STORAGE_PREFIX}default`, JSON.stringify(payload));

        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(EVENTO_CONFIG_KARDEX_ACTUALIZADA, {
                detail: {
                    empresaId: id,
                    costoUnitario: cUnit,
                    precioVentaUnitario: pVenta
                }
            }));
        }
    } catch (e) {
        console.warn("No se pudo guardar la configuración de Kardex en localStorage:", e);
    }
}
