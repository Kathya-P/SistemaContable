// Módulo de cálculo de Ratios Financieros a partir del Libro Mayor, Balance General, Estado de Resultados y Kardex.
import { calcularEstadoResultados } from "./Estadoresultados.js";
import { calcularBalanceGeneral } from "./balanceGeneral.js";

const centavos = valor => Math.round(Number(valor || 0) * 100);
const dolares = valor => valor / 100;

function saldoPrefijo(filasMayor, prefijo, naturaleza = "debe") {
    let debe = 0;
    let haber = 0;
    for (const fila of filasMayor || []) {
        if (String(fila.codigo).startsWith(prefijo)) {
            debe += centavos(fila.total_debe);
            haber += centavos(fila.total_haber);
        }
    }
    return naturaleza === "debe" ? debe - haber : haber - debe;
}

/**
 * Calcula todos los ratios financieros clasificados en las 4 secciones:
 * Liquidez, Rentabilidad, Solvencia y Eficiencia.
 */
export function calcularRatios({
    mayorPeriodo = [],
    mayorAcumuladoFin = [],
    mayorAcumuladoInicio = [],
    inventarioInicial = 0,
    inventarioFinal = 0,
    desde = "",
    hasta = "",
    historicosMensuales = []
}) {
    // 1. Estados Financieros base
    const estadoResultados = calcularEstadoResultados(mayorPeriodo, inventarioInicial, inventarioFinal);
    const balanceFin = calcularBalanceGeneral(mayorAcumuladoFin, mayorPeriodo, inventarioInicial, inventarioFinal);

    // Magnitudes de flujo (Estado de Resultados en [desde, hasta])
    const ventas = Number(estadoResultados.ventasNetas || estadoResultados.ventas || 0);
    const compras = Number(estadoResultados.comprasNetas || estadoResultados.compras || 0);
    const costoVentas = Number(estadoResultados.costoVentas || 0);
    const utilidadBruta = Number(estadoResultados.utilidadBruta || 0);
    const utilidadOperativa = Number(estadoResultados.utilidadOperacional || 0);
    const gastosFinancieros = Number(estadoResultados.gastosFinancieros || 0);
    const utilidadNeta = Number(estadoResultados.utilidadAntesImpuestos || 0);

    // Magnitudes de saldo acumulado a la fecha fin (Balance General a 'hasta')
    const activoCirculante = Number(balanceFin.activo?.corriente?.total || 0);
    const activoTotal = Number(balanceFin.activo?.total || 0);
    const pasivoCirculante = Number(balanceFin.pasivo?.corriente?.total || 0);
    const pasivoTotal = Number(balanceFin.pasivo?.total || 0);
    const patrimonioTotal = Number(balanceFin.capital?.total || 0);

    // Saldos finales de cuentas clave
    const invFinalVal = Number(inventarioFinal || balanceFin.inventario?.inventarioFinal || dolares(saldoPrefijo(mayorAcumuladoFin, "1103", "debe")) || 0);
    // Cuenta 1102: Cuentas por cobrar (110201 Clientes)
    const cxcFinal = dolares(saldoPrefijo(mayorAcumuladoFin, "1102", "debe"));
    // Cuenta 2101: Cuentas por pagar (210101 Proveedores)
    const cxpFinal = dolares(saldoPrefijo(mayorAcumuladoFin, "2101", "haber"));

    // Saldos iniciales acumulados a la fecha inicio (para promedios)
    const invInicialVal = Number(inventarioInicial || dolares(saldoPrefijo(mayorAcumuladoInicio, "1103", "debe")) || 0);
    // Cuenta 1102: Cuentas por cobrar inicial
    const cxcInicial = dolares(saldoPrefijo(mayorAcumuladoInicio, "1102", "debe"));
    // Cuenta 2101: Cuentas por pagar inicial
    const cxpInicial = dolares(saldoPrefijo(mayorAcumuladoInicio, "2101", "haber"));

    // Promedios contables del período: (saldo inicial + saldo final) / 2
    const inventarioPromedio = (invInicialVal > 0 || invFinalVal > 0)
        ? (invInicialVal + invFinalVal) / 2
        : 1;

    // CxC Promedio: (saldo inicial + saldo final) / 2
    const cxcPromedio = (cxcFinal > 0 || cxcInicial > 0)
        ? (cxcInicial + cxcFinal) / 2
        : (cxcFinal || 1);

    // CxP Promedio
    const cxpPromedio = (cxpFinal > 0 || cxpInicial > 0)
        ? (cxpInicial + cxpFinal) / 2
        : (cxpFinal || 1);

    // ==========================================
    // 1. LIQUIDEZ (fuente: Balance General)
    // ==========================================
    const razonCorriente = pasivoCirculante > 0 ? activoCirculante / pasivoCirculante : (activoCirculante > 0 ? 999 : 0);
    const estadoRazonCorriente = razonCorriente >= 1.5 ? "saludable" : (razonCorriente >= 1.0 ? "alerta" : "critico");

    const pruebaAcida = pasivoCirculante > 0 ? (activoCirculante - invFinalVal) / pasivoCirculante : (activoCirculante - invFinalVal > 0 ? 999 : 0);
    const estadoPruebaAcida = pruebaAcida >= 1.0 ? "saludable" : (pruebaAcida >= 0.8 ? "alerta" : "critico");

    const capitalTrabajoNeto = activoCirculante - pasivoCirculante;
    const estadoCapitalTrabajo = capitalTrabajoNeto > 0 ? "saludable" : "critico";

    // ==========================================
    // 2. RENTABILIDAD (fuente: Estado de Resultados + Balance General)
    // ==========================================
    const margenBruto = ventas > 0 ? ((ventas - costoVentas) / ventas) * 100 : 0;
    const estadoMargenBruto = margenBruto >= 25 ? "saludable" : (margenBruto >= 15 ? "alerta" : "critico");

    const margenOperativo = ventas > 0 ? (utilidadOperativa / ventas) * 100 : 0;
    const estadoMargenOperativo = margenOperativo >= 15 ? "saludable" : (margenOperativo >= 5 ? "alerta" : "critico");

    const margenNeto = ventas > 0 ? (utilidadNeta / ventas) * 100 : 0;
    const estadoMargenNeto = margenNeto >= 10 ? "saludable" : (margenNeto >= 3 ? "alerta" : "critico");

    const roa = activoTotal > 0 ? (utilidadNeta / activoTotal) * 100 : 0;
    const estadoRoa = roa >= 5 ? "saludable" : (roa >= 2 ? "alerta" : "critico");

    const roe = patrimonioTotal > 0 ? (utilidadNeta / patrimonioTotal) * 100 : 0;
    const estadoRoe = roe >= 12 ? "saludable" : (roe >= 6 ? "alerta" : "critico");

    // DuPont
    const dupontMargenNeto = ventas > 0 ? (utilidadNeta / ventas) : 0;
    const dupontRotacionActivos = activoTotal > 0 ? (ventas / activoTotal) : 0;
    const dupontMultiplicadorApalancamiento = patrimonioTotal > 0 ? (activoTotal / patrimonioTotal) : 1;
    const roeDuPont = dupontMargenNeto * dupontRotacionActivos * dupontMultiplicadorApalancamiento * 100;

    // ==========================================
    // 3. SOLVENCIA (fuente: Balance General + Estado de Resultados)
    // ==========================================
    const razonDeudaTotal = activoTotal > 0 ? pasivoTotal / activoTotal : 0;
    const estadoDeudaTotal = razonDeudaTotal <= 0.50 ? "saludable" : (razonDeudaTotal <= 0.70 ? "alerta" : "critico");

    const deudaPatrimonio = patrimonioTotal > 0 ? pasivoTotal / patrimonioTotal : 0;
    const estadoDeudaPatrimonio = deudaPatrimonio <= 1.0 ? "saludable" : (deudaPatrimonio <= 1.5 ? "alerta" : "critico");

    const tieneCuentaGastosFinancieros = gastosFinancieros > 0;
    const coberturaIntereses = tieneCuentaGastosFinancieros ? (utilidadOperativa / gastosFinancieros) : null;
    const estadoCoberturaIntereses = coberturaIntereses === null ? "neutro" : (coberturaIntereses >= 3.0 ? "saludable" : (coberturaIntereses >= 1.5 ? "alerta" : "critico"));

    // ==========================================
    // 4. EFICIENCIA (fuente: Kardex + Balance General + Estado de Resultados)
    // ==========================================
    const rotacionInventario = inventarioPromedio > 0 ? costoVentas / inventarioPromedio : 0;
    const estadoRotacionInventario = rotacionInventario >= 4.0 ? "saludable" : (rotacionInventario >= 2.0 ? "alerta" : "critico");

    const diasInventario = rotacionInventario > 0 ? 365 / rotacionInventario : 0;
    const estadoDiasInventario = diasInventario <= 60 && diasInventario > 0 ? "saludable" : (diasInventario <= 120 ? "alerta" : "critico");

    const rotacionCuentasCobrar = cxcPromedio > 0 ? ventas / cxcPromedio : 0;
    const estadoRotacionCxc = rotacionCuentasCobrar >= 6.0 ? "saludable" : (rotacionCuentasCobrar >= 3.0 ? "alerta" : "critico");

    const periodoPromedioCobro = rotacionCuentasCobrar > 0 ? 365 / rotacionCuentasCobrar : 0;
    const estadoPeriodoCobro = periodoPromedioCobro <= 45 && periodoPromedioCobro > 0 ? "saludable" : (periodoPromedioCobro <= 90 ? "alerta" : "critico");

    const rotacionActivosTotales = activoTotal > 0 ? ventas / activoTotal : 0;
    const estadoRotacionActivos = rotacionActivosTotales >= 1.2 ? "saludable" : (rotacionActivosTotales >= 0.7 ? "alerta" : "critico");

    const baseCompras = compras > 0 ? compras : costoVentas;
    const rotacionCuentasPagar = (cxpPromedio > 0 && baseCompras > 0) ? baseCompras / cxpPromedio : 0;
    const diasCuentasPagar = rotacionCuentasPagar > 0 ? 365 / rotacionCuentasPagar : 0;

    const cicloConversionEfectivo = diasInventario + periodoPromedioCobro - diasCuentasPagar;
    const estadoCicloEfectivo = cicloConversionEfectivo <= 45 && cicloConversionEfectivo > 0 ? "saludable" : (cicloConversionEfectivo <= 90 ? "alerta" : "critico");

    return {
        rango: { desde, hasta },
        promediosInfo: {
            inventario: { inicial: invInicialVal, final: invFinalVal, promedio: inventarioPromedio },
            cuentasCobrar: { inicial: cxcInicial, final: cxcFinal, promedio: cxcPromedio },
            cuentasPagar: { inicial: cxpInicial, final: cxpFinal, promedio: cxpPromedio }
        },
        valoresBase: {
            ventas, compras, costoVentas, utilidadBruta, utilidadOperativa,
            gastosFinancieros, utilidadNeta, activoCirculante, activoTotal,
            pasivoCirculante, pasivoTotal, patrimonioTotal, inventarioFinal: invFinalVal
        },
        secciones: {
            liquidez: {
                titulo: "Liquidez",
                descripcion: "Capacidad de la empresa para cumplir sus obligaciones a corto plazo con activos disponibles.",
                ratios: [
                    {
                        id: "razonCorriente",
                        nombre: "Razón Corriente",
                        tipo: "ratio",
                        valor: razonCorriente,
                        formato: `${razonCorriente.toFixed(2)}x`,
                        estado: estadoRazonCorriente,
                        rangoSaludable: "≥ 1.50x",
                        interpretacion: `Por cada $1.00 de deuda a corto plazo, la empresa dispone de $${razonCorriente.toFixed(2)} en activos circulantes para respaldarla.`,
                        formula: "Activo Circulante / Pasivo Circulante",
                        valoresCalculo: `$${activoCirculante.toFixed(2)} / $${pasivoCirculante.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.razonCorriente }))
                    },
                    {
                        id: "pruebaAcida",
                        nombre: "Prueba Ácida",
                        tipo: "ratio",
                        valor: pruebaAcida,
                        formato: `${pruebaAcida.toFixed(2)}x`,
                        estado: estadoPruebaAcida,
                        rangoSaludable: "≥ 1.00x",
                        interpretacion: `Por cada $1.00 de pasivo corriente, se cuenta con $${pruebaAcida.toFixed(2)} de liquidez inmediata sin depender de vender inventario.`,
                        formula: "(Activo Circulante − Inventario) / Pasivo Circulante",
                        valoresCalculo: `($${activoCirculante.toFixed(2)} − $${invFinalVal.toFixed(2)}) / $${pasivoCirculante.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.pruebaAcida }))
                    },
                    {
                        id: "capitalTrabajoNeto",
                        nombre: "Capital de Trabajo Neto",
                        tipo: "monto",
                        valor: capitalTrabajoNeto,
                        formato: `$ ${capitalTrabajoNeto.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        estado: estadoCapitalTrabajo,
                        rangoSaludable: "> $ 0.00",
                        interpretacion: capitalTrabajoNeto >= 0
                            ? `La empresa cuenta con un fondo de maniobra operativo neto de $${capitalTrabajoNeto.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para operar con holgura.`
                            : `Déficit de capital de trabajo por $${Math.abs(capitalTrabajoNeto).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}; las obligaciones inmediatas superan los activos líquidos.`,
                        formula: "Activo Circulante − Pasivo Circulante",
                        valoresCalculo: `$${activoCirculante.toFixed(2)} − $${pasivoCirculante.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.capitalTrabajoNeto }))
                    }
                ]
            },
            rentabilidad: {
                titulo: "Rentabilidad",
                descripcion: "Eficiencia de la empresa para generar utilidades a partir de sus ventas, activos y patrimonio.",
                ratios: [
                    {
                        id: "margenBruto",
                        nombre: "Margen Bruto",
                        tipo: "porcentaje",
                        valor: margenBruto,
                        formato: `${margenBruto.toFixed(2)}%`,
                        estado: estadoMargenBruto,
                        rangoSaludable: "≥ 25.00%",
                        interpretacion: `Por cada $100.00 de ventas, se retienen $${margenBruto.toFixed(2)} como margen bruto tras absorber el costo de adquisición de mercancía.`,
                        formula: "(Ventas − Costo de Ventas) / Ventas × 100",
                        valoresCalculo: `($${ventas.toFixed(2)} − $${costoVentas.toFixed(2)}) / $${ventas.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.margenBruto }))
                    },
                    {
                        id: "margenOperativo",
                        nombre: "Margen Operativo",
                        tipo: "porcentaje",
                        valor: margenOperativo,
                        formato: `${margenOperativo.toFixed(2)}%`,
                        estado: estadoMargenOperativo,
                        rangoSaludable: "≥ 15.00%",
                        interpretacion: `Por cada $100.00 comercializados, quedan $${margenOperativo.toFixed(2)} de utilidad puramente operativa para la compañía.`,
                        formula: "Utilidad Operativa / Ventas × 100",
                        valoresCalculo: `$${utilidadOperativa.toFixed(2)} / $${ventas.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.margenOperativo }))
                    },
                    {
                        id: "margenNeto",
                        nombre: "Margen Neto",
                        tipo: "porcentaje",
                        valor: margenNeto,
                        formato: `${margenNeto.toFixed(2)}%`,
                        estado: estadoMargenNeto,
                        rangoSaludable: "≥ 10.00%",
                        interpretacion: `Por cada $100.00 facturados, la empresa obtiene $${margenNeto.toFixed(2)} de ganancia neta final del período.`,
                        formula: "Utilidad Neta / Ventas × 100",
                        valoresCalculo: `$${utilidadNeta.toFixed(2)} / $${ventas.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.margenNeto }))
                    },
                    {
                        id: "roa",
                        nombre: "ROA (Rentabilidad de Activos)",
                        tipo: "porcentaje",
                        valor: roa,
                        formato: `${roa.toFixed(2)}%`,
                        estado: estadoRoa,
                        rangoSaludable: "≥ 5.00%",
                        interpretacion: `Por cada $100.00 invertidos en la totalidad de activos, la empresa genera $${roa.toFixed(2)} de rendimiento neto.`,
                        formula: "Utilidad Neta / Activo Total × 100",
                        valoresCalculo: `$${utilidadNeta.toFixed(2)} / $${activoTotal.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.roa }))
                    },
                    {
                        id: "roe",
                        nombre: "ROE (Rentabilidad del Patrimonio)",
                        tipo: "porcentaje",
                        valor: roe,
                        formato: `${roe.toFixed(2)}%`,
                        estado: estadoRoe,
                        rangoSaludable: "≥ 12.00%",
                        interpretacion: `El capital propio aportado por los socios y acumulado obtiene un rendimiento anualizado del ${roe.toFixed(2)}%.`,
                        formula: "Utilidad Neta / Patrimonio Total × 100",
                        valoresCalculo: `$${utilidadNeta.toFixed(2)} / $${patrimonioTotal.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.roe }))
                    }
                ],
                dupont: {
                    roe: roeDuPont,
                    margenNeto: dupontMargenNeto,
                    rotacionActivos: dupontRotacionActivos,
                    multiplicadorApalancamiento: dupontMultiplicadorApalancamiento,
                    formula: "Margen Neto × Rotación de Activos × Multiplicador de Apalancamiento",
                    explicacion: `DuPont descompone el ROE (${roeDuPont.toFixed(2)}%) en: Eficiencia operativa (${(dupontMargenNeto * 100).toFixed(1)}%), Eficiencia de uso de activos (${dupontRotacionActivos.toFixed(2)}x) y Apalancamiento financiero (${dupontMultiplicadorApalancamiento.toFixed(2)}x).`,
                    componentes: [
                        {
                            nombre: "1. Margen Neto",
                            formato: `${(dupontMargenNeto * 100).toFixed(2)}%`,
                            detalle: `Utilidad Neta ($${utilidadNeta.toFixed(2)}) / Ventas ($${ventas.toFixed(2)})`
                        },
                        {
                            nombre: "2. Rotación de Activos",
                            formato: `${dupontRotacionActivos.toFixed(2)}x`,
                            detalle: `Ventas ($${ventas.toFixed(2)}) / Activo Total ($${activoTotal.toFixed(2)})`
                        },
                        {
                            nombre: "3. Multiplicador de Apalancamiento",
                            formato: `${dupontMultiplicadorApalancamiento.toFixed(2)}x`,
                            detalle: `Activo Total ($${activoTotal.toFixed(2)}) / Patrimonio ($${patrimonioTotal.toFixed(2)})`
                        }
                    ]
                }
            },
            solvencia: {
                titulo: "Solvencia",
                descripcion: "Estructura de endeudamiento a largo plazo y capacidad de respaldo patrimonial ante pasivos totales.",
                ratios: [
                    {
                        id: "razonDeudaTotal",
                        nombre: "Razón de Deuda Total",
                        tipo: "porcentaje",
                        valor: razonDeudaTotal * 100,
                        formato: `${(razonDeudaTotal * 100).toFixed(2)}%`,
                        estado: estadoDeudaTotal,
                        rangoSaludable: "≤ 50.00%",
                        interpretacion: `El ${(razonDeudaTotal * 100).toFixed(1)}% de los activos totales de la empresa se encuentran financiados por deuda con acreedores.`,
                        formula: "Pasivo Total / Activo Total",
                        valoresCalculo: `$${pasivoTotal.toFixed(2)} / $${activoTotal.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.razonDeudaTotal * 100 }))
                    },
                    {
                        id: "deudaPatrimonio",
                        nombre: "Deuda / Patrimonio (Leverage)",
                        tipo: "ratio",
                        valor: deudaPatrimonio,
                        formato: `${deudaPatrimonio.toFixed(2)}x`,
                        estado: estadoDeudaPatrimonio,
                        rangoSaludable: "≤ 1.00x",
                        interpretacion: `Por cada $1.00 de patrimonio aportado por los socios, la empresa adeuda $${deudaPatrimonio.toFixed(2)} a terceros.`,
                        formula: "Pasivo Total / Patrimonio Total",
                        valoresCalculo: `$${pasivoTotal.toFixed(2)} / $${patrimonioTotal.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.deudaPatrimonio }))
                    },
                    {
                        id: "coberturaIntereses",
                        nombre: "Cobertura de Intereses",
                        tipo: "ratio",
                        valor: coberturaIntereses,
                        formato: coberturaIntereses !== null ? `${coberturaIntereses.toFixed(2)}x` : "N/D",
                        estado: estadoCoberturaIntereses,
                        rangoSaludable: "≥ 3.00x",
                        disponible: tieneCuentaGastosFinancieros,
                        mensajeNoDisponible: "No se registran cargos en la cuenta de Gastos Financieros (4203) en este período.",
                        interpretacion: coberturaIntereses !== null
                            ? `La utilidad operativa cubre ${coberturaIntereses.toFixed(2)} veces los intereses y gastos financieros del período.`
                            : "Sin costos financieros devengados en el período contable seleccionado.",
                        formula: "Utilidad Operativa / Gastos Financieros",
                        valoresCalculo: tieneCuentaGastosFinancieros ? `$${utilidadOperativa.toFixed(2)} / $${gastosFinancieros.toFixed(2)}` : "Sin gastos financieros",
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.coberturaIntereses }))
                    }
                ]
            },
            eficiencia: {
                titulo: "Eficiencia Operativa",
                descripcion: "Velocidad y optimización en la rotación de inventarios, cobranza a clientes y pago a proveedores.",
                ratios: [
                    {
                        id: "rotacionInventario",
                        nombre: "Rotación de Inventario",
                        tipo: "veces",
                        valor: rotacionInventario,
                        formato: `${rotacionInventario.toFixed(2)} veces`,
                        estado: estadoRotacionInventario,
                        rangoSaludable: "≥ 4.00 veces/año",
                        interpretacion: `El inventario se renueva completamente ${rotacionInventario.toFixed(2)} veces durante el período analizado.`,
                        formula: "Costo de Ventas / Inventario Promedio",
                        valoresCalculo: `$${costoVentas.toFixed(2)} / $${inventarioPromedio.toFixed(2)}`,
                        notaPromedio: `Inv. Promedio: ($${invInicialVal.toFixed(2)} inicial + $${invFinalVal.toFixed(2)} final) / 2 = $${inventarioPromedio.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.rotacionInventario }))
                    },
                    {
                        id: "diasInventario",
                        nombre: "Días de Inventario",
                        tipo: "dias",
                        valor: diasInventario,
                        formato: `${Math.round(diasInventario)} días`,
                        estado: estadoDiasInventario,
                        rangoSaludable: "≤ 60 días",
                        interpretacion: `La mercancía permanece en promedio ${Math.round(diasInventario)} días en bodega antes de ser vendida al cliente.`,
                        formula: "365 / Rotación de Inventario",
                        valoresCalculo: `365 / ${rotacionInventario.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.diasInventario }))
                    },
                    {
                        id: "rotacionCuentasCobrar",
                        nombre: "Rotación de Cuentas por Cobrar",
                        tipo: "veces",
                        valor: rotacionCuentasCobrar,
                        formato: `${rotacionCuentasCobrar.toFixed(2)} veces`,
                        estado: estadoRotacionCxc,
                        rangoSaludable: "≥ 6.00 veces/año",
                        interpretacion: `La cartera de créditos a clientes se cobra y renueva ${rotacionCuentasCobrar.toFixed(2)} veces en el período.`,
                        formula: "Ventas Totales / Cuentas por Cobrar Promedio",
                        valoresCalculo: `$${ventas.toFixed(2)} / $${cxcPromedio.toFixed(2)}`,
                        notaPromedio: `CxC Promedio: ($${cxcInicial.toFixed(2)} inicial + $${cxcFinal.toFixed(2)} final) / 2 = $${cxcPromedio.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.rotacionCuentasCobrar }))
                    },
                    {
                        id: "periodoPromedioCobro",
                        nombre: "Período Promedio de Cobro",
                        tipo: "dias",
                        valor: periodoPromedioCobro,
                        formato: `${Math.round(periodoPromedioCobro)} días`,
                        estado: estadoPeriodoCobro,
                        rangoSaludable: "≤ 45 días",
                        interpretacion: `Se tarda en promedio ${Math.round(periodoPromedioCobro)} días en recaudar el efectivo de las ventas realizadas a clientes.`,
                        formula: "365 / Rotación de Cuentas por Cobrar",
                        valoresCalculo: `365 / ${rotacionCuentasCobrar.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.periodoPromedioCobro }))
                    },
                    {
                        id: "rotacionActivosTotales",
                        nombre: "Rotación de Activos Totales",
                        tipo: "veces",
                        valor: rotacionActivosTotales,
                        formato: `${rotacionActivosTotales.toFixed(2)}x`,
                        estado: estadoRotacionActivos,
                        rangoSaludable: "≥ 1.20x",
                        interpretacion: `Por cada $1.00 colocado en activos totales, la compañía produce $${rotacionActivosTotales.toFixed(2)} en ingresos de ventas.`,
                        formula: "Ventas / Activo Total",
                        valoresCalculo: `$${ventas.toFixed(2)} / $${activoTotal.toFixed(2)}`,
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.rotacionActivosTotales }))
                    },
                    {
                        id: "cicloConversionEfectivo",
                        nombre: "Ciclo de Conversión de Efectivo (CCE)",
                        tipo: "dias",
                        valor: cicloConversionEfectivo,
                        formato: `${Math.round(cicloConversionEfectivo)} días`,
                        estado: estadoCicloEfectivo,
                        rangoSaludable: "≤ 45 días",
                        interpretacion: `Transcurren ${Math.round(cicloConversionEfectivo)} días desde el desembolso a proveedores de compra hasta la cobranza en efectivo de las ventas.`,
                        formula: "Días Inventario + Período Cobro − Días Pago",
                        valoresCalculo: `${Math.round(diasInventario)} + ${Math.round(periodoPromedioCobro)} − ${Math.round(diasCuentasPagar)}`,
                        detallesCiclo: {
                            diasInventario: Math.round(diasInventario),
                            periodoCobro: Math.round(periodoPromedioCobro),
                            diasPago: Math.round(diasCuentasPagar)
                        },
                        tendencia: historicosMensuales.map(h => ({ mes: h.mes, valor: h.cicloConversionEfectivo }))
                    }
                ]
            }
        }
    };
}
