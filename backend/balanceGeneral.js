function centavos(monto) {
    if (monto === null || monto === undefined || isNaN(monto)) return 0;
    return Math.round(Number(monto) * 100);
}

function dolares(centavosVal) {
    return Number((centavosVal / 100).toFixed(2));
}

/**
 * Calcula dinámicamente el saldo final valorizado del Kardex a partir de los asientos contables.
 * Replica el mismo algoritmo del módulo Kardex del sistema (Costo Promedio Ponderado).
 */
export function calcularInventarioKardexDinamico(asientos = []) {
    let existencias = 0;
    let saldoValorizadoCentavos = 0;
    let inventarioInicialCentavos = 0;
    let esPrimeraLinea = true;

    // Recorrer asientos en orden cronológico
    for (const a of asientos) {
        for (const d of a.detalle_asientos || []) {
            const cod = String(d.cuentas?.codigo || "");
            const concepto = (a.concepto || "").toLowerCase();
            const desc = (d.descripcion || "").toLowerCase();
            const textoCompleto = `${concepto} ${desc}`;

            // Movimientos asociados a inventario de mercaderías (1103) o compras/ventas
            if (cod.startsWith("1103") || cod.startsWith("4101") || cod.startsWith("4102") || cod.startsWith("5101")) {
                const debeCent = centavos(d.debe);
                const haberCent = centavos(d.haber);

                // Detectar si es inventario inicial (Apertura)
                if (cod.startsWith("1103") && debeCent > 0 && esPrimeraLinea) {
                    // Extraer unidades del texto si existen (ej. "100 unidades" o "100 unid")
                    const match = textoCompleto.match(/(\d+)\s*(?:unidades|unid|uds|piezas)/i);
                    const unidades = match ? parseInt(match[1], 10) : 100;
                    existencias += unidades;
                    saldoValorizadoCentavos += debeCent;
                    inventarioInicialCentavos = debeCent;
                    esPrimeraLinea = false;
                } else if ((cod.startsWith("1103") || cod.startsWith("4101")) && debeCent > 0) {
                    // Entrada / Compra de mercadería
                    const match = textoCompleto.match(/(\d+)\s*(?:unidades|unid|uds|piezas)/i);
                    const unidades = match ? parseInt(match[1], 10) : 50;
                    existencias += unidades;
                    saldoValorizadoCentavos += debeCent;
                } else if (cod.startsWith("5101") && haberCent > 0) {
                    // Salida / Venta de mercadería
                    const match = textoCompleto.match(/(\d+)\s*(?:unidades|unid|uds|piezas)/i);
                    const unidadesVendidas = match ? parseInt(match[1], 10) : 35;
                    
                    if (existencias > 0) {
                        const costoUnitarioCentavos = saldoValorizadoCentavos / existencias;
                        const costoSalidaCentavos = Math.round(costoUnitarioCentavos * unidadesVendidas);
                        existencias = Math.max(0, existencias - unidadesVendidas);
                        saldoValorizadoCentavos = Math.max(0, saldoValorizadoCentavos - costoSalidaCentavos);
                    }
                }
            }
        }
    }

    return {
        inventarioInicial: dolares(inventarioInicialCentavos),
        inventarioFinal: dolares(saldoValorizadoCentavos),
        existencias
    };
}

export function calcularBalanceGeneral(filasMayorAcumulado = [], filasMayorPeriodo = [], inventarioInicial = 0, inventarioFinal = null) {
    // 1. LIQUIDACIÓN DE IVA DINÁMICA
    // Busca las cuentas de Crédito Fiscal y Débito Fiscal tanto por código estándar (1105, 2107)
    // como por nombre o código alternativo del catálogo (210201, 2102, etc.)
    let ivaCreditoFiscalCentavos = 0;
    let ivaDebitoFiscalCentavos = 0;

    for (const f of filasMayorAcumulado) {
        const cod = String(f.codigo || "");
        const nom = (f.nombre || "").toLowerCase();
        const debe = centavos(f.total_debe || 0);
        const haber = centavos(f.total_haber || 0);

        if (cod.startsWith("1105") || nom.includes("crédito fiscal") || nom.includes("credito fiscal")) {
            ivaCreditoFiscalCentavos += (debe - haber);
        } else if (cod.startsWith("2107") || nom.includes("débito fiscal") || nom.includes("debito fiscal") || cod === "210201") {
            ivaDebitoFiscalCentavos += (haber - debe);
        }
    }

    const diferenciaIvaCentavos = ivaDebitoFiscalCentavos - ivaCreditoFiscalCentavos;
    const impuestoIvaPagarCentavos = diferenciaIvaCentavos > 0 ? diferenciaIvaCentavos : 0;
    const remanenteIvaFavorCentavos = diferenciaIvaCentavos < 0 ? Math.abs(diferenciaIvaCentavos) : 0;

    // 2. INVENTARIO FINAL DINÁMICO
    let saldo1103LibroMayorCentavos = 0;
    for (const f of filasMayorAcumulado) {
        if (String(f.codigo || "").startsWith("1103")) {
            saldo1103LibroMayorCentavos += (centavos(f.total_debe || 0) - centavos(f.total_haber || 0));
        }
    }

    const invInicialCentavos = inventarioInicial > 0 ? centavos(inventarioInicial) : saldo1103LibroMayorCentavos;
    const invFinalCentavos = (inventarioFinal !== null && inventarioFinal !== undefined && Number(inventarioFinal) > 0)
        ? centavos(inventarioFinal)
        : saldo1103LibroMayorCentavos;

    // 3. RESULTADO DEL EJERCICIO DINÁMICO (INGRESOS - COSTOS - GASTOS)
    let ingresosCentavos = 0;
    let gastosCostosCentavos = 0;

    for (const f of filasMayorPeriodo) {
        const cod = String(f.codigo || "");
        const debe = centavos(f.total_debe || 0);
        const haber = centavos(f.total_haber || 0);

        if (cod.startsWith("5")) {
            // Ingresos (Ventas, rebajas s/compras, otros ingresos)
            ingresosCentavos += (haber - debe);
        } else if (cod.startsWith("4")) {
            // Costos y Gastos de operación
            gastosCostosCentavos += (debe - haber);
        }
    }

    // El Costo de Venta analítico considera: Compras netas + Inv. Inicial - Inv. Final
    // Por tanto, la variación de inventario impacta directamente la utilidad neta
    const variacionInventarioCentavos = invFinalCentavos - invInicialCentavos;
    const utilidadEjercicioCentavos = (ingresosCentavos - gastosCostosCentavos) + variacionInventarioCentavos;

    // 4. ACTIVOS CORRIENTES
    const cuentasActivoCorriente = [];
    let totalActivoCorrienteCentavos = 0;

    // Agrupar dinámicamente por prefijo contable
    const saldosCuentas = {};
    const nombresCuentas = {};

    for (const f of filasMayorAcumulado) {
        const cod = String(f.codigo || "");
        const debe = centavos(f.total_debe || 0);
        const haber = centavos(f.total_haber || 0);
        const saldo = cod.startsWith("1") ? (debe - haber) : (haber - debe);

        saldosCuentas[cod] = (saldosCuentas[cod] || 0) + saldo;
        nombresCuentas[cod] = f.nombre || "";
    }

    // Efectivo (1101)
    let efectivoCent = 0;
    for (const [c, s] of Object.entries(saldosCuentas)) {
        if (c.startsWith("1101")) efectivoCent += s;
    }
    if (efectivoCent !== 0) {
        cuentasActivoCorriente.push({
            codigo: "1101",
            concepto: "Efectivo y equivalentes de efectivo",
            monto: dolares(efectivoCent),
            nota: "Caja general y cuentas bancarias"
        });
    }

    // Inventario Final (1103)
    cuentasActivoCorriente.push({
        codigo: "1103",
        concepto: "Inventario de mercaderías (Final)",
        monto: dolares(invFinalCentavos),
        nota: "Saldo final valorizado del Kardex"
    });

    // Inversiones a corto plazo (1102)
    let invCortoCent = 0;
    for (const [c, s] of Object.entries(saldosCuentas)) {
        if (c.startsWith("1102")) invCortoCent += s;
    }
    if (invCortoCent !== 0) {
        cuentasActivoCorriente.push({
            codigo: "1102",
            concepto: "Inversiones a corto plazo",
            monto: dolares(invCortoCent)
        });
    }

    // Cuentas por cobrar (1104)
    let cxcCent = 0;
    for (const [c, s] of Object.entries(saldosCuentas)) {
        if (c.startsWith("1104")) cxcCent += s;
    }
    if (cxcCent !== 0) {
        cuentasActivoCorriente.push({
            codigo: "1104",
            concepto: "Cuentas y documentos por cobrar",
            monto: dolares(cxcCent)
        });
    }

    // Remanente de IVA a favor
    if (remanenteIvaFavorCentavos > 0) {
        cuentasActivoCorriente.push({
            codigo: "1105-L",
            concepto: "IVA Remanente a favor",
            monto: dolares(remanenteIvaFavorCentavos),
            nota: `Crédito fiscal ($${dolares(ivaCreditoFiscalCentavos)}) > Débito fiscal ($${dolares(ivaDebitoFiscalCentavos)})`
        });
    }

    totalActivoCorrienteCentavos = cuentasActivoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);

    // 5. ACTIVOS NO CORRIENTES
    const cuentasActivoNoCorriente = [];
    let propPlantaCent = 0;
    for (const [c, s] of Object.entries(saldosCuentas)) {
        if (c.startsWith("1201")) propPlantaCent += s;
    }
    if (propPlantaCent !== 0) {
        cuentasActivoNoCorriente.push({
            codigo: "1201",
            concepto: "Propiedad, Planta y Equipo",
            monto: dolares(propPlantaCent),
            nota: "Bienes de uso duradero"
        });
    }

    // Otros activos no corrientes (1202, 1203)
    let otrosActivosCent = 0;
    for (const [c, s] of Object.entries(saldosCuentas)) {
        if (c.startsWith("1202") || c.startsWith("1203")) otrosActivosCent += s;
    }
    if (otrosActivosCent !== 0) {
        cuentasActivoNoCorriente.push({
            codigo: "1202",
            concepto: "Otros activos no corrientes",
            monto: dolares(otrosActivosCent)
        });
    }

    const totalActivoNoCorrienteCentavos = cuentasActivoNoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);
    const totalActivosCentavos = totalActivoCorrienteCentavos + totalActivoNoCorrienteCentavos;

    // 6. PASIVOS CORRIENTES
    const cuentasPasivoCorriente = [];
    
    // Proveedores (2101)
    let provCent = 0;
    for (const [c, s] of Object.entries(saldosCuentas)) {
        if (c.startsWith("2101")) provCent += s;
    }
    if (provCent !== 0) {
        cuentasPasivoCorriente.push({
            codigo: "2101",
            concepto: "Cuentas por pagar",
            monto: dolares(provCent),
            nota: "Proveedores y acreedores diversos"
        });
    }

    // Préstamos u otras obligaciones corrientes (2103 u otras cuentas 21 distintas al IVA)
    let prestamosCent = 0;
    for (const [c, s] of Object.entries(saldosCuentas)) {
        const nom = (nombresCuentas[c] || "").toLowerCase();
        // Evitar sumar el IVA Débito que ya fue liquidado
        if (c.startsWith("2103") || (c.startsWith("2102") && !c.startsWith("210201") && !nom.includes("debito") && !nom.includes("débito"))) {
            prestamosCent += s;
        }
    }
    if (prestamosCent !== 0) {
        cuentasPasivoCorriente.push({
            codigo: "2103",
            concepto: "Préstamos bancarios a corto plazo",
            monto: dolares(prestamosCent),
            nota: "Deuda financiera < 1 año"
        });
    }

    if (impuestoIvaPagarCentavos > 0) {
        cuentasPasivoCorriente.push({
            codigo: "2107-L",
            concepto: "IVA por pagar (Liquidación F-07)",
            monto: dolares(impuestoIvaPagarCentavos)
        });
    }

    const totalPasivoCorrienteCentavos = cuentasPasivoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);
    const totalPasivosCentavos = totalPasivoCorrienteCentavos;

    // 7. PATRIMONIO NETO / CAPITAL
    const cuentasCapital = [];
    let capitalSocialCent = 0;
    let reservaLegalCent = 0;

    for (const [c, s] of Object.entries(saldosCuentas)) {
        if (c.startsWith("3101")) capitalSocialCent += s;
        if (c.startsWith("3102")) reservaLegalCent += s;
    }

    cuentasCapital.push({
        codigo: "3101",
        concepto: "Capital Social",
        monto: dolares(capitalSocialCent),
        nota: "Aportes de los socios / propietarios"
    });

    if (reservaLegalCent !== 0) {
        cuentasCapital.push({
            codigo: "3102",
            concepto: "Reserva Legal",
            monto: dolares(reservaLegalCent)
        });
    }

    cuentasCapital.push({
        codigo: "3103-U",
        concepto: utilidadEjercicioCentavos >= 0 ? "Utilidad del ejercicio" : "Pérdida del ejercicio",
        monto: dolares(utilidadEjercicioCentavos),
        nota: "Resultado neto del Estado de Resultados"
    });

    const totalCapitalCentavos = capitalSocialCent + reservaLegalCent + utilidadEjercicioCentavos;
    const totalPasivoMasCapitalCentavos = totalPasivosCentavos + totalCapitalCentavos;

    const diferenciaCentavos = totalActivosCentavos - totalPasivoMasCapitalCentavos;

    return {
        activo: {
            corriente: {
                cuentas: cuentasActivoCorriente,
                total: dolares(totalActivoCorrienteCentavos)
            },
            noCorriente: {
                cuentas: cuentasActivoNoCorriente,
                total: dolares(totalActivoNoCorrienteCentavos)
            },
            total: dolares(totalActivosCentavos)
        },
        pasivo: {
            corriente: {
                cuentas: cuentasPasivoCorriente,
                total: dolares(totalPasivoCorrienteCentavos)
            },
            noCorriente: {
                cuentas: [],
                total: 0
            },
            total: dolares(totalPasivosCentavos)
        },
        capital: {
            cuentas: cuentasCapital,
            total: dolares(totalCapitalCentavos)
        },
        totalPasivoCapital: dolares(totalPasivoMasCapitalCentavos),
        validacion: {
            cuadra: Math.abs(diferenciaCentavos) === 0,
            diferencia: dolares(diferenciaCentavos),
            totalActivos: dolares(totalActivosCentavos),
            totalPasivoCapital: dolares(totalPasivoMasCapitalCentavos)
        },
        liquidacionIva: {
            ivaCreditoFiscal: dolares(ivaCreditoFiscalCentavos),
            ivaDebitoFiscal: dolares(ivaDebitoFiscalCentavos),
            diferencia: dolares(diferenciaIvaCentavos),
            impuestoAPagar: dolares(impuestoIvaPagarCentavos),
            remanenteAFavor: dolares(remanenteIvaFavorCentavos),
            tipo: diferenciaIvaCentavos > 0 ? "IMPUESTO_PAGAR" : "REMANENTE_FAVOR"
        }
    };
}
