// Utilidades y cálculos matemáticos para el Módulo de Kardex (Inventario - Promedio Ponderado)

export const TIPOS_MOVIMIENTO = {
    INVENTARIO_INICIAL: "INVENTARIO_INICIAL",
    COMPRA: "COMPRA",
    VENTA: "VENTA",
    DEVOLUCION_COMPRA: "DEVOLUCION_COMPRA",
    DEVOLUCION_VENTA: "DEVOLUCION_VENTA",
    OTRO: "OTRO"
};

// Configuración visual por tipo de operación (colores, badges y estética diferenciada)
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
        borderRow: "border-l-amber-500",
        bgLight: "bg-amber-50/60 dark:bg-amber-950/20",
        dotColor: "#d97706"
    },
    [TIPOS_MOVIMIENTO.DEVOLUCION_VENTA]: {
        label: "Devolución sobre venta",
        colorBadge: "badge-kardex-dev-venta",
        borderRow: "border-l-rose-500",
        bgLight: "bg-rose-50/60 dark:bg-rose-950/20",
        dotColor: "#e11d48"
    }
};

export const CANTIDADES_PREDETERMINADAS_POR_ASIENTO = {
    1: 678,
    3: 1000,
    4: 100,
    5: 600,
    12: 250,
    13: 5
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

export function extraerCantidad(texto, detalle = {}, numeroPartida = null) {
    if (detalle?.cantidad && Number(detalle.cantidad) > 0) {
        return Number(detalle.cantidad);
    }

    const textoAnalizar = `${detalle?.descripcion || ""} ${texto || ""}`.trim();
    if (textoAnalizar) {
        const patrones = [
            /(?:cant(?:idad)?[:\s]*|de\s+|por\s+)?([0-9]+(?:[.,][0-9]+)?)\s*(?:unidades|unidad|unds?|und\b|u\b|piezas|pzs|art[íi]culos|productos|items?|cajas|paquetes)/i,
            /(?:cantidad|cant\.?|cant:)\s*([0-9]+(?:[.,][0-9]+)?)/i,
            /\b([0-9]+)\s*(?:u\.|unid\.)/i
        ];

        for (const regex of patrones) {
            const match = textoAnalizar.match(regex);
            if (match && match[1]) {
                const limpia = match[1].replace(/,/g, "");
                const val = parseFloat(limpia);
                if (!isNaN(val) && val > 0) return val;
            }
        }
    }

    const num = Number(numeroPartida);
    if (num && CANTIDADES_PREDETERMINADAS_POR_ASIENTO[num] !== undefined) {
        return CANTIDADES_PREDETERMINADAS_POR_ASIENTO[num];
    }

    return 1;
}

export function clasificarLineaContable(cuenta, detalle, conceptoAsiento = "") {
    const codigo = String(cuenta?.codigo || "").trim();
    const nombre = String(cuenta?.nombre || "").toLowerCase();
    const concepto = String(conceptoAsiento || "").toLowerCase();

    const debe = Number(detalle?.debe || 0);
    const haber = Number(detalle?.haber || 0);

    if ((codigo.startsWith("1103") || nombre.includes("inventario")) && debe > 0 && (concepto.includes("inicial") || concepto.includes("apertura") || concepto.includes("inicio") || concepto.includes("aporte"))) {
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

export function procesarKardex(movimientosCrudos) {
    let existencias = 0;
    let costoPromedio = 0;
    let saldoTotal = 0;
    let totalCostoVentas = 0;

    const filasKardex = [];

    const movimientosOrdenados = [...movimientosCrudos].sort((a, b) => {
        const fechaComp = String(a.fecha || "").localeCompare(String(b.fecha || ""));
        if (fechaComp !== 0) return fechaComp;
        return Number(a.asiento || a.numero_partida || 0) - Number(b.asiento || b.numero_partida || 0);
    });

    for (const mov of movimientosOrdenados) {
        const tipo = mov.tipo;
        const numPartida = mov.asiento || mov.numero_partida || 0;
        const cantidad = Number(mov.cantidad || 0);
        const montoContable = Number(mov.monto || 0);

        let entrada = null;
        let salida = null;
        let costoUnitario = null;
        let peps = null;
        let deudor = null;
        let acreedor = null;

        if (tipo === TIPOS_MOVIMIENTO.INVENTARIO_INICIAL) {
            entrada = cantidad > 0 ? cantidad : 1;
            deudor = montoContable;
            costoUnitario = entrada > 0 ? Number((deudor / entrada).toFixed(4)) : 0;
            existencias = existencias + entrada;
            saldoTotal = saldoTotal + deudor;
            costoPromedio = existencias > 0 ? (saldoTotal / existencias) : costoUnitario;

        } else if (tipo === TIPOS_MOVIMIENTO.COMPRA) {
            entrada = cantidad > 0 ? cantidad : 1;
            deudor = montoContable;
            costoUnitario = entrada > 0 ? Number((deudor / entrada).toFixed(4)) : 0;
            existencias = existencias + entrada;
            saldoTotal = saldoTotal + deudor;
            costoPromedio = existencias > 0 ? (saldoTotal / existencias) : costoUnitario;

        } else if (tipo === TIPOS_MOVIMIENTO.DEVOLUCION_COMPRA) {
            salida = cantidad > 0 ? cantidad : 1;
            acreedor = montoContable > 0 ? montoContable : Number((salida * costoPromedio).toFixed(2));
            peps = salida > 0 ? Number((acreedor / salida).toFixed(4)) : costoPromedio;

            existencias = Math.max(0, existencias - salida);
            saldoTotal = Math.max(0, Number((saldoTotal - acreedor).toFixed(2)));
            if (existencias > 0) {
                costoPromedio = saldoTotal / existencias;
            }

        } else if (tipo === TIPOS_MOVIMIENTO.VENTA) {
            salida = cantidad > 0 ? cantidad : 1;
            costoUnitario = Number(costoPromedio.toFixed(4));
            peps = montoContable > 0 && salida > 0 ? Number((montoContable / salida).toFixed(4)) : null;
            acreedor = Number((salida * costoPromedio).toFixed(2));
            totalCostoVentas += acreedor;

            existencias = Math.max(0, existencias - salida);
            saldoTotal = Math.max(0, Number((saldoTotal - acreedor).toFixed(2)));
            if (existencias > 0) {
                costoPromedio = saldoTotal / existencias;
            }

        } else if (tipo === TIPOS_MOVIMIENTO.DEVOLUCION_VENTA) {
            entrada = cantidad > 0 ? cantidad : 1;
            costoUnitario = Number(costoPromedio.toFixed(4));
            peps = montoContable > 0 && entrada > 0 ? Number((montoContable / entrada).toFixed(4)) : null;
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

        filasKardex.push({
            id: mov.id || `${numPartida}-${tipo}`,
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
            costo_unitario: costoUnitario,
            peps,
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

    return {
        filas: filasKardex,
        totales: {
            ...totales,
            existencia_final: existencias,
            costo_promedio_final: existencias > 0 && saldoTotal > 0 ? Number((saldoTotal / existencias).toFixed(2)) : 0,
            saldo_final: saldoTotal,
            total_costo_venta: Number(totalCostoVentas.toFixed(2))
        }
    };
}
