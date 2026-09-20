import { useCallback, useEffect, useState } from "react";
import { obtenerDatosKardex } from "../services/kardexService";
import { FiltersPeriodo } from "./FiltersPeriodo";
import { TablaKardex } from "./TablaKardex";
import { formatearMoneda } from "../utils/kardexCalculos";

export function KardexPage({ cambiarVista }) {
    const [fechaInicio, setFechaInicio] = useState("");
    const [fechaFin, setFechaFin] = useState("");
    const [cantidadesPersonalizadas, setCantidadesPersonalizadas] = useState({});

    const [filas, setFilas] = useState([]);
    const [totales, setTotales] = useState({});
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");

    const cargarKardex = useCallback(async () => {
        setCargando(true);
        setError("");
        try {
            const data = await obtenerDatosKardex({
                fechaInicio,
                fechaFin,
                cantidadesPersonalizadas
            });
            setFilas(data.filas || []);
            setTotales(data.totales || {});
        } catch (err) {
            console.error("Error al cargar Kardex:", err);
            setError(err.message || "Error al procesar el Kardex de inventario.");
        } finally {
            setCargando(false);
        }
    }, [fechaInicio, fechaFin, cantidadesPersonalizadas]);

    useEffect(() => {
        cargarKardex();
    }, [cargarKardex]);

    function handleLimpiarFiltros() {
        setFechaInicio("");
        setFechaFin("");
    }

    function handleActualizarCantidad(id, nuevaCantidad) {
        setCantidadesPersonalizadas(prev => ({
            ...prev,
            [id]: nuevaCantidad
        }));
    }

    function exportarCSV() {
        if (!filas.length) return;
        const cabeceras = [
            "Asiento",
            "Fecha",
            "Concepto",
            "Entrada",
            "Salida",
            "Existencias",
            "Costo Unitario",
            "Costo Entrada",
            "Costo Salida",
            "Saldo",
            "Precio Venta Unitario"
        ];

        const lineas = filas.map(f => [
            `"${f.asiento}"`,
            `"${f.fecha}"`,
            `"${(f.concepto || "").replace(/"/g, '""')}"`,
            f.entrada,
            f.salida,
            f.existencias,
            f.costo_unitario.toFixed(4),
            f.costo_entrada.toFixed(2),
            f.costo_salida.toFixed(2),
            f.saldo.toFixed(2),
            f.precio_venta_unitario ? f.precio_venta_unitario.toFixed(2) : ""
        ].join(","));

        const contenido = [cabeceras.join(","), ...lineas].join("\n");
        const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `kardex_inventario_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function imprimirReporte() {
        window.print();
    }

    return (
        <section className="view-section kardex-section">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Control de Inventarios · Valuación Ponderada</p>
                    <h1>Kardex de Inventario</h1>
                </div>

                <div className="heading-actions">
                    {cambiarVista && (
                        <button
                            type="button"
                            className="button-primary"
                            onClick={() => cambiarVista("asiento")}
                        >
                            + Nuevo Asiento
                        </button>
                    )}
                    <button
                        type="button"
                        className="button-secondary"
                        onClick={exportarCSV}
                        disabled={filas.length === 0}
                    >
                        Exportar CSV
                    </button>
                    <button
                        type="button"
                        className="button-secondary print-button"
                        onClick={imprimirReporte}
                        disabled={filas.length === 0}
                    >
                        Imprimir
                    </button>
                </div>
            </div>

            {/* Resumen de Indicadores Clave */}
            <div className="kardex-stats-grid">
                <div className="kardex-stat-card">
                    <span className="stat-label">Existencias Disponibles</span>
                    <span className="stat-value">
                        {Number(totales.existencia_final || 0).toLocaleString("es-SV")}
                    </span>
                    <span className="stat-sub">Unidades físicas en bodega</span>
                </div>

                <div className="kardex-stat-card">
                    <span className="stat-label">Costo Promedio Ponderado</span>
                    <span className="stat-value stat-accent">
                        {formatearMoneda(totales.costo_promedio_final || 0)}
                    </span>
                    <span className="stat-sub">Por unidad de mercadería</span>
                </div>

                <div className="kardex-stat-card">
                    <span className="stat-label">Saldo Valorizado Total</span>
                    <span className="stat-value">
                        {formatearMoneda(totales.saldo_final || 0)}
                    </span>
                    <span className="stat-sub">Valor de inventario (Activo 1103)</span>
                </div>

                <div className="kardex-stat-card stat-costo-venta">
                    <span className="stat-label">Costo de Ventas (Período)</span>
                    <span className="stat-value">
                        {formatearMoneda(totales.total_costo_venta || 0)}
                    </span>
                    <span className="stat-sub">Salidas valuadas al costo promedio</span>
                </div>
            </div>

            {/* Filtros de Período */}
            <FiltersPeriodo
                fechaInicio={fechaInicio}
                setFechaInicio={setFechaInicio}
                fechaFin={fechaFin}
                setFechaFin={setFechaFin}
                onFiltrar={cargarKardex}
                onLimpiar={handleLimpiarFiltros}
                cargando={cargando}
            />

            {error && <p className="message-error">{error}</p>}

            {/* Tabla Detallada con 11 columnas */}
            {cargando ? (
                <div className="kardex-loading">
                    <p>Calculando valuación de inventario Kardex...</p>
                </div>
            ) : (
                <TablaKardex
                    filas={filas}
                    totales={totales}
                    onActualizarCantidad={handleActualizarCantidad}
                />
            )}
        </section>
    );
}

export default KardexPage;
