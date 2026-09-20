import { solicitarApi } from "./api";
import { obtenerLibroDiario } from "./libroDiarioService";
import { obtenerCuentas } from "./cuentasService";
import {
    clasificarLineaContable,
    extraerCantidad,
    procesarKardex,
    TIPOS_MOVIMIENTO
} from "../utils/kardexCalculos";

// Conjunto de datos de ejemplo verificado según la guía paso a paso del prompt
export const DATOS_EJEMPLO_KARDEX = [
    {
        id: "ej-1",
        asiento: 1,
        fecha: "2026-01-01",
        concepto: "Inventario inicial (678 unidades @ $8.85)",
        tipo: TIPOS_MOVIMIENTO.INVENTARIO_INICIAL,
        cantidad: 678,
        monto: 6000.30,
        cuenta_codigo: "1103",
        cuenta_nombre: "Inventario de mercaderías"
    },
    {
        id: "ej-3",
        asiento: 3,
        fecha: "2026-01-05",
        concepto: "Compras de mercadería (1,000 unidades @ $8.85)",
        tipo: TIPOS_MOVIMIENTO.COMPRA,
        cantidad: 1000,
        monto: 8849.56,
        cuenta_codigo: "4101",
        cuenta_nombre: "Compras"
    },
    {
        id: "ej-4",
        asiento: 4,
        fecha: "2026-01-08",
        concepto: "Devolución sobre compra (100 unidades)",
        tipo: TIPOS_MOVIMIENTO.DEVOLUCION_COMPRA,
        cantidad: 100,
        monto: 885.00,
        cuenta_codigo: "4102",
        cuenta_nombre: "Devoluciones sobre compras"
    },
    {
        id: "ej-5",
        asiento: 5,
        fecha: "2026-01-10",
        concepto: "Ventas de mercadería (600 unidades @ $17.70 c/u)",
        tipo: TIPOS_MOVIMIENTO.VENTA,
        cantidad: 600,
        monto: 10620.00,
        cuenta_codigo: "5101",
        cuenta_nombre: "Ventas"
    },
    {
        id: "ej-12",
        asiento: 12,
        fecha: "2026-02-20",
        concepto: "Ventas de mercadería (250 unidades @ $17.70 c/u)",
        tipo: TIPOS_MOVIMIENTO.VENTA,
        cantidad: 250,
        monto: 4425.00,
        cuenta_codigo: "5101",
        cuenta_nombre: "Ventas"
    },
    {
        id: "ej-13",
        asiento: 13,
        fecha: "2026-02-27",
        concepto: "Devolución sobre venta (5 unidades)",
        tipo: TIPOS_MOVIMIENTO.DEVOLUCION_VENTA,
        cantidad: 5,
        monto: 44.25,
        cuenta_codigo: "5102",
        cuenta_nombre: "Devoluciones sobre ventas"
    }
];

/**
 * Obtiene todos los asientos contables y extrae los movimientos pertinentes al inventario
 * @param {Object} opciones
 * @param {string} opciones.fechaInicio Fecha inicio YYYY-MM-DD
 * @param {string} opciones.fechaFin Fecha fin YYYY-MM-DD
 * @param {boolean} opciones.usarEjemplo Si es true, usa los datos de ejemplo del ejercicio
 * @param {Object} opciones.cantidadesPersonalizadas Objeto con { [idAsiento]: cantidad }
 */
export async function obtenerDatosKardex({
    fechaInicio = "",
    fechaFin = "",
    usarEjemplo = false,
    cantidadesPersonalizadas = {}
} = {}) {
    let movimientosCrudos = [];

    if (usarEjemplo) {
        movimientosCrudos = DATOS_EJEMPLO_KARDEX.map(m => ({
            ...m,
            cantidad: cantidadesPersonalizadas[m.id] !== undefined
                ? Number(cantidadesPersonalizadas[m.id])
                : m.cantidad
        }));
    } else {
        // Cargar asientos reales (intentar endpoint dedicado /kardex o fallback a /libro-diario)
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

            for (const detalle of detalles) {
                const cuenta = detalle.cuentas || cuentasPorId.get(String(detalle.cuenta_id));
                const clasificacion = clasificarLineaContable(cuenta, detalle, asiento.concepto);

                if (clasificacion.esInventario) {
                    const idUnico = `${asiento.id}-${detalle.cuenta_id || clasificacion.tipo}`;
                    let cantidad = cantidadesPersonalizadas[idUnico] !== undefined
                        ? Number(cantidadesPersonalizadas[idUnico])
                        : extraerCantidad(asiento.concepto, detalle);

                    // Si no se pudo deducir una cantidad explícita, se usa 1 como predeterminado editable
                    if (!cantidad || cantidad <= 0) {
                        cantidad = 1;
                    }

                    movimientosCrudos.push({
                        id: idUnico,
                        asiento: asiento.numero_partida || asiento.id,
                        fecha: String(asiento.fecha || "").slice(0, 10),
                        concepto: asiento.concepto,
                        tipo: clasificacion.tipo,
                        cantidad,
                        monto: clasificacion.monto,
                        cuenta_codigo: cuenta?.codigo || "",
                        cuenta_nombre: cuenta?.nombre || ""
                    });
                }
            }
        }
    }

    // Filtrar por rango de fechas si se especificaron
    let movimientosFiltrados = movimientosCrudos;
    if (fechaInicio) {
        movimientosFiltrados = movimientosFiltrados.filter(m => m.fecha >= fechaInicio);
    }
    if (fechaFin) {
        movimientosFiltrados = movimientosFiltrados.filter(m => m.fecha <= fechaFin);
    }

    // Procesar acumulados según Promedio Ponderado
    const resultado = procesarKardex(movimientosFiltrados);

    return {
        ...resultado,
        totalMovimientos: movimientosFiltrados.length,
        tieneDatosReales: movimientosCrudos.length > 0 && !usarEjemplo
    };
}
