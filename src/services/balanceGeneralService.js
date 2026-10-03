import { solicitarApi } from "./api";
import { obtenerDatosKardex } from "./kardexService";
import { obtenerConfiguracionKardex } from "../utils/kardexCalculos";

/**
 * Consulta el Balance General desde el backend enviando las fechas,
 * inventario final del Kardex y parámetros de costo y precio.
 */
export async function obtenerBalanceGeneral({
    desde,
    hasta,
    inventarioFinalManual = null,
    inventarioFinal = null,
    costoUnitario = null,
    precioVentaUnitario = null,
    empresaId = null
}) {
    const config = obtenerConfiguracionKardex(empresaId);
    const cUnit = costoUnitario !== null && costoUnitario !== undefined && Number(costoUnitario) > 0
        ? Number(costoUnitario)
        : (config?.costoUnitario ? Number(config.costoUnitario) : 0);

    const pVenta = precioVentaUnitario !== null && precioVentaUnitario !== undefined && Number(precioVentaUnitario) > 0
        ? Number(precioVentaUnitario)
        : (config?.precioVentaUnitario ? Number(config.precioVentaUnitario) : 0);

    let invFinal = (inventarioFinalManual !== null && inventarioFinalManual !== undefined && Number(inventarioFinalManual) > 0)
        ? Number(inventarioFinalManual)
        : (inventarioFinal !== null && inventarioFinal !== undefined && Number(inventarioFinal) > 0 ? Number(inventarioFinal) : null);

    let invInicial = null;

    // Si no se proporcionó inventario final, consultarlo directamente del Kardex unificado
    if (invFinal === null || invFinal <= 0) {
        try {
            const datosKardex = await obtenerDatosKardex({
                fechaInicio: desde,
                fechaFin: hasta,
                costoUnitario: cUnit,
                precioVentaUnitario: pVenta,
                empresaId
            });
            const saldoKardex = Number(datosKardex?.totales?.saldo_final || 0);
            if (saldoKardex > 0) {
                invFinal = saldoKardex;
            }
            if (datosKardex?.totales?.inventario_inicial_monto > 0) {
                invInicial = Number(datosKardex.totales.inventario_inicial_monto);
            }
        } catch (kardexError) {
            console.warn("No se pudo obtener el Kardex para el Balance General:", kardexError);
        }
    }

    if (invFinal === null) invFinal = 0;

    const query = new URLSearchParams({
        desde: desde || "",
        hasta: hasta || "",
        inventario_final: String(invFinal),
        inventarioFinal: String(invFinal)
    });

    if (cUnit > 0) query.append("costo_unitario", String(cUnit));
    if (pVenta > 0) query.append("precio_venta", String(pVenta));
    if (invInicial !== null && invInicial > 0) query.append("inventario_inicial", String(invInicial));

    return solicitarApi(`/balance-general?${query.toString()}`);
}
