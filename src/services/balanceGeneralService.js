import { solicitarApi } from "./api";
import { obtenerDatosKardex } from "./kardexService";
import { calcularBalanceGeneralCliente, DATOS_FERRETERIA_REFERENCIA } from "../utils/balanceCalculos";
import { supabaseConfigurado } from "../lib/supabase";

/**
 * Consulta el Balance General desde el backend o lo calcula agregando
 * datos de Libro Mayor, Kardex y Estado de Resultados.
 */
export async function obtenerBalanceGeneral({ desde, hasta, inventarioFinalManual = null, inventarioFinal = null }) {
    if (!supabaseConfigurado) {
        // Modo demostración offline con los datos de la Ferretería
        return {
            ...DATOS_FERRETERIA_REFERENCIA,
            desde,
            hasta,
            modoDemo: true
        };
    }

    // 1. Obtener el inventario final del Kardex si no se proporcionó manualmente
    let invFinal = (inventarioFinalManual !== null && inventarioFinalManual !== undefined && Number(inventarioFinalManual) > 0)
        ? Number(inventarioFinalManual)
        : (inventarioFinal !== null && inventarioFinal !== undefined && Number(inventarioFinal) > 0 ? Number(inventarioFinal) : null);
    let inventarioInicial = 0;

    if (invFinal === null || invFinal <= 0) {
        try {
            const datosKardex = await obtenerDatosKardex({ fechaInicio: desde, fechaFin: hasta });
            const saldoKardex = Number(datosKardex?.totales?.saldo_final || 0);
            if (saldoKardex > 0) {
                invFinal = saldoKardex;
            } else {
                // Si por el rango de fechas no hay movimientos, buscar el saldo general del Kardex
                const kardexGeneral = await obtenerDatosKardex({});
                const saldoGeneral = Number(kardexGeneral?.totales?.saldo_final || 0);
                if (saldoGeneral > 0) {
                    invFinal = saldoGeneral;
                }
            }
        } catch (kardexError) {
            console.warn("No se pudo obtener el Kardex directamente, usando 0 o valor provisto:", kardexError);
        }
    }

    if (invFinal === null) invFinal = 0;

    // 2. Intentar llamar al endpoint dedicado /api/balance-general
    try {
        const query = new URLSearchParams({
            desde,
            hasta,
            inventario_final: String(invFinal),
            inventarioFinal: String(invFinal)
        });
        const respuesta = await solicitarApi(`/balance-general?${query.toString()}`);
        return respuesta;
    } catch (apiError) {
        console.info("Endpoint /api/balance-general no disponible en servidor remoto, calculando en cliente:", apiError.message);

        // 3. Respaldo: calcular combinando libro-mayor y estado-resultados
        const [mayorAcumulado, mayorPeriodo, estadoRes] = await Promise.all([
            solicitarApi(`/libro-mayor?desde=1900-01-01&hasta=${hasta}`).catch(() => []),
            solicitarApi(`/libro-mayor?desde=${desde}&hasta=${hasta}`).catch(() => []),
            solicitarApi(`/estado-resultados?desde=${desde}&hasta=${hasta}&inventario_final=${invFinal}`).catch(() => null)
        ]);

        inventarioInicial = estadoRes?.inventarioInicial || 0;
        const utilidadPeriodo = estadoRes?.estado?.utilidadAntesImpuestos ?? null;

        const balance = calcularBalanceGeneralCliente({
            filasMayorAcumulado: mayorAcumulado || [],
            filasMayorPeriodo: mayorPeriodo || [],
            inventarioInicial,
            inventarioFinal: invFinal,
            utilidadPeriodo
        });

        return {
            empresa: estadoRes?.empresa || "Empresa Contable",
            desde,
            hasta,
            ...balance
        };
    }
}
