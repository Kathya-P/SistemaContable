import { solicitarApi } from "./api";
import { obtenerDatosKardex } from "./kardexService";

/**
 * Servicio para consultar los Ratios Financieros con datos reales del sistema.
 * @param {Object} params
 * @param {string} params.desde - Fecha inicio (filtro de flujo)
 * @param {string} params.hasta - Fecha fin (fecha de corte acumulativa para balances)
 * @param {number} [params.inventarioFinal] - Inventario final valorizado (si ya fue consultado)
 */
export async function obtenerRatiosFinancieros({ desde, hasta, inventarioFinal = null }) {
    let inv = inventarioFinal;

    // Si no se proporcionó inventario final, intentar consultar del Kardex dinámico hasta la fecha de corte
    if (inv === null || inv === undefined || inv <= 0) {
        try {
            const kardex = await obtenerDatosKardex({ fechaFin: hasta || "" });
            const saldo = Number(kardex?.totales?.saldo_final ?? 0);
            if (saldo > 0) {
                inv = saldo;
            } else {
                const kardexGen = await obtenerDatosKardex({});
                const saldoGen = Number(kardexGen?.totales?.saldo_final ?? 0);
                if (saldoGen > 0) {
                    inv = saldoGen;
                }
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

    return solicitarApi(`/ratios-financieros?${query.toString()}`);
}
