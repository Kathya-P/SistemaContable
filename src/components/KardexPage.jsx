import { useCallback, useEffect, useState } from "react";
import { obtenerDatosKardex } from "../services/kardexService";
import { FiltersPeriodo } from "./FiltersPeriodo";
import { TablaKardex } from "./TablaKardex";
import { formatearMoneda, obtenerConfiguracionKardex, guardarConfiguracionKardex } from "../utils/kardexCalculos";
import { exportarKardexPDF, exportarKardexExcel } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";

const anioActual = new Date().getFullYear();

export function KardexPage({ filtroDesde, filtroHasta, ocultarFiltros, empresaNombre = "Empresa", empresaId = null } = {}) {
    const [fechaInicio, setFechaInicio] = useState(filtroDesde || `${anioActual}-01-01`);
    const [fechaFin, setFechaFin] = useState(filtroHasta || `${anioActual}-12-31`);

    // Parámetros editables: costo de compra y precio de venta sin IVA (sin valores quemados)
    const [costoUnitario, setCostoUnitario] = useState(() => {
        const cfg = obtenerConfiguracionKardex(empresaId);
        return cfg.costoUnitario !== null && cfg.costoUnitario !== undefined ? String(cfg.costoUnitario) : "";
    });

    const [precioVentaUnitario, setPrecioVentaUnitario] = useState(() => {
        const cfg = obtenerConfiguracionKardex(empresaId);
        return cfg.precioVentaUnitario !== null && cfg.precioVentaUnitario !== undefined ? String(cfg.precioVentaUnitario) : "";
    });

    const [filas, setFilas] = useState([]);
    const [totales, setTotales] = useState({});
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (filtroDesde) setFechaInicio(filtroDesde);
        if (filtroHasta) setFechaFin(filtroHasta);
    }, [filtroDesde, filtroHasta]);

    const cUnitNum = Number(costoUnitario);
    const pVentaNum = Number(precioVentaUnitario);
    const parametrosValidos = !isNaN(cUnitNum) && cUnitNum > 0 && !isNaN(pVentaNum) && pVentaNum > 0;

    const cargarKardex = useCallback(async () => {
        setCargando(true);
        setError("");

        if (!parametrosValidos) {
            setFilas([]);
            setTotales({
                total_entradas: 0,
                total_salidas: 0,
                total_deudor: 0,
                total_acreedor: 0,
                existencia_final: 0,
                costo_promedio_final: 0,
                saldo_final: 0,
                total_costo_venta: 0
            });
            setCargando(false);
            return;
        }

        try {
            const data = await obtenerDatosKardex({
                fechaInicio,
                fechaFin,
                costoUnitario: cUnitNum,
                precioVentaUnitario: pVentaNum,
                empresaId
            });
            setFilas(data.filas || []);
            setTotales(data.totales || {});
        } catch (err) {
            console.error("Error al cargar Kardex:", err);
            setError(err.message || "Error al procesar el Kardex de inventario.");
        } finally {
            setCargando(false);
        }
    }, [fechaInicio, fechaFin, parametrosValidos, cUnitNum, pVentaNum, empresaId]);

    useEffect(() => {
        cargarKardex();
    }, [cargarKardex]);

    // Manejo de cambios en los campos editables
    function handleCostoChange(e) {
        const val = e.target.value;
        setCostoUnitario(val);
        const num = Number(val);
        if (!isNaN(num) && num > 0) {
            guardarConfiguracionKardex(empresaId, {
                costoUnitario: num,
                precioVentaUnitario: Number(precioVentaUnitario) || null
            });
        }
    }

    function handlePrecioVentaChange(e) {
        const val = e.target.value;
        setPrecioVentaUnitario(val);
        const num = Number(val);
        if (!isNaN(num) && num > 0) {
            guardarConfiguracionKardex(empresaId, {
                costoUnitario: Number(costoUnitario) || null,
                precioVentaUnitario: num
            });
        }
    }

    function handleLimpiarFiltros() {
        setFechaInicio(`${anioActual}-01-01`);
        setFechaFin(`${anioActual}-12-31`);
    }

    function manejarExportacionPDF() {
        exportarKardexPDF({
            filas,
            totales,
            desde: fechaInicio,
            hasta: fechaFin,
            empresa: empresaNombre,
            precioVentaUnitario: pVentaNum
        });
    }

    function manejarExportacionExcel() {
        exportarKardexExcel({
            filas,
            totales,
            desde: fechaInicio,
            hasta: fechaFin,
            empresa: empresaNombre,
            precioVentaUnitario: pVentaNum
        });
    }

    return (
        <section className="view-section kardex-section">
            {/* Cabecera */}
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Control de Inventarios · Valuación Ponderada</p>
                    <h1>Kardex de Inventario</h1>
                </div>
                <ExportarPdfButton
                    onExport={manejarExportacionPDF}
                    onExportExcel={manejarExportacionExcel}
                    reporte="Kardex"
                    disabled={cargando || !!error || !filas.length || !parametrosValidos}
                />
            </div>

            {/* Tarjetas de Indicadores Clave */}
            <div className="kardex-stats-grid">
                <div className="kardex-stat-card border-l-4 border-l-sky-500">
                    <span className="stat-label">Existencias Disponibles</span>
                    <span className="stat-value">
                        {parametrosValidos ? Number(totales.existencia_final || 0).toLocaleString("en-US") : "—"}
                    </span>
                    <span className="stat-sub">Unidades físicas en bodega</span>
                </div>

                <div className="kardex-stat-card border-l-4 border-l-emerald-500">
                    <span className="stat-label">Costo Promedio Ponderado</span>
                    <span className="stat-value stat-accent">
                        {parametrosValidos ? (formatearMoneda(totales.costo_promedio_final, true) || "$ 0.00") : "—"}
                    </span>
                    <span className="stat-sub">Costo unitario por unidad</span>
                </div>

                <div className="kardex-stat-card border-l-4 border-l-indigo-500">
                    <span className="stat-label">Saldo Valorizado Total</span>
                    <span className="stat-value">
                        {parametrosValidos ? formatearMoneda(totales.saldo_final || 0) : "—"}
                    </span>
                    <span className="stat-sub">Inventario por mercadería (1103)</span>
                </div>

                <div className="kardex-stat-card stat-costo-venta border-l-4 border-l-rose-500">
                    <span className="stat-label">Costo de Ventas Acumulado</span>
                    <span className="stat-value">
                        {parametrosValidos ? formatearMoneda(totales.total_costo_venta || 0) : "—"}
                    </span>
                    <span className="stat-sub">Costo de mercadería vendida</span>
                </div>
            </div>

            {/* Panel de Configuración de Parámetros Editables del Kardex */}
            <div className="kardex-config-panel" style={{
                background: "var(--color-bg-card, #ffffff)",
                border: "1px solid var(--color-borde, #e2e8f0)",
                borderRadius: "10px",
                padding: "16px 20px",
                marginBottom: "20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
            }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <label htmlFor="kardex-costo-unitario" style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-texto-muted, #475569)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                Costo unitario (sin IVA)
                            </label>
                            <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                                <span style={{ position: "absolute", left: "10px", color: "#64748b", fontWeight: "600" }}>$</span>
                                <input
                                    id="kardex-costo-unitario"
                                    name="costoUnitario"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={costoUnitario}
                                    onChange={handleCostoChange}
                                    style={{
                                        paddingLeft: "26px",
                                        paddingRight: "12px",
                                        paddingTop: "7px",
                                        paddingBottom: "7px",
                                        borderRadius: "6px",
                                        border: "1px solid #cbd5e1",
                                        fontSize: "14px",
                                        fontWeight: "600",
                                        width: "150px"
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <label htmlFor="kardex-precio-venta" style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-texto-muted, #475569)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                Precio de venta unitario (sin IVA)
                            </label>
                            <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                                <span style={{ position: "absolute", left: "10px", color: "#64748b", fontWeight: "600" }}>$</span>
                                <input
                                    id="kardex-precio-venta"
                                    name="precioVentaUnitario"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={precioVentaUnitario}
                                    onChange={handlePrecioVentaChange}
                                    style={{
                                        paddingLeft: "26px",
                                        paddingRight: "12px",
                                        paddingTop: "7px",
                                        paddingBottom: "7px",
                                        borderRadius: "6px",
                                        border: "1px solid #cbd5e1",
                                        fontSize: "14px",
                                        fontWeight: "600",
                                        width: "150px"
                                    }}
                                />
                            </div>
                        </div>

                        {parametrosValidos && (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#059669", fontSize: "13px", fontWeight: "500", marginTop: "16px" }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>Parámetros aplicados al Kardex, Balance y Ratios</span>
                            </div>
                        )}
                    </div>
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
                    precioVentaUnitario={pVentaNum}
                    parametrosValidos={parametrosValidos}
                />
            )}
        </section>
    );
}

export default KardexPage;
