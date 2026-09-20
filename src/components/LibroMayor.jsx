import { useCallback, useEffect, useState } from "react";
import { solicitarApi } from "../services/api";

function hoy(){
    return new Date().toISOString().slice(0, 10);
}

function moneda(valor){
    return Number(valor || 0).toLocaleString("es-SV", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function LibroMayor(){
    const [desde, setDesde] = useState(`${new Date().getFullYear()}-01-01`);
    const [hasta, setHasta] = useState(hoy());
    const [cuentas, setCuentas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");

    const cargarMayor = useCallback(async () => {
        setCargando(true);
        setError("");

        try{
            setCuentas(await solicitarApi(`/libro-mayor?desde=${desde}&hasta=${hasta}`));
        }catch(errorCarga){
            setError(errorCarga.message || "No se pudo cargar el Libro Mayor.");
        }finally{
            setCargando(false);
        }
    }, [desde, hasta]);

    useEffect(() => {
        // La carga inicial sincroniza el reporte con la API al montar la vista.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        cargarMayor();
    }, [cargarMayor]);

    return(
        <section className="view-section">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Mayorización automática</p>
                    <h1>Libro Mayor</h1>
                </div>
            </div>

            <div className="report-filters">
                <label>Desde
                    <input type="date" value={desde} onChange={evento => setDesde(evento.target.value)} />
                </label>
                <label>Hasta
                    <input type="date" value={hasta} onChange={evento => setHasta(evento.target.value)} />
                </label>
                <button type="button" className="button-primary" onClick={cargarMayor}>Actualizar</button>
            </div>

            {cargando && <p>Cargando Libro Mayor...</p>}
            {error && <p className="message-error">{error}</p>}
            {!cargando && !error && (
                <div className="table-shell">
                    <table>
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Cuenta</th>
                                <th>Debe</th>
                                <th>Haber</th>
                                <th>Saldo deudor</th>
                                <th>Saldo acreedor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cuentas.length === 0 ? (
                                <tr><td colSpan="6" className="empty-state">No hay movimientos contabilizados en el período.</td></tr>
                            ) : cuentas.map(cuenta => (
                                <tr key={cuenta.cuenta_id}>
                                    <td className="account-code">{cuenta.codigo}</td>
                                    <td>{cuenta.nombre}</td>
                                    <td>$ {moneda(cuenta.total_debe)}</td>
                                    <td>$ {moneda(cuenta.total_haber)}</td>
                                    <td>$ {moneda(cuenta.saldo_deudor)}</td>
                                    <td>$ {moneda(cuenta.saldo_acreedor)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

export default LibroMayor;
