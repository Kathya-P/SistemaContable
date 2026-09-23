import { useCallback, useEffect, useState } from "react";
import { obtenerDatosKardex } from "../services/kardexService";
import { FiltersPeriodo } from "./FiltersPeriodo";
import { TablaKardex } from "./TablaKardex";
import { formatearMoneda } from "../utils/kardexCalculos";
import { exportarKardexPDF } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";

const anioActual = new Date().getFullYear();

export function KardexPage({ filtroDesde, filtroHasta, ocultarFiltros } = {}) {
    const [fechaInicio, setFechaInicio] = useState(filtroDesde || `${anioActual}-01-01`);
    const [fechaFin, setFechaFin] = useState(filtroHasta || `${anioActual}-12-31`);

    const [filas, setFilas] = useState([]);
    const [totales, setTotales] = useState({});
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (filtroDesde) setFechaInicio(filtroDesde);
        if (filtroHasta) setFechaFin(filtroHasta);
    }, [filtroDesde, filtroHasta]);

    const cargarKardex = useCallback(async () => {
        setCargando(true);
        setError("");
        try {
            const data = await obtenerDatosKardex({
                fechaInicio,
                fechaFin
            });
            setFilas(data.filas || []);
            setTotales(data.totales || {});
        } catch (err) {
            console.error("Error al cargar Kardex:", err);
            setError(err.message || "Error al procesar el Kardex de inventario.");
        } finally {
            setCargando(false);
        }
    }, [fechaInicio, fechaFin]);

    useEffect(() => {
        // La carga inicial (y cada cambio de filtro) sincroniza el reporte con la API.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        cargarKardex();
    }, [cargarKardex]);

    function handleLimpiarFiltros() {
        setFechaInicio(`${anioActual}-01-01`);
        setFechaFin(`${anioActual}-12-31`);
    }

    function manejarExportacionPDF() {
        exportarKardexPDF({ filas, totales, desde: fechaInicio, hasta: fechaFin });
    }

    return (
        <section className="view-section kardex-section">
            {/* Cabecera */}
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Control de Inventarios · Valuación Ponderada</p>
                    <h1>Kardex de Inventario</h1>
                </div>
                <ExportarPdfButton onExport={manejarExportacionPDF} reporte="Kardex" disabled={cargando || !!error || !filas.length} />
            </div>

            {/* Tarjetas de Indicadores Clave */}
            <div className="kardex-stats-grid">
                <div className="kardex-stat-card border-l-4 border-l-sky-500">
                    <span className="stat-label">Existencias Disponibles</span>
                    <span className="stat-value">
                        {Number(totales.existencia_final || 0).toLocaleString("en-US")}
                    </span>
                    <span className="stat-sub">Unidades físicas en bodega</span>
                </div>

                <div className="kardex-stat-card border-l-4 border-l-emerald-500">
                    <span className="stat-label">Costo Promedio Ponderado</span>
                    <span className="stat-value stat-accent">
                        {formatearMoneda(totales.costo_promedio_final, true) || "$ 0.00"}
                    </span>
                    <span className="stat-sub">Costo unitario por unidad</span>
                </div>

                <div className="kardex-stat-card border-l-4 border-l-indigo-500">
                    <span className="stat-label">Saldo Valorizado Total</span>
                    <span className="stat-value">
                        {formatearMoneda(totales.saldo_final || 0)}
                    </span>
                    <span className="stat-sub">Inventario por mercadería (1103)</span>
                </div>

                <div className="kardex-stat-card stat-costo-venta border-l-4 border-l-rose-500">
                    <span className="stat-label">Costo de Ventas Acumulado</span>
                    <span className="stat-value">
                        {formatearMoneda(totales.total_costo_venta || 0)}
                    </span>
                    <span className="stat-sub">Costo de mercadería vendida</span>
                </div>
            </div>

            {/* Barra de Filtros por Período */}
            {!ocultarFiltros && (
                <div>
                    <FiltersPeriodo
                        fechaInicio={fechaInicio}
                        setFechaInicio={setFechaInicio}
                        fechaFin={fechaFin}
                        setFechaFin={setFechaFin}
                        onFiltrar={cargarKardex}
                        onLimpiar={handleLimpiarFiltros}
                        cargando={cargando}
                    />
                </div>
            )}

            {/* Alerta de Error si ocurre */}
            {error && <div className="banner-error">{error}</div>}

            {/* Tabla de Movimientos del Kardex */}
            {cargando ? (
                <div className="kardex-loading">
                    <span className="spinner-dots">● ● ●</span> Cargando movimientos contables...
                </div>
            ) : (
                <TablaKardex
                    filas={filas}
                    totales={totales}
                />
            )}
        </section>
    );
}

export default KardexPage;
