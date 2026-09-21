function centavos(monto) {
    if (monto === null || monto === undefined || isNaN(monto)) return 0;
    return Math.round(Number(monto) * 100);
}

function dolares(centavosVal) {
    return Number((centavosVal / 100).toFixed(2));
}

export function calcularBalanceGeneral({
    filasMayorAcumulado = [],
    catalogoCuentas = [],
    inventarioFinalKardex = null,
    utilidadEstadoResultados = null
}) {
    // Mapa rápido de catálogo para nombres oficiales y niveles
    const mapaCatalogo = new Map();
    for (const c of catalogoCuentas) {
        mapaCatalogo.set(String(c.codigo), c.nombre);
    }

    // 1. LIQUIDACIÓN DE IVA
    let ivaCreditoFiscalCent = 0;
    let ivaDebitoFiscalCent = 0;

    for (const f of filasMayorAcumulado) {
        const cod = String(f.codigo || "");
        const nom = (f.nombre || mapaCatalogo.get(cod) || "").toLowerCase();
        const debe = centavos(f.total_debe || 0);
        const haber = centavos(f.total_haber || 0);

        if (cod.startsWith("1105") || nom.includes("crédito fiscal") || nom.includes("credito fiscal")) {
            ivaCreditoFiscalCent += (debe - haber);
        } else if (cod.startsWith("2107") || nom.includes("débito fiscal") || nom.includes("debito fiscal") || cod === "210201") {
            ivaDebitoFiscalCent += (haber - debe);
        }
    }

    const diferenciaIvaCent = ivaDebitoFiscalCent - ivaCreditoFiscalCent;
    const impuestoIvaPagarCent = diferenciaIvaCent > 0 ? diferenciaIvaCent : 0;
    const remanenteIvaFavorCent = diferenciaIvaCent < 0 ? Math.abs(diferenciaIvaCent) : 0;

    // 2. INVENTARIO FINAL DEL KARDEX
    let saldo1103MayorCent = 0;
    for (const f of filasMayorAcumulado) {
        if (String(f.codigo || "").startsWith("1103")) {
            saldo1103MayorCent += (centavos(f.total_debe || 0) - centavos(f.total_haber || 0));
        }
    }

    // Si viene el inventario final del Kardex se usa ese; si no, el del mayor
    const invFinalCent = (inventarioFinalKardex !== null && inventarioFinalKardex !== undefined && Number(inventarioFinalKardex) > 0)
        ? centavos(inventarioFinalKardex)
        : saldo1103MayorCent;

    // 3. UTILIDAD DEL ESTADO DE RESULTADOS
    // Si viene calculada del Estado de Resultados se respeta idéntica; si no, por diferencia ingresos - gastos
    let utilidadEjercicioCent = 0;
    if (utilidadEstadoResultados !== null && utilidadEstadoResultados !== undefined && !isNaN(Number(utilidadEstadoResultados))) {
        utilidadEjercicioCent = centavos(utilidadEstadoResultados);
    } else {
        let ingresosCent = 0;
        let gastosCent = 0;
        for (const f of filasMayorAcumulado) {
            const cod = String(f.codigo || "");
            const debe = centavos(f.total_debe || 0);
            const haber = centavos(f.total_haber || 0);
            if (cod.startsWith("5")) ingresosCent += (haber - debe);
            if (cod.startsWith("4")) gastosCent += (debe - haber);
        }
        utilidadEjercicioCent = ingresosCent - gastosCent;
    }

    // 4. CLASIFICACIÓN DINÁMICA POR CATÁLOGO
    // Cuentas de Mayor (nivel 2 o 4 dígitos como 1101, 1102, 1104, 1201, 2101, etc.)
    const saldosPorCodigo = new Map();
    const nombresPorCodigo = new Map();

    for (const f of filasMayorAcumulado) {
        const cod = String(f.codigo || "");
        const debe = centavos(f.total_debe || 0);
        const haber = centavos(f.total_haber || 0);
        const saldo = cod.startsWith("1") ? (debe - haber) : (haber - debe);

        // Agrupar a nivel de cuenta principal (4 dígitos)
        const codigoGrupo = cod.length >= 4 ? cod.substring(0, 4) : cod;
        saldosPorCodigo.set(codigoGrupo, (saldosPorCodigo.get(codigoGrupo) || 0) + saldo);

        if (!nombresPorCodigo.has(codigoGrupo)) {
            nombresPorCodigo.set(codigoGrupo, mapaCatalogo.get(codigoGrupo) || f.nombre || "");
        }
    }

    // ACTIVOS CORRIENTES (Prefijo 11)
    const cuentasActivoCorriente = [];
    for (const [codigo, saldoCent] of saldosPorCodigo.entries()) {
        if (!codigo.startsWith("11")) continue;

        // La 1103 (Inventario) se muestra con el valor final del Kardex
        if (codigo === "1103") {
            cuentasActivoCorriente.push({
                codigo: "1103",
                concepto: nombresPorCodigo.get("1103") || "Inventario de mercaderías",
                monto: dolares(invFinalCent),
                nota: "Saldo final valorizado del Kardex"
            });
            continue;
        }

        // El IVA Crédito Fiscal (1105) se sustituye por la liquidación de IVA neta
        if (codigo === "1105") continue;

        if (saldoCent !== 0) {
            cuentasActivoCorriente.push({
                codigo,
                concepto: nombresPorCodigo.get(codigo) || `Cuenta ${codigo}`,
                monto: dolares(saldoCent)
            });
        }
    }

    // Agregar Remanente de IVA a favor si existe
    if (remanenteIvaFavorCent > 0) {
        cuentasActivoCorriente.push({
            codigo: "1105-L",
            concepto: "IVA Remanente a favor",
            monto: dolares(remanenteIvaFavorCent),
            nota: `Crédito fiscal ($${dolares(ivaCreditoFiscalCent)}) > Débito fiscal ($${dolares(ivaDebitoFiscalCent)})`
        });
    }

    // Ordenar por código
    cuentasActivoCorriente.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totalActivoCorrienteCent = cuentasActivoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);

    // ACTIVOS NO CORRIENTES (Prefijo 12)
    const cuentasActivoNoCorriente = [];
    for (const [codigo, saldoCent] of saldosPorCodigo.entries()) {
        if (codigo.startsWith("12") && saldoCent !== 0) {
            cuentasActivoNoCorriente.push({
                codigo,
                concepto: nombresPorCodigo.get(codigo) || `Cuenta ${codigo}`,
                monto: dolares(saldoCent)
            });
        }
    }
    cuentasActivoNoCorriente.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totalActivoNoCorrienteCent = cuentasActivoNoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);
    const totalActivosCent = totalActivoCorrienteCent + totalActivoNoCorrienteCent;

    // PASIVOS CORRIENTES (Prefijo 21)
    const cuentasPasivoCorriente = [];
    for (const [codigo, saldoCent] of saldosPorCodigo.entries()) {
        if (!codigo.startsWith("21")) continue;
        // Omitir IVA Débito Fiscal si fue liquidado
        if (codigo === "2107" || codigo === "2102") {
            const nom = (nombresPorCodigo.get(codigo) || "").toLowerCase();
            if (nom.includes("debito") || nom.includes("débito")) continue;
        }

        if (saldoCent !== 0) {
            cuentasPasivoCorriente.push({
                codigo,
                concepto: nombresPorCodigo.get(codigo) || `Cuenta ${codigo}`,
                monto: dolares(saldoCent)
            });
        }
    }

    // Agregar IVA por pagar si resultó débito a pagar
    if (impuestoIvaPagarCent > 0) {
        cuentasPasivoCorriente.push({
            codigo: "2107-L",
            concepto: "IVA por pagar (Liquidación F-07)",
            monto: dolares(impuestoIvaPagarCent)
        });
    }

    cuentasPasivoCorriente.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totalPasivoCorrienteCent = cuentasPasivoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);

    // PASIVOS NO CORRIENTES (Prefijo 22)
    const cuentasPasivoNoCorriente = [];
    for (const [codigo, saldoCent] of saldosPorCodigo.entries()) {
        if (codigo.startsWith("22") && saldoCent !== 0) {
            cuentasPasivoNoCorriente.push({
                codigo,
                concepto: nombresPorCodigo.get(codigo) || `Cuenta ${codigo}`,
                monto: dolares(saldoCent)
            });
        }
    }
    cuentasPasivoNoCorriente.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totalPasivoNoCorrienteCent = cuentasPasivoNoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);
    const totalPasivosCent = totalPasivoCorrienteCent + totalPasivoNoCorrienteCent;

    // PATRIMONIO NETO / CAPITAL (Prefijo 3)
    const cuentasCapital = [];
    for (const [codigo, saldoCent] of saldosPorCodigo.entries()) {
        if (codigo.startsWith("31") && saldoCent !== 0) {
            cuentasCapital.push({
                codigo,
                concepto: nombresPorCodigo.get(codigo) || `Cuenta ${codigo}`,
                monto: dolares(saldoCent)
            });
        }
    }

    // Utilidad o Pérdida del ejercicio proveniente del Estado de Resultados
    cuentasCapital.push({
        codigo: "3104-E",
        concepto: utilidadEjercicioCent >= 0 ? "Utilidad del ejercicio" : "Pérdida del ejercicio",
        monto: dolares(utilidadEjercicioCent),
        nota: "Resultado neto del Estado de Resultados"
    });

    cuentasCapital.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totalCapitalCent = cuentasCapital.reduce((acc, c) => acc + centavos(c.monto), 0);
    const totalPasivoMasCapitalCent = totalPasivosCent + totalCapitalCent;

    const diferenciaCent = totalActivosCent - totalPasivoMasCapitalCent;

    return {
        activo: {
            corriente: {
                cuentas: cuentasActivoCorriente,
                total: dolares(totalActivoCorrienteCent)
            },
            noCorriente: {
                cuentas: cuentasActivoNoCorriente,
                total: dolares(totalActivoNoCorrienteCent)
            },
            total: dolares(totalActivosCent)
        },
        pasivo: {
            corriente: {
                cuentas: cuentasPasivoCorriente,
                total: dolares(totalPasivoCorrienteCent)
            },
            noCorriente: {
                cuentas: cuentasPasivoNoCorriente,
                total: dolares(totalPasivoNoCorrienteCent)
            },
            total: dolares(totalPasivosCent)
        },
        capital: {
            cuentas: cuentasCapital,
            total: dolares(totalCapitalCent)
        },
        totalPasivoCapital: dolares(totalPasivoMasCapitalCent),
        validacion: {
            cuadra: Math.abs(diferenciaCent) === 0,
            diferencia: dolares(diferenciaCent),
            totalActivos: dolares(totalActivosCent),
            totalPasivoCapital: dolares(totalPasivoMasCapitalCent)
        },
        liquidacionIva: {
            ivaCreditoFiscal: dolares(ivaCreditoFiscalCent),
            ivaDebitoFiscal: dolares(ivaDebitoFiscalCent),
            diferencia: dolares(diferenciaIvaCent),
            impuestoAPagar: dolares(impuestoIvaPagarCent),
            remanenteAFavor: dolares(remanenteIvaFavorCent),
            tipo: diferenciaIvaCent > 0 ? "IMPUESTO_PAGAR" : "REMANENTE_FAVOR"
        }
    };
}
