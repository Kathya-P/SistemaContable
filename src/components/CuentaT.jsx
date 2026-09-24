function dinero(valor) {
    return `$ ${Number(valor || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatearFecha(fechaIso) {
    if (!fechaIso) return "";
    const [anio, mes, dia] = fechaIso.split("-");
    return `${dia}/${mes}/${anio}`;
}

export function CuentaT({ cuenta, onCerrar }) {
    if (!cuenta) {
        return null;
    }

    const totalDebe = cuenta.movimientos.reduce((suma, m) => suma + m.debe, 0);
    const totalHaber = cuenta.movimientos.reduce((suma, m) => suma + m.haber, 0);
    const saldo = Math.round((totalDebe - totalHaber) * 100) / 100;

    function origenMovimiento(m) {
        // Si el movimiento vino de una subcuenta distinta a la que se está
        // mostrando (ej. "1101 Efectivo y equivalentes" agrupando "Bancos"),
        // se etiqueta para no perder de dónde salió cada línea.
        if (m.cuenta_codigo && String(m.cuenta_codigo) !== String(cuenta.codigo)) {
            return `${m.cuenta_codigo} - ${m.cuenta_nombre}`;
        }
        return null;
    }

    return (
        <div className="t-account-panel">
            <div className="t-account-panel-heading">
                <h2>{cuenta.codigo} - {cuenta.nombre}</h2>
                <button type="button" className="button-secondary" onClick={onCerrar}>Cerrar</button>
            </div>

            <div className="t-account">
                <div className="t-body">
                    <div className="t-side t-side-debe">
                        <div className="t-head">Debe</div>
                        {cuenta.movimientos.filter(m => m.debe > 0).map((m, indice) => (
                            <div className="t-row" key={`d-${indice}`}>
                                <span className="t-ref-block">
                                    <span className="t-ref">Partida {m.numero_partida} · {formatearFecha(m.fecha)}</span>
                                    {origenMovimiento(m) && (
                                        <span className="t-subcuenta">{origenMovimiento(m)}</span>
                                    )}
                                </span>
                                <span className="t-monto">{dinero(m.debe)}</span>
                            </div>
                        ))}
                        <div className="t-total">{dinero(totalDebe)}</div>
                    </div>

                    <div className="t-side t-side-haber">
                        <div className="t-head">Haber</div>
                        {cuenta.movimientos.filter(m => m.haber > 0).map((m, indice) => (
                            <div className="t-row" key={`h-${indice}`}>
                                <span className="t-ref-block">
                                    <span className="t-ref">Partida {m.numero_partida} · {formatearFecha(m.fecha)}</span>
                                    {origenMovimiento(m) && (
                                        <span className="t-subcuenta">{origenMovimiento(m)}</span>
                                    )}
                                </span>
                                <span className="t-monto">{dinero(m.haber)}</span>
                            </div>
                        ))}
                        <div className="t-total">{dinero(totalHaber)}</div>
                    </div>
                </div>

                <footer className="t-saldo">
                    {saldo === 0
                        ? "Saldo: $ 0.00"
                        : `Saldo ${saldo > 0 ? "deudor" : "acreedor"}: ${dinero(Math.abs(saldo))}`}
                </footer>
            </div>
        </div>
    );
}

export default CuentaT;