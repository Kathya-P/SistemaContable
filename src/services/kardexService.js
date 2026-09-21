import { solicitarApi } from "./api";
import { obtenerLibroDiario } from "./libroDiarioService";
import { obtenerCuentas } from "./cuentasService";
import {
    clasificarLineaContable,
    extraerCantidad,
    obtenerNombreCuenta,
    procesarKardex
} from "../utils/kardexCalculos";

export async function obtenerDatosKardex({
    fechaInicio = "",
    fechaFin = "",
    cantidadesPersonalizadas = {}
} = {}) {
    const movimientosCrudos = [];

    const params = new URLSearchParams();
    if (fechaInicio) params.append("desde", fechaInicio);
    if (fechaFin) params.append("hasta", fechaFin);
    const queryStr = params.toString() ? `?${params.toString()}` : "";

    const [asientos, cuentas] = await Promise.all([
        solicitarApi(`/kardex${queryStr}`).catch(() => obtenerLibroDiario().catch(() => [])),
        obtenerCuentas().catch(() => [])
    ]);

    const cuentasPorId = new Map((cuentas || []).map(c => [String(c.id), c]));

    for (const asiento of (asientos || [])) {
        const detalles = asiento.detalle_asientos || [];
        const numPartida = asiento.numero_partida || asiento.id;

        for (const detalle of detalles) {
            const cuenta = detalle.cuentas || cuentasPorId.get(String(detalle.cuenta_id));
            const clasificacion = clasificarLineaContable(cuenta, detalle, asiento.concepto);

            if (clasificacion.esInventario) {
                const idUnico = `${asiento.id}-${detalle.cuenta_id || clasificacion.tipo}`;
                
                let cantidad = cantidadesPersonalizadas[idUnico] !== undefined
                    ? Number(cantidadesPersonalizadas[idUnico])
                    : (cantidadesPersonalizadas[numPartida] !== undefined
                        ? Number(cantidadesPersonalizadas[numPartida])
                        : extraerCantidad(asiento.concepto, detalle, numPartida));

                if (!cantidad || cantidad <= 0) {
                    cantidad = 1;
                }

                const nombreCuenta = obtenerNombreCuenta(clasificacion.tipo, cuenta);

                movimientosCrudos.push({
                    id: idUnico,
                    asiento: numPartida,
                    fecha: String(asiento.fecha || "").slice(0, 10),
                    concepto: asiento.concepto || detalle.descripcion || nombreCuenta,
                    cuenta_nombre: nombreCuenta,
                    tipo: clasificacion.tipo,
                    cantidad,
                    monto: clasificacion.monto,
                    cuenta_codigo: cuenta?.codigo || ""
                });
            }
        }
    }

    let movimientosFiltrados = movimientosCrudos;
    if (fechaInicio) {
        movimientosFiltrados = movimientosFiltrados.filter(m => m.fecha >= fechaInicio);
    }
    if (fechaFin) {
        movimientosFiltrados = movimientosFiltrados.filter(m => m.fecha <= fechaFin);
    }

    const resultado = procesarKardex(movimientosFiltrados);

    return {
        ...resultado,
        totalMovimientos: movimientosFiltrados.length,
        tieneDatosReales: movimientosCrudos.length > 0
    };
}
