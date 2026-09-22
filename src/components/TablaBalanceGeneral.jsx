import { useState } from "react";

function ChevronDown({ size = 14, className = "", style = {} }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
            <path d="m6 9 6 6 6-6"/>
        </svg>
    );
}

function ChevronRight({ size = 14, className = "", style = {} }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
            <path d="m9 18 6-6-6-6"/>
        </svg>
    );
}

function formatearDinero(monto) {
    if (monto === null || monto === undefined || isNaN(monto)) return "$0.00";
    return "$" + Number(monto).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export function TablaBalanceGeneral({ balance, nivel = 2 }) {
    if (!balance) return null;

    const { activo, pasivo, capital, totalPasivoCapital, niveles } = balance;
    const [expandidas, setExpandidas] = useState(new Set());

    const toggle = (cod) => {
        setExpandidas(prev => {
            const n = new Set(prev);
            if (n.has(cod)) n.delete(cod);
            else n.add(cod);
            return n;
        });
    };

    const mostrarSub = (cod) => {
        if (nivel === 3) return true;
        if (nivel === 2 && expandidas.has(cod)) return true;
        return false;
    };

    // Si es Nivel 0
    if (nivel === 0) {
        return (
            <div style={{ maxWidth: "600px", margin: "0 auto", padding: "16px" }}>
                <table className="balance-table" style={{ width: "100%" }}>
                    <tbody>
                        <tr className="balance-row">
                            <td style={{ fontWeight: 700, padding: "12px 8px" }}>TOTAL DEL ACTIVO</td>
                            <td style={{ textAlign: "right", fontWeight: 700, padding: "12px 8px" }}>{formatearDinero(activo?.total)}</td>
                        </tr>
                        <tr className="balance-row">
                            <td style={{ fontWeight: 700, padding: "12px 8px" }}>TOTAL DEL PASIVO</td>
                            <td style={{ textAlign: "right", fontWeight: 700, padding: "12px 8px" }}>{formatearDinero(pasivo?.total)}</td>
                        </tr>
                        <tr className="balance-row">
                            <td style={{ fontWeight: 700, padding: "12px 8px" }}>TOTAL PATRIMONIO NETO</td>
                            <td style={{ textAlign: "right", fontWeight: 700, padding: "12px 8px" }}>{formatearDinero(capital?.total)}</td>
                        </tr>
                        <tr className="balance-total-fila" style={{ borderTop: "2px solid #0f172a" }}>
                            <td style={{ fontWeight: 800, padding: "14px 8px" }}>TOTAL PASIVO Y PATRIMONIO</td>
                            <td style={{ textAlign: "right", fontWeight: 800, padding: "14px 8px" }}>{formatearDinero(totalPasivoCapital)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    // Si es Nivel 1
    if (nivel === 1) {
        return (
            <div className="balance-tables-split">
                <div className="balance-column activo-column">
                    <div className="balance-section-banner banner-activo">
                        <span>ACTIVO</span>
                        <span>{formatearDinero(activo?.total)}</span>
                    </div>
                    <table className="balance-table">
                        <tbody>
                            <tr className="balance-row">
                                <td style={{ padding: "12px 8px", fontWeight: 600 }}>Activo Corriente</td>
                                <td style={{ textAlign: "right", padding: "12px 8px", fontWeight: 700 }}>{formatearDinero(activo?.corriente?.total)}</td>
                            </tr>
                            <tr className="balance-row">
                                <td style={{ padding: "12px 8px", fontWeight: 600 }}>Activo No Corriente</td>
                                <td style={{ textAlign: "right", padding: "12px 8px", fontWeight: 700 }}>{formatearDinero(activo?.noCorriente?.total)}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr className="balance-total-fila total-activo-fila">
                                <td>TOTAL DEL ACTIVO</td>
                                <td style={{ textAlign: "right" }}>{formatearDinero(activo?.total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="balance-column pasivo-capital-column">
                    <div className="balance-section-banner banner-pasivo">
                        <span>PASIVO Y PATRIMONIO</span>
                        <span>{formatearDinero(totalPasivoCapital)}</span>
                    </div>
                    <table className="balance-table">
                        <tbody>
                            <tr className="balance-row">
                                <td style={{ padding: "12px 8px", fontWeight: 600 }}>Pasivo Corriente</td>
                                <td style={{ textAlign: "right", padding: "12px 8px", fontWeight: 700 }}>{formatearDinero(pasivo?.corriente?.total)}</td>
                            </tr>
                            <tr className="balance-row">
                                <td style={{ padding: "12px 8px", fontWeight: 600 }}>Pasivo No Corriente</td>
                                <td style={{ textAlign: "right", padding: "12px 8px", fontWeight: 700 }}>{formatearDinero(pasivo?.noCorriente?.total)}</td>
                            </tr>
                            <tr className="balance-row">
                                <td style={{ padding: "12px 8px", fontWeight: 600 }}>Patrimonio Neto</td>
                                <td style={{ textAlign: "right", padding: "12px 8px", fontWeight: 700 }}>{formatearDinero(capital?.total)}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr className="balance-total-fila total-pasivo-capital-fila">
                                <td>TOTAL PASIVO Y PATRIMONIO</td>
                                <td style={{ textAlign: "right" }}>{formatearDinero(totalPasivoCapital)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    }

    // Niveles 2 y 3: Renderizado con Cuentas de Mayor y Subcuentas
    const renderFilaCuenta = (c, keyPrefix) => {
        const tieneSub = c.subcuentas && c.subcuentas.length > 0;
        const abierta = mostrarSub(c.codigo);

        return (
            <div key={`${keyPrefix}-${c.codigo}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <div 
                    onClick={() => tieneSub && toggle(c.codigo)}
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "7px 6px",
                        cursor: tieneSub ? "pointer" : "default",
                        background: abierta ? "#f8fafc" : "transparent"
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {tieneSub && (
                            <span style={{ color: "#64748b" }}>
                                {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                        )}
                        <span style={{ width: "55px", fontFamily: "monospace", fontSize: "12px", color: "#64748b" }}>
                            {c.codigo}
                        </span>
                        <span style={{ fontWeight: 600, color: "#1e293b", fontSize: "13px" }}>
                            {c.concepto}
                        </span>
                        {c.nota && (
                            <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "4px" }}>
                                ({c.nota})
                            </span>
                        )}
                    </div>
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>
                        {formatearDinero(c.monto)}
                    </span>
                </div>

                {tieneSub && abierta && (
                    <div style={{ paddingLeft: "32px", paddingRight: "8px", background: "#f8fafc", paddingBottom: "6px" }}>
                        {c.subcuentas.map((sub, sIdx) => (
                            <div key={`${c.codigo}-sub-${sIdx}`} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px", color: "#475569" }}>
                                <span>
                                    <span style={{ fontFamily: "monospace", color: "#64748b", marginRight: "8px" }}>{sub.codigo}</span>
                                    {sub.concepto}
                                </span>
                                <span style={{ fontWeight: 500 }}>{formatearDinero(sub.monto)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="balance-tables-split">
            {/* COLUMNA IZQUIERDA: ACTIVOS */}
            <div className="balance-column activo-column">
                <div className="balance-section-banner banner-activo">
                    <span>ACTIVO</span>
                    <span>{formatearDinero(activo?.total)}</span>
                </div>

                {/* Activo Corriente */}
                <div className="balance-subgrupo">
                    <div className="subgrupo-header">
                        <h4>ACTIVO CORRIENTE</h4>
                        <span className="subgrupo-subtotal">{formatearDinero(activo?.corriente?.total)}</span>
                    </div>
                    <div>
                        {(activo?.corriente?.cuentas || []).map(c => renderFilaCuenta(c, "ac"))}
                        {(!activo?.corriente?.cuentas || activo.corriente.cuentas.length === 0) && (
                            <div className="col-vacia" style={{ padding: "8px" }}>Sin movimientos registrados</div>
                        )}
                    </div>
                </div>

                {/* Activo No Corriente */}
                <div className="balance-subgrupo">
                    <div className="subgrupo-header">
                        <h4>ACTIVO NO CORRIENTE</h4>
                        <span className="subgrupo-subtotal">{formatearDinero(activo?.noCorriente?.total)}</span>
                    </div>
                    <div>
                        {(activo?.noCorriente?.cuentas || []).map(c => renderFilaCuenta(c, "anc"))}
                        {(!activo?.noCorriente?.cuentas || activo.noCorriente.cuentas.length === 0) && (
                            <div className="col-vacia" style={{ padding: "8px" }}>Sin cuentas de activo no corriente</div>
                        )}
                    </div>
                </div>

                {/* Total Activo Pie */}
                <div className="balance-total-fila total-activo-fila">
                    <span>TOTAL DEL ACTIVO</span>
                    <span>{formatearDinero(activo?.total)}</span>
                </div>
            </div>

            {/* COLUMNA DERECHA: PASIVO Y PATRIMONIO */}
            <div className="balance-column pasivo-capital-column">
                <div className="balance-section-banner banner-pasivo">
                    <span>PASIVO</span>
                    <span>{formatearDinero(pasivo?.total)}</span>
                </div>

                {/* Pasivo Corriente */}
                <div className="balance-subgrupo">
                    <div className="subgrupo-header">
                        <h4>PASIVO CORRIENTE</h4>
                        <span className="subgrupo-subtotal">{formatearDinero(pasivo?.corriente?.total)}</span>
                    </div>
                    <div>
                        {(pasivo?.corriente?.cuentas || []).map(c => renderFilaCuenta(c, "pc"))}
                        {(!pasivo?.corriente?.cuentas || pasivo.corriente.cuentas.length === 0) && (
                            <div className="col-vacia" style={{ padding: "8px" }}>Sin pasivos corrientes pendientes</div>
                        )}
                    </div>
                </div>

                {/* Pasivo No Corriente */}
                <div className="balance-subgrupo">
                    <div className="subgrupo-header">
                        <h4>PASIVO NO CORRIENTE</h4>
                        <span className="subgrupo-subtotal">{formatearDinero(pasivo?.noCorriente?.total)}</span>
                    </div>
                    <div>
                        {(pasivo?.noCorriente?.cuentas || []).map(c => renderFilaCuenta(c, "pnc"))}
                        {(!pasivo?.noCorriente?.cuentas || pasivo.noCorriente.cuentas.length === 0) && (
                            <div className="col-vacia" style={{ padding: "8px" }}>Sin obligaciones a largo plazo</div>
                        )}
                    </div>
                </div>

                {/* Total Pasivos */}
                <div className="balance-subtotal-fila">
                    <span>TOTAL PASIVOS</span>
                    <span>{formatearDinero(pasivo?.total)}</span>
                </div>

                {/* PATRIMONIO NETO / CAPITAL */}
                <div className="balance-section-banner banner-capital" style={{ marginTop: "18px" }}>
                    <span>PATRIMONIO NETO</span>
                    <span>{formatearDinero(capital?.total)}</span>
                </div>

                <div className="balance-subgrupo">
                    <div className="subgrupo-header">
                        <h4>CAPITAL CONTABLE</h4>
                        <span className="subgrupo-subtotal">{formatearDinero(capital?.total)}</span>
                    </div>
                    <div>
                        {(capital?.cuentas || []).map(c => renderFilaCuenta(c, "cap"))}
                    </div>
                </div>

                {/* Total Pasivo + Capital */}
                <div className="balance-total-fila total-pasivo-capital-fila">
                    <span>TOTAL PASIVO Y PATRIMONIO</span>
                    <span>{formatearDinero(totalPasivoCapital)}</span>
                </div>
            </div>
        </div>
    );
}

export default TablaBalanceGeneral;
