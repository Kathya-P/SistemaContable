import { solicitarApi } from "./api";
import { obtenerLibroDiario } from "./libroDiarioService";
import { obtenerCuentas } from "./cuentasService";
import { calcularKardexDesdeAsientos, obtenerConfiguracionKardex } from "../utils/kardexCalculos";

export async function obtenerDatosKardex({
    fechaInicio = "",
    fechaFin = "",
    costoUnitario = null,
    precioVentaUnitario = null,
    empresaId = null
} = {}) {
    // Si no se proporcionaron costo o precio, obtener de la configuración guardada por empresa
    const config = obtenerConfiguracionKardex(empresaId);
    const cUnit = costoUnitario !== null && costoUnitario !== undefined && Number(costoUnitario) > 0
        ? Number(costoUnitario)
        : (config?.costoUnitario ? Number(config.costoUnitario) : 0);

    const pVenta = precioVentaUnitario !== null && precioVentaUnitario !== undefined && Number(precioVentaUnitario) > 0
        ? Number(precioVentaUnitario)
        : (config?.precioVentaUnitario ? Number(config.precioVentaUnitario) : 0);

    const tieneConfiguracion = cUnit > 0 && pVenta > 0;

    const params = new URLSearchParams();
    if (fechaInicio) params.append("desde", fechaInicio);
    if (fechaFin) params.append("hasta", fechaFin);
    if (cUnit > 0) params.append("costo_unitario", String(cUnit));
    if (pVenta > 0) params.append("precio_venta", String(pVenta));

    const queryStr = params.toString() ? `?${params.toString()}` : "";

    const [asientos, cuentas] = await Promise.all([
        solicitarApi(`/kardex${queryStr}`).catch(() => obtenerLibroDiario().catch(() => [])),
        obtenerCuentas().catch(() => [])
    ]);

    // Si aún no se han configurado los valores, no inventar números
    if (!tieneConfiguracion) {
        return {
            filas: [],
            totales: {
                total_entradas: 0,
                total_salidas: 0,
                total_deudor: 0,
                total_acreedor: 0,
                existencia_final: 0,
                costo_promedio_final: 0,
                saldo_final: 0,
                total_costo_venta: 0,
                inventario_inicial_monto: 0,
                inventario_inicial_unidades: 0
            },
            totalMovimientos: 0,
            tieneDatosReales: Array.isArray(asientos) && asientos.length > 0,
            requiereConfiguracion: true,
            costoUnitario: cUnit || null,
            precioVentaUnitario: pVenta || null
        };
    }

    // Usar la función de cálculo compartida
    const resultado = calcularKardexDesdeAsientos(
        asientos,
        cUnit,
        pVenta,
        { desde: fechaInicio, hasta: fechaFin, catalogoCuentas: cuentas }
    );

    return {
        ...resultado,
        totalMovimientos: resultado.filas.length,
        tieneDatosReales: Array.isArray(asientos) && asientos.length > 0,
        requiereConfiguracion: false,
        costoUnitario: cUnit,
        precioVentaUnitario: pVenta
    };
}
