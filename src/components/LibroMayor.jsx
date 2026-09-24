import { useCallback, useEffect, useMemo, useState } from "react";
import { solicitarApi } from "../services/api";
import { obtenerCuentas } from "../services/cuentasService";
import { exportarLibroMayorPDF } from "../services/exportationService";
import CuentaT from "./CuentaT";
import ExportarPdfButton from "./ExportarPdfButton";

function hoy(){
    return new Date().toISOString().slice(0, 10);
}

function moneda(valor){
    return Number(valor || 0).toLocaleString("es-SV", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function LibroMayor({ filtroDesde, filtroHasta, ocultarFiltros } = {}){
    const [desde, setDesde] = useState(filtroDesde || `${new Date().getFullYear()}-01-01`);
    const [hasta, setHasta] = useState(filtroHasta || hoy());
    const [cuentas, setCuentas] = useState([]);
    const [asientos, setAsientos] = useState([]);
    const [catalogo, setCatalogo] = useState([]);
    const [filaSeleccionada, setFilaSeleccionada] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (filtroDesde) setDesde(filtroDesde);
        if (filtroHasta) setHasta(filtroHasta);
    }, [filtroDesde, filtroHasta]);

    const cargarMayor = useCallback(async () => {
        setCargando(true);
        setError("");
        setFilaSeleccionada(null);

        try{
            const [totales, movimientos, catalogoCompleto] = await Promise.all([
                solicitarApi(`/libro-mayor?desde=${desde}&hasta=${hasta}`),
                solicitarApi(`/kardex?desde=${desde}&hasta=${hasta}`),
                obtenerCuentas()
            ]);
            setCuentas(totales);
            setAsientos(movimientos);
            setCatalogo(catalogoCompleto);
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

    const catalogoPorId = useMemo(() => {
        const mapa = new Map();
        for (const cuenta of catalogo) {
            mapa.set(String(cuenta.id), cuenta);
        }
        return mapa;
    }, [catalogo]);

    // Decide qué cuenta se debe mostrar: si el padre es de nivel "CUENTA"
    // (ej. 1101 Efectivo y equivalentes), se agrupa ahí. Si el padre es
    // GRUPO/SUBGRUPO o no hay padre, la cuenta ya es la que se muestra tal
    // cual (ej. IVA, Ventas, Compras). Si la cuenta no aparece en el
    // catálogo cargado, usamos el código/nombre que ya trae la propia fila
    // en vez de dejarla en blanco.
    const resolverCuentaMostrada = useCallback((cuentaId, codigoPropio = "", nombrePropio = "") => {
        const cuenta = catalogoPorId.get(String(cuentaId));

        if (!cuenta) {
            if (import.meta.env.DEV) {
                console.warn(`[LibroMayor] La cuenta id=${cuentaId} tiene movimientos pero no está en el catálogo cargado (¿inactiva, eliminada o de otra empresa?).`);
            }
            return { id: String(cuentaId), codigo: codigoPropio, nombre: nombrePropio };
        }

        const padre = cuenta.cuenta_padre_id ? catalogoPorId.get(String(cuenta.cuenta_padre_id)) : null;
        const padreEsCuenta = padre && (
            String(padre.nivel || "").toUpperCase() === "CUENTA" ||
            (!padre.nivel && String(padre.codigo || "").length === 4)
        );

        if (padreEsCuenta) {
            return { id: String(padre.id), codigo: padre.codigo, nombre: padre.nombre };
        }

        return { id: String(cuenta.id), codigo: cuenta.codigo, nombre: cuenta.nombre };
    }, [catalogoPorId]);

    // Agrupa los TOTALES de /libro-mayor por cuenta mostrada: esta es la lista que se pinta en la tabla.
    // Agrupa los TOTALES de /libro-mayor por cuenta mostrada: esta es la lista que se pinta en la tabla.
    const filasMostradas = useMemo(() => {
        const mapa = new Map();

        for (const cuenta of cuentas) {
            const mostrada = resolverCuentaMostrada(cuenta.cuenta_id, cuenta.codigo, cuenta.nombre);

            if (!mapa.has(mostrada.id)) {
                mapa.set(mostrada.id, {
                    cuenta_id: mostrada.id,
                    codigo: mostrada.codigo,
                    nombre: mostrada.nombre,
                    total_debe: 0,
                    total_haber: 0
                });
            }

            const fila = mapa.get(mostrada.id);
            fila.total_debe += Number(cuenta.total_debe || 0);
            fila.total_haber += Number(cuenta.total_haber || 0);
        }

        return [...mapa.values()]
            .map(fila => {
                const saldo = Math.round((fila.total_debe - fila.total_haber) * 100) / 100;
                return {
                    ...fila,
                    saldo_deudor: saldo > 0 ? saldo : 0,
                    saldo_acreedor: saldo < 0 ? Math.abs(saldo) : 0
                };
            })
            .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    }, [cuentas, resolverCuentaMostrada]);

    // Sumatoria de comprobación para las 4 columnas numéricas (Debe, Haber, Saldo deudor, Saldo acreedor)
    const totalesComprobacion = useMemo(() => {
        return filasMostradas.reduce(
            (acum, fila) => {
                acum.total_debe += Number(fila.total_debe || 0);
                acum.total_haber += Number(fila.total_haber || 0);
                acum.saldo_deudor += Number(fila.saldo_deudor || 0);
                acum.saldo_acreedor += Number(fila.saldo_acreedor || 0);
                return acum;
            },
            { total_debe: 0, total_haber: 0, saldo_deudor: 0, saldo_acreedor: 0 }
        );
    }, [filasMostradas]);

    // Agrupa cada línea de detalle (de /kardex) por la misma cuenta mostrada, para la Cuenta T.
    const movimientosPorCuenta = useMemo(() => {
        const mapa = new Map();

        for (const asiento of asientos) {
            for (const detalle of asiento.detalle_asientos || []) {
                const cuentaDetalle = detalle.cuentas;
                if (!cuentaDetalle) continue;

                const mostrada = resolverCuentaMostrada(cuentaDetalle.id, cuentaDetalle.codigo, cuentaDetalle.nombre);

                if (!mapa.has(mostrada.id)) {
                    mapa.set(mostrada.id, { ...mostrada, movimientos: [] });
                }

                mapa.get(mostrada.id).movimientos.push({
                    numero_partida: asiento.numero_partida,
                    fecha: asiento.fecha,
                    debe: Number(detalle.debe || 0),
                    haber: Number(detalle.haber || 0),
                    cuenta_codigo: cuentaDetalle.codigo,
                    cuenta_nombre: cuentaDetalle.nombre
                });
            }
        }

        return mapa;
    }, [asientos, resolverCuentaMostrada]);

    function alternarFila(cuentaId) {
        setFilaSeleccionada(actual => (String(actual) === String(cuentaId) ? null : cuentaId));
    }

    const cuentaTSeleccionada = filaSeleccionada ? movimientosPorCuenta.get(String(filaSeleccionada)) : null;

    function manejarExportacionPDF() {
        exportarLibroMayorPDF({
            filas: filasMostradas,
            totalesComprobacion,
            movimientosPorCuenta,
            desde,
            hasta
        });
    }

    return(
        <section className="view-section">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Mayorización automática</p>
                    <h1>Libro Mayor</h1>
                </div>
                <ExportarPdfButton onExport={manejarExportacionPDF} reporte="Libro Mayor" disabled={cargando || !!error || !filasMostradas.length} />
            </div>

            {!ocultarFiltros && (
                <div className="report-filters">
                    <label>Desde
                        <input type="date" value={desde} onChange={evento => setDesde(evento.target.value)} />
                    </label>
                    <label>Hasta
                        <input type="date" value={hasta} onChange={evento => setHasta(evento.target.value)} />
                    </label>
                    <button type="button" className="button-primary" onClick={cargarMayor}>Actualizar</button>
                </div>
            )}

            {cargando && <p>Cargando Libro Mayor...</p>}
            {error && <p className="message-error">{error}</p>}
            {!cargando && !error && (
                <>
                    <p className="form-help">Haz clic en una cuenta para ver su Cuenta T.</p>
                    <div className="mayor-layout">
                        <div className="table-shell mayor-tabla">
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
                                    {filasMostradas.length === 0 ? (
                                        <tr><td colSpan="6" className="empty-state">No hay movimientos contabilizados en el período.</td></tr>
                                    ) : filasMostradas.map(cuenta => (
                                        <tr
                                            key={cuenta.cuenta_id}
                                            className={String(cuenta.cuenta_id) === String(filaSeleccionada) ? "lm-cuenta-row is-selected" : "lm-cuenta-row"}
                                            onClick={() => alternarFila(cuenta.cuenta_id)}
                                        >
                                            <td className="account-code">{cuenta.codigo}</td>
                                            <td>{cuenta.nombre}</td>
                                            <td>$ {moneda(cuenta.total_debe)}</td>
                                            <td>$ {moneda(cuenta.total_haber)}</td>
                                            <td>$ {moneda(cuenta.saldo_deudor)}</td>
                                            <td>$ {moneda(cuenta.saldo_acreedor)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    {filasMostradas.length > 0 && (
                                        <tr
                                            className="mayor-total-row"
                                            style={{
                                                fontWeight: "bold",
                                                borderTop: "2px solid #1B4332",
                                                backgroundColor: "rgba(27, 67, 50, 0.08)"
                                            }}
                                        >
                                            <td colSpan="2" style={{ fontWeight: 800, padding: "12px 14px" }}>
                                                Comprobación:
                                            </td>
                                            <td style={{ fontWeight: 800, padding: "12px 10px" }}>
                                                $ {moneda(totalesComprobacion.total_debe)}
                                            </td>
                                            <td style={{ fontWeight: 800, padding: "12px 10px" }}>
                                                $ {moneda(totalesComprobacion.total_haber)}
                                            </td>
                                            <td style={{ fontWeight: 800, padding: "12px 10px" }}>
                                                $ {moneda(totalesComprobacion.saldo_deudor)}
                                            </td>
                                            <td style={{ fontWeight: 800, padding: "12px 10px" }}>
                                                $ {moneda(totalesComprobacion.saldo_acreedor)}
                                            </td>
                                        </tr>
                                    )}
                                </tfoot>
                            </table>
                        </div>

                        {cuentaTSeleccionada && (
                            <div className="mayor-panel-lateral">
                                <CuentaT cuenta={cuentaTSeleccionada} onCerrar={() => setFilaSeleccionada(null)} />
                            </div>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}

export default LibroMayor;
