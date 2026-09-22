import { calcularEstadoResultados } from "./Estadoresultados.js";

function centavos(monto) {
    if (monto === null || monto === undefined || isNaN(monto)) return 0;
    return Math.round(Number(monto) * 100);
}

function dolares(centavosVal) {
    return Number((centavosVal / 100).toFixed(2));
}

const NOMBRES_DEFAULT = {
    "1101": "Efectivo y equivalentes de efectivo",
    "1102": "Cuentas y documentos por cobrar",
    "1103": "Inventarios de mercaderías",
    "1104": "Pagos anticipados",
    "1105": "IVA Crédito Fiscal",
    "1201": "Propiedad, planta y equipo",
    "1202": "Depreciación acumulada",
    "2101": "Cuentas y documentos por pagar",
    "2102": "IVA Débito Fiscal",
    "2103": "Retenciones por pagar",
    "2104": "Beneficios a empleados por pagar",
    "2107": "Impuestos por pagar",
    "2201": "Préstamos bancarios a largo plazo",
    "3101": "Capital social",
    "3102": "Reserva legal",
    "3103": "Utilidades acumuladas",
    "3104": "Resultado del ejercicio"
};

export function calcularBalanceGeneral(arg1 = {}, arg2 = null, arg3 = null, arg4 = null, arg5 = null) {
    let filasMayorAcumulado = [];
    let catalogoCuentas = [];
    let inventarioFinalKardex = null;
    let utilidadEstadoResultados = null;
    let mayorPeriodo = [];
    let inventarioInicial = 0;

    if (Array.isArray(arg1)) {
        // Invocación posicional:
        // calcularBalanceGeneral(mayorAcumulado, mayorPeriodoOCatalogo, inventarioInicial, inventarioFinal, utilidadEstadoResultados)
        filasMayorAcumulado = arg1;
        if (Array.isArray(arg2)) {
            if (arg2.length > 0 && (arg2[0].cuenta_padre_id !== undefined || arg2[0].nivel !== undefined || arg2[0].permite_movimientos !== undefined)) {
                catalogoCuentas = arg2;
            } else {
                mayorPeriodo = arg2;
            }
        }
        inventarioInicial = (arg3 !== null && arg3 !== undefined) ? Number(arg3) : 0;
        inventarioFinalKardex = (arg4 !== null && arg4 !== undefined) ? Number(arg4) : null;
        utilidadEstadoResultados = (arg5 !== null && arg5 !== undefined) ? Number(arg5) : null;
    } else if (arg1 && typeof arg1 === "object") {
        filasMayorAcumulado = arg1.filasMayorAcumulado || arg1.mayorAcumulado || [];
        catalogoCuentas = arg1.catalogoCuentas || arg1.catalogo || [];
        inventarioFinalKardex = arg1.inventarioFinalKardex ?? arg1.inventarioFinal ?? null;
        utilidadEstadoResultados = arg1.utilidadEstadoResultados ?? arg1.utilidadEjercicio ?? null;
        mayorPeriodo = arg1.mayorPeriodo || [];
        inventarioInicial = arg1.inventarioInicial ?? 0;
    }

    // Mapa rápido de catálogo para nombres oficiales y niveles
    const mapaCatalogo = new Map();
    for (const c of catalogoCuentas) {
        if (c && c.codigo) {
            mapaCatalogo.set(String(c.codigo).trim(), c.nombre);
        }
    }

    // 1. LIQUIDACIÓN DE IVA
    let ivaCreditoFiscalCent = 0;
    let ivaDebitoFiscalCent = 0;

    for (const f of filasMayorAcumulado) {
        const cod = String(f.codigo || "").trim();
        const nom = (f.nombre || mapaCatalogo.get(cod) || "").toLowerCase();
        const debe = centavos(f.total_debe || 0);
        const haber = centavos(f.total_haber || 0);

        if (cod.startsWith("1105") || nom.includes("crédito fiscal") || nom.includes("credito fiscal")) {
            ivaCreditoFiscalCent += (debe - haber);
        } else if (cod.startsWith("2107") || nom.includes("débito fiscal") || nom.includes("debito fiscal") || cod === "210201" || cod === "2102") {
            ivaDebitoFiscalCent += (haber - debe);
        }
    }

    const diferenciaIvaCent = ivaDebitoFiscalCent - ivaCreditoFiscalCent;
    const impuestoIvaPagarCent = diferenciaIvaCent > 0 ? diferenciaIvaCent : 0;
    const remanenteIvaFavorCent = diferenciaIvaCent < 0 ? Math.abs(diferenciaIvaCent) : 0;

    // 2. INVENTARIO FINAL DEL KARDEX
    let saldo1103MayorCent = 0;
    for (const f of filasMayorAcumulado) {
        if (String(f.codigo || "").trim().startsWith("1103")) {
            saldo1103MayorCent += (centavos(f.total_debe || 0) - centavos(f.total_haber || 0));
        }
    }

    const invFinalCent = (inventarioFinalKardex !== null && inventarioFinalKardex !== undefined && Number(inventarioFinalKardex) > 0)
        ? centavos(inventarioFinalKardex)
        : saldo1103MayorCent;

    // 3. UTILIDAD DEL ESTADO DE RESULTADOS
    let utilidadEjercicioCent = 0;
    if (utilidadEstadoResultados !== null && utilidadEstadoResultados !== undefined && !isNaN(Number(utilidadEstadoResultados))) {
        utilidadEjercicioCent = centavos(utilidadEstadoResultados);
    } else if (mayorPeriodo && mayorPeriodo.length > 0) {
        try {
            const er = calcularEstadoResultados(mayorPeriodo, inventarioInicial, dolares(invFinalCent));
            if (er && er.utilidadAntesImpuestos !== undefined) {
                utilidadEjercicioCent = centavos(er.utilidadAntesImpuestos);
            }
        } catch (e) {
            console.warn("No se pudo calcular utilidad desde mayorPeriodo:", e);
        }
    }
    
    if (utilidadEjercicioCent === 0 && (!mayorPeriodo || mayorPeriodo.length === 0)) {
        let ingresosCent = 0;
        let gastosCent = 0;
        for (const f of filasMayorAcumulado) {
            const cod = String(f.codigo || "").trim();
            const debe = centavos(f.total_debe || 0);
            const haber = centavos(f.total_haber || 0);
            if (cod.startsWith("5")) ingresosCent += (haber - debe);
            if (cod.startsWith("4")) gastosCent += (debe - haber);
        }
        utilidadEjercicioCent = ingresosCent - gastosCent;
    }

    // 4. CLASIFICACIÓN DINÁMICA POR NIVELES (Nivel 2 Cuentas Mayor, Nivel 3 Subcuentas)
    const saldosMayor = new Map();
    const nombresMayor = new Map();
    const subcuentasPorMayor = new Map();

    for (const f of filasMayorAcumulado) {
        const cod = String(f.codigo || "").trim();
        if (!cod || (!cod.startsWith("1") && !cod.startsWith("2") && !cod.startsWith("3"))) {
            continue;
        }

        const debe = centavos(f.total_debe || 0);
        const haber = centavos(f.total_haber || 0);
        const saldo = cod.startsWith("1") ? (debe - haber) : (haber - debe);

        const codigoMayor = cod.length >= 4 ? cod.substring(0, 4) : cod;

        // Sumar al saldo de la cuenta mayor
        saldosMayor.set(codigoMayor, (saldosMayor.get(codigoMayor) || 0) + saldo);

        if (!nombresMayor.has(codigoMayor)) {
            const nombreOficial = mapaCatalogo.get(codigoMayor) || NOMBRES_DEFAULT[codigoMayor] || (cod.length === 4 ? f.nombre : `Cuenta ${codigoMayor}`);
            nombresMayor.set(codigoMayor, nombreOficial);
        }

        // Subcuentas analíticas (Nivel 3)
        if (cod.length > 4) {
            if (!subcuentasPorMayor.has(codigoMayor)) {
                subcuentasPorMayor.set(codigoMayor, []);
            }
            if (saldo !== 0) {
                subcuentasPorMayor.get(codigoMayor).push({
                    codigo: cod,
                    concepto: mapaCatalogo.get(cod) || f.nombre || `Subcuenta ${cod}`,
                    monto: dolares(saldo)
                });
            }
        }
    }

    // Asegurar nombres para cuentas típicas
    for (const [cod, defNom] of Object.entries(NOMBRES_DEFAULT)) {
        if (!nombresMayor.has(cod)) {
            nombresMayor.set(cod, mapaCatalogo.get(cod) || defNom);
        }
    }

    // ACTIVOS CORRIENTES (Prefijo 11)
    const cuentasActivoCorriente = [];
    for (const [codigo, saldoCent] of saldosMayor.entries()) {
        if (!codigo.startsWith("11")) continue;

        // La 1103 (Inventario) se muestra con el valor final del Kardex
        if (codigo === "1103") {
            cuentasActivoCorriente.push({
                codigo: "1103",
                concepto: nombresMayor.get("1103") || "Inventarios de mercaderías",
                monto: dolares(invFinalCent),
                nota: "Saldo final valorizado del Kardex",
                subcuentas: [
                    {
                        codigo: "110301",
                        concepto: "Inventario final de mercaderías",
                        monto: dolares(invFinalCent),
                        nota: "Saldo final valorizado del Kardex"
                    }
                ]
            });
            continue;
        }

        // El IVA Crédito Fiscal (1105) se sustituye por la liquidación de IVA neta
        if (codigo === "1105") continue;

        if (saldoCent !== 0) {
            const subcs = subcuentasPorMayor.get(codigo) || [];
            if (subcs.length === 0) {
                subcs.push({
                    codigo: `${codigo}01`,
                    concepto: nombresMayor.get(codigo) || `Cuenta ${codigo}`,
                    monto: dolares(saldoCent)
                });
            }
            subcs.sort((a, b) => a.codigo.localeCompare(b.codigo));

            cuentasActivoCorriente.push({
                codigo,
                concepto: nombresMayor.get(codigo) || `Cuenta ${codigo}`,
                monto: dolares(saldoCent),
                subcuentas: subcs
            });
        }
    }

    // Agregar Remanente de IVA a favor si existe
    if (remanenteIvaFavorCent > 0) {
        cuentasActivoCorriente.push({
            codigo: "1105-L",
            concepto: "IVA Remanente a favor",
            monto: dolares(remanenteIvaFavorCent),
            nota: `Crédito fiscal ($${dolares(ivaCreditoFiscalCent)}) > Débito fiscal ($${dolares(ivaDebitoFiscalCent)})`,
            subcuentas: [
                {
                    codigo: "110501",
                    concepto: "IVA Crédito Fiscal (Compras)",
                    monto: dolares(ivaCreditoFiscalCent)
                },
                {
                    codigo: "110502",
                    concepto: "(-) IVA Débito Fiscal compensado",
                    monto: dolares(-ivaDebitoFiscalCent)
                },
                {
                    codigo: "1105-L",
                    concepto: "Remanente neto de IVA a favor (F-07)",
                    monto: dolares(remanenteIvaFavorCent),
                    nota: "Liquidación F-07 a favor"
                }
            ]
        });
    }

    cuentasActivoCorriente.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totalActivoCorrienteCent = cuentasActivoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);

    // ACTIVOS NO CORRIENTES (Prefijo 12)
    const cuentasActivoNoCorriente = [];
    for (const [codigo, saldoCent] of saldosMayor.entries()) {
        if (codigo.startsWith("12") && saldoCent !== 0) {
            const subcs = subcuentasPorMayor.get(codigo) || [];
            if (subcs.length === 0) {
                subcs.push({
                    codigo: `${codigo}01`,
                    concepto: nombresMayor.get(codigo) || `Cuenta ${codigo}`,
                    monto: dolares(saldoCent)
                });
            }
            subcs.sort((a, b) => a.codigo.localeCompare(b.codigo));

            cuentasActivoNoCorriente.push({
                codigo,
                concepto: nombresMayor.get(codigo) || `Cuenta ${codigo}`,
                monto: dolares(saldoCent),
                subcuentas: subcs
            });
        }
    }
    cuentasActivoNoCorriente.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totalActivoNoCorrienteCent = cuentasActivoNoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);
    const totalActivosCent = totalActivoCorrienteCent + totalActivoNoCorrienteCent;

    // PASIVOS CORRIENTES (Prefijo 21)
    const cuentasPasivoCorriente = [];
    for (const [codigo, saldoCent] of saldosMayor.entries()) {
        if (!codigo.startsWith("21")) continue;
        if (codigo === "2107" || codigo === "2102") {
            const nom = (nombresMayor.get(codigo) || "").toLowerCase();
            if (nom.includes("debito") || nom.includes("débito")) continue;
        }

        if (saldoCent !== 0) {
            const subcs = subcuentasPorMayor.get(codigo) || [];
            if (subcs.length === 0) {
                subcs.push({
                    codigo: `${codigo}01`,
                    concepto: nombresMayor.get(codigo) || `Cuenta ${codigo}`,
                    monto: dolares(saldoCent)
                });
            }
            subcs.sort((a, b) => a.codigo.localeCompare(b.codigo));

            cuentasPasivoCorriente.push({
                codigo,
                concepto: nombresMayor.get(codigo) || `Cuenta ${codigo}`,
                monto: dolares(saldoCent),
                subcuentas: subcs
            });
        }
    }

    // Agregar IVA por pagar si resultó débito a pagar
    if (impuestoIvaPagarCent > 0) {
        cuentasPasivoCorriente.push({
            codigo: "2107-L",
            concepto: "IVA por pagar (Liquidación F-07)",
            monto: dolares(impuestoIvaPagarCent),
            nota: `Débito fiscal ($${dolares(ivaDebitoFiscalCent)}) > Crédito fiscal ($${dolares(ivaCreditoFiscalCent)})`,
            subcuentas: [
                {
                    codigo: "210701",
                    concepto: "IVA Débito Fiscal (Ventas)",
                    monto: dolares(ivaDebitoFiscalCent)
                },
                {
                    codigo: "210702",
                    concepto: "(-) IVA Crédito Fiscal compensado",
                    monto: dolares(-ivaCreditoFiscalCent)
                },
                {
                    codigo: "2107-L",
                    concepto: "Impuesto neto IVA por pagar (F-07)",
                    monto: dolares(impuestoIvaPagarCent)
                }
            ]
        });
    }

    cuentasPasivoCorriente.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totalPasivoCorrienteCent = cuentasPasivoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);

    // PASIVOS NO CORRIENTES (Prefijo 22)
    const cuentasPasivoNoCorriente = [];
    for (const [codigo, saldoCent] of saldosMayor.entries()) {
        if (codigo.startsWith("22") && saldoCent !== 0) {
            const subcs = subcuentasPorMayor.get(codigo) || [];
            if (subcs.length === 0) {
                subcs.push({
                    codigo: `${codigo}01`,
                    concepto: nombresMayor.get(codigo) || `Cuenta ${codigo}`,
                    monto: dolares(saldoCent)
                });
            }
            subcs.sort((a, b) => a.codigo.localeCompare(b.codigo));

            cuentasPasivoNoCorriente.push({
                codigo,
                concepto: nombresMayor.get(codigo) || `Cuenta ${codigo}`,
                monto: dolares(saldoCent),
                subcuentas: subcs
            });
        }
    }
    cuentasPasivoNoCorriente.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totalPasivoNoCorrienteCent = cuentasPasivoNoCorriente.reduce((acc, c) => acc + centavos(c.monto), 0);
    const totalPasivosCent = totalPasivoCorrienteCent + totalPasivoNoCorrienteCent;

    // PATRIMONIO NETO / CAPITAL (Prefijo 3)
    const cuentasCapital = [];
    for (const [codigo, saldoCent] of saldosMayor.entries()) {
        if (codigo.startsWith("31") && saldoCent !== 0) {
            const subcs = subcuentasPorMayor.get(codigo) || [];
            if (subcs.length === 0) {
                subcs.push({
                    codigo: `${codigo}01`,
                    concepto: nombresMayor.get(codigo) || `Cuenta ${codigo}`,
                    monto: dolares(saldoCent)
                });
            }
            subcs.sort((a, b) => a.codigo.localeCompare(b.codigo));

            cuentasCapital.push({
                codigo,
                concepto: nombresMayor.get(codigo) || `Cuenta ${codigo}`,
                monto: dolares(saldoCent),
                subcuentas: subcs
            });
        }
    }

    // Utilidad o Pérdida del ejercicio proveniente del Estado de Resultados
    cuentasCapital.push({
        codigo: "3104-E",
        concepto: utilidadEjercicioCent >= 0 ? "Utilidad del ejercicio" : "Pérdida del ejercicio",
        monto: dolares(utilidadEjercicioCent),
        nota: "Resultado neto del Estado de Resultados",
        subcuentas: [
            {
                codigo: "310401",
                concepto: utilidadEjercicioCent >= 0 ? "Utilidad neta según Estado de Resultados" : "Pérdida neta según Estado de Resultados",
                monto: dolares(utilidadEjercicioCent),
                nota: "Resultado acumulado del ejercicio"
            }
        ]
    });

    cuentasCapital.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totalCapitalCent = cuentasCapital.reduce((acc, c) => acc + centavos(c.monto), 0);
    const totalPasivoMasCapitalCent = totalPasivosCent + totalCapitalCent;
    const diferenciaCent = totalActivosCent - totalPasivoMasCapitalCent;

    // ESTRUCTURA POR NIVELES
    const niveles = {
        nivel0: {
            activo: { concepto: "TOTAL DEL ACTIVO", total: dolares(totalActivosCent) },
            pasivo: { concepto: "TOTAL DE PASIVOS", total: dolares(totalPasivosCent) },
            patrimonio: { concepto: "TOTAL PATRIMONIO NETO", total: dolares(totalCapitalCent) },
            totalPasivoPatrimonio: dolares(totalPasivoMasCapitalCent),
            cuadra: Math.abs(diferenciaCent) === 0,
            diferencia: dolares(diferenciaCent)
        },
        nivel1: {
            activo: {
                corriente: { concepto: "Activo Corriente", total: dolares(totalActivoCorrienteCent) },
                noCorriente: { concepto: "Activo No Corriente", total: dolares(totalActivoNoCorrienteCent) },
                total: dolares(totalActivosCent)
            },
            pasivo: {
                corriente: { concepto: "Pasivo Corriente", total: dolares(totalPasivoCorrienteCent) },
                noCorriente: { concepto: "Pasivo No Corriente", total: dolares(totalPasivoNoCorrienteCent) },
                total: dolares(totalPasivosCent)
            },
            patrimonio: {
                concepto: "Patrimonio Neto",
                total: dolares(totalCapitalCent)
            },
            totalPasivoPatrimonio: dolares(totalPasivoMasCapitalCent)
        },
        nivel2: {
            activoCorriente: cuentasActivoCorriente.map(c => ({ codigo: c.codigo, concepto: c.concepto, monto: c.monto, nota: c.nota })),
            activoNoCorriente: cuentasActivoNoCorriente.map(c => ({ codigo: c.codigo, concepto: c.concepto, monto: c.monto, nota: c.nota })),
            pasivoCorriente: cuentasPasivoCorriente.map(c => ({ codigo: c.codigo, concepto: c.concepto, monto: c.monto, nota: c.nota })),
            pasivoNoCorriente: cuentasPasivoNoCorriente.map(c => ({ codigo: c.codigo, concepto: c.concepto, monto: c.monto, nota: c.nota })),
            patrimonio: cuentasCapital.map(c => ({ codigo: c.codigo, concepto: c.concepto, monto: c.monto, nota: c.nota }))
        },
        nivel3: {
            activoCorriente: cuentasActivoCorriente,
            activoNoCorriente: cuentasActivoNoCorriente,
            pasivoCorriente: cuentasPasivoCorriente,
            pasivoNoCorriente: cuentasPasivoNoCorriente,
            patrimonio: cuentasCapital
        }
    };

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
        },
        niveles
    };
}
