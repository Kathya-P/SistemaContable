import { useEffect, useState } from "react";
import { obtenerDatosKardex } from "../services/kardexService";
import { obtenerBalanceGeneral } from "../services/balanceGeneralService";

// Formato de moneda contable: $ 1,234.56 o ($ 1,234.56) si es negativo
function formatearMoneda(valor) {
    if (valor === 0 || valor === null || valor === undefined) return "$ -";
    const num = Number(valor);
    const texto = Math.abs(num).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return num < 0 ? `($ ${texto})` : `$ ${texto}`;
}

function formatearFechaCorte(fechaStr) {
    if (!fechaStr) return "31 de diciembre de 2026";
    const partes = String(fechaStr).split("-");
    if (partes.length === 3) {
        const meses = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
        ];
        const anio = partes[0];
        const mes = meses[parseInt(partes[1], 10) - 1] || partes[1];
        const dia = parseInt(partes[2], 10);
        return `${dia} de ${mes} de ${anio}`;
    }
    return fechaStr;
}

export function BalanceGeneral({ empresa, fechaDesde, fechaHasta, fechaCorte }) {
    const [balance, setBalance] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [mostrarIvaModal, setMostrarIvaModal] = useState(false);

    // Fechas de filtro dinámicas
    const anioActual = new Date().getFullYear();
    const fechaFin = fechaCorte || fechaHasta || `${anioActual}-12-31`;
    const fechaInicio = fechaDesde || `${anioActual}-01-01`;

    useEffect(() => {
        let cancelado = false;

        async function cargarDatos() {
            setCargando(true);
            setError(null);
            try {
                // 1. Obtener el inventario final del Kardex (saldo_final real dinámico)
                let inventarioFinalKardex = null;
                try {
                    const kardex = await obtenerDatosKardex({
                        fechaInicio,
                        fechaFin
                    });
                    const saldo = Number(kardex?.totales?.saldo_final ?? 0);
                    if (saldo > 0) {
                        inventarioFinalKardex = saldo;
                    } else {
                        const kardexGeneral = await obtenerDatosKardex({});
                        const saldoGeneral = Number(kardexGeneral?.totales?.saldo_final ?? 0);
                        if (saldoGeneral > 0) {
                            inventarioFinalKardex = saldoGeneral;
                        }
                    }
                } catch (errKardex) {
                    console.warn("No se pudo obtener el saldo final del Kardex:", errKardex);
                }

                // 2. Cargar el Balance General pasando ese inventario final dinámico
                const data = await obtenerBalanceGeneral({
                    desde: fechaInicio,
                    hasta: fechaFin,
                    inventarioFinal: inventarioFinalKardex,
                    inventarioFinalManual: inventarioFinalKardex
                });

                if (!cancelado) {
                    setBalance(data);
                }
            } catch (err) {
                if (!cancelado) {
                    console.error("Error al cargar el Balance General:", err);
                    setError(err.message || "Error al cargar los datos del balance general.");
                }
            } finally {
                if (!cancelado) {
                    setCargando(false);
                }
            }
        }

        cargarDatos();

        return () => {
            cancelado = true;
        };
    }, [fechaInicio, fechaFin]);

    if (cargando) {
        return (
            <div className="bg-section" style={{ padding: "40px 20px", textAlign: "center", color: "#64748b" }}>
                <div style={{ display: "inline-block", padding: "16px 24px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <span>Cargando balance general y verificando cuadre...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-section" style={{ padding: "24px 20px" }}>
                <div style={{ padding: "16px 20px", background: "#fef2f2", color: "#991b1b", borderRadius: "8px", border: "1px solid #fecaca" }}>
                    <p style={{ fontWeight: 700, margin: "0 0 4px 0" }}>Error al cargar balance:</p>
                    <p style={{ margin: 0, fontSize: "14px" }}>{error}</p>
                </div>
            </div>
        );
    }

    if (!balance) return null;

    const { activo, pasivo, capital, liquidacionIva, validacion, totalPasivoCapital } = balance;
    const nombreEmpresa = balance.empresa || empresa || "FERRETERÍA LA POPULAR";

    return (
        <div className="bg-section" style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
            
            {/* Tarjeta de Validación de Cuadre Superior */}
            {validacion && (
                <div
                    className="bg-validation-card"
                    style={{
                        marginBottom: "24px",
                        padding: "16px 20px",
                        borderRadius: "10px",
                        background: validacion.cuadra ? "#f0fdf4" : "#fef2f2",
                        border: `1px solid ${validacion.cuadra ? "#bbf7d0" : "#fecaca"}`,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "50%",
                                    background: validacion.cuadra ? "#16a34a" : "#dc2626",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "14px"
                                }}
                            >
                                {validacion.cuadra ? "✓" : "!"}
                            </span>
                            <div>
                                <span style={{ fontWeight: 700, color: validacion.cuadra ? "#166534" : "#991b1b", fontSize: "15px" }}>
                                    {validacion.cuadra
                                        ? "Ecuación Patrimonial Verificada: Activo = Pasivo + Patrimonio"
                                        : `El Balance General presenta una diferencia de ${formatearMoneda(validacion.diferencia)}`}
                                </span>
                                <div style={{ fontSize: "12.5px", color: validacion.cuadra ? "#15803d" : "#b91c1c", marginTop: "2px" }}>
                                    Activo ({formatearMoneda(activo?.total)}) = Pasivo ({formatearMoneda(pasivo?.total)}) + Patrimonio ({formatearMoneda(capital?.total)})
                                </div>
                            </div>
                        </div>

                        {liquidacionIva && (
                            <button
                                type="button"
                                onClick={() => setMostrarIvaModal(!mostrarIvaModal)}
                                style={{
                                    fontSize: "12.5px",
                                    fontWeight: 600,
                                    padding: "6px 14px",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    border: "1px solid #cbd5e1",
                                    background: "#ffffff",
                                    color: "#1e293b",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                                }}
                            >
                                {mostrarIvaModal ? "Ocultar Liquidación IVA" : `Ver Liquidación IVA (${liquidacionIva.tipo === "A_PAGAR" ? "A Pagar" : "Remanente"})`}
                            </button>
                        )}
                    </div>

                    {/* Panel desplegable de Liquidación de IVA */}
                    {mostrarIvaModal && liquidacionIva && (
                        <div
                            className="bg-iva-liquidation-panel"
                            style={{
                                marginTop: "16px",
                                paddingTop: "14px",
                                borderTop: "1px dashed #cbd5e1",
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                                gap: "16px",
                                fontSize: "13px"
                            }}
                        >
                            <div style={{ background: "#ffffff", padding: "10px 14px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                <span style={{ display: "block", color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                                    IVA Crédito Fiscal (Compras)
                                </span>
                                <strong style={{ fontSize: "16px", color: "#0f172a" }}>{formatearMoneda(liquidacionIva.ivaCreditoFiscal)}</strong>
                            </div>
                            <div style={{ background: "#ffffff", padding: "10px 14px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                <span style={{ display: "block", color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                                    IVA Débito Fiscal (Ventas)
                                </span>
                                <strong style={{ fontSize: "16px", color: "#0f172a" }}>{formatearMoneda(liquidacionIva.ivaDebitoFiscal)}</strong>
                            </div>
                            <div style={{ background: liquidacionIva.impuestoAPagar > 0 ? "#fef2f2" : "#f0fdf4", padding: "10px 14px", borderRadius: "6px", border: `1px solid ${liquidacionIva.impuestoAPagar > 0 ? "#fecaca" : "#bbf7d0"}` }}>
                                <span style={{ display: "block", color: liquidacionIva.impuestoAPagar > 0 ? "#991b1b" : "#166534", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                                    {liquidacionIva.impuestoAPagar > 0 ? "Impuesto a Pagar (Pasivo)" : "Remanente a Favor (Activo)"}
                                </span>
                                <strong style={{ fontSize: "16px", color: liquidacionIva.impuestoAPagar > 0 ? "#b91c1c" : "#15803d" }}>
                                    {formatearMoneda(liquidacionIva.impuestoAPagar > 0 ? liquidacionIva.impuestoAPagar : liquidacionIva.remanenteAFavor)}
                                </strong>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Hoja de Papel Contable Formal */}
            <div className="bg-sheet-paper" style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #cbd5e1", padding: "36px 40px", boxShadow: "0 4px 20px -2px rgba(0,0,0,0.07)" }}>
                
                {/* Encabezado del Balance General */}
                <header className="bg-sheet-header" style={{ textAlign: "center", paddingBottom: "22px", borderBottom: "2px solid #1b4332", marginBottom: "26px" }}>
                    <p className="bg-sheet-company" style={{ fontSize: "19px", fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", color: "#1b4332", margin: "0 0 4px 0" }}>
                        {nombreEmpresa}
                    </p>
                    <h2 className="bg-sheet-title" style={{ fontSize: "23px", fontWeight: 800, margin: "0 0 2px 0", letterSpacing: "0.5px", color: "#0f172a" }}>
                        BALANCE GENERAL
                    </h2>
                    <p className="bg-sheet-subtitle" style={{ fontSize: "14px", color: "#64748b", margin: "0 0 6px 0" }}>
                        (Estado de Situación Financiera)
                    </p>
                    <p className="bg-sheet-date" style={{ fontSize: "14px", fontWeight: 600, color: "#334155", margin: "0 0 4px 0" }}>
                        Al {formatearFechaCorte(fechaFin)}
                    </p>
                    <p className="bg-sheet-currency" style={{ fontSize: "12px", color: "#94a3b8", margin: 0, fontStyle: "italic" }}>
                        Valores expresados en Dólares de los Estados Unidos de América (USD)
                    </p>
                </header>

                {/* Cuadrícula de 2 Columnas Contables: Activos a la izquierda | Pasivo + Patrimonio a la derecha */}
                <div className="bg-sheet-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "36px", alignItems: "start" }}>
                    
                    {/* ================= COLUMNA IZQUIERDA: ACTIVOS ================= */}
                    <section className="bg-sheet-col bg-col-activos" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                        <div className="bg-group-title-row" style={{ background: "#1b4332", color: "#ffffff", padding: "8px 14px", borderRadius: "6px" }}>
                            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>ACTIVO</h3>
                        </div>

                        {/* ACTIVO CORRIENTE */}
                        <div className="bg-subgroup" style={{ display: "flex", flexDirection: "column" }}>
                            <div className="bg-subgroup-title" style={{ borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", marginBottom: "6px" }}>
                                <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, letterSpacing: "0.5px", color: "#475569" }}>ACTIVO CORRIENTE</h4>
                            </div>
                            <table className="bg-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                                <tbody>
                                    {(activo?.corriente?.cuentas || []).map((cuenta) => (
                                        <tr key={cuenta.codigo} className="bg-row-item">
                                            <td className="bg-td-code" style={{ width: "70px", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#64748b", padding: "6px 4px" }}>
                                                {cuenta.codigo}
                                            </td>
                                            <td className="bg-td-name" style={{ padding: "6px 4px" }}>
                                                <span style={{ color: "#1e293b" }}>{cuenta.concepto}</span>
                                                {cuenta.nota && (
                                                    <small className="bg-item-note" style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>
                                                        {cuenta.nota}
                                                    </small>
                                                )}
                                            </td>
                                            <td className="bg-td-amount" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", width: "110px", padding: "6px 4px", fontWeight: 500 }}>
                                                {formatearMoneda(cuenta.monto)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-row-subtotal" style={{ borderTop: "1px solid #cbd5e1" }}>
                                        <td colSpan="2" style={{ padding: "10px 4px", fontWeight: 600, color: "#334155" }}>
                                            Total Activo Corriente
                                        </td>
                                        <td className="bg-td-amount" style={{ textAlign: "right", padding: "10px 4px", fontWeight: 700, color: "#0f172a" }}>
                                            {formatearMoneda(activo?.corriente?.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* ACTIVO NO CORRIENTE */}
                        <div className="bg-subgroup" style={{ display: "flex", flexDirection: "column" }}>
                            <div className="bg-subgroup-title" style={{ borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", marginBottom: "6px" }}>
                                <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, letterSpacing: "0.5px", color: "#475569" }}>ACTIVO NO CORRIENTE</h4>
                            </div>
                            <table className="bg-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                                <tbody>
                                    {(activo?.noCorriente?.cuentas || []).length === 0 ? (
                                        <tr className="bg-row-empty">
                                            <td colSpan="3" style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "12px", padding: "8px 4px" }}>
                                                Sin cuentas en este período
                                            </td>
                                        </tr>
                                    ) : (
                                        (activo?.noCorriente?.cuentas || []).map((cuenta) => (
                                            <tr key={cuenta.codigo} className="bg-row-item">
                                                <td className="bg-td-code" style={{ width: "70px", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#64748b", padding: "6px 4px" }}>
                                                    {cuenta.codigo}
                                                </td>
                                                <td className="bg-td-name" style={{ padding: "6px 4px" }}>
                                                    <span style={{ color: "#1e293b" }}>{cuenta.concepto}</span>
                                                    {cuenta.nota && (
                                                        <small className="bg-item-note" style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>
                                                            {cuenta.nota}
                                                        </small>
                                                    )}
                                                </td>
                                                <td className="bg-td-amount" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", width: "110px", padding: "6px 4px", fontWeight: 500 }}>
                                                    {formatearMoneda(cuenta.monto)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-row-subtotal" style={{ borderTop: "1px solid #cbd5e1" }}>
                                        <td colSpan="2" style={{ padding: "10px 4px", fontWeight: 600, color: "#334155" }}>
                                            Total Activo No Corriente
                                        </td>
                                        <td className="bg-td-amount" style={{ textAlign: "right", padding: "10px 4px", fontWeight: 700, color: "#0f172a" }}>
                                            {formatearMoneda(activo?.noCorriente?.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* TOTAL ACTIVOS */}
                        <div
                            className="bg-grand-total bg-grand-total-activos"
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "12px 10px",
                                borderTop: "2px solid #0f172a",
                                borderBottom: "3px double #0f172a",
                                fontSize: "15px",
                                fontWeight: 800,
                                background: "rgba(27, 67, 50, 0.05)",
                                marginTop: "12px"
                            }}
                        >
                            <span>TOTAL DEL ACTIVO</span>
                            <strong style={{ fontSize: "16px" }}>{formatearMoneda(activo?.total)}</strong>
                        </div>
                    </section>

                    {/* ================= COLUMNA DERECHA: PASIVO Y CAPITAL ================= */}
                    <section className="bg-sheet-col bg-col-pasivo-capital" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                        <div className="bg-group-title-row" style={{ background: "#1b4332", color: "#ffffff", padding: "8px 14px", borderRadius: "6px" }}>
                            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>PASIVO</h3>
                        </div>

                        {/* PASIVO CORRIENTE */}
                        <div className="bg-subgroup" style={{ display: "flex", flexDirection: "column" }}>
                            <div className="bg-subgroup-title" style={{ borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", marginBottom: "6px" }}>
                                <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, letterSpacing: "0.5px", color: "#475569" }}>PASIVO CORRIENTE</h4>
                            </div>
                            <table className="bg-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                                <tbody>
                                    {(pasivo?.corriente?.cuentas || []).map((cuenta) => (
                                        <tr key={cuenta.codigo} className="bg-row-item">
                                            <td className="bg-td-code" style={{ width: "70px", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#64748b", padding: "6px 4px" }}>
                                                {cuenta.codigo}
                                            </td>
                                            <td className="bg-td-name" style={{ padding: "6px 4px" }}>
                                                <span style={{ color: "#1e293b" }}>{cuenta.concepto}</span>
                                                {cuenta.nota && (
                                                    <small className="bg-item-note" style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>
                                                        {cuenta.nota}
                                                    </small>
                                                )}
                                            </td>
                                            <td className="bg-td-amount" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", width: "110px", padding: "6px 4px", fontWeight: 500 }}>
                                                {formatearMoneda(cuenta.monto)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-row-subtotal" style={{ borderTop: "1px solid #cbd5e1" }}>
                                        <td colSpan="2" style={{ padding: "10px 4px", fontWeight: 600, color: "#334155" }}>
                                            Total Pasivo Corriente
                                        </td>
                                        <td className="bg-td-amount" style={{ textAlign: "right", padding: "10px 4px", fontWeight: 700, color: "#0f172a" }}>
                                            {formatearMoneda(pasivo?.corriente?.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* PASIVO NO CORRIENTE */}
                        <div className="bg-subgroup" style={{ display: "flex", flexDirection: "column" }}>
                            <div className="bg-subgroup-title" style={{ borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", marginBottom: "6px" }}>
                                <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, letterSpacing: "0.5px", color: "#475569" }}>PASIVO NO CORRIENTE</h4>
                            </div>
                            <table className="bg-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                                <tbody>
                                    {(pasivo?.noCorriente?.cuentas || []).length === 0 ? (
                                        <tr className="bg-row-empty">
                                            <td colSpan="3" style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "12px", padding: "8px 4px" }}>
                                                Sin deudas a largo plazo registradas
                                            </td>
                                        </tr>
                                    ) : (
                                        (pasivo?.noCorriente?.cuentas || []).map((cuenta) => (
                                            <tr key={cuenta.codigo} className="bg-row-item">
                                                <td className="bg-td-code" style={{ width: "70px", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#64748b", padding: "6px 4px" }}>
                                                    {cuenta.codigo}
                                                </td>
                                                <td className="bg-td-name" style={{ padding: "6px 4px" }}>
                                                    <span style={{ color: "#1e293b" }}>{cuenta.concepto}</span>
                                                    {cuenta.nota && (
                                                        <small className="bg-item-note" style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>
                                                            {cuenta.nota}
                                                        </small>
                                                    )}
                                                </td>
                                                <td className="bg-td-amount" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", width: "110px", padding: "6px 4px", fontWeight: 500 }}>
                                                    {formatearMoneda(cuenta.monto)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-row-subtotal" style={{ borderTop: "1px solid #cbd5e1" }}>
                                        <td colSpan="2" style={{ padding: "10px 4px", fontWeight: 600, color: "#334155" }}>
                                            Total Pasivo No Corriente
                                        </td>
                                        <td className="bg-td-amount" style={{ textAlign: "right", padding: "10px 4px", fontWeight: 700, color: "#0f172a" }}>
                                            {formatearMoneda(pasivo?.noCorriente?.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* TOTAL PASIVOS INTERMEDIO */}
                        <div
                            className="bg-intermediate-total"
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "10px 8px",
                                borderTop: "1px solid #94a3b8",
                                borderBottom: "1px solid #94a3b8",
                                fontSize: "14px",
                                fontWeight: 700
                            }}
                        >
                            <span>TOTAL PASIVOS</span>
                            <strong>{formatearMoneda(pasivo?.total)}</strong>
                        </div>

                        {/* PATRIMONIO NETO / CAPITAL */}
                        <div className="bg-subgroup bg-capital-section" style={{ display: "flex", flexDirection: "column", marginTop: "4px" }}>
                            <div className="bg-group-title-row bg-capital-header" style={{ background: "#234c38", color: "#ffffff", padding: "8px 14px", borderRadius: "6px" }}>
                                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>
                                    PATRIMONIO NETO
                                </h3>
                            </div>
                            <table className="bg-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                                <tbody>
                                    {(capital?.cuentas || []).map((cuenta) => (
                                        <tr key={cuenta.codigo} className="bg-row-item">
                                            <td className="bg-td-code" style={{ width: "70px", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#64748b", padding: "6px 4px" }}>
                                                {cuenta.codigo}
                                            </td>
                                            <td className="bg-td-name" style={{ padding: "6px 4px" }}>
                                                <span style={{ color: "#1e293b" }}>{cuenta.concepto}</span>
                                                {cuenta.nota && (
                                                    <small className="bg-item-note" style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>
                                                        {cuenta.nota}
                                                    </small>
                                                )}
                                            </td>
                                            <td className="bg-td-amount" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", width: "110px", padding: "6px 4px", fontWeight: 500 }}>
                                                {formatearMoneda(cuenta.monto)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-row-subtotal" style={{ borderTop: "1px solid #cbd5e1" }}>
                                        <td colSpan="2" style={{ padding: "10px 4px", fontWeight: 600, color: "#334155" }}>
                                            Total Patrimonio Neto
                                        </td>
                                        <td className="bg-td-amount" style={{ textAlign: "right", padding: "10px 4px", fontWeight: 700, color: "#0f172a" }}>
                                            {formatearMoneda(capital?.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* TOTAL PASIVO + CAPITAL */}
                        <div
                            className="bg-grand-total bg-grand-total-pasivo-capital"
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "12px 10px",
                                borderTop: "2px solid #0f172a",
                                borderBottom: "3px double #0f172a",
                                fontSize: "15px",
                                fontWeight: 800,
                                background: "rgba(27, 67, 50, 0.05)",
                                marginTop: "12px"
                            }}
                        >
                            <span>TOTAL PASIVO Y PATRIMONIO</span>
                            <strong style={{ fontSize: "16px" }}>{formatearMoneda(totalPasivoCapital)}</strong>
                        </div>
                    </section>
                </div>

                {/* Firmas Reglamentarias Contables */}
                <div
                    className="bg-sheet-signatures"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "24px",
                        marginTop: "48px",
                        paddingTop: "24px"
                    }}
                >
                    <div className="bg-sig-box" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div className="bg-sig-line" style={{ width: "80%", borderBottom: "1px solid #94a3b8", marginBottom: "8px" }} />
                        <p className="bg-sig-name" style={{ margin: "0 0 2px 0", fontSize: "13px", fontWeight: 700 }}>Representante Legal</p>
                        <span className="bg-sig-role" style={{ fontSize: "11px", color: "#64748b" }}>Gerencia General</span>
                    </div>
                    <div className="bg-sig-box" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div className="bg-sig-line" style={{ width: "80%", borderBottom: "1px solid #94a3b8", marginBottom: "8px" }} />
                        <p className="bg-sig-name" style={{ margin: "0 0 2px 0", fontSize: "13px", fontWeight: 700 }}>Contador General</p>
                        <span className="bg-sig-role" style={{ fontSize: "11px", color: "#64748b" }}>Reg. Profesional N° 45892</span>
                    </div>
                    <div className="bg-sig-box" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div className="bg-sig-line" style={{ width: "80%", borderBottom: "1px solid #94a3b8", marginBottom: "8px" }} />
                        <p className="bg-sig-name" style={{ margin: "0 0 2px 0", fontSize: "13px", fontWeight: 700 }}>Auditor Externo</p>
                        <span className="bg-sig-role" style={{ fontSize: "11px", color: "#64748b" }}>Dictamen e Informe Fiscal</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default BalanceGeneral;
