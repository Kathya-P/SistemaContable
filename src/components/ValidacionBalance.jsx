function formatearDinero(monto) {
    if (monto === null || monto === undefined || isNaN(monto)) return "$0.00";
    return "$" + Number(monto).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export function ValidacionBalance({ validacion, liquidacionIva }) {
    if (!validacion) return null;

    const { cuadra, diferencia, totalActivos, totalPasivoCapital } = validacion;

    return (
        <div className={`validacion-balance-card ${cuadra ? "es-cuadrado" : "es-descuadrado"}`}>
            <div className="validacion-icono-estado">
                {cuadra ? (
                    <span className="icono-check">✓</span>
                ) : (
                    <span className="icono-alerta">⚠</span>
                )}
            </div>
            <div className="validacion-info">
                <h4 className="validacion-titulo">
                    {cuadra
                        ? "Ecuación Contable Cuadrada con Éxito"
                        : "Diferencia Detectada en la Ecuación Contable"}
                </h4>
                <p className="validacion-descripcion">
                    {cuadra
                        ? `Activo = Pasivo + Capital ($${formatearDinero(totalActivos)} = $${formatearDinero(totalPasivoCapital)}). La ecuación fundamental se cumple con exactitud matemática al centavo.`
                        : `Existe un descuadre de ${formatearDinero(Math.abs(diferencia))}. Verifica que todas las partidas del libro diario estén correctamente asentadas.`}
                </p>
                {liquidacionIva && (
                    <div className="validacion-iva-badge">
                        <span>Tratamiento Tributario IVA: </span>
                        <strong>
                            {liquidacionIva.tipo === "REMANENTE_FAVOR"
                                ? `Remanente a Favor (${formatearDinero(liquidacionIva.remanenteAFavor)}) clasificado en Activo Corriente`
                                : `Impuesto por Pagar (${formatearDinero(liquidacionIva.impuestoAPagar)}) clasificado en Pasivo Corriente`}
                        </strong>
                    </div>
                )}
            </div>
            <div className="validacion-totales-rapidos">
                <div className="total-rapido-item">
                    <span>Activo Total:</span>
                    <strong>{formatearDinero(totalActivos)}</strong>
                </div>
                <div className="total-rapido-item">
                    <span>Pasivo + Capital:</span>
                    <strong>{formatearDinero(totalPasivoCapital)}</strong>
                </div>
                {!cuadra && (
                    <div className="total-rapido-item item-diferencia">
                        <span>Diferencia:</span>
                        <strong>{formatearDinero(diferencia)}</strong>
                    </div>
                )}
            </div>
        </div>
    );
}
