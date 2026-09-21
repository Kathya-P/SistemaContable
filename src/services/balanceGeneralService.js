import { solicitarApi } from "./api";
import { obtenerDatosKardex } from "./kardexService";

/**
 * Consulta el Balance General desde el backend enviando las fechas
 * y el inventario final del Kardex.
 */
export async function obtenerBalanceGeneral({ desde, hasta, inventarioFinalManual = null, inventarioFinal = null }) {
    let invFinal = (inventarioFinalManual !== null && inventarioFinalManual !== undefined && Number(inventarioFinalManual) > 0)
        ? Number(inventarioFinalManual)
        : (inventarioFinal !== null && inventarioFinal !== undefined && Number(inventarioFinal) > 0 ? Number(inventarioFinal) : null);

    // Si no se proporcionó inventario final, consultarlo directamente del Kardex
    if (invFinal === null || invFinal <= 0) {
        try {
            const datosKardex = await obtenerDatosKardex({ fechaInicio: desde, fechaFin: hasta });
            const saldoKardex = Number(datosKardex?.totales?.saldo_final || 0);
            if (saldoKardex > 0) {
                invFinal = saldoKardex;
            } else {
                const kardexGeneral = await obtenerDatosKardex({});
                const saldoGeneral = Number(kardexGeneral?.totales?.saldo_final || 0);
                if (saldoGeneral > 0) {
                    invFinal = saldoGeneral;
                }
            }
        } catch (kardexError) {
            console.warn("No se pudo obtener el Kardex:", kardexError);
        }
    }

    if (invFinal === null) invFinal = 0;

    const query = new URLSearchParams({
        desde,
        hasta,
        inventario_final: String(invFinal),
        inventarioFinal: String(invFinal)
    });

    return solicitarApi(`/balance-general?${query.toString()}`);
}
