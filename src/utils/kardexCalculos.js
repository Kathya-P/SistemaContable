// Utilidades y cálculos para el Módulo de Kardex (Inventario - Promedio Ponderado)

export const TIPOS_MOVIMIENTO = {
    INVENTARIO_INICIAL: "INVENTARIO_INICIAL",
    COMPRA: "COMPRA",
    VENTA: "VENTA",
    DEVOLUCION_COMPRA: "DEVOLUCION_COMPRA",
    DEVOLUCION_VENTA: "DEVOLUCION_VENTA",
    OTRO: "OTRO"
};

export const NOMBRES_MOVIMIENTO = {
    INVENTARIO_INICIAL: "Inventario inicial",
    COMPRA: "Compras",
    VENTA: "Ventas",
    DEVOLUCION_COMPRA: "Devolución sobre compra",
    DEVOLUCION_VENTA: "Devolución sobre venta",
    OTRO: "Ajuste de inventario"
};

/**
 * Normaliza un número para evitar NaN o valores infinitos
 */
export function normalizarNumero(valor, decimales = 2) {
    const num = Number(valor);
    if (!Number.isFinite(num)) return 0;
    return Number(num.toFixed(decimales));
}

/**
 * Formatea un valor numérico a moneda ($ 1,234.56)
 */
export function formatearMoneda(valor) {
    const num = Number(valor || 0);
    return `$ ${num.toLocaleString("es-SV", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

/**
 * Formatea una fecha YYYY-MM-DD a DD/MM/YYYY
 */
export function formatearFecha(fechaStr) {
    if (!fechaStr) return "";
    const partes = String(fechaStr).slice(0, 10).split("-");
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fechaStr;
}

/**
 * Extrae la cantidad física de unidades a partir de:
 * 1. Campo cantidad directo
 * 2. Texto en concepto o descripción (ej: "1,000 unidades", "678 und", "cant: 50", "@ $8.85")
 */
export function extraerCantidad(texto, detalle = {}) {
    if (detalle?.cantidad && Number(detalle.cantidad) > 0) {
        return Number(detalle.cantidad);
    }

    const textoAnalizar = `${detalle?.descripcion || ""} ${texto || ""}`.trim();
    if (!textoAnalizar) return 0;

    // Buscar patrones tipo: "678 unidades", "1,000 unidades", "100 unds", "5 piezas", "cant: 100"
    const regexUnidades = /(?:cant(?:idad)?[:\s]*|de\s+)?([0-9]+(?:[.,][0-9]+)?)\s*(?:unidades|unidad|unds?|u\b|piezas|pzs|art[íi]culos)/i;
    const matchU = textoAnalizar.match(regexUnidades);
    if (matchU) {
        const limpia = matchU[1].replace(/,/g, "");
        const val = parseFloat(limpia);
        if (!isNaN(val) && val > 0) return val;
    }

    // Buscar "@ $precio" con cantidad anterior, ej: "678 @ $8.85" o "1000 @ 8.85"
    const regexArroba = /([0-9]+(?:[.,][0-9]+)?)\s*(?:@|a|\*)\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i;
    const matchA = textoAnalizar.match(regexArroba);
    if (matchA) {
        const cant = parseFloat(matchA[1].replace(/,/g, ""));
        if (!isNaN(cant) && cant > 0) return cant;
    }

    return 0;
}

/**
 * Identifica si un detalle de cuenta corresponde a un movimiento del Kardex:
 * - 1103 (Inventario)
 * - 4101 (Compras)
 * - 4102 (Devoluciones sobre compras)
 * - 5101 (Ventas)
 * - 5102 (Devoluciones sobre ventas)
 */
export function clasificarLineaContable(cuenta, detalle, conceptoAsiento = "") {
    const codigo = String(cuenta?.codigo || "").trim();
    const nombre = String(cuenta?.nombre || "").toLowerCase();
    const concepto = String(conceptoAsiento || "").toLowerCase();

    const debe = Number(detalle?.debe || 0);
    const haber = Number(detalle?.haber || 0);

    // 1. Inventario inicial: Cuenta 1103 al Debe o concepto indica inventario inicial
    if ((codigo.startsWith("1103") || nombre.includes("inventario")) && debe > 0 && (concepto.includes("inicial") || concepto.includes("apertura") || concepto.includes("inicio"))) {
        return {
            tipo: TIPOS_MOVIMIENTO.INVENTARIO_INICIAL,
            esInventario: true,
            monto: debe
        };
    }

    // 2. Compras: Cuenta 4101 al Debe (o cuenta con nombre compra sin devolucion)
    if ((codigo.startsWith("4101") || (nombre.includes("compra") && !nombre.includes("devoluci"))) && debe > 0) {
        return {
            tipo: TIPOS_MOVIMIENTO.COMPRA,
            esInventario: true,
            monto: debe
        };
    }

    // 3. Devolución sobre compras: Cuenta 4102 al Haber (o nombre con devolucion y compra)
    if ((codigo.startsWith("4102") || (nombre.includes("devoluci") && nombre.includes("compra"))) && haber > 0) {
        return {
            tipo: TIPOS_MOVIMIENTO.DEVOLUCION_COMPRA,
            esInventario: true,
            monto: haber
        };
    }

    // 4. Devolución sobre ventas: Cuenta 5102 al Debe (o nombre con devolucion y venta)
    if ((codigo.startsWith("5102") || (nombre.includes("devoluci") && nombre.includes("venta"))) && debe > 0) {
        return {
            tipo: TIPOS_MOVIMIENTO.DEVOLUCION_VENTA,
            esInventario: true,
            monto: debe
        };
    }

    // 5. Ventas: Cuenta 5101 al Haber (o nombre con venta sin devolucion)
    if ((codigo.startsWith("5101") || (nombre.includes("venta") && !nombre.includes("devoluci"))) && haber > 0) {
        return {
            tipo: TIPOS_MOVIMIENTO.VENTA,
            esInventario: true,
            monto: haber
        };
    }

    // Si es cuenta de inventario 1103 genérica:
    if (codigo.startsWith("1103") || nombre.includes("inventario")) {
        if (debe > 0) {
            return {
                tipo: TIPOS_MOVIMIENTO.COMPRA,
                esInventario: true,
                monto: debe
            };
        } else if (haber > 0) {
            return {
                tipo: TIPOS_MOVIMIENTO.VENTA,
                esInventario: true,
                monto: haber
            };
        }
    }

    return { tipo: null, esInventario: false, monto: 0 };
}

/**
 * Ejecuta el cálculo completo del Kardex según el método de Costo Promedio Ponderado
 * Recibe una lista cronológica de asientos o movimientos crudos.
 */
export function procesarKardex(movimientosCrudos) {
    let existencias = 0;
    let costoPromedio = 0;
    let saldoTotal = 0;

    const filasKardex = [];

    // Ordenar cronológicamente por fecha y luego número de partida
    const movimientosOrdenados = [...movimientosCrudos].sort((a, b) => {
        const fechaComp = String(a.fecha || "").localeCompare(String(b.fecha || ""));
        if (fechaComp !== 0) return fechaComp;
        return Number(a.asiento || a.numero_partida || 0) - Number(b.asiento || b.numero_partida || 0);
    });

    for (const mov of movimientosOrdenados) {
        const tipo = mov.tipo;
        const cantidadBruta = Number(mov.cantidad || 0);
        const montoContable = Number(mov.monto || 0);

        let entrada = 0;
        let salida = 0;
        let costoUnitarioMovimiento = 0;
        let costoEntrada = 0;
        let costoSalida = 0;
        let precioVentaUnitario = null;

        if (tipo === TIPOS_MOVIMIENTO.INVENTARIO_INICIAL) {
            entrada = cantidadBruta;
            salida = 0;
            costoUnitarioMovimiento = entrada > 0 ? (montoContable / entrada) : 0;
            costoEntrada = montoContable > 0 ? montoContable : (entrada * costoUnitarioMovimiento);

            // Primer costo promedio ponderado
            costoPromedio = entrada > 0 ? (costoEntrada / entrada) : 0;
            existencias = entrada;
            saldoTotal = existencias * costoPromedio;

        } else if (tipo === TIPOS_MOVIMIENTO.COMPRA) {
            entrada = cantidadBruta;
            salida = 0;
            costoUnitarioMovimiento = entrada > 0 ? (montoContable / entrada) : costoPromedio;
            costoEntrada = montoContable > 0 ? montoContable : (entrada * costoUnitarioMovimiento);

            const nuevasExistencias = existencias + entrada;
            if (nuevasExistencias > 0) {
                costoPromedio = ((existencias * costoPromedio) + costoEntrada) / nuevasExistencias;
            }
            existencias = nuevasExistencias;
            saldoTotal = existencias * costoPromedio;

        } else if (tipo === TIPOS_MOVIMIENTO.VENTA) {
            entrada = 0;
            salida = cantidadBruta;
            precioVentaUnitario = salida > 0 ? (montoContable / salida) : 0;
            costoSalida = salida * costoPromedio;

            // En ventas, el costo promedio unitario NO cambia
            existencias = Math.max(0, existencias - salida);
            saldoTotal = existencias * costoPromedio;

        } else if (tipo === TIPOS_MOVIMIENTO.DEVOLUCION_COMPRA) {
            // Devolución sobre compra: Sale mercadería al costo promedio actual
            entrada = 0;
            salida = cantidadBruta;
            costoSalida = salida * costoPromedio;

            // El costo promedio unitario se mantiene
            existencias = Math.max(0, existencias - salida);
            saldoTotal = existencias * costoPromedio;

        } else if (tipo === TIPOS_MOVIMIENTO.DEVOLUCION_VENTA) {
            // Devolución sobre venta: Entra mercadería reingresada al costo promedio
            entrada = cantidadBruta;
            salida = 0;
            costoUnitarioMovimiento = costoPromedio;
            costoEntrada = entrada * costoPromedio;

            const nuevasExistencias = existencias + entrada;
            if (nuevasExistencias > 0) {
                costoPromedio = ((existencias * costoPromedio) + costoEntrada) / nuevasExistencias;
            }
            existencias = nuevasExistencias;
            saldoTotal = existencias * costoPromedio;
        }

        filasKardex.push({
            id: mov.id || `${mov.asiento}-${tipo}-${mov.fecha}`,
            asiento: mov.asiento || mov.numero_partida || "—",
            fecha: mov.fecha,
            concepto: mov.concepto || NOMBRES_MOVIMIENTO[tipo] || "Movimiento",
            tipo,
            cuenta_codigo: mov.cuenta_codigo || "",
            cuenta_nombre: mov.cuenta_nombre || "",
            entrada,
            salida,
            existencias,
            costo_unitario: costoPromedio,
            costo_entrada: costoEntrada,
            costo_salida: costoSalida,
            saldo: saldoTotal,
            precio_venta_unitario: precioVentaUnitario
        });
    }

    // Calcular totales acumulados
    const totales = filasKardex.reduce((acc, fila) => {
        acc.total_entradas_unidades += fila.entrada;
        acc.total_salidas_unidades += fila.salida;
        acc.total_costo_entrada += fila.costo_entrada;
        acc.total_costo_salida += fila.costo_salida;
        if (fila.tipo === TIPOS_MOVIMIENTO.VENTA) {
            acc.total_costo_venta += fila.costo_salida;
        }
        return acc;
    }, {
        total_entradas_unidades: 0,
        total_salidas_unidades: 0,
        total_costo_entrada: 0,
        total_costo_salida: 0,
        total_costo_venta: 0
    });

    return {
        filas: filasKardex,
        totales: {
            ...totales,
            existencia_final: existencias,
            costo_promedio_final: costoPromedio,
            saldo_final: saldoTotal
        }
    };
}
