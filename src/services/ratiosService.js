import { solicitarApi } from "./api";
import { obtenerDatosKardex } from "./kardexService";
import { obtenerConfiguracionKardex } from "../utils/kardexCalculos";

/**
 * Servicio para consultar los Ratios Financieros con datos reales del sistema.
 * @param {Object} params
 * @param {string} params.desde - Fecha inicio (filtro de flujo)
 * @param {string} params.hasta - Fecha fin (fecha de corte acumulativa para balances)
 * @param {number} [params.inventarioFinal] - Inventario final valorizado (si ya fue consultado)
 * @param {number} [params.costoUnitario] - Costo unitario
 * @param {number} [params.precioVentaUnitario] - Precio de venta unitario
 * @param {string|number} [params.empresaId] - Id de la empresa
 */
export async function obtenerRatiosFinancieros({
    desde,
    hasta,
    inventarioFinal = null,
    costoUnitario = null,
    precioVentaUnitario = null,
    empresaId = null
} = {}) {
    const config = obtenerConfiguracionKardex(empresaId);
    const cUnit = costoUnitario !== null && costoUnitario !== undefined && Number(costoUnitario) > 0
        ? Number(costoUnitario)
        : (config?.costoUnitario ? Number(config.costoUnitario) : 0);

    const pVenta = precioVentaUnitario !== null && precioVentaUnitario !== undefined && Number(precioVentaUnitario) > 0
        ? Number(precioVentaUnitario)
        : (config?.precioVentaUnitario ? Number(config.precioVentaUnitario) : 0);

    let inv = inventarioFinal;
    let invInicial = null;

    // Si no se proporcionó inventario final o es <= 0, consultar el Kardex dinámico
    if (inv === null || inv === undefined || inv <= 0) {
        try {
            const kardex = await obtenerDatosKardex({
                fechaInicio: desde || "",
                fechaFin: hasta || "",
                costoUnitario: cUnit,
                precioVentaUnitario: pVenta,
                empresaId
            });
            const saldo = Number(kardex?.totales?.saldo_final ?? 0);
            if (saldo > 0) {
                inv = saldo;
            }
            if (kardex?.totales?.inventario_inicial_monto > 0) {
                invInicial = Number(kardex.totales.inventario_inicial_monto);
            }
        } catch (errKardex) {
            console.warn("No se pudo obtener el saldo final del Kardex para ratios:", errKardex);
        }
    }

    if (inv === null || inv === undefined) {
        inv = 0;
    }

    const query = new URLSearchParams({
        desde: desde || "",
        hasta: hasta || "",
        inventario_final: String(inv)
    });

    if (cUnit > 0) query.append("costo_unitario", String(cUnit));
    if (pVenta > 0) query.append("precio_venta", String(pVenta));
    if (invInicial !== null && invInicial > 0) query.append("inventario_inicial", String(invInicial));

    return solicitarApi(`/ratios-financieros?${query.toString()}`);
}
