import { useEffect, useState, useMemo } from "react";
import { obtenerDatosKardex } from "../services/kardexService";
import { obtenerBalanceGeneral } from "../services/balanceGeneralService";
import { exportarBalanceGeneralPDF, exportarBalanceGeneralExcel } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";

// Iconos SVG integrados sin dependencias externas (compatibilidad total para Vercel y despliegues sin lucide-react)
function Calendar({ size = 18, className = "", style = {} }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
            <line x1="16" x2="16" y1="2" y2="6"/>
            <line x1="8" x2="8" y1="2" y2="6"/>
            <line x1="3" x2="21" y1="10" y2="10"/>
        </svg>
    );
}

function RefreshCw({ size = 14, className = "", style = {} }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
        </svg>
    );
}

function Layers({ size = 16, className = "", style = {} }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
        </svg>
    );
}

function CheckCircle2({ size = 24, className = "", style = {} }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
            <circle cx="12" cy="12" r="10"/>
            <path d="m9 12 2 2 4-4"/>
        </svg>
    );
}

function AlertCircle({ size = 20, className = "", style = {} }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" x2="12" y1="8" y2="12"/>
            <line x1="12" x2="12.01" y1="16" y2="16"/>
        </svg>
    );
}

function ChevronDown({ size = 14, className = "", style = {} }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
            <path d="m6 9 6 6 6-6"/>
        </svg>
    );
}

function ChevronRight({ size = 14, className = "", style = {} }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
            <path d="m9 18 6-6-6-6"/>
        </svg>
    );
}

// Formato de moneda contable: $ 1,234.56 o ($ 1,234.56) si es negativo
function formatearMoneda(valor) {
    if (valor === 0 || valor === null || valor === undefined) return "$ 0.00";
    const num = Number(valor);
    if (isNaN(num)) return "$ 0.00";
    const texto = Math.abs(num).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return num < 0 ? `($ ${texto})` : `$ ${texto}`;
}

function formatearFechaCorte(fechaStr) {
    if (!fechaStr) return "31 de diciembre";
    const partes = String(fechaStr).slice(0, 10).split("-");
    if (partes.length === 3) {
        const meses = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
        ];
        const anio = partes[0];
        const mes = meses[parseInt(partes[1], 10) - 1] || partes[1];
        const dia = parseInt(partes[2], 10);
        return `${dia} de ${mes} de ${anio}`;
    }
    return fechaStr;
}

export function BalanceGeneral({ empresa, fechaDesde: propFechaDesde, fechaHasta: propFechaHasta, fechaCorte: propFechaCorte, ocultarFiltros }) {
    // Año base para pre-cargar 1 de enero y 31 de diciembre
    const anioActual = new Date().getFullYear();
    const fechaInicialDesde = propFechaDesde || `${anioActual}-01-01`;
    const fechaInicialHasta = propFechaCorte || propFechaHasta || `${anioActual}-12-31`;

    // Filtros de fecha controlados por el usuario
    const [fechaDesde, setFechaDesde] = useState(fechaInicialDesde);
    const [fechaHasta, setFechaHasta] = useState(fechaInicialHasta);
    const [fechasAplicadas, setFechasAplicadas] = useState({
        desde: fechaInicialDesde,
        hasta: fechaInicialHasta
    });

    useEffect(() => {
        if (propFechaDesde || propFechaHasta || propFechaCorte) {
            const d = propFechaDesde || `${anioActual}-01-01`;
            const h = propFechaCorte || propFechaHasta || `${anioActual}-12-31`;
            setFechaDesde(d);
            setFechaHasta(h);
            setFechasAplicadas({ desde: d, hasta: h });
        }
    }, [propFechaDesde, propFechaHasta, propFechaCorte, anioActual]);

    // Control de Niveles de agregación contable:
    // Nivel 0: General (Activo, Pasivo, Patrimonio)
    // Nivel 1: Clasificación (Corriente y No Corriente)
    // Nivel 2: Cuentas de Mayor (Rubros principales de 4 dígitos)
    // Nivel 3: Subcuentas analíticas (Detalle de 6 dígitos: Caja, Bancos, Inventario Kardex, Proveedores, etc.)
    const [nivel, setNivel] = useState(2);

    // Conjunto de cuentas expandidas manualmente (para nivel 2)
    const [cuentasExpandidas, setCuentasExpandidas] = useState(new Set());

    // Estados de datos
    const [balance, setBalance] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [mostrarIvaModal, setMostrarIvaModal] = useState(false);
    const [inventarioManual, setInventarioManual] = useState("");

    // Función para alternar expansión de una cuenta específica
    const toggleExpandirCuenta = (codigo) => {
        setCuentasExpandidas(prev => {
            const nuevo = new Set(prev);
            if (nuevo.has(codigo)) {
                nuevo.delete(codigo);
            } else {
                nuevo.add(codigo);
            }
            return nuevo;
        });
    };

    // Expandir o colapsar todas
    const expandirTodas = () => {
        if (!balance) return;
        const codigos = new Set();
        const recolectar = (lista) => {
            (lista || []).forEach(c => {
                if (c.subcuentas && c.subcuentas.length > 0) {
                    codigos.add(c.codigo);
                }
            });
        };
        recolectar(balance.activo?.corriente?.cuentas);
        recolectar(balance.activo?.noCorriente?.cuentas);
        recolectar(balance.pasivo?.corriente?.cuentas);
        recolectar(balance.pasivo?.noCorriente?.cuentas);
        recolectar(balance.capital?.cuentas);
        setCuentasExpandidas(codigos);
    };

    const colapsarTodas = () => {
        setCuentasExpandidas(new Set());
    };

    // Carga de datos
    const cargarDatos = async () => {
        setCargando(true);
        setError(null);

        try {
            // 1. Obtener inventario final de Kardex
            let invFinalKardex = null;
            if (inventarioManual && Number(inventarioManual) > 0) {
                invFinalKardex = Number(inventarioManual);
            } else {
                try {
                    const kardex = await obtenerDatosKardex({
                        fechaInicio: fechasAplicadas.desde,
                        fechaFin: fechasAplicadas.hasta
                    });
                    const saldo = Number(kardex?.totales?.saldo_final ?? 0);
                    if (saldo > 0) {
                        invFinalKardex = saldo;
                    }
                } catch (errK) {
                    console.warn("Kardex no disponible directamente:", errK);
                }
            }

            // 2. Cargar Balance General
            const data = await obtenerBalanceGeneral({
                desde: fechasAplicadas.desde,
                hasta: fechasAplicadas.hasta,
                inventarioFinal: invFinalKardex,
                inventarioFinalManual: invFinalKardex
            });

            if (!data) {
                throw new Error("El servidor no devolvió información para el Balance General.");
            }

            setBalance(data);
        } catch (err) {
            console.error("Error al cargar Balance General:", err);
            setError(err.message || "No se pudo cargar el Balance General. Verifique su conexión y fechas.");
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargarDatos();
    }, [fechasAplicadas]);

    // Aplicar filtros de fecha manuales
    const manejarAplicarFiltros = (e) => {
        if (e) e.preventDefault();
        if (!fechaDesde || !fechaHasta) {
            alert("Por favor ingrese tanto la Fecha Desde como la Fecha Hasta.");
            return;
        }
        if (fechaDesde > fechaHasta) {
            alert("La Fecha Desde no puede ser mayor que la Fecha Hasta.");
            return;
        }
        setFechasAplicadas({ desde: fechaDesde, hasta: fechaHasta });
    };

    // Pre-configurar año rápido
    const aplicarAnio = (anio) => {
        const d = `${anio}-01-01`;
        const h = `${anio}-12-31`;
        setFechaDesde(d);
        setFechaHasta(h);
        setFechasAplicadas({ desde: d, hasta: h });
    };

    const nombreEmpresa = balance?.empresa || (typeof empresa === "string" ? empresa : empresa?.nombre_empresa) || "EMPRESA COMERCIAL";
    const validacion = balance?.validacion;
    const liquidacionIva = balance?.liquidacionIva;
    const activo = balance?.activo;
    const pasivo = balance?.pasivo;
    const capital = balance?.capital;
    const totalPasivoCapital = balance?.totalPasivoCapital ?? (Number(pasivo?.total || 0) + Number(capital?.total || 0));

    function manejarExportacionPDF() {
        exportarBalanceGeneralPDF({
            balance,
            desde: fechasAplicadas.desde,
            hasta: fechasAplicadas.hasta
        });
    }

    function manejarExportacionExcel() {
        exportarBalanceGeneralExcel({ balance, desde: fechasAplicadas.desde, hasta: fechasAplicadas.hasta });
    }

    // Determina si una cuenta debe mostrar sus subcuentas
    const debeMostrarSubcuentas = (codigo) => {
        if (nivel === 3) return true; // En nivel 3 siempre se muestran
        if (nivel === 2 && cuentasExpandidas.has(codigo)) return true; // En nivel 2 se expande si el usuario hizo clic
        return false;
    };

    return (
        <div className="bg-section-container" style={{ maxWidth: "1280px", margin: "0 auto", padding: "20px 16px", color: "#1e293b", fontFamily: "system-ui, -apple-system, sans-serif" }}>
            
            {/* ================= BARRA SUPERIOR DE FILTROS Y CONTROLES ================= */}
            <div 
                className="bg-controls-bar"
                style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    marginBottom: "20px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
                }}
            >
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                    
                    {/* Filtros de Fecha Re-cargados con 1 de enero y 31 de diciembre */}
                    {!ocultarFiltros && (
                        <form onSubmit={manejarAplicarFiltros} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Calendar size={18} style={{ color: "#1b4332" }} />
                                <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Filtros de Fecha:</span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <label style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Desde:</label>
                                <input 
                                    type="date" 
                                    value={fechaDesde}
                                    onChange={(e) => setFechaDesde(e.target.value)}
                                    style={{
                                        fontSize: "13px",
                                        padding: "6px 10px",
                                        borderRadius: "6px",
                                        border: "1px solid #cbd5e1",
                                        background: "#f8fafc",
                                        color: "#0f172a",
                                        fontWeight: 500
                                    }}
                                />
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <label style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Hasta (Corte):</label>
                                <input 
                                    type="date" 
                                    value={fechaHasta}
                                    onChange={(e) => setFechaHasta(e.target.value)}
                                    style={{
                                        fontSize: "13px",
                                        padding: "6px 10px",
                                        borderRadius: "6px",
                                        border: "1px solid #cbd5e1",
                                        background: "#f8fafc",
                                        color: "#0f172a",
                                        fontWeight: 500
                                    }}
                                />
                            </div>

                            <button 
                                type="submit"
                                disabled={cargando}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    background: "#1b4332",
                                    color: "#ffffff",
                                    border: "none",
                                    padding: "7px 16px",
                                    borderRadius: "6px",
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    cursor: cargando ? "wait" : "pointer",
                                    transition: "background 0.2s"
                                }}
                            >
                                <RefreshCw size={14} className={cargando ? "animate-spin" : ""} />
                                {cargando ? "Consultando..." : "Actualizar"}
                            </button>

                            {/* Botones de Años Rápidos */}
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "4px" }}>
                                <button
                                    type="button"
                                    onClick={() => aplicarAnio(anioActual)}
                                    style={{
                                        fontSize: "11px",
                                        padding: "4px 8px",
                                        borderRadius: "4px",
                                        border: fechaHasta.startsWith(String(anioActual)) ? "1px solid #1b4332" : "1px solid #e2e8f0",
                                        background: fechaHasta.startsWith(String(anioActual)) ? "#ecfdf5" : "#ffffff",
                                        color: fechaHasta.startsWith(String(anioActual)) ? "#1b4332" : "#475569",
                                        fontWeight: 600,
                                        cursor: "pointer"
                                    }}
                                >
                                    {anioActual} (Actual)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => aplicarAnio(anioActual - 1)}
                                    style={{
                                        fontSize: "11px",
                                        padding: "4px 8px",
                                        borderRadius: "4px",
                                        border: fechaHasta.startsWith(String(anioActual - 1)) ? "1px solid #1b4332" : "1px solid #e2e8f0",
                                        background: fechaHasta.startsWith(String(anioActual - 1)) ? "#ecfdf5" : "#ffffff",
                                        color: fechaHasta.startsWith(String(anioActual - 1)) ? "#1b4332" : "#475569",
                                        fontWeight: 600,
                                        cursor: "pointer"
                                    }}
                                >
                                    {anioActual - 1}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Acciones de impresión y vista */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <ExportarPdfButton onExport={manejarExportacionPDF} onExportExcel={manejarExportacionExcel} reporte="Balance General" disabled={cargando || !balance} />
                    </div>
                </div>

                {/* Selector de Niveles (Nivel 0 a Nivel 3) */}
                <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #f1f5f9", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
                            <Layers size={16} style={{ color: "#1b4332" }} />
                            Nivel de Detalle:
                        </span>

                        {/* Botón Nivel 0 */}
                        <button
                            type="button"
                            onClick={() => setNivel(0)}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                fontSize: "12.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                                border: nivel === 0 ? "2px solid #1b4332" : "1px solid #cbd5e1",
                                background: nivel === 0 ? "#1b4332" : "#ffffff",
                                color: nivel === 0 ? "#ffffff" : "#475569",
                                transition: "all 0.15s"
                            }}
                        >
                            Nivel 0: General
                        </button>

                        {/* Botón Nivel 1 */}
                        <button
                            type="button"
                            onClick={() => setNivel(1)}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                fontSize: "12.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                                border: nivel === 1 ? "2px solid #1b4332" : "1px solid #cbd5e1",
                                background: nivel === 1 ? "#1b4332" : "#ffffff",
                                color: nivel === 1 ? "#ffffff" : "#475569",
                                transition: "all 0.15s"
                            }}
                        >
                            Nivel 1: Clasificación
                        </button>

                        {/* Botón Nivel 2 */}
                        <button
                            type="button"
                            onClick={() => setNivel(2)}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                fontSize: "12.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                                border: nivel === 2 ? "2px solid #1b4332" : "1px solid #cbd5e1",
                                background: nivel === 2 ? "#1b4332" : "#ffffff",
                                color: nivel === 2 ? "#ffffff" : "#475569",
                                transition: "all 0.15s"
                            }}
                        >
                            Nivel 2: Cuentas de Mayor
                        </button>

                        {/* Botón Nivel 3 */}
                        <button
                            type="button"
                            onClick={() => setNivel(3)}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                fontSize: "12.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                                border: nivel === 3 ? "2px solid #1b4332" : "1px solid #cbd5e1",
                                background: nivel === 3 ? "#1b4332" : "#ffffff",
                                color: nivel === 3 ? "#ffffff" : "#475569",
                                transition: "all 0.15s"
                            }}
                        >
                            Nivel 3: Subcuentas Analíticas
                        </button>
                    </div>

                    {/* Controles de expansión para niveles 2 y 3 */}
                    {(nivel === 2 || nivel === 3) && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <button
                                type="button"
                                onClick={expandirTodas}
                                style={{
                                    fontSize: "11.5px",
                                    padding: "4px 10px",
                                    borderRadius: "4px",
                                    border: "1px solid #cbd5e1",
                                    background: "#f8fafc",
                                    color: "#334155",
                                    cursor: "pointer",
                                    fontWeight: 600
                                }}
                            >
                                Expandir todas
                            </button>
                            <button
                                type="button"
                                onClick={colapsarTodas}
                                style={{
                                    fontSize: "11.5px",
                                    padding: "4px 10px",
                                    borderRadius: "4px",
                                    border: "1px solid #cbd5e1",
                                    background: "#f8fafc",
                                    color: "#334155",
                                    cursor: "pointer",
                                    fontWeight: 600
                                }}
                            >
                                Colapsar todas
                            </button>
                        </div>
                    )}
                </div>

                {/* Explicación breve del nivel activo */}
                <div style={{ marginTop: "10px", fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                    {nivel === 0 && "Nivel 0: Resumen ejecutivo del Activo, Pasivo y Patrimonio Neto (grandes masas patrimoniales)."}
                    {nivel === 1 && "Nivel 1: Clasificación de Activos y Pasivos en Corrientes y No Corrientes."}
                    {nivel === 2 && "Nivel 2: Cuentas de Mayor (4 dígitos) con montos consolidados. Haga clic en una cuenta o use 'Expandir todas' para ver sus subcuentas."}
                    {nivel === 3 && "Nivel 3: Vista analítica total. Despliega todas las subcuentas de 6 dígitos que alimentan cada rubro (Caja, Bancos, Kardex, etc.)."}
                </div>
            </div>

            {/* ================= ESTADOS DE CARGA Y ERROR ================= */}
            {cargando && (
                <div style={{ padding: "30px 20px", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
                    <RefreshCw size={24} className="animate-spin" style={{ color: "#1b4332", margin: "0 auto 8px auto" }} />
                    <p style={{ margin: 0, fontWeight: 600, color: "#334155", fontSize: "14px" }}>
                        Cargando saldos acumulados y calculando Balance General...
                    </p>
                </div>
            )}

            {error && (
                <div style={{ padding: "16px 20px", background: "#fef2f2", color: "#991b1b", borderRadius: "8px", border: "1px solid #fecaca", marginBottom: "20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <AlertCircle size={20} />
                        <div>
                            <strong style={{ display: "block", fontSize: "14px" }}>No se pudo cargar el Balance General</strong>
                            <span style={{ fontSize: "13px" }}>{error}</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={cargarDatos}
                        style={{
                            marginTop: "12px",
                            padding: "6px 14px",
                            background: "#991b1b",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer"
                        }}
                    >
                        Reintentar consulta
                    </button>
                </div>
            )}

            {/* ================= VALIDACIÓN DE CUADRE Y LIQUIDACIÓN IVA ================= */}
            {balance && validacion && (
                <div
                    className="bg-validation-card"
                    style={{
                        marginBottom: "20px",
                        padding: "16px 20px",
                        borderRadius: "10px",
                        background: validacion.cuadra ? "#f0fdf4" : "#fef2f2",
                        border: `1px solid ${validacion.cuadra ? "#bbf7d0" : "#fecaca"}`,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            {validacion.cuadra ? (
                                <CheckCircle2 size={24} style={{ color: "#16a34a" }} />
                            ) : (
                                <AlertCircle size={24} style={{ color: "#dc2626" }} />
                            )}
                            <div>
                                <span style={{ fontWeight: 700, color: validacion.cuadra ? "#166534" : "#991b1b", fontSize: "14.5px" }}>
                                    {validacion.cuadra
                                        ? "Ecuación Patrimonial Verificada: Activo = Pasivo + Patrimonio Neto"
                                        : `Diferencia de Cuadre detectada: ${formatearMoneda(validacion.diferencia)}`}
                                </span>
                                <div style={{ fontSize: "12.5px", color: validacion.cuadra ? "#15803d" : "#b91c1c", marginTop: "2px" }}>
                                    Activo ({formatearMoneda(activo?.total)}) = Pasivo ({formatearMoneda(pasivo?.total)}) + Patrimonio ({formatearMoneda(capital?.total)})
                                </div>
                            </div>
                        </div>

                        {liquidacionIva && (
                            <button
                                type="button"
                                onClick={() => setMostrarIvaModal(!mostrarIvaModal)}
                                style={{
                                    fontSize: "12.5px",
                                    fontWeight: 600,
                                    padding: "6px 14px",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    border: "1px solid #cbd5e1",
                                    background: "#ffffff",
                                    color: "#1e293b",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                                }}
                            >
                                {mostrarIvaModal ? "Ocultar Liquidación IVA" : `Ver Liquidación IVA (${liquidacionIva.tipo === "IMPUESTO_PAGAR" || liquidacionIva.tipo === "A_PAGAR" ? "Impuesto a Pagar" : "Remanente a Favor"})`}
                            </button>
                        )}
                    </div>

                    {/* Panel desplegable de Liquidación de IVA */}
                    {mostrarIvaModal && liquidacionIva && (
                        <div
                            style={{
                                marginTop: "14px",
                                paddingTop: "12px",
                                borderTop: "1px dashed #cbd5e1",
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                                gap: "12px",
                                fontSize: "13px"
                            }}
                        >
                            <div style={{ background: "#ffffff", padding: "10px 14px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                <span style={{ display: "block", color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                                    IVA Crédito Fiscal (Compras)
                                </span>
                                <strong style={{ fontSize: "15px", color: "#0f172a" }}>{formatearMoneda(liquidacionIva.ivaCreditoFiscal)}</strong>
                            </div>
                            <div style={{ background: "#ffffff", padding: "10px 14px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                <span style={{ display: "block", color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                                    IVA Débito Fiscal (Ventas)
                                </span>
                                <strong style={{ fontSize: "15px", color: "#0f172a" }}>{formatearMoneda(liquidacionIva.ivaDebitoFiscal)}</strong>
                            </div>
                            <div style={{ background: liquidacionIva.impuestoAPagar > 0 ? "#fef2f2" : "#f0fdf4", padding: "10px 14px", borderRadius: "6px", border: `1px solid ${liquidacionIva.impuestoAPagar > 0 ? "#fecaca" : "#bbf7d0"}` }}>
                                <span style={{ display: "block", color: liquidacionIva.impuestoAPagar > 0 ? "#991b1b" : "#166534", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                                    {liquidacionIva.impuestoAPagar > 0 ? "Impuesto a Pagar (Pasivo F-07)" : "Remanente a Favor (Activo F-07)"}
                                </span>
                                <strong style={{ fontSize: "15px", color: liquidacionIva.impuestoAPagar > 0 ? "#b91c1c" : "#15803d" }}>
                                    {formatearMoneda(liquidacionIva.impuestoAPagar > 0 ? liquidacionIva.impuestoAPagar : liquidacionIva.remanenteAFavor)}
                                </strong>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ================= HOJA DE PAPEL CONTABLE FORMAL ================= */}
            <div 
                className="bg-sheet-paper"
                style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    border: "1px solid #cbd5e1",
                    padding: "36px 40px",
                    boxShadow: "0 4px 20px -2px rgba(0,0,0,0.06)"
                }}
            >
                {/* Encabezado Formal */}
                <header style={{ textAlign: "center", paddingBottom: "20px", borderBottom: "2px solid #1b4332", marginBottom: "26px" }}>
                    <h2 style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", color: "#1b4332", margin: "0 0 4px 0" }}>
                        {nombreEmpresa}
                    </h2>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "#334155", margin: "0 0 6px 0" }}>
                        BALANCE GENERAL
                    </h3>
                    <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 4px 0", fontWeight: 600 }}>
                        Al {formatearFechaCorte(fechasAplicadas.hasta)}
                    </p>
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 6px 0" }}>
                        (Período contable: {fechasAplicadas.desde} al {fechasAplicadas.hasta}) &bull; Vista: Nivel {nivel}
                    </p>
                    <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, fontStyle: "italic" }}>
                        Valores expresados en Dólares de los Estados Unidos de América (USD)
                    </p>
                </header>

                {/* ================= VISTA NIVEL 0: GENERAL (GRANDES MASAS) ================= */}
                {nivel === 0 && (
                    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "20px 0" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                            <tbody>
                                <tr style={{ borderBottom: "2px solid #1b4332", background: "#f8fafc" }}>
                                    <td style={{ padding: "14px 16px", fontWeight: 800, color: "#1b4332", fontSize: "16px" }}>
                                        TOTAL DEL ACTIVO
                                    </td>
                                    <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 800, color: "#1b4332", fontSize: "18px" }}>
                                        {formatearMoneda(activo?.total)}
                                    </td>
                                </tr>
                                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "#334155" }}>
                                        TOTAL DEL PASIVO
                                    </td>
                                    <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 700, color: "#334155" }}>
                                        {formatearMoneda(pasivo?.total)}
                                    </td>
                                </tr>
                                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "#334155" }}>
                                        TOTAL PATRIMONIO NETO
                                    </td>
                                    <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 700, color: "#334155" }}>
                                        {formatearMoneda(capital?.total)}
                                    </td>
                                </tr>
                                <tr style={{ borderTop: "2px solid #0f172a", borderBottom: "3px double #0f172a", background: "rgba(27, 67, 50, 0.05)" }}>
                                    <td style={{ padding: "16px", fontWeight: 800, color: "#0f172a", fontSize: "16px" }}>
                                        TOTAL PASIVO Y PATRIMONIO
                                    </td>
                                    <td style={{ padding: "16px", textAlign: "right", fontWeight: 800, color: "#0f172a", fontSize: "18px" }}>
                                        {formatearMoneda(totalPasivoCapital)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <div style={{ marginTop: "24px", padding: "14px 18px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0", fontSize: "13px", color: "#166534", textAlign: "center" }}>
                            <strong>Comprobación de la Ecuación Contable:</strong> Activo ({formatearMoneda(activo?.total)}) = Pasivo ({formatearMoneda(pasivo?.total)}) + Patrimonio ({formatearMoneda(capital?.total)})
                        </div>
                    </div>
                )}

                {/* ================= VISTA NIVEL 1: CLASIFICACIÓN (CORRIENTE Y NO CORRIENTE) ================= */}
                {nivel === 1 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "36px", alignItems: "start" }}>
                        
                        {/* Columna Izquierda: Activos */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div style={{ background: "#1b4332", color: "#ffffff", padding: "8px 14px", borderRadius: "6px" }}>
                                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>ACTIVO</h3>
                            </div>

                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                                <tbody>
                                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                        <td style={{ padding: "12px 6px", fontWeight: 600, color: "#1e293b" }}>
                                            Activo Corriente
                                        </td>
                                        <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 700 }}>
                                            {formatearMoneda(activo?.corriente?.total)}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                        <td style={{ padding: "12px 6px", fontWeight: 600, color: "#1e293b" }}>
                                            Activo No Corriente
                                        </td>
                                        <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 700 }}>
                                            {formatearMoneda(activo?.noCorriente?.total)}
                                        </td>
                                    </tr>
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: "2px solid #0f172a", borderBottom: "3px double #0f172a", background: "rgba(27, 67, 50, 0.05)" }}>
                                        <td style={{ padding: "14px 6px", fontWeight: 800, color: "#0f172a" }}>
                                            TOTAL DEL ACTIVO
                                        </td>
                                        <td style={{ padding: "14px 6px", textAlign: "right", fontWeight: 800, color: "#0f172a", fontSize: "16px" }}>
                                            {formatearMoneda(activo?.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Columna Derecha: Pasivo y Patrimonio */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div style={{ background: "#1b4332", color: "#ffffff", padding: "8px 14px", borderRadius: "6px" }}>
                                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>PASIVO Y PATRIMONIO</h3>
                            </div>

                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                                <tbody>
                                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                        <td style={{ padding: "12px 6px", fontWeight: 600, color: "#1e293b" }}>
                                            Pasivo Corriente
                                        </td>
                                        <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 700 }}>
                                            {formatearMoneda(pasivo?.corriente?.total)}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                        <td style={{ padding: "12px 6px", fontWeight: 600, color: "#1e293b" }}>
                                            Pasivo No Corriente
                                        </td>
                                        <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 700 }}>
                                            {formatearMoneda(pasivo?.noCorriente?.total)}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: "1px solid #cbd5e1", background: "#f8fafc" }}>
                                        <td style={{ padding: "10px 6px", fontWeight: 700, color: "#475569" }}>
                                            Total Pasivos
                                        </td>
                                        <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 700, color: "#334155" }}>
                                            {formatearMoneda(pasivo?.total)}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                        <td style={{ padding: "12px 6px", fontWeight: 600, color: "#1e293b" }}>
                                            Patrimonio Neto
                                        </td>
                                        <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 700 }}>
                                            {formatearMoneda(capital?.total)}
                                        </td>
                                    </tr>
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: "2px solid #0f172a", borderBottom: "3px double #0f172a", background: "rgba(27, 67, 50, 0.05)" }}>
                                        <td style={{ padding: "14px 6px", fontWeight: 800, color: "#0f172a" }}>
                                            TOTAL PASIVO Y PATRIMONIO
                                        </td>
                                        <td style={{ padding: "14px 6px", textAlign: "right", fontWeight: 800, color: "#0f172a", fontSize: "16px" }}>
                                            {formatearMoneda(totalPasivoCapital)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}

                {/* ================= VISTA NIVELES 2 Y 3: CUENTAS DE MAYOR Y SUBCUENTAS ================= */}
                {(nivel === 2 || nivel === 3) && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "36px", alignItems: "start" }}>
                        
                        {/* ================= COLUMNA IZQUIERDA: ACTIVOS ================= */}
                        <section style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                            <div style={{ background: "#1b4332", color: "#ffffff", padding: "8px 14px", borderRadius: "6px" }}>
                                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>ACTIVO</h3>
                            </div>

                            {/* ACTIVO CORRIENTE */}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <div style={{ borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", marginBottom: "6px" }}>
                                    <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, letterSpacing: "0.5px", color: "#475569" }}>ACTIVO CORRIENTE</h4>
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                                    <tbody>
                                        {(!activo?.corriente?.cuentas || activo.corriente.cuentas.length === 0) ? (
                                            <tr>
                                                <td colSpan="3" style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "12px", padding: "8px 4px" }}>
                                                    Sin cuentas corrientes en este período
                                                </td>
                                            </tr>
                                        ) : (
                                            activo.corriente.cuentas.map((cuenta) => {
                                                const tieneSubcuentas = cuenta.subcuentas && cuenta.subcuentas.length > 0;
                                                const expandido = debeMostrarSubcuentas(cuenta.codigo);

                                                return (
                                                    <tr key={cuenta.codigo} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                        <td colSpan="3" style={{ padding: 0 }}>
                                                            {/* Fila Principal de la Cuenta de Mayor */}
                                                            <div 
                                                                onClick={() => tieneSubcuentas && toggleExpandirCuenta(cuenta.codigo)}
                                                                style={{ 
                                                                    display: "flex", 
                                                                    justifyContent: "space-between", 
                                                                    alignItems: "center",
                                                                    padding: "7px 4px",
                                                                    cursor: tieneSubcuentas ? "pointer" : "default",
                                                                    background: expandido ? "#f8fafc" : "transparent",
                                                                    borderRadius: "4px"
                                                                }}
                                                            >
                                                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                                                                    {tieneSubcuentas && (
                                                                        <span style={{ color: "#64748b", display: "inline-flex" }}>
                                                                            {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                        </span>
                                                                    )}
                                                                    <span style={{ width: "60px", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#64748b" }}>
                                                                        {cuenta.codigo}
                                                                    </span>
                                                                    <div>
                                                                        <span style={{ fontWeight: 600, color: "#1e293b" }}>{cuenta.concepto}</span>
                                                                        {cuenta.nota && (
                                                                            <small style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>
                                                                                {cuenta.nota}
                                                                            </small>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", paddingRight: "4px", fontWeight: 600, color: "#0f172a" }}>
                                                                    {formatearMoneda(cuenta.monto)}
                                                                </div>
                                                            </div>

                                                            {/* Despliegue de Subcuentas (Nivel 3) */}
                                                            {tieneSubcuentas && expandido && (
                                                                <div style={{ background: "#f8fafc", padding: "4px 8px 6px 36px", borderLeft: "2px solid #cbd5e1", marginBottom: "4px" }}>
                                                                    {cuenta.subcuentas.map((sub, idx) => (
                                                                        <div key={`${cuenta.codigo}-sub-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: "12px", color: "#475569" }}>
                                                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                                                <span style={{ fontFamily: "ui-monospace, monospace", color: "#64748b", minWidth: "55px" }}>{sub.codigo}</span>
                                                                                <span>{sub.concepto}</span>
                                                                                {sub.nota && <span style={{ fontSize: "10.5px", background: "#e2e8f0", padding: "1px 5px", borderRadius: "3px", color: "#475569" }}>{sub.nota}</span>}
                                                                            </div>
                                                                            <span style={{ fontVariantNumeric: "tabular-nums", color: "#334155", fontWeight: 500 }}>
                                                                                {formatearMoneda(sub.monto)}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: "1px solid #cbd5e1" }}>
                                            <td colSpan="2" style={{ padding: "10px 4px", fontWeight: 600, color: "#334155" }}>
                                                Total Activo Corriente
                                            </td>
                                            <td style={{ textAlign: "right", padding: "10px 4px", fontWeight: 700, color: "#0f172a" }}>
                                                {formatearMoneda(activo?.corriente?.total)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* ACTIVO NO CORRIENTE */}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <div style={{ borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", marginBottom: "6px" }}>
                                    <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, letterSpacing: "0.5px", color: "#475569" }}>ACTIVO NO CORRIENTE</h4>
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                                    <tbody>
                                        {(!activo?.noCorriente?.cuentas || activo.noCorriente.cuentas.length === 0) ? (
                                            <tr>
                                                <td colSpan="3" style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "12px", padding: "8px 4px" }}>
                                                    Sin cuentas no corrientes registradas
                                                </td>
                                            </tr>
                                        ) : (
                                            activo.noCorriente.cuentas.map((cuenta) => {
                                                const tieneSubcuentas = cuenta.subcuentas && cuenta.subcuentas.length > 0;
                                                const expandido = debeMostrarSubcuentas(cuenta.codigo);

                                                return (
                                                    <tr key={cuenta.codigo} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                        <td colSpan="3" style={{ padding: 0 }}>
                                                            <div 
                                                                onClick={() => tieneSubcuentas && toggleExpandirCuenta(cuenta.codigo)}
                                                                style={{ 
                                                                    display: "flex", 
                                                                    justifyContent: "space-between", 
                                                                    alignItems: "center",
                                                                    padding: "7px 4px",
                                                                    cursor: tieneSubcuentas ? "pointer" : "default",
                                                                    background: expandido ? "#f8fafc" : "transparent",
                                                                    borderRadius: "4px"
                                                                }}
                                                            >
                                                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                                                                    {tieneSubcuentas && (
                                                                        <span style={{ color: "#64748b", display: "inline-flex" }}>
                                                                            {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                        </span>
                                                                    )}
                                                                    <span style={{ width: "60px", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#64748b" }}>
                                                                        {cuenta.codigo}
                                                                    </span>
                                                                    <div>
                                                                        <span style={{ fontWeight: 600, color: "#1e293b" }}>{cuenta.concepto}</span>
                                                                        {cuenta.nota && (
                                                                            <small style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>
                                                                                {cuenta.nota}
                                                                            </small>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", paddingRight: "4px", fontWeight: 600, color: "#0f172a" }}>
                                                                    {formatearMoneda(cuenta.monto)}
                                                                </div>
                                                            </div>

                                                            {tieneSubcuentas && expandido && (
                                                                <div style={{ background: "#f8fafc", padding: "4px 8px 6px 36px", borderLeft: "2px solid #cbd5e1", marginBottom: "4px" }}>
                                                                    {cuenta.subcuentas.map((sub, idx) => (
                                                                        <div key={`${cuenta.codigo}-sub-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: "12px", color: "#475569" }}>
                                                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                                                <span style={{ fontFamily: "ui-monospace, monospace", color: "#64748b", minWidth: "55px" }}>{sub.codigo}</span>
                                                                                <span>{sub.concepto}</span>
                                                                                {sub.nota && <span style={{ fontSize: "10.5px", background: "#e2e8f0", padding: "1px 5px", borderRadius: "3px", color: "#475569" }}>{sub.nota}</span>}
                                                                            </div>
                                                                            <span style={{ fontVariantNumeric: "tabular-nums", color: "#334155", fontWeight: 500 }}>
                                                                                {formatearMoneda(sub.monto)}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: "1px solid #cbd5e1" }}>
                                            <td colSpan="2" style={{ padding: "10px 4px", fontWeight: 600, color: "#334155" }}>
                                                Total Activo No Corriente
                                            </td>
                                            <td style={{ textAlign: "right", padding: "10px 4px", fontWeight: 700, color: "#0f172a" }}>
                                                {formatearMoneda(activo?.noCorriente?.total)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* TOTAL ACTIVOS */}
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "12px 10px",
                                    borderTop: "2px solid #0f172a",
                                    borderBottom: "3px double #0f172a",
                                    fontSize: "15px",
                                    fontWeight: 800,
                                    background: "rgba(27, 67, 50, 0.05)",
                                    marginTop: "10px"
                                }}
                            >
                                <span>TOTAL DEL ACTIVO</span>
                                <strong style={{ fontSize: "16px" }}>{formatearMoneda(activo?.total)}</strong>
                            </div>
                        </section>

                        {/* ================= COLUMNA DERECHA: PASIVO Y CAPITAL ================= */}
                        <section style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                            <div style={{ background: "#1b4332", color: "#ffffff", padding: "8px 14px", borderRadius: "6px" }}>
                                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>PASIVO</h3>
                            </div>

                            {/* PASIVO CORRIENTE */}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <div style={{ borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", marginBottom: "6px" }}>
                                    <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, letterSpacing: "0.5px", color: "#475569" }}>PASIVO CORRIENTE</h4>
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                                    <tbody>
                                        {(!pasivo?.corriente?.cuentas || pasivo.corriente.cuentas.length === 0) ? (
                                            <tr>
                                                <td colSpan="3" style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "12px", padding: "8px 4px" }}>
                                                    Sin deudas a corto plazo registradas
                                                </td>
                                            </tr>
                                        ) : (
                                            pasivo.corriente.cuentas.map((cuenta) => {
                                                const tieneSubcuentas = cuenta.subcuentas && cuenta.subcuentas.length > 0;
                                                const expandido = debeMostrarSubcuentas(cuenta.codigo);

                                                return (
                                                    <tr key={cuenta.codigo} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                        <td colSpan="3" style={{ padding: 0 }}>
                                                            <div 
                                                                onClick={() => tieneSubcuentas && toggleExpandirCuenta(cuenta.codigo)}
                                                                style={{ 
                                                                    display: "flex", 
                                                                    justifyContent: "space-between", 
                                                                    alignItems: "center",
                                                                    padding: "7px 4px",
                                                                    cursor: tieneSubcuentas ? "pointer" : "default",
                                                                    background: expandido ? "#f8fafc" : "transparent",
                                                                    borderRadius: "4px"
                                                                }}
                                                            >
                                                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                                                                    {tieneSubcuentas && (
                                                                        <span style={{ color: "#64748b", display: "inline-flex" }}>
                                                                            {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                        </span>
                                                                    )}
                                                                    <span style={{ width: "60px", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#64748b" }}>
                                                                        {cuenta.codigo}
                                                                    </span>
                                                                    <div>
                                                                        <span style={{ fontWeight: 600, color: "#1e293b" }}>{cuenta.concepto}</span>
                                                                        {cuenta.nota && (
                                                                            <small style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>
                                                                                {cuenta.nota}
                                                                            </small>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", paddingRight: "4px", fontWeight: 600, color: "#0f172a" }}>
                                                                    {formatearMoneda(cuenta.monto)}
                                                                </div>
                                                            </div>

                                                            {tieneSubcuentas && expandido && (
                                                                <div style={{ background: "#f8fafc", padding: "4px 8px 6px 36px", borderLeft: "2px solid #cbd5e1", marginBottom: "4px" }}>
                                                                    {cuenta.subcuentas.map((sub, idx) => (
                                                                        <div key={`${cuenta.codigo}-sub-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: "12px", color: "#475569" }}>
                                                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                                                <span style={{ fontFamily: "ui-monospace, monospace", color: "#64748b", minWidth: "55px" }}>{sub.codigo}</span>
                                                                                <span>{sub.concepto}</span>
                                                                                {sub.nota && <span style={{ fontSize: "10.5px", background: "#e2e8f0", padding: "1px 5px", borderRadius: "3px", color: "#475569" }}>{sub.nota}</span>}
                                                                            </div>
                                                                            <span style={{ fontVariantNumeric: "tabular-nums", color: "#334155", fontWeight: 500 }}>
                                                                                {formatearMoneda(sub.monto)}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: "1px solid #cbd5e1" }}>
                                            <td colSpan="2" style={{ padding: "10px 4px", fontWeight: 600, color: "#334155" }}>
                                                Total Pasivo Corriente
                                            </td>
                                            <td style={{ textAlign: "right", padding: "10px 4px", fontWeight: 700, color: "#0f172a" }}>
                                                {formatearMoneda(pasivo?.corriente?.total)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* PASIVO NO CORRIENTE */}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <div style={{ borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", marginBottom: "6px" }}>
                                    <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, letterSpacing: "0.5px", color: "#475569" }}>PASIVO NO CORRIENTE</h4>
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                                    <tbody>
                                        {(!pasivo?.noCorriente?.cuentas || pasivo.noCorriente.cuentas.length === 0) ? (
                                            <tr>
                                                <td colSpan="3" style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "12px", padding: "8px 4px" }}>
                                                    Sin deudas a largo plazo registradas
                                                </td>
                                            </tr>
                                        ) : (
                                            pasivo.noCorriente.cuentas.map((cuenta) => {
                                                const tieneSubcuentas = cuenta.subcuentas && cuenta.subcuentas.length > 0;
                                                const expandido = debeMostrarSubcuentas(cuenta.codigo);

                                                return (
                                                    <tr key={cuenta.codigo} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                        <td colSpan="3" style={{ padding: 0 }}>
                                                            <div 
                                                                onClick={() => tieneSubcuentas && toggleExpandirCuenta(cuenta.codigo)}
                                                                style={{ 
                                                                    display: "flex", 
                                                                    justifyContent: "space-between", 
                                                                    alignItems: "center",
                                                                    padding: "7px 4px",
                                                                    cursor: tieneSubcuentas ? "pointer" : "default",
                                                                    background: expandido ? "#f8fafc" : "transparent",
                                                                    borderRadius: "4px"
                                                                }}
                                                            >
                                                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                                                                    {tieneSubcuentas && (
                                                                        <span style={{ color: "#64748b", display: "inline-flex" }}>
                                                                            {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                        </span>
                                                                    )}
                                                                    <span style={{ width: "60px", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#64748b" }}>
                                                                        {cuenta.codigo}
                                                                    </span>
                                                                    <div>
                                                                        <span style={{ fontWeight: 600, color: "#1e293b" }}>{cuenta.concepto}</span>
                                                                        {cuenta.nota && (
                                                                            <small style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>
                                                                                {cuenta.nota}
                                                                            </small>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", paddingRight: "4px", fontWeight: 600, color: "#0f172a" }}>
                                                                    {formatearMoneda(cuenta.monto)}
                                                                </div>
                                                            </div>

                                                            {tieneSubcuentas && expandido && (
                                                                <div style={{ background: "#f8fafc", padding: "4px 8px 6px 36px", borderLeft: "2px solid #cbd5e1", marginBottom: "4px" }}>
                                                                    {cuenta.subcuentas.map((sub, idx) => (
                                                                        <div key={`${cuenta.codigo}-sub-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: "12px", color: "#475569" }}>
                                                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                                                <span style={{ fontFamily: "ui-monospace, monospace", color: "#64748b", minWidth: "55px" }}>{sub.codigo}</span>
                                                                                <span>{sub.concepto}</span>
                                                                                {sub.nota && <span style={{ fontSize: "10.5px", background: "#e2e8f0", padding: "1px 5px", borderRadius: "3px", color: "#475569" }}>{sub.nota}</span>}
                                                                            </div>
                                                                            <span style={{ fontVariantNumeric: "tabular-nums", color: "#334155", fontWeight: 500 }}>
                                                                                {formatearMoneda(sub.monto)}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: "1px solid #cbd5e1" }}>
                                            <td colSpan="2" style={{ padding: "10px 4px", fontWeight: 600, color: "#334155" }}>
                                                Total Pasivo No Corriente
                                            </td>
                                            <td style={{ textAlign: "right", padding: "10px 4px", fontWeight: 700, color: "#0f172a" }}>
                                                {formatearMoneda(pasivo?.noCorriente?.total)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* TOTAL PASIVOS INTERMEDIO */}
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "10px 8px",
                                    borderTop: "1px solid #94a3b8",
                                    borderBottom: "1px solid #94a3b8",
                                    fontSize: "14px",
                                    fontWeight: 700
                                }}
                            >
                                <span>TOTAL PASIVOS</span>
                                <strong>{formatearMoneda(pasivo?.total)}</strong>
                            </div>

                            {/* PATRIMONIO NETO / CAPITAL */}
                            <div style={{ display: "flex", flexDirection: "column", marginTop: "4px" }}>
                                <div style={{ background: "#234c38", color: "#ffffff", padding: "8px 14px", borderRadius: "6px" }}>
                                    <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>
                                        PATRIMONIO NETO
                                    </h3>
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                                    <tbody>
                                        {(!capital?.cuentas || capital.cuentas.length === 0) ? (
                                            <tr>
                                                <td colSpan="3" style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "12px", padding: "8px 4px" }}>
                                                    Sin cuentas de patrimonio registradas
                                                </td>
                                            </tr>
                                        ) : (
                                            capital.cuentas.map((cuenta) => {
                                                const tieneSubcuentas = cuenta.subcuentas && cuenta.subcuentas.length > 0;
                                                const expandido = debeMostrarSubcuentas(cuenta.codigo);

                                                return (
                                                    <tr key={cuenta.codigo} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                        <td colSpan="3" style={{ padding: 0 }}>
                                                            <div 
                                                                onClick={() => tieneSubcuentas && toggleExpandirCuenta(cuenta.codigo)}
                                                                style={{ 
                                                                    display: "flex", 
                                                                    justifyContent: "space-between", 
                                                                    alignItems: "center",
                                                                    padding: "7px 4px",
                                                                    cursor: tieneSubcuentas ? "pointer" : "default",
                                                                    background: expandido ? "#f8fafc" : "transparent",
                                                                    borderRadius: "4px"
                                                                }}
                                                            >
                                                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                                                                    {tieneSubcuentas && (
                                                                        <span style={{ color: "#64748b", display: "inline-flex" }}>
                                                                            {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                        </span>
                                                                    )}
                                                                    <span style={{ width: "60px", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#64748b" }}>
                                                                        {cuenta.codigo}
                                                                    </span>
                                                                    <div>
                                                                        <span style={{ fontWeight: 600, color: "#1e293b" }}>{cuenta.concepto}</span>
                                                                        {cuenta.nota && (
                                                                            <small style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>
                                                                                {cuenta.nota}
                                                                            </small>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", paddingRight: "4px", fontWeight: 600, color: "#0f172a" }}>
                                                                    {formatearMoneda(cuenta.monto)}
                                                                </div>
                                                            </div>

                                                            {tieneSubcuentas && expandido && (
                                                                <div style={{ background: "#f8fafc", padding: "4px 8px 6px 36px", borderLeft: "2px solid #cbd5e1", marginBottom: "4px" }}>
                                                                    {cuenta.subcuentas.map((sub, idx) => (
                                                                        <div key={`${cuenta.codigo}-sub-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: "12px", color: "#475569" }}>
                                                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                                                <span style={{ fontFamily: "ui-monospace, monospace", color: "#64748b", minWidth: "55px" }}>{sub.codigo}</span>
                                                                                <span>{sub.concepto}</span>
                                                                                {sub.nota && <span style={{ fontSize: "10.5px", background: "#e2e8f0", padding: "1px 5px", borderRadius: "3px", color: "#475569" }}>{sub.nota}</span>}
                                                                            </div>
                                                                            <span style={{ fontVariantNumeric: "tabular-nums", color: "#334155", fontWeight: 500 }}>
                                                                                {formatearMoneda(sub.monto)}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: "1px solid #cbd5e1" }}>
                                            <td colSpan="2" style={{ padding: "10px 4px", fontWeight: 600, color: "#334155" }}>
                                                Total Patrimonio Neto
                                            </td>
                                            <td style={{ textAlign: "right", padding: "10px 4px", fontWeight: 700, color: "#0f172a" }}>
                                                {formatearMoneda(capital?.total)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* TOTAL PASIVO + CAPITAL */}
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "12px 10px",
                                    borderTop: "2px solid #0f172a",
                                    borderBottom: "3px double #0f172a",
                                    fontSize: "15px",
                                    fontWeight: 800,
                                    background: "rgba(27, 67, 50, 0.05)",
                                    marginTop: "10px"
                                }}
                            >
                                <span>TOTAL PASIVO Y PATRIMONIO</span>
                                <strong style={{ fontSize: "16px" }}>{formatearMoneda(totalPasivoCapital)}</strong>
                            </div>
                        </section>
                    </div>
                )}

                {/* Firmas Reglamentarias Contables */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "24px",
                        marginTop: "48px",
                        paddingTop: "24px"
                    }}
                >
                    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: "80%", borderBottom: "1px solid #94a3b8", marginBottom: "8px" }} />
                        <p style={{ margin: "0 0 2px 0", fontSize: "13px", fontWeight: 700 }}>Representante Legal</p>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>Gerencia General</span>
                    </div>
                    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: "80%", borderBottom: "1px solid #94a3b8", marginBottom: "8px" }} />
                        <p style={{ margin: "0 0 2px 0", fontSize: "13px", fontWeight: 700 }}>Contador General</p>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>Reg. Profesional N° 45892</span>
                    </div>
                    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: "80%", borderBottom: "1px solid #94a3b8", marginBottom: "8px" }} />
                        <p style={{ margin: "0 0 2px 0", fontSize: "13px", fontWeight: 700 }}>Auditor Externo</p>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>Dictamen e Informe Fiscal</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default BalanceGeneral;
