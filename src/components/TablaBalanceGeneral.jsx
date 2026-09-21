import PropTypes from "prop-types";

function formatearDinero(monto) {
    if (monto === null || monto === undefined || isNaN(monto)) return "$0.00";
    return "$" + Number(monto).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export function TablaBalanceGeneral({ balance }) {
    if (!balance) return null;

    const { activo, pasivo, capital, totalPasivoCapital } = balance;

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
                    <table className="balance-table">
                        <tbody>
                            {(activo?.corriente?.cuentas || []).map((c, i) => (
                                <tr key={`ac-${i}`} className="balance-row">
                                    <td className="col-codigo">{c.codigo}</td>
                                    <td className="col-concepto">
                                        <div>{c.concepto}</div>
                                        {c.nota && <span className="col-nota">{c.nota}</span>}
                                    </td>
                                    <td className="col-monto">{formatearDinero(c.monto)}</td>
                                </tr>
                            ))}
                            {(!activo?.corriente?.cuentas || activo.corriente.cuentas.length === 0) && (
                                <tr>
                                    <td colSpan="3" className="col-vacia">Sin movimientos registrados</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Activo No Corriente */}
                <div className="balance-subgrupo">
                    <div className="subgrupo-header">
                        <h4>ACTIVO NO CORRIENTE</h4>
                        <span className="subgrupo-subtotal">{formatearDinero(activo?.noCorriente?.total)}</span>
                    </div>
                    <table className="balance-table">
                        <tbody>
                            {(activo?.noCorriente?.cuentas || []).map((c, i) => (
                                <tr key={`anc-${i}`} className="balance-row">
                                    <td className="col-codigo">{c.codigo}</td>
                                    <td className="col-concepto">
                                        <div>{c.concepto}</div>
                                        {c.nota && <span className="col-nota">{c.nota}</span>}
                                    </td>
                                    <td className="col-monto">{formatearDinero(c.monto)}</td>
                                </tr>
                            ))}
                            {(!activo?.noCorriente?.cuentas || activo.noCorriente.cuentas.length === 0) && (
                                <tr>
                                    <td colSpan="3" className="col-vacia">Sin cuentas de activo no corriente</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Total Activo Pie */}
                <div className="balance-total-fila total-activo-fila">
                    <span>TOTAL DEL ACTIVO</span>
                    <span>{formatearDinero(activo?.total)}</span>
                </div>
            </div>

            {/* COLUMNA DERECHA: PASIVO Y PATRIMONIO */}
            <div className="balance-column pasivo-capital-column">
                {/* PASIVOS */}
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
                    <table className="balance-table">
                        <tbody>
                            {(pasivo?.corriente?.cuentas || []).map((c, i) => (
                                <tr key={`pc-${i}`} className="balance-row">
                                    <td className="col-codigo">{c.codigo}</td>
                                    <td className="col-concepto">
                                        <div>{c.concepto}</div>
                                        {c.nota && <span className="col-nota">{c.nota}</span>}
                                    </td>
                                    <td className="col-monto">{formatearDinero(c.monto)}</td>
                                </tr>
                            ))}
                            {(!pasivo?.corriente?.cuentas || pasivo.corriente.cuentas.length === 0) && (
                                <tr>
                                    <td colSpan="3" className="col-vacia">Sin pasivos corrientes pendientes</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pasivo No Corriente */}
                <div className="balance-subgrupo">
                    <div className="subgrupo-header">
                        <h4>PASIVO NO CORRIENTE</h4>
                        <span className="subgrupo-subtotal">{formatearDinero(pasivo?.noCorriente?.total)}</span>
                    </div>
                    <table className="balance-table">
                        <tbody>
                            {(pasivo?.noCorriente?.cuentas || []).map((c, i) => (
                                <tr key={`pnc-${i}`} className="balance-row">
                                    <td className="col-codigo">{c.codigo}</td>
                                    <td className="col-concepto">
                                        <div>{c.concepto}</div>
                                        {c.nota && <span className="col-nota">{c.nota}</span>}
                                    </td>
                                    <td className="col-monto">{formatearDinero(c.monto)}</td>
                                </tr>
                            ))}
                            {(!pasivo?.noCorriente?.cuentas || pasivo.noCorriente.cuentas.length === 0) && (
                                <tr>
                                    <td colSpan="3" className="col-vacia">Sin obligaciones a largo plazo</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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
                    <table className="balance-table">
                        <tbody>
                            {(capital?.cuentas || []).map((c, i) => (
                                <tr key={`cap-${i}`} className="balance-row">
                                    <td className="col-codigo">{c.codigo}</td>
                                    <td className="col-concepto">
                                        <div>{c.concepto}</div>
                                        {c.nota && <span className="col-nota">{c.nota}</span>}
                                    </td>
                                    <td className="col-monto">{formatearDinero(c.monto)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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

TablaBalanceGeneral.propTypes = {
    balance: PropTypes.shape({
        activo: PropTypes.object,
        pasivo: PropTypes.object,
        capital: PropTypes.object,
        totalPasivoCapital: PropTypes.number
    })
};
