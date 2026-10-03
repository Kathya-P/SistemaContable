// Utilidades y cálculos contables del Módulo de Kardex (Inventario - Promedio Ponderado)
// Fuente única de verdad compartida entre Frontend y Backend.

export const TIPOS_MOVIMIENTO = {
    INVENTARIO_INICIAL: "INVENTARIO_INICIAL",
    COMPRA: "COMPRA",
    VENTA: "VENTA",
    DEVOLUCION_COMPRA: "DEVOLUCION_COMPRA",
    DEVOLUCION_VENTA: "DEVOLUCION_VENTA",
    OTRO: "OTRO"
};

// Configuración visual por tipo de operación
export const CONFIG_TIPO_MOVIMIENTO = {
    [TIPOS_MOVIMIENTO.INVENTARIO_INICIAL]: {
        label: "Inventario por mercadería",
        colorBadge: "badge-kardex-inventario",
        borderRow: "border-l-sky-500",
        bgLight: "bg-sky-50/60 dark:bg-sky-950/20",
        dotColor: "#0284c7"
    },
    [TIPOS_MOVIMIENTO.COMPRA]: {
        label: "Compras",
        colorBadge: "badge-kardex-compra",
        borderRow: "border-l-emerald-500",
        bgLight: "bg-emerald-50/60 dark:bg-emerald-950/20",
        dotColor: "#059669"
    },
    [TIPOS_MOVIMIENTO.VENTA]: {
        label: "Ventas",
        colorBadge: "badge-kardex-venta",
        borderRow: "border-l-indigo-500",
        bgLight: "bg-indigo-50/60 dark:bg-indigo-950/20",
        dotColor: "#6366f1"
    },
    [TIPOS_MOVIMIENTO.DEVOLUCION_COMPRA]: {
        label: "Devolución sobre compra",
        colorBadge: "badge-kardex-dev-compra",
        borderRow: "border-l-teal-600",
        bgLight: "bg-teal-50/60 dark:bg-teal-950/20",
        dotColor: "#0d9488"
    },
    [TIPOS_MOVIMIENTO.DEVOLUCION_VENTA]: {
        label: "Devolución sobre venta",
        colorBadge: "badge-kardex-dev-venta",
        borderRow: "border-l-rose-500",
        bgLight: "bg-rose-50/60 dark:bg-rose-950/20",
        dotColor: "#e11d48"
    }
};

const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

export function formatearFechaKardex(fechaStr) {
    if (!fechaStr) return "";
    const partes = String(fechaStr).slice(0, 10).split("-");
    if (partes.length === 3) {
        const diaNum = parseInt(partes[2], 10);
        const dia = diaNum === 5 ? "5" : (diaNum < 10 ? `0${diaNum}` : `${diaNum}`);
        const mesIdx = parseInt(partes[1], 10) - 1;
        const nombreMes = MESES[mesIdx] || partes[1];
        return `${dia} de ${nombreMes}`;
    }
    return fechaStr;
}

export function formatearMoneda(valor, permitirVacio = false) {
    if (permitirVacio && (valor === null || valor === undefined || valor === 0 || valor === "")) {
        return "";
    }
    const num = Number(valor || 0);
    return `$ ${num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

export function obtenerNombreCuenta(tipo, cuenta = {}) {
    if (cuenta?.nombre && String(cuenta.nombre).trim()) {
        const nom = String(cuenta.nombre).trim();
        if (tipo === TIPOS_MOVIMIENTO.INVENTARIO_INICIAL && nom.toLowerCase().includes("inventario")) {
            return nom.toLowerCase().includes("mercader") ? nom : "Inventario por mercadería";
        }
        return nom;
    }

    switch (tipo) {
        case TIPOS_MOVIMIENTO.INVENTARIO_INICIAL:
            return "Inventario por mercadería";
        case TIPOS_MOVIMIENTO.COMPRA:
            return "Compras";
        case TIPOS_MOVIMIENTO.VENTA:
            return "Ventas";
        case TIPOS_MOVIMIENTO.DEVOLUCION_COMPRA:
            return "Devolución sobre compra";
        case TIPOS_MOVIMIENTO.DEVOLUCION_VENTA:
            return "Devolución sobre venta";
        default:
            return "Inventario por mercadería";
    }
}

/**
 * Deduce las unidades físicas del movimiento contable sin capturarlas ni usar cantidades quemadas.
 * - Inventario inicial, Compras y Devolución sobre compras: unidades = monto del asiento / costo unitario
 * - Ventas y Devolución sobre ventas: unidades = monto del asiento / precio de venta unitario
 * Redondea al entero más cercano (Math.round) porque no existen fracciones de unidad.
 * Si costo unitario o precio de venta unitario no están definidos (> 0), retorna 0 sin inventar números.
 */
export function deducirCantidadMovimiento(tipo, monto, costoUnitario, precioVentaUnitario) {
    const m = Number(monto || 0);
    const cUnit = Number(costoUnitario || 0);
    const pVenta = Number(precioVentaUnitario || 0);

    if (m <= 0) return 0;

    if (
        tipo === TIPOS_MOVIMIENTO.INVENTARIO_INICIAL ||
        tipo === TIPOS_MOVIMIENTO.COMPRA ||
        tipo === TIPOS_MOVIMIENTO.DEVOLUCION_COMPRA
    ) {
        if (cUnit <= 0) return 0;
        return Math.round(m / cUnit);
    }

    if (
        tipo === TIPOS_MOVIMIENTO.VENTA ||
        tipo === TIPOS_MOVIMIENTO.DEVOLUCION_VENTA
    ) {
        if (pVenta <= 0) return 0;
        return Math.round(m / pVenta);
    }

    return 0;
}

/**
 * Clasifica cada renglón contable por su código o naturaleza según el catálogo contable oficial:
 * 1103: Inventario de mercadería (inicial o movimientos)
 * 4101: Compras (Debe)
 * 4102: Devolución sobre compras (Haber)
 * 5101: Ventas (Haber)
 * 5102: Devolución sobre ventas (Debe)
 */
export function clasificarLineaContable(cuenta, detalle, conceptoAsiento = "", numPartida = null) {
    const codigo = String(cuenta?.codigo || "").trim();
    const nombre = String(cuenta?.nombre || "").toLowerCase();
    const concepto = String(conceptoAsiento || "").toLowerCase();

    const debe = Number(detalle?.debe || 0);
    const haber = Number(detalle?.haber || 0);

    // Asiento 1 o concepto explícito de apertura con cuenta de inventario
    const esPartidaUno = Number(numPartida) === 1;
    const esConceptoInicial = concepto.includes("inicial") || concepto.includes("apertura") || concepto.includes("inicio") || concepto.includes("aporte");

    if ((codigo.startsWith("1103") || nombre.includes("inventario")) && debe > 0 && (esPartidaUno || esConceptoInicial)) {
        return {
            tipo: TIPOS_MOVIMIENTO.INVENTARIO_INICIAL,
            esInventario: true,
            monto: debe
        };
    }

    if ((codigo.startsWith("4101") || (nombre.includes("compra") && !nombre.includes("devoluci"))) && debe > 0) {
        return {
            tipo: TIPOS_MOVIMIENTO.COMPRA,
            esInventario: true,
            monto: debe
        };
    }

    if ((codigo.startsWith("4102") || (nombre.includes("devoluci") && nombre.includes("compra"))) && haber > 0) {
        return {
            tipo: TIPOS_MOVIMIENTO.DEVOLUCION_COMPRA,
            esInventario: true,
            monto: haber
        };
    }

    if ((codigo.startsWith("5102") || (nombre.includes("devoluci") && nombre.includes("venta"))) && debe > 0) {
        return {
            tipo: TIPOS_MOVIMIENTO.DEVOLUCION_VENTA,
            esInventario: true,
            monto: debe
        };
    }

    if ((codigo.startsWith("5101") || (nombre.includes("venta") && !nombre.includes("devoluci"))) && haber > 0) {
        return {
            tipo: TIPOS_MOVIMIENTO.VENTA,
            esInventario: true,
            monto: haber
        };
    }

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
 * Procesa la serie de movimientos con el método de Promedio Ponderado.
 * Las unidades se deducen o se toman del movimiento; las ventas salen al costo promedio vigente;
 * las devoluciones sobre venta entran al costo promedio vigente.
 * No utiliza la columna PEPS ni fallbacks de 1 unidad.
 */
export function procesarKardex(movimientosCrudos, { costoUnitario = 0, precioVentaUnitario = 0 } = {}) {
    let existencias = 0;
    let costoPromedio = 0;
    let saldoTotal = 0;
    let totalCostoVentas = 0;
    let inventarioInicialMonto = 0;
    let inventarioInicialUnidades = 0;

    const filasKardex = [];

    const movimientosOrdenados = [...movimientosCrudos].sort((a, b) => {
        const fechaComp = String(a.fecha || "").localeCompare(String(b.fecha || ""));
        if (fechaComp !== 0) return fechaComp;
        return Number(a.asiento || a.numero_partida || 0) - Number(b.asiento || b.numero_partida || 0);
    });

    const cUnitConfig = Number(costoUnitario || 0);
    const pVentaConfig = Number(precioVentaUnitario || 0);

    for (const mov of movimientosOrdenados) {
        const tipo = mov.tipo;
        const numPartida = mov.asiento || mov.numero_partida || 0;
        const montoContable = Number(mov.monto || 0);

        // Deducir unidades según el monto y los parámetros editables (sin inventar cantidades)
        let cantidad = Number(mov.cantidad || 0);
        if (cantidad <= 0 && (cUnitConfig > 0 || pVentaConfig > 0)) {
            cantidad = deducirCantidadMovimiento(tipo, montoContable, cUnitConfig, pVentaConfig);
        }

        let entrada = null;
        let salida = null;
        let costoUnitarioFila = null;
        let deudor = null;
        let acreedor = null;

        if (tipo === TIPOS_MOVIMIENTO.INVENTARIO_INICIAL) {
            entrada = cantidad;
            deudor = montoContable;
            costoUnitarioFila = entrada > 0 ? Number((deudor / entrada).toFixed(4)) : (cUnitConfig > 0 ? cUnitConfig : 0);
            existencias = existencias + entrada;
            saldoTotal = Number((saldoTotal + deudor).toFixed(2));
            costoPromedio = existencias > 0 ? (saldoTotal / existencias) : costoUnitarioFila;

            inventarioInicialMonto += deudor;
            inventarioInicialUnidades += entrada;

        } else if (tipo === TIPOS_MOVIMIENTO.COMPRA) {
            entrada = cantidad;
            deudor = montoContable;
            costoUnitarioFila = entrada > 0 ? Number((deudor / entrada).toFixed(4)) : (cUnitConfig > 0 ? cUnitConfig : 0);
            existencias = existencias + entrada;
            saldoTotal = Number((saldoTotal + deudor).toFixed(2));
            costoPromedio = existencias > 0 ? (saldoTotal / existencias) : costoUnitarioFila;

        } else if (tipo === TIPOS_MOVIMIENTO.DEVOLUCION_COMPRA) {
            salida = cantidad;
            acreedor = montoContable > 0 ? montoContable : Number((salida * costoPromedio).toFixed(2));
            costoUnitarioFila = salida > 0 ? Number((acreedor / salida).toFixed(4)) : Number(costoPromedio.toFixed(4));

            existencias = Math.max(0, existencias - salida);
            saldoTotal = Math.max(0, Number((saldoTotal - acreedor).toFixed(2)));
            if (existencias > 0) {
                costoPromedio = saldoTotal / existencias;
            }

        } else if (tipo === TIPOS_MOVIMIENTO.VENTA) {
            salida = cantidad;
            costoUnitarioFila = Number(costoPromedio.toFixed(4));
            // Las ventas salen al costo promedio ponderado vigente
            acreedor = Number((salida * costoPromedio).toFixed(2));
            totalCostoVentas += acreedor;

            existencias = Math.max(0, existencias - salida);
            saldoTotal = Math.max(0, Number((saldoTotal - acreedor).toFixed(2)));
            if (existencias > 0) {
                costoPromedio = saldoTotal / existencias;
            }

        } else if (tipo === TIPOS_MOVIMIENTO.DEVOLUCION_VENTA) {
            entrada = cantidad;
            costoUnitarioFila = Number(costoPromedio.toFixed(4));
            // Las devoluciones sobre venta ingresan al costo promedio ponderado vigente
            deudor = Number((entrada * costoPromedio).toFixed(2));
            totalCostoVentas = Math.max(0, totalCostoVentas - deudor);

            existencias = existencias + entrada;
            saldoTotal = Number((saldoTotal + deudor).toFixed(2));
            if (existencias > 0) {
                costoPromedio = saldoTotal / existencias;
            }
        }

        const configVisual = CONFIG_TIPO_MOVIMIENTO[tipo] || {
            label: mov.cuenta_nombre || "Inventario por mercadería",
            colorBadge: "badge-kardex-inventario",
            borderRow: "border-l-slate-400",
            bgLight: "bg-white",
            dotColor: "#64748b"
        };

        // Precio de venta unitario informativo para operaciones de venta / dev. sobre venta
        const esOperacionVenta = tipo === TIPOS_MOVIMIENTO.VENTA || tipo === TIPOS_MOVIMIENTO.DEVOLUCION_VENTA;
        const precioUnitVenta = esOperacionVenta && pVentaConfig > 0 ? pVentaConfig : null;

        filasKardex.push({
            id: mov.id || `${numPartida}-${tipo}-${filasKardex.length}`,
            asiento: numPartida,
            fecha: mov.fecha,
            fechaTexto: formatearFechaKardex(mov.fecha),
            cuenta: mov.cuenta_nombre || configVisual.label,
            concepto: mov.concepto || mov.descripcion || configVisual.label,
            tipo,
            config: configVisual,
            entrada,
            salida,
            existencias,
            costo_unitario: costoUnitarioFila,
            precio_venta: precioUnitVenta,
            deudor,
            acreedor,
            saldo: saldoTotal
        });
    }

    const totales = filasKardex.reduce((acc, f) => {
        acc.total_entradas += Number(f.entrada || 0);
        acc.total_salidas += Number(f.salida || 0);
        acc.total_deudor += Number(f.deudor || 0);
        acc.total_acreedor += Number(f.acreedor || 0);
        return acc;
    }, {
        total_entradas: 0,
        total_salidas: 0,
        total_deudor: 0,
        total_acreedor: 0
    });

    const saldoFinalCalculado = Number(saldoTotal.toFixed(2));
    const costoPromedioFinalCalculado = existencias > 0 && saldoFinalCalculado > 0
        ? Number((saldoFinalCalculado / existencias).toFixed(2))
        : 0;

    return {
        filas: filasKardex,
        totales: {
            ...totales,
            existencia_final: existencias,
            costo_promedio_final: costoPromedioFinalCalculado,
            saldo_final: saldoFinalCalculado,
            total_costo_venta: Number(totalCostoVentas.toFixed(2)),
            inventario_inicial_monto: Number(inventarioInicialMonto.toFixed(2)),
            inventario_inicial_unidades: inventarioInicialUnidades
        }
    };
}

/**
 * Función compartida Frontend-Backend que recibe la lista de asientos crudos de la base de datos
 * y devuelve el Kardex y sus totales exactos utilizando los parámetros de costo y precio de venta.
 */
export function calcularKardexDesdeAsientos(
    asientos = [],
    costoUnitario = 0,
    precioVentaUnitario = 0,
    { desde = null, hasta = null, catalogoCuentas = null } = {}
) {
    const cuentasPorId = Array.isArray(catalogoCuentas)
        ? new Map(catalogoCuentas.map(c => [String(c.id), c]))
        : null;

    const movimientosCrudos = [];

    for (const asiento of (asientos || [])) {
        const numPartida = Number(asiento.numero_partida || asiento.id || 0);
        const fecha = String(asiento.fecha || "").slice(0, 10);
        const detalles = asiento.detalle_asientos || [];

        for (const det of detalles) {
            const cuenta = det.cuentas || (cuentasPorId ? cuentasPorId.get(String(det.cuenta_id)) : null) || {};
            const clasificacion = clasificarLineaContable(cuenta, det, asiento.concepto, numPartida);

            if (clasificacion.esInventario) {
                const nombreCuenta = obtenerNombreCuenta(clasificacion.tipo, cuenta);
                const idUnico = `${asiento.id || numPartida}-${det.cuenta_id || clasificacion.tipo}-${movimientosCrudos.length}`;

                // Unidades deducidas matemáticamente según costo unitario o precio de venta unitario
                const cantidadDeducida = deducirCantidadMovimiento(
                    clasificacion.tipo,
                    clasificacion.monto,
                    costoUnitario,
                    precioVentaUnitario
                );

                movimientosCrudos.push({
                    id: idUnico,
                    asiento: numPartida,
                    fecha,
                    concepto: asiento.concepto || det.descripcion || nombreCuenta,
                    cuenta_nombre: nombreCuenta,
                    tipo: clasificacion.tipo,
                    cantidad: cantidadDeducida,
                    monto: clasificacion.monto,
                    cuenta_codigo: cuenta?.codigo || ""
                });
            }
        }
    }

    // Filtrar por fechas si se especifica
    let filtrados = movimientosCrudos;
    if (desde) {
        filtrados = filtrados.filter(m => m.fecha >= desde);
    }
    if (hasta) {
        filtrados = filtrados.filter(m => m.fecha <= hasta);
    }

    return procesarKardex(filtrados, { costoUnitario, precioVentaUnitario });
}
