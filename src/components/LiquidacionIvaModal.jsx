function formatearDinero(monto) {
    if (monto === null || monto === undefined || isNaN(monto)) return "$0.00";
    return "$" + Number(monto).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export function LiquidacionIvaModal({ liquidacion, onClose }) {
    if (!liquidacion) return null;

    const { ivaCreditoFiscal, ivaDebitoFiscal, diferencia, tipo, impuestoAPagar, remanenteAFavor } = liquidacion;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-contenido modal-iva" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Liquidación Mensual de IVA (Art. 64 Ley de IVA)</h3>
                    <button type="button" className="btn-cerrar" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <p className="iva-modal-intro">
                        Comparación de débitos y créditos fiscales al cierre del período para determinar la posición neta ante la Administración Tributaria.
                    </p>

                    <div className="iva-comparativa-grid">
                        <div className="iva-item debito-box">
                            <span className="iva-label">IVA Débito Fiscal (13% en Ventas)</span>
                            <span className="iva-monto">{formatearDinero(ivaDebitoFiscal)}</span>
                            <small>Cuenta 210701 - Obligación generada</small>
                        </div>
                        <div className="iva-item credito-box">
                            <span className="iva-label">IVA Crédito Fiscal (13% en Compras)</span>
                            <span className="iva-monto">{formatearDinero(ivaCreditoFiscal)}</span>
                            <small>Cuenta 110501 - Crédito deducible</small>
                        </div>
                    </div>

                    <div className={`iva-resultado-box ${tipo === "REMANENTE_FAVOR" ? "es-remanente" : "es-pago"}`}>
                        <div className="iva-res-titulo">
                            {tipo === "REMANENTE_FAVOR" ? "REMANENTE DE CRÉDITO FISCAL A FAVOR" : "IMPUESTO SOBRE LAS VENTAS POR PAGAR"}
                        </div>
                        <div className="iva-res-monto">
                            {formatearDinero(tipo === "REMANENTE_FAVOR" ? remanenteAFavor : impuestoAPagar)}
                        </div>
                        <p className="iva-res-explicacion">
                            {tipo === "REMANENTE_FAVOR"
                                ? `El Crédito Fiscal excede al Débito Fiscal por ${formatearDinero(Math.abs(diferencia))}. De acuerdo a la normativa, se presenta como Activo Corriente (derecho exigible para deducir en períodos futuros).`
                                : `El Débito Fiscal excede al Crédito Fiscal por ${formatearDinero(diferencia)}. Deberá enterarse en la declaración F-07 y se clasifica como Pasivo Corriente.`}
                        </p>
                    </div>
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn-accion-primario" onClick={onClose}>
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}
