import { solicitarApi } from "./api";

/**
 * Obtiene el balance general calculado desde el backend contable.
 * @param {Object} params
 * @param {string} params.desde - Fecha inicial (YYYY-MM-DD)
 * @param {string} params.hasta - Fecha final (YYYY-MM-DD)
 * @param {number} [params.inventarioFinal] - Opcional, valor del inventario final
 */
export async function obtenerBalanceGeneral({ desde, hasta, inventarioFinal } = {}) {
    const query = new URLSearchParams();
    if (desde) query.set("desde", desde);
    if (hasta) query.set("hasta", hasta);
    if (inventarioFinal !== undefined && inventarioFinal !== null) {
        query.set("inventarioFinal", inventarioFinal);
    }

    const qs = query.toString() ? `?${query.toString()}` : "";
    return await solicitarApi(`/balance-general${qs}`);
}
