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
                                <span className="t-ref">Partida {m.numero_partida} · {formatearFecha(m.fecha)}</span>
                                <span>{dinero(m.debe)}</span>
                            </div>
                        ))}
                        <div className="t-total">{dinero(totalDebe)}</div>
                    </div>

                    <div className="t-side">
                        <div className="t-head">Haber</div>
                        {cuenta.movimientos.filter(m => m.haber > 0).map((m, indice) => (
                            <div className="t-row" key={`h-${indice}`}>
                                <span className="t-ref">Partida {m.numero_partida} · {formatearFecha(m.fecha)}</span>
                                <span>{dinero(m.haber)}</span>
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