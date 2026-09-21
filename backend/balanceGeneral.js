import { calcularEstadoResultados } from "./estadoResultados.js";

function centavos(monto) {
    if (monto === null || monto === undefined || isNaN(monto)) return 0;
    return Math.round(Number(monto) * 100);
}

function dolares(centavosVal) {
    return Number((centavosVal / 100).toFixed(2));
}

function saldoPrefijo(filas, prefijo, tipo) {
    let acum = 0;
    for (const f of filas) {
        const codigo = String(f.codigo || "");
        if (codigo.startsWith(prefijo)) {
            const debe = centavos(f.total_debe || 0);
            const haber = centavos(f.total_haber || 0);
            if (tipo === "debe") {
                acum += (debe - haber);
            } else {
                acum += (haber - debe);
            }
        }
    }
    return acum;
}

export function calcularBalanceGeneral(filasMayorAcumulado = [], filasMayorPeriodo = [], inventarioInicial = 0, inventarioFinal = null) {
    // 1. LIQUIDACIÓN DE IVA
    const ivaCreditoFiscalCentavos = saldoPrefijo(filasMayorAcumulado, "1105", "debe");
    const ivaDebitoFiscalCentavos = saldoPrefijo(filasMayorAcumulado, "2107", "haber");
    const diferenciaIvaCentavos = ivaDebitoFiscalCentavos - ivaCreditoFiscalCentavos;

    const impuestoIvaPagarCentavos = diferenciaIvaCentavos > 0 ? diferenciaIvaCentavos : 0;
    const remanenteIvaFavorCentavos = diferenciaIvaCentavos < 0 ? Math.abs(diferenciaIvaCentavos) : 0;

    // 2. RESULTADO DEL EJERCICIO (UTILIDAD / PÉRDIDA)
    const saldoLibroMayor1103Centavos = saldoPrefijo(filasMayorAcumulado, "1103", "debe");
    
    const inventarioInicialCentavos = centavos(inventarioInicial);
    // El inventario final viene del Kardex, o por defecto del saldo en libros de la cuenta 1103
    const inventarioFinalCentavos = (inventarioFinal !== null && inventarioFinal !== undefined && Number(inventarioFinal) > 0)
        ? centavos(inventarioFinal)
        : (inventarioInicialCentavos > 0 ? inventarioInicialCentavos : saldoLibroMayor1103Centavos);

    const invFinalParaCalculos = dolares(inventarioFinalCentavos);
    const estadoResultados = calcularEstadoResultados(filasMayorPeriodo, inventarioInicial, invFinalParaCalculos);
    const utilidadEjercicio = estadoResultados.utilidadAntesImpuestos;
    const utilidadEjercicioCentavos = centavos(utilidadEjercicio);

    // 3. ACTIVOS CORRIENTES
    const efectivoCentavos = saldoPrefijo(filasMayorAcumulado, "1101", "debe");
    const inversionesCortoCentavos = saldoPrefijo(filasMayorAcumulado, "1102", "debe");
    const cuentasCobrarCentavos = saldoPrefijo(filasMayorAcumulado, "1104", "debe");

    const cuentasActivoCorriente = [];

    if (efectivoCentavos !== 0) {
        cuentasActivoCorriente.push({
            codigo: "1101",
            concepto: "Efectivo y equivalentes de efectivo",
            monto: dolares(efectivoCentavos),
            nota: "Caja general y cuentas bancarias"
        });
    }

    cuentasActivoCorriente.push({
        codigo: "1103",
        concepto: "Inventario de mercaderías (Final)",
        monto: dolares(inventarioFinalCentavos),
        nota: "Saldo final valorizado del inventario"
    });

    if (inversionesCortoCentavos !== 0) {
        cuentasActivoCorriente.push({
            codigo: "1102",
            concepto: "Inversiones a corto plazo",
            monto: dolares(inversionesCortoCentavos)
        });
    }

    if (cuentasCobrarCentavos !== 0) {
        cuentasActivoCorriente.push({
            codigo: "1104",
            concepto: "Cuentas y documentos por cobrar",
            monto: dolares(cuentasCobrarCentavos)
        });
    }

    if (remanenteIvaFavorCentavos > 0) {
        cuentasActivoCorriente.push({
            codigo: "1105-L",
            concepto: "IVA Remanente a favor",
            monto: dolares(remanenteIvaFavorCentavos),
            nota: `Crédito fiscal ($${dolares(ivaCreditoFiscalCentavos)}) > Débito fiscal ($${dolares(ivaDebitoFiscalCentavos)})`
        });
    }

    const totalActivoCorrienteCentavos = cuentasActivoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);

    // 4. ACTIVOS NO CORRIENTES
    const propiedadPlantaCentavos = saldoPrefijo(filasMayorAcumulado, "1201", "debe");
    const intangiblesCentavos = saldoPrefijo(filasMayorAcumulado, "1202", "debe");
    const inversionesLargoCentavos = saldoPrefijo(filasMayorAcumulado, "1203", "debe");

    const cuentasActivoNoCorriente = [];

    if (propiedadPlantaCentavos !== 0) {
        cuentasActivoNoCorriente.push({
            codigo: "1201",
            concepto: "Propiedad, planta y equipo (Bienes de uso)",
            monto: dolares(propiedadPlantaCentavos)
        });
    }

    if (intangiblesCentavos !== 0) {
        cuentasActivoNoCorriente.push({
            codigo: "1202",
            concepto: "Activos intangibles",
            monto: dolares(intangiblesCentavos)
        });
    }

    if (inversionesLargoCentavos !== 0) {
        cuentasActivoNoCorriente.push({
            codigo: "1203",
            concepto: "Inversiones a largo plazo",
            monto: dolares(inversionesLargoCentavos)
        });
    }

    const totalActivoNoCorrienteCentavos = cuentasActivoNoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);
    const totalActivosCentavos = totalActivoCorrienteCentavos + totalActivoNoCorrienteCentavos;

    // 5. PASIVOS CORRIENTES
    const proveedoresCentavos = saldoPrefijo(filasMayorAcumulado, "2101", "haber");
    const prestamosCortoCentavos = saldoPrefijo(filasMayorAcumulado, "2102", "haber");
    const cuentasPagarCortoCentavos = saldoPrefijo(filasMayorAcumulado, "2103", "haber");
    const retencionesCentavos = saldoPrefijo(filasMayorAcumulado, "2104", "haber");
    const beneficiosEmpleadosCentavos = saldoPrefijo(filasMayorAcumulado, "2105", "haber");

    const cuentasPasivoCorriente = [];

    if (proveedoresCentavos !== 0) {
        cuentasPasivoCorriente.push({
            codigo: "2101",
            concepto: "Cuentas y documentos por pagar comerciales",
            monto: dolares(proveedoresCentavos)
        });
    }

    if (prestamosCortoCentavos !== 0) {
        cuentasPasivoCorriente.push({
            codigo: "2102",
            concepto: "Préstamos bancarios a corto plazo",
            monto: dolares(prestamosCortoCentavos)
        });
    }

    if (cuentasPagarCortoCentavos !== 0) {
        cuentasPasivoCorriente.push({
            codigo: "2103",
            concepto: "Otras cuentas por pagar a corto plazo",
            monto: dolares(cuentasPagarCortoCentavos)
        });
    }

    if (retencionesCentavos !== 0) {
        cuentasPasivoCorriente.push({
            codigo: "2104",
            concepto: "Retenciones y aportaciones por pagar",
            monto: dolares(retencionesCentavos)
        });
    }

    if (beneficiosEmpleadosCentavos !== 0) {
        cuentasPasivoCorriente.push({
            codigo: "2105",
            concepto: "Beneficios a empleados por pagar",
            monto: dolares(beneficiosEmpleadosCentavos)
        });
    }

    if (impuestoIvaPagarCentavos > 0) {
        cuentasPasivoCorriente.push({
            codigo: "2107-L",
            concepto: "IVA por pagar (Liquidación F-07)",
            monto: dolares(impuestoIvaPagarCentavos),
            nota: `Débito fiscal ($${dolares(ivaDebitoFiscalCentavos)}) > Crédito fiscal ($${dolares(ivaCreditoFiscalCentavos)})`
        });
    }

    const totalPasivoCorrienteCentavos = cuentasPasivoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);

    // 6. PASIVOS NO CORRIENTES
    const prestamosLargoCentavos = saldoPrefijo(filasMayorAcumulado, "2201", "haber");
    const hipotecasCentavos = saldoPrefijo(filasMayorAcumulado, "2202", "haber");

    const cuentasPasivoNoCorriente = [];

    if (prestamosLargoCentavos !== 0) {
        cuentasPasivoNoCorriente.push({
            codigo: "2201",
            concepto: "Préstamos bancarios a largo plazo",
            monto: dolares(prestamosLargoCentavos)
        });
    }

    if (hipotecasCentavos !== 0) {
        cuentasPasivoNoCorriente.push({
            codigo: "2202",
            concepto: "Hipotecas y obligaciones a largo plazo",
            monto: dolares(hipotecasCentavos)
        });
    }

    const totalPasivoNoCorrienteCentavos = cuentasPasivoNoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);
    const totalPasivosCentavos = totalPasivoCorrienteCentavos + totalPasivoNoCorrienteCentavos;

    // 7. PATRIMONIO NETO / CAPITAL
    const capitalSocialCentavos = saldoPrefijo(filasMayorAcumulado, "3101", "haber");
    const reservaLegalCentavos = saldoPrefijo(filasMayorAcumulado, "3102", "haber");
    const utilidadesRetenidasCentavos = saldoPrefijo(filasMayorAcumulado, "3103", "haber");

    const cuentasCapital = [];

    cuentasCapital.push({
        codigo: "3101",
        concepto: "Capital Social Suscrito y Pagado",
        monto: dolares(capitalSocialCentavos)
    });

    if (reservaLegalCentavos !== 0) {
        cuentasCapital.push({
            codigo: "3102",
            concepto: "Reserva Legal",
            monto: dolares(reservaLegalCentavos)
        });
    }

    if (utilidadesRetenidasCentavos !== 0) {
        cuentasCapital.push({
            codigo: "3103",
            concepto: "Resultados de ejercicios anteriores (Acumulados)",
            monto: dolares(utilidadesRetenidasCentavos)
        });
    }

    cuentasCapital.push({
        codigo: "3104-E",
        concepto: utilidadEjercicioCentavos >= 0 ? "Utilidad neta del ejercicio actual" : "Pérdida neta del ejercicio actual",
        monto: dolares(utilidadEjercicioCentavos),
        nota: "Proveniente del Estado de Resultados"
    });

    const totalCapitalCentavos = capitalSocialCentavos + reservaLegalCentavos + utilidadesRetenidasCentavos + utilidadEjercicioCentavos;
    const totalPasivoMasCapitalCentavos = totalPasivosCentavos + totalCapitalCentavos;

    // 8. VALIDACIÓN DE LA ECUACIÓN CONTABLE
    const diferenciaCentavos = totalActivosCentavos - totalPasivoMasCapitalCentavos;
    const cuadra = Math.abs(diferenciaCentavos) === 0;

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
                cuentas: cuentasPasivoNoCorriente,
                total: dolares(totalPasivoNoCorrienteCentavos)
            },
            total: dolares(totalPasivosCentavos)
        },
        capital: {
            cuentas: cuentasCapital,
            total: dolares(totalCapitalCentavos)
        },
        totalPasivoCapital: dolares(totalPasivoMasCapitalCentavos),
        validacion: {
            cuadra,
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
