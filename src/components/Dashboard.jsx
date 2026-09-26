import { useEffect, useMemo, useState } from "react";
import { obtenerCuentas } from "../services/cuentasService";
import { obtenerLibroDiario } from "../services/libroDiarioService";
import { obtenerBalanceGeneral } from "../services/balanceGeneralService";
import { obtenerDatosKardex } from "../services/kardexService";
import { solicitarApi } from "../services/api";
import ExportarPdfButton from "./ExportarPdfButton";
import { exportarDashboardPDF, exportarDashboardExcel } from "../services/exportationService";

function moneda(valor) {
    return Number(valor || 0).toLocaleString("es-SV", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function fechaCorta(valor) {
    if (!valor) return "--";
    const partes = String(valor).slice(0, 10).split("-");
    if (partes.length < 3) return valor;
    const [anio, mes, dia] = partes;
    return `${dia}/${mes}/${anio}`;
}

// Iconos SVG limpios y estéticos
function IconoMas({ size = 16, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}

function IconoDiario({ size = 18, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="8" y1="7" x2="16" y2="7" />
            <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
    );
}

function IconoKardex({ size = 18, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <polyline points="21 8 21 21 3 21 3 8" />
            <rect x="1" y="3" width="22" height="5" />
            <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
    );
}

function IconoGrafica({ size = 18, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
    );
}

function IconoBalanza({ size = 18, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <line x1="12" y1="3" x2="12" y2="21" />
            <polyline points="4 7 12 5 20 7" />
            <path d="M6 16l-2-7h4l-2 7a2 2 0 0 1-4 0z" />
            <path d="M18 16l-2-7h4l-2 7a2 2 0 0 1-4 0z" />
            <path d="M4 21h16" />
        </svg>
    );
}

function IconoRatios({ size = 18, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    );
}

function IconoCatalogo({ size = 18, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
    );
}

function IconoAuditoria({ size = 18, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
        </svg>
    );
}

function IconoCheck({ size = 15, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function IconoFlecha({ size = 14, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
        </svg>
    );
}

function IconoMayor({ size = 18, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="12" y1="6" x2="12" y2="20" />
        </svg>
    );
}

function calcularResumen(asientos, cuentas) {
    const cuentasPorId = new Map(cuentas.map(cuenta => [String(cuenta.id), cuenta]));
    const resultado = { activos: 0, pasivos: 0, ingresos: 0, gastos: 0 };

    asientos.forEach(asiento => {
        (asiento.detalle_asientos || []).forEach(detalle => {
            const cuenta = cuentasPorId.get(String(detalle.cuenta_id)) || detalle.cuentas;
            const codigo = String(cuenta?.codigo || "").trim();
            const debe = Number(detalle.debe || 0);
            const haber = Number(detalle.haber || 0);

            if (!codigo || !Number.isFinite(debe) || !Number.isFinite(haber)) return;

            switch (codigo.charAt(0)) {
                case "1": resultado.activos += debe - haber; break;
                case "2": resultado.pasivos += haber - debe; break;
                case "4": resultado.gastos += debe - haber; break;
                case "5": resultado.ingresos += haber - debe; break;
                default: break;
            }
        });
    });

    return resultado;
}

function Dashboard({ cambiarVista, usuario, empresaNombre = "Empresa" }) {
    const [asientos, setAsientos] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [balance, setBalance] = useState(null);
    const [estadoResultados, setEstadoResultados] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");
    const [barraHover, setBarraHover] = useState(null);

    useEffect(() => {
        async function cargarDatos() {
            try {
                const anioActual = new Date().getFullYear();
                const desde = `${anioActual}-01-01`;
                const hasta = `${anioActual}-12-31`;

                const [asientosCargados, cuentasCargadas, balanceCargado, kardex] =
                    await Promise.all([
                        obtenerLibroDiario(),
                        obtenerCuentas(),
                        obtenerBalanceGeneral({ desde, hasta }),
                        obtenerDatosKardex({ fechaInicio: desde, fechaFin: hasta })
                    ]);

                const inventarioFinal = Number(kardex?.totales?.saldo_final || 0);
                let estadoCargado = null;
                try {
                    estadoCargado = await solicitarApi(
                        `/estado-resultados?desde=${desde}&hasta=${hasta}&inventario_final=${inventarioFinal}`
                    );
                } catch (e) {
                    console.warn("Estado de resultados no disponible:", e);
                }

                setAsientos(asientosCargados || []);
                setCuentas(cuentasCargadas || []);
                setBalance(balanceCargado || null);
                setEstadoResultados(estadoCargado?.estado || null);
            } catch (errorCarga) {
                console.error("Error cargando el dashboard:", errorCarga);
                setError(errorCarga.message || "No se pudo cargar el resumen contable.");
            } finally {
                setCargando(false);
            }
        }

        cargarDatos();
    }, []);

    const resumen = useMemo(() => calcularResumen(asientos, cuentas), [asientos, cuentas]);

    // Métricas clave consolidadas
    const activos = balance?.activo?.total ?? resumen.activos;
    const pasivos = balance?.pasivo?.total ?? resumen.pasivos;
    const patrimonio = balance?.patrimonio?.total ?? Math.max(0, activos - pasivos);
    const ingresos = estadoResultados?.ventasNetas ?? resumen.ingresos;
    const costos = estadoResultados?.costoVentas ?? resumen.gastos;
    const gastosOperacion = estadoResultados?.totalGastosOperacion ?? 0;
    const gastosTotales = costos + gastosOperacion;
    const utilidadBruta = estadoResultados?.utilidadBruta ?? (ingresos - costos);
    const utilidadNeta = estadoResultados?.utilidadAntesImpuestos ?? (ingresos - gastosTotales);
    const margenNeto = ingresos > 0 ? ((utilidadNeta / ingresos) * 100).toFixed(1) : "0.0";

    // Totales globales para validación de partida doble en el ejercicio
    const totalDebeGlobal = useMemo(() => {
        return asientos.reduce((sum, a) => {
            return sum + (a.detalle_asientos || []).reduce((sub, d) => sub + Number(d.debe || 0), 0);
        }, 0);
    }, [asientos]);

    const totalHaberGlobal = useMemo(() => {
        return asientos.reduce((sum, a) => {
            return sum + (a.detalle_asientos || []).reduce((sub, d) => sub + Number(d.haber || 0), 0);
        }, 0);
    }, [asientos]);

    const librosCuadrados = Math.abs(totalDebeGlobal - totalHaberGlobal) < 0.02;
    const movimientos = asientos.slice(-5).reverse();

    // Saludo según hora del día
    const saludoHora = useMemo(() => {
        const hora = new Date().getHours();
        if (hora < 12) return "Buenos días";
        if (hora < 19) return "Buenas tardes";
        return "Buenas noches";
    }, []);

    const nombreUsuario = usuario?.nombre || "Contador";
    const rolUsuario = usuario?.rol || "ADMIN";

    // Cálculos para Gráfica 1: Rendimiento Financiero
    const maxBarra = Math.max(ingresos, costos, gastosOperacion, Math.abs(utilidadNeta), 100);
    const datosBarras = [
        { id: "ingresos", etiqueta: "Ingresos netos", valor: Math.max(0, ingresos), color: "#059669", colorDark: "#10b981", desc: "Ventas brutas menos devoluciones" },
        { id: "costos", etiqueta: "Costo de ventas", valor: Math.max(0, costos), color: "#d97706", colorDark: "#fbbf24", desc: "Costo de adquisición de mercadería" },
        { id: "gastos", etiqueta: "Gastos operación", valor: Math.max(0, gastosOperacion), color: "#2563eb", colorDark: "#60a5fa", desc: "Gastos de administración y ventas" },
        {
            id: "utilidad",
            etiqueta: utilidadNeta >= 0 ? "Utilidad neta" : "Pérdida neta",
            valor: Math.abs(utilidadNeta),
            color: utilidadNeta >= 0 ? "#047857" : "#dc2626",
            colorDark: utilidadNeta >= 0 ? "#34d399" : "#f87171",
            desc: utilidadNeta >= 0 ? `Ganancia neta (Margen: ${margenNeto}%)` : "Resultado negativo del período"
        }
    ];

    // Cálculos para Gráfica 2: Composición Patrimonial (Donut Chart SVG)
    const sumaPatrimonial = Math.max(activos, pasivos + patrimonio, 1);
    const pctPasivo = Math.min(100, Math.max(0, Math.round((pasivos / sumaPatrimonial) * 100)));
    const pctPatrimonio = Math.max(0, 100 - pctPasivo);

    // Circunferencia para SVG Donut (Radio r=50 -> Circunferencia = 2 * PI * 50 = 314.159)
    const circ = 2 * Math.PI * 50;
    const offsetPasivo = circ * (1 - pctPasivo / 100);

    function manejarExportacionPDF() {
        exportarDashboardPDF({
            activos,
            pasivos,
            ingresos,
            costos,
            movimientos: asientos.slice(-5).reverse(),
            periodo: `Ejercicio Fiscal ${new Date().getFullYear()}`,
            empresa: empresaNombre
        });
    }

    function manejarExportacionExcel() {
        exportarDashboardExcel({
            activos,
            pasivos,
            ingresos,
            costos,
            movimientos: asientos.slice(-5).reverse(),
            periodo: `Ejercicio Fiscal ${new Date().getFullYear()}`,
            empresa: empresaNombre
        });
    }

    if (cargando) {
        return (
            <section className="dashboard-page">
                <div style={{ padding: "60px 20px", textAlign: "center", color: "#6b7280" }}>
                    <div style={{ display: "inline-block", width: "32px", height: "32px", border: "3px solid #059669", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    <p style={{ marginTop: "14px", fontSize: "15px", fontWeight: "500" }}>Cargando información del sistema contable...</p>
                </div>
            </section>
        );
    }

    return (
        <section className="dashboard-page">
            {/* HERO FUSION: BIENVENIDA Y ACCIONES RÁPIDAS */}
            <header className="dashboard-hero-card">
                <div className="dashboard-hero-main">
                    <div className="dashboard-hero-header-row">
                        <span className="dashboard-hero-kicker">
                            <span className="live-status-dot" aria-hidden="true" />
                            {empresaNombre} · Ejercicio Fiscal {new Date().getFullYear()}
                        </span>
                        <span className="dashboard-badge-role">{rolUsuario}</span>
                    </div>

                    <h1 className="dashboard-hero-title">
                        {saludoHora}, <span className="highlight-name">{nombreUsuario}</span>
                    </h1>

                    <p className="dashboard-hero-desc">
                        Bienvenido a tu panel central contable. Consulta la situación patrimonial, supervisa el cumplimiento de la partida doble y analiza los estados financieros en tiempo real.
                    </p>

                    <div className="dashboard-hero-actions">
                        <button
                            type="button"
                            className="btn-hero-primary"
                            onClick={() => cambiarVista("asiento")}
                        >
                            <IconoMas size={16} />
                            <span>Registrar asiento</span>
                        </button>

                        <button
                            type="button"
                            className="btn-hero-secondary"
                            onClick={() => cambiarVista("diario")}
                        >
                            <IconoDiario size={16} />
                            <span>Libro Diario</span>
                        </button>

                        <button
                            type="button"
                            className="btn-hero-secondary"
                            onClick={() => cambiarVista("kardex")}
                        >
                            <IconoKardex size={16} />
                            <span>Kardex</span>
                        </button>

                        <div className="hero-export-wrap">
                            <ExportarPdfButton
                                onExport={manejarExportacionPDF}
                                onExportExcel={manejarExportacionExcel}
                                reporte="Dashboard Ejecutivo"
                            />
                        </div>
                    </div>
                </div>

                {/* Resumen lateral de salud contable */}
                <div className="dashboard-hero-audit-box">
                    <div className="audit-box-header">
                        <span>Salud Contable del Ejercicio</span>
                        <span className="audit-tag-active">En línea</span>
                    </div>

                    <div className="audit-box-status">
                        <div className={`status-pill ${librosCuadrados ? "is-balanced" : "is-warning"}`}>
                            <IconoCheck size={14} />
                            <span>{librosCuadrados ? "Partida Doble Cuadrada al 100%" : "Revisar diferencias de cuadre"}</span>
                        </div>
                    </div>

                    <div className="audit-stat-lines">
                        <div className="audit-stat-item">
                            <span className="audit-stat-label">Total Debe</span>
                            <strong className="audit-stat-val">$ {moneda(totalDebeGlobal)}</strong>
                        </div>
                        <div className="audit-stat-item">
                            <span className="audit-stat-label">Total Haber</span>
                            <strong className="audit-stat-val">$ {moneda(totalHaberGlobal)}</strong>
                        </div>
                        <div className="audit-stat-item">
                            <span className="audit-stat-label">Partidas Contabilizadas</span>
                            <strong className="audit-stat-val">{asientos.length} partidas</strong>
                        </div>
                    </div>
                </div>
            </header>

            {error && (
                <div className="dashboard-notice" role="alert">
                    <span>Aviso del sistema: {error}</span>
                </div>
            )}

            {/* SECCIÓN 1: SEIS MÉTRICAS CLAVE (KPIS FINANCIEROS) */}
            <div className="dashboard-kpi-grid">
                <article className="kpi-card" onClick={() => cambiarVista("balanceGeneral")}>
                    <div className="kpi-top">
                        <span className="kpi-kicker">Activos</span>
                        <span className="kpi-badge kpi-badge-green">Recursos</span>
                    </div>
                    <strong className="kpi-value">$ {moneda(activos)}</strong>
                    <p className="kpi-sub">Bancos, caja, inventarios y bienes</p>
                </article>

                <article className="kpi-card" onClick={() => cambiarVista("balanceGeneral")}>
                    <div className="kpi-top">
                        <span className="kpi-kicker">Pasivos</span>
                        <span className="kpi-badge kpi-badge-amber">Obligaciones</span>
                    </div>
                    <strong className="kpi-value">$ {moneda(pasivos)}</strong>
                    <p className="kpi-sub">Proveedores y deudas a pagar</p>
                </article>

                <article className="kpi-card" onClick={() => cambiarVista("balanceGeneral")}>
                    <div className="kpi-top">
                        <span className="kpi-kicker">Patrimonio Neto</span>
                        <span className="kpi-badge kpi-badge-blue">Capital</span>
                    </div>
                    <strong className="kpi-value">$ {moneda(patrimonio)}</strong>
                    <p className="kpi-sub">Fondos propios (Activo − Pasivo)</p>
                </article>

                <article className="kpi-card" onClick={() => cambiarVista("estadoResultados")}>
                    <div className="kpi-top">
                        <span className="kpi-kicker">Ingresos Netos</span>
                        <span className="kpi-badge kpi-badge-green">Ventas</span>
                    </div>
                    <strong className="kpi-value">$ {moneda(ingresos)}</strong>
                    <p className="kpi-sub">Facturación neta del período</p>
                </article>

                <article className="kpi-card" onClick={() => cambiarVista("estadoResultados")}>
                    <div className="kpi-top">
                        <span className="kpi-kicker">Costos y Gastos</span>
                        <span className="kpi-badge kpi-badge-amber">Egresos</span>
                    </div>
                    <strong className="kpi-value">$ {moneda(gastosTotales)}</strong>
                    <p className="kpi-sub">Costo de ventas + operación</p>
                </article>

                <article className={`kpi-card ${utilidadNeta >= 0 ? "kpi-accent-positive" : "kpi-accent-negative"}`} onClick={() => cambiarVista("estadoResultados")}>
                    <div className="kpi-top">
                        <span className="kpi-kicker">{utilidadNeta >= 0 ? "Utilidad Neta" : "Pérdida Neta"}</span>
                        <span className={`kpi-badge ${utilidadNeta >= 0 ? "kpi-badge-emerald" : "kpi-badge-red"}`}>
                            {utilidadNeta >= 0 ? `Margen: ${margenNeto}%` : "Déficit"}
                        </span>
                    </div>
                    <strong className="kpi-value">$ {moneda(utilidadNeta)}</strong>
                    <p className="kpi-sub">{utilidadNeta >= 0 ? "Rendimiento neto positivo" : "Resultado negativo del período"}</p>
                </article>
            </div>

            {/* SECCIÓN 2: SUITE DE GRÁFICAS VISUALES INTERACTIVAS */}
            <div className="dashboard-charts-layout">
                {/* Gráfica 1: Rendimiento Financiero Comparativo */}
                <article className="dashboard-card chart-large-card">
                    <div className="card-header-clean">
                        <div>
                            <span className="card-kicker-text">Actividad y Resultados</span>
                            <h2 className="card-title-text">Rendimiento Financiero del Ejercicio</h2>
                        </div>
                        <span className="card-badge-period">Año {new Date().getFullYear()}</span>
                    </div>

                    <div className="financial-chart-container">
                        <div className="chart-vertical-scale">
                            <span>$ {moneda(maxBarra)}</span>
                            <span>$ {moneda(maxBarra * 0.75)}</span>
                            <span>$ {moneda(maxBarra * 0.5)}</span>
                            <span>$ {moneda(maxBarra * 0.25)}</span>
                            <span>$ 0.00</span>
                        </div>

                        <div className="chart-columns-area">
                            {datosBarras.map(b => {
                                const alturaPct = Math.max(4, Math.min(100, (b.valor / maxBarra) * 100));
                                const esHover = barraHover === b.id;

                                return (
                                    <div
                                        key={b.id}
                                        className="chart-bar-slot"
                                        onMouseEnter={() => setBarraHover(b.id)}
                                        onMouseLeave={() => setBarraHover(null)}
                                    >
                                        {esHover && (
                                            <div className="chart-tooltip">
                                                <strong>{b.etiqueta}</strong>
                                                <span>$ {moneda(b.valor)}</span>
                                                <small>{b.desc}</small>
                                            </div>
                                        )}

                                        <div
                                            className="chart-bar-element"
                                            style={{
                                                height: `${alturaPct}%`,
                                                backgroundColor: b.color
                                            }}
                                        >
                                            <span className="bar-val-label">$ {moneda(b.valor)}</span>
                                        </div>

                                        <span className="chart-bar-caption">{b.etiqueta}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="chart-legend-row">
                        <span className="legend-item"><span className="legend-dot dot-green" /> Ingresos</span>
                        <span className="legend-item"><span className="legend-dot dot-amber" /> Costo de ventas</span>
                        <span className="legend-item"><span className="legend-dot dot-blue" /> Gastos de operación</span>
                        <span className="legend-item"><span className="legend-dot dot-emerald" /> Utilidad neta</span>
                    </div>
                </article>

                {/* Gráfica 2: Composición Patrimonial (Ecuación Contable Donut Chart) */}
                <article className="dashboard-card chart-donut-card">
                    <div className="card-header-clean">
                        <div>
                            <span className="card-kicker-text">Estructura Patrimonial</span>
                            <h2 className="card-title-text">Ecuación Contable</h2>
                        </div>
                    </div>

                    <p className="donut-explainer">
                        Activos totales distribuidos entre obligaciones con terceros (Pasivo) y recursos propios (Patrimonio).
                    </p>

                    <div className="donut-center-wrap">
                        <svg viewBox="0 0 120 120" className="donut-svg" aria-label="Estructura Patrimonial">
                            {/* Anillo de Fondo (Total Activos) */}
                            <circle
                                cx="60"
                                cy="60"
                                r="50"
                                fill="transparent"
                                stroke="var(--donut-track, #e2e8f0)"
                                strokeWidth="15"
                            />
                            {/* Segmento Patrimonio Neto (Verde) */}
                            <circle
                                cx="60"
                                cy="60"
                                r="50"
                                fill="transparent"
                                stroke="#059669"
                                strokeWidth="15"
                                strokeDasharray={circ}
                                strokeDashoffset="0"
                                strokeLinecap="round"
                                transform="rotate(-90 60 60)"
                            />
                            {/* Segmento Pasivo (Ámbar) */}
                            <circle
                                cx="60"
                                cy="60"
                                r="50"
                                fill="transparent"
                                stroke="#d97706"
                                strokeWidth="15"
                                strokeDasharray={circ}
                                strokeDashoffset={offsetPasivo}
                                strokeLinecap="round"
                                transform="rotate(-90 60 60)"
                            />
                        </svg>

                        <div className="donut-inner-content">
                            <span className="donut-inner-label">Activos</span>
                            <strong className="donut-inner-number">$ {moneda(activos)}</strong>
                        </div>
                    </div>

                    <div className="donut-legend-breakdown">
                        <div className="donut-legend-line">
                            <div className="donut-legend-left">
                                <span className="donut-swatch swatch-patrimonio" />
                                <span>Patrimonio Neto</span>
                            </div>
                            <div className="donut-legend-right">
                                <strong>$ {moneda(patrimonio)}</strong>
                                <span className="donut-pct">({pctPatrimonio}%)</span>
                            </div>
                        </div>

                        <div className="donut-legend-line">
                            <div className="donut-legend-left">
                                <span className="donut-swatch swatch-pasivo" />
                                <span>Pasivos (Terceros)</span>
                            </div>
                            <div className="donut-legend-right">
                                <strong>$ {moneda(pasivos)}</strong>
                                <span className="donut-pct">({pctPasivo}%)</span>
                            </div>
                        </div>
                    </div>
                </article>
            </div>

            {/* SECCIÓN 3: HUB DE HERRAMIENTAS Y ACCESOS RÁPIDOS */}
            <div className="dashboard-section-header">
                <div>
                    <span className="section-kicker">Módulos del Sistema</span>
                    <h2 className="section-title">Accesos Rápidos & Herramientas</h2>
                </div>
                <p className="section-desc">Navega directamente a los módulos operativos, informes y trazabilidad.</p>
            </div>

            <div className="tools-cards-grid">
                <button type="button" className="tool-card-box" onClick={() => cambiarVista("asiento")}>
                    <div className="tool-icon-circle icon-circle-emerald">
                        <IconoMas size={20} />
                    </div>
                    <div className="tool-card-info">
                        <h3>Registrar Asiento</h3>
                        <p>Partidas dobles con cálculo automático de IVA y autocompletado.</p>
                    </div>
                    <span className="tool-card-arrow" aria-hidden="true">→</span>
                </button>

                <button type="button" className="tool-card-box" onClick={() => cambiarVista("diario")}>
                    <div className="tool-icon-circle icon-circle-forest">
                        <IconoDiario size={20} />
                    </div>
                    <div className="tool-card-info">
                        <h3>Libro Diario</h3>
                        <p>Historial cronológico de partidas, filtros de fecha y edición.</p>
                    </div>
                    <span className="tool-card-arrow" aria-hidden="true">→</span>
                </button>

                <button type="button" className="tool-card-box" onClick={() => cambiarVista("mayor")}>
                    <div className="tool-icon-circle icon-circle-blue">
                        <IconoMayor size={20} />
                    </div>
                    <div className="tool-card-info">
                        <h3>Libro Mayor & Cuentas T</h3>
                        <p>Agrupación de movimientos por cuenta y saldos finales.</p>
                    </div>
                    <span className="tool-card-arrow" aria-hidden="true">→</span>
                </button>

                <button type="button" className="tool-card-box" onClick={() => cambiarVista("kardex")}>
                    <div className="tool-icon-circle icon-circle-amber">
                        <IconoKardex size={20} />
                    </div>
                    <div className="tool-card-info">
                        <h3>Kardex de Inventario</h3>
                        <p>Control de existencias y costos con PEPS y costo promedio.</p>
                    </div>
                    <span className="tool-card-arrow" aria-hidden="true">→</span>
                </button>

                <button type="button" className="tool-card-box" onClick={() => cambiarVista("estadoResultados")}>
                    <div className="tool-icon-circle icon-circle-emerald">
                        <IconoGrafica size={20} />
                    </div>
                    <div className="tool-card-info">
                        <h3>Estado de Resultados</h3>
                        <p>Informe financiero de ventas netas, costos y utilidad.</p>
                    </div>
                    <span className="tool-card-arrow" aria-hidden="true">→</span>
                </button>

                <button type="button" className="tool-card-box" onClick={() => cambiarVista("balanceGeneral")}>
                    <div className="tool-icon-circle icon-circle-forest">
                        <IconoBalanza size={20} />
                    </div>
                    <div className="tool-card-info">
                        <h3>Balance General</h3>
                        <p>Fotografía patrimonial de activos, pasivos y capital contable.</p>
                    </div>
                    <span className="tool-card-arrow" aria-hidden="true">→</span>
                </button>

                <button type="button" className="tool-card-box" onClick={() => cambiarVista("ratiosFinancieros")}>
                    <div className="tool-icon-circle icon-circle-blue">
                        <IconoRatios size={20} />
                    </div>
                    <div className="tool-card-info">
                        <h3>Ratios Financieros</h3>
                        <p>Indicadores de liquidez corriente, prueba ácida y solvencia.</p>
                    </div>
                    <span className="tool-card-arrow" aria-hidden="true">→</span>
                </button>

                <button type="button" className="tool-card-box" onClick={() => cambiarVista("cuentas")}>
                    <div className="tool-icon-circle icon-circle-amber">
                        <IconoCatalogo size={20} />
                    </div>
                    <div className="tool-card-info">
                        <h3>Catálogo de Cuentas</h3>
                        <p>Estructura de cuentas principales y subcuentas del catálogo.</p>
                    </div>
                    <span className="tool-card-arrow" aria-hidden="true">→</span>
                </button>
            </div>

            {/* SECCIÓN 4: ÚLTIMAS PARTIDAS Y MOVIMIENTOS RECIENTES */}
            <article className="dashboard-card recent-activity-card">
                <div className="card-header-clean">
                    <div>
                        <span className="card-kicker-text">Trazabilidad en Vivo</span>
                        <h2 className="card-title-text">Últimos Movimientos del Libro Diario</h2>
                    </div>

                    <button
                        type="button"
                        className="btn-view-all-link"
                        onClick={() => cambiarVista("diario")}
                    >
                        <span>Ver todas las partidas</span>
                        <IconoFlecha size={14} />
                    </button>
                </div>

                {movimientos.length === 0 ? (
                    <div className="empty-activity-wrap">
                        <p>Todavía no hay asientos registrados en el sistema.</p>
                        <button
                            type="button"
                            className="btn-hero-primary"
                            onClick={() => cambiarVista("asiento")}
                            style={{ marginTop: "12px" }}
                        >
                            Registrar primer asiento
                        </button>
                    </div>
                ) : (
                    <div className="activity-table-wrapper">
                        <table className="recent-entries-table">
                            <thead>
                                <tr>
                                    <th>Partida</th>
                                    <th>Fecha</th>
                                    <th>Concepto</th>
                                    <th style={{ textAlign: "right" }}>Total</th>
                                    <th style={{ textAlign: "center" }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {movimientos.map(asiento => {
                                    const totalPartida = (asiento.detalle_asientos || []).reduce(
                                        (sum, d) => sum + Number(d.debe || 0),
                                        0
                                    );

                                    return (
                                        <tr
                                            key={asiento.id}
                                            className="entry-interactive-row"
                                            onClick={() => cambiarVista("diario")}
                                        >
                                            <td>
                                                <span className="badge-partida">
                                                    Partida {asiento.numero_partida || asiento.id}
                                                </span>
                                            </td>
                                            <td className="entry-date-cell">{fechaCorta(asiento.fecha)}</td>
                                            <td className="entry-concept-cell">
                                                <strong>{String(asiento.concepto || "Sin concepto").replace(/^C\/\s*/i, "")}</strong>
                                            </td>
                                            <td className="entry-amount-cell">
                                                $ {moneda(totalPartida)}
                                            </td>
                                            <td style={{ textAlign: "center" }}>
                                                <span className="entry-row-arrow" title="Ver en Libro Diario">
                                                    →
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </article>
        </section>
    );
}

export default Dashboard;
