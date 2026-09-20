import { useEffect, useMemo, useState } from "react";
import { solicitarApi } from "../services/api";

const dinero = (n) =>
    `$ ${n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;

const redondear = (n) => Math.round(n * 100) / 100;

function CuentasT() {
    const anio = new Date().getFullYear();

    const [desde, setDesde] = useState(`${anio}-01-01`);
    const [hasta, setHasta] = useState(`${anio}-12-31`);
    const [movimientos, setMovimientos] = useState([]);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!desde || !hasta) {
            return undefined;
        }

        let activo = true;

        async function cargar() {
            try {
                setCargando(true);
                setError("");

                const datos = await solicitarApi(
                    `/libro-mayor/movimientos?desde=${desde}&hasta=${hasta}`
                );

                if (activo) {
                    setMovimientos(datos || []);
                }
            } catch (errorCarga) {
                if (activo) {
                    setError(
                        errorCarga.message ||
                        "No se pudo cargar el Libro Mayor."
                    );
                }
            } finally {
                if (activo) {
                    setCargando(false);
                }
            }
        }

        cargar();

        return () => {
            activo = false;
        };
    }, [desde, hasta]);

    const cuentasT = useMemo(() => {
        const mapa = new Map();

        for (const movimiento of movimientos) {
            const cuenta = movimiento.mayor;

            if (!mapa.has(cuenta.id)) {
                mapa.set(cuenta.id, {
                    ...cuenta,
                    debitos: [],
                    creditos: [],
                    totalDebe: 0,
                    totalHaber: 0
                });
            }

            const cuentaT = mapa.get(cuenta.id);

            if (movimiento.debe > 0) {
                cuentaT.debitos.push(movimiento);
                cuentaT.totalDebe += movimiento.debe;
            }

            if (movimiento.haber > 0) {
                cuentaT.creditos.push(movimiento);
                cuentaT.totalHaber += movimiento.haber;
            }
        }

        return [...mapa.values()].sort((a, b) =>
            a.codigo.localeCompare(b.codigo)
        );
    }, [movimientos]);

    const sumaDebe = redondear(
        cuentasT.reduce((suma, cuenta) => suma + cuenta.totalDebe, 0)
    );

    const sumaHaber = redondear(
        cuentasT.reduce((suma, cuenta) => suma + cuenta.totalHaber, 0)
    );

    const diferencia = redondear(sumaDebe - sumaHaber);

    return (
        <section className="view-section">

            <div className="section-heading">
                <div>
                    <p className="eyebrow">Mayorización</p>
                    <h1>Cuentas T</h1>
                </div>
            </div>

            <div className="form-grid">
                <label>
                    Desde
                    <input
                        type="date"
                        value={desde}
                        onChange={(evento) =>
                            setDesde(evento.target.value)
                        }
                    />
                </label>

                <label>
                    Hasta
                    <input
                        type="date"
                        value={hasta}
                        onChange={(evento) =>
                            setHasta(evento.target.value)
                        }
                    />
                </label>
            </div>

            {error && (
                <p className="message-error">
                    {error}
                </p>
            )}

            {cargando && (
                <p>Cargando movimientos...</p>
            )}

            {!cargando && !error && cuentasT.length === 0 && (
                <p className="form-help">
                    No hay asientos contabilizados en ese rango de fechas.
                </p>
            )}

            {!cargando && !error && cuentasT.length > 0 && (
                <>
                    <div className="t-grid">
                        {cuentasT.map((cuenta) => {
                            const saldo = redondear(
                                cuenta.totalDebe - cuenta.totalHaber
                            );

                            return (
                                <article
                                    key={cuenta.id}
                                    className="t-account"
                                >
                                    <header className="t-title">
                                        {cuenta.codigo} - {cuenta.nombre}
                                    </header>

                                    <div className="t-body">

                                        <div className="t-side t-side-debe">
                                            <div className="t-head">
                                                DEBE
                                            </div>

                                            {cuenta.debitos.map(
                                                (movimiento, indice) => (
                                                    <div
                                                        key={`d-${indice}`}
                                                        className="t-row"
                                                    >
                                                        <span className="t-ref">
                                                            ({movimiento.partida})
                                                        </span>

                                                        <span>
                                                            {dinero(
                                                                movimiento.debe
                                                            )}
                                                        </span>
                                                    </div>
                                                )
                                            )}

                                            <div className="t-total">
                                                {dinero(cuenta.totalDebe)}
                                            </div>
                                        </div>

                                        <div className="t-side">
                                            <div className="t-head">
                                                HABER
                                            </div>

                                            {cuenta.creditos.map(
                                                (movimiento, indice) => (
                                                    <div
                                                        key={`h-${indice}`}
                                                        className="t-row"
                                                    >
                                                        <span className="t-ref">
                                                            ({movimiento.partida})
                                                        </span>

                                                        <span>
                                                            {dinero(
                                                                movimiento.haber
                                                            )}
                                                        </span>
                                                    </div>
                                                )
                                            )}

                                            <div className="t-total">
                                                {dinero(cuenta.totalHaber)}
                                            </div>
                                        </div>

                                    </div>

                                    <footer className="t-saldo">
                                        {saldo === 0
                                            ? "Saldo: $ 0.00"
                                            : `Saldo ${
                                                saldo > 0
                                                    ? "deudor"
                                                    : "acreedor"
                                            }: ${dinero(Math.abs(saldo))}`}
                                    </footer>
                                </article>
                            );
                        })}
                    </div>

                    <div className="t-summary">
                        <div className="t-summary-title">
                            Sumatoria general
                        </div>

                        <div className="t-summary-grid">
                            <div>
                                <span>Debe</span>
                                <strong>{dinero(sumaDebe)}</strong>
                            </div>

                            <div>
                                <span>Haber</span>
                                <strong>{dinero(sumaHaber)}</strong>
                            </div>

                            <div>
                                <span>Diferencia</span>
                                <strong>
                                    {dinero(Math.abs(diferencia))}
                                </strong>
                            </div>
                        </div>
                    </div>
                </>
            )}

        </section>
    );
}

export default CuentasT;