import React, { useEffect, useMemo, useState } from "react";
import { obtenerRatiosFinancieros } from "../services/ratiosService";
import { obtenerDatosKardex } from "../services/kardexService";

// Helper para formatear fechas a YYYY-MM-DD
function fechaIso(date) {
    const d = new Date(date);
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mes}-${dia}`;
}

// Opciones rápidas de fechas
function obtenerRangoRapido(opcion) {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = hoy.getMonth();

    if (opcion === "hoy") {
        const hStr = fechaIso(hoy);
        return { desde: hStr, hasta: hStr };
    }

    if (opcion === "mes") {
        const primerDia = new Date(anio, mes, 1);
        const ultimoDia = new Date(anio, mes + 1, 0);
        return { desde: fechaIso(primerDia), hasta: fechaIso(ultimoDia) };
    }

    if (opcion === "trimestre") {
        const inicioTrimestreMes = Math.floor(mes / 3) * 3;
        const primerDia = new Date(anio, inicioTrimestreMes, 1);
        const ultimoDia = new Date(anio, inicioTrimestreMes + 3, 0);
        return { desde: fechaIso(primerDia), hasta: fechaIso(ultimoDia) };
    }

    if (opcion === "anio") {
        return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
    }

    return null;
}

// Mini Gráfico de línea en SVG puro para visualizar la evolución mensual
function MiniGraficoTendencia({ datos = [], color = "#1B4332", unidad = "" }) {
    const [puntoHover, setPuntoHover] = useState(null);

    const puntosValidos = useMemo(() => {
        return (datos || [])
            .filter(d => d && d.mes && d.valor !== null && d.valor !== undefined && !isNaN(d.valor))
            .map(d => ({
                mes: d.mes,
                valor: Number(d.valor)
            }));
    }, [datos]);

    if (!puntosValidos || puntosValidos.length < 2) {
        return (
            <div style={{ fontSize: "11px", color: "#64748b", fontStyle: "italic", padding: "6px 0" }}>
                Tendencia histórica no disponible para este rango
            </div>
        );
    }

    const valores = puntosValidos.map(p => p.valor);
    const minVal = Math.min(...valores);
    const maxVal = Math.max(...valores);
    const rango = maxVal - minVal === 0 ? 1 : maxVal - minVal;

    const width = 240;
    const height = 50;
    const paddingX = 14;
    const paddingY = 8;

    const coords = puntosValidos.map((p, i) => {
        const x = paddingX + (i / (puntosValidos.length - 1)) * (width - paddingX * 2);
        const y = height - paddingY - ((p.valor - minVal) / rango) * (height - paddingY * 2);
        return { x, y, mes: p.mes, valor: p.valor };
    });

    const pathD = coords.reduce((acc, pt, idx) => {
        return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
    }, "");

    const areaD = `${pathD} L ${coords[coords.length - 1].x},${height} L ${coords[0].x},${height} Z`;
    const gradientId = `grad-${Math.random().toString(36).substring(2, 9)}`;

    return (
        <div style={{ position: "relative", width: "100%", maxWidth: "260px" }}>
            <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                    </linearGradient>
                </defs>

                <path d={areaD} fill={`url(#${gradientId})`} />
                <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                {coords.map((pt, i) => (
                    <g key={i}>
                        <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={puntoHover === i ? 4 : 2.5}
                            fill={puntoHover === i ? "#ffffff" : color}
                            stroke={color}
                            strokeWidth="2"
                            style={{ cursor: "pointer", transition: "r 0.15s ease" }}
                            onMouseEnter={() => setPuntoHover(i)}
                            onMouseLeave={() => setPuntoHover(null)}
                        />
                    </g>
                ))}
            </svg>

            {puntoHover !== null && coords[puntoHover] && (
                <div
                    style={{
                        position: "absolute",
                        top: "-26px",
                        left: `${(coords[puntoHover].x / width) * 100}%`,
                        transform: "translateX(-50%)",
                        background: "#1B4332",
                        color: "#ffffff",
                        padding: "2px 7px",
                        borderRadius: "4px",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        boxShadow: "0 2px 5px rgba(0,0,0,0.15)",
                        zIndex: 10
                    }}
                >
                    {coords[puntoHover].mes}: {coords[puntoHover].valor.toFixed(2)} {unidad}
                </div>
            )}
        </div>
    );
}

export function RatiosFinancieros() {
    const anioActual = new Date().getFullYear();
    const [desde, setDesde] = useState(`${anioActual}-01-01`);
    const [hasta, setHasta] = useState(`${anioActual}-12-31`);
    const [opcionRapida, setOpcionRapida] = useState("anio");

    const [datosRatios, setDatosRatios] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);

    const [seccionActiva, setSeccionActiva] = useState("todas");
    const [mostrarFormulas, setMostrarFormulas] = useState(false);

    const cargarRatios = async (fechaInicio, fechaFin) => {
        setCargando(true);
        setError(null);
        try {
            let invFinal = null;
            try {
                const kardex = await obtenerDatosKardex({ fechaFin: fechaFin || "" });
                const saldo = Number(kardex?.totales?.saldo_final ?? 0);
                if (saldo > 0) invFinal = saldo;
            } catch (errKardex) {
                console.warn("Kardex no disponible directamente:", errKardex);
            }

            const data = await obtenerRatiosFinancieros({
                desde: fechaInicio,
                hasta: fechaFin,
                inventarioFinal: invFinal
            });

            setDatosRatios(data);
        } catch (err) {
            console.error("Error al obtener los ratios financieros:", err);
            setError(err.message || "No se pudieron cargar los ratios financieros con los datos del sistema.");
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargarRatios(desde, hasta);
    }, [desde, hasta]);

    const manejarOpcionRapida = (opcion) => {
        setOpcionRapida(opcion);
        if (opcion === "personalizado") return;
        const rango = obtenerRangoRapido(opcion);
        if (rango) {
            setDesde(rango.desde);
            setHasta(rango.hasta);
        }
    };

    // Paleta de estados en armonía con el verde institucional y fondo claro
    const getEstadoBadge = (estado) => {
        if (estado === "saludable") {
            return {
                label: "Saludable",
                bg: "#EAF5EE",
                border: "#B7E4C7",
                color: "#1B4332",
                chartColor: "#2D6A4F",
                icon: "✓"
            };
        }
        if (estado === "alerta") {
            return {
                label: "Atención",
                bg: "#FFF9E6",
                border: "#FED7AA",
                color: "#9A3412",
                chartColor: "#C2410C",
                icon: "!"
            };
        }
        if (estado === "critico") {
            return {
                label: "Riesgo",
                bg: "#FDF2F2",
                border: "#FECACA",
                color: "#991B1B",
                chartColor: "#DC2626",
                icon: "✕"
            };
        }
        return {
            label: "Informativo",
            bg: "#F8FAFC",
            border: "#DDE3E0",
            color: "#475569",
            chartColor: "#52B788",
            icon: "ℹ"
        };
    };

    const secciones = datosRatios?.secciones || {};
    const promedios = datosRatios?.promediosInfo || {};

    return (
        <section className="bg-section" style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px 20px" }}>
            
            {/* Cabecera Principal */}
            <header style={{ marginBottom: "22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                        <span style={{ fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--accent, #1B4332)" }}>
                            ContaCabal • Análisis Financiero
                        </span>
                        <h1 style={{ fontSize: "28px", fontWeight: 800, margin: "4px 0 6px 0", color: "var(--text-h, #1C2321)" }}>
                            Ratios Financieros
                        </h1>
                        <p style={{ margin: 0, fontSize: "14px", color: "#55655D" }}>
                            Indicadores calculados con datos reales del Libro Mayor, Balance General, Estado de Resultados y Kardex.
                        </p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <button
                            type="button"
                            onClick={() => window.print()}
                            style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                padding: "8px 14px",
                                borderRadius: "8px",
                                border: "1px solid var(--border, #DDE3E0)",
                                background: "var(--panel, #FFFFFF)",
                                color: "var(--accent, #1B4332)",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px"
                            }}
                        >
                            <span>🖨️</span> Imprimir reporte
                        </button>

                        <button
                            type="button"
                            onClick={() => setMostrarFormulas(!mostrarFormulas)}
                            style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                padding: "8px 15px",
                                borderRadius: "8px",
                                border: "1px solid var(--border, #DDE3E0)",
                                background: mostrarFormulas ? "var(--accent-soft, #E3EFE7)" : "var(--panel, #FFFFFF)",
                                color: "var(--accent, #1B4332)",
                                cursor: "pointer",
                                transition: "all 0.15s ease"
                            }}
                        >
                            {mostrarFormulas ? "Ocultar fórmulas" : "Ver fórmulas y sustitución"}
                        </button>
                    </div>
                </div>

                {/* Barra de Filtro Global de Fechas con diseño Verde y Claro */}
                <div
                    style={{
                        marginTop: "18px",
                        padding: "16px 20px",
                        borderRadius: "10px",
                        background: "var(--panel, #FFFFFF)",
                        border: "1px solid var(--border, #DDE3E0)",
                        boxShadow: "0 2px 8px rgba(27, 67, 50, 0.04)"
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                        
                        {/* Botones de Selección Rápida */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text, #1C2321)", marginRight: "4px" }}>
                                Período:
                            </span>
                            {[
                                { id: "hoy", label: "Hoy" },
                                { id: "mes", label: "Este mes" },
                                { id: "trimestre", label: "Este trimestre" },
                                { id: "anio", label: "Este año" },
                                { id: "personalizado", label: "Personalizado" }
                            ].map((btn) => {
                                const activo = opcionRapida === btn.id;
                                return (
                                    <button
                                        key={btn.id}
                                        type="button"
                                        onClick={() => manejarOpcionRapida(btn.id)}
                                        style={{
                                            fontSize: "12.5px",
                                            fontWeight: activo ? 700 : 500,
                                            padding: "6px 13px",
                                            borderRadius: "6px",
                                            cursor: "pointer",
                                            border: activo ? "1px solid var(--accent, #1B4332)" : "1px solid var(--border, #DDE3E0)",
                                            background: activo ? "var(--accent, #1B4332)" : "var(--panel, #FFFFFF)",
                                            color: activo ? "#FFFFFF" : "var(--text, #1C2321)",
                                            transition: "all 0.15s ease"
                                        }}
                                    >
                                        {btn.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Controles de Fechas Desde y Hasta */}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <label htmlFor="filtro-desde" style={{ fontSize: "12.5px", fontWeight: 600, color: "#55655D" }}>
                                    Desde:
                                </label>
                                <input
                                    id="filtro-desde"
                                    type="date"
                                    value={desde}
                                    onChange={(e) => {
                                        setOpcionRapida("personalizado");
                                        setDesde(e.target.value);
                                    }}
                                    style={{
                                        fontSize: "13px",
                                        padding: "6px 10px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border, #DDE3E0)",
                                        background: "var(--panel, #FFFFFF)",
                                        color: "var(--text, #1C2321)"
                                    }}
                                />
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <label htmlFor="filtro-hasta" style={{ fontSize: "12.5px", fontWeight: 600, color: "#55655D" }}>
                                    Hasta (corte):
                                </label>
                                <input
                                    id="filtro-hasta"
                                    type="date"
                                    value={hasta}
                                    onChange={(e) => {
                                        setOpcionRapida("personalizado");
                                        setHasta(e.target.value);
                                    }}
                                    style={{
                                        fontSize: "13px",
                                        padding: "6px 10px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border, #DDE3E0)",
                                        background: "var(--panel, #FFFFFF)",
                                        color: "var(--text, #1C2321)"
                                    }}
                                />
                            </div>

                            <button
                                type="button"
                                onClick={() => cargarRatios(desde, hasta)}
                                disabled={cargando}
                                style={{
                                    fontSize: "13px",
                                    fontWeight: 700,
                                    padding: "6px 16px",
                                    borderRadius: "6px",
                                    background: "var(--accent, #1B4332)",
                                    color: "#FFFFFF",
                                    border: "none",
                                    cursor: cargando ? "wait" : "pointer",
                                    transition: "background 0.15s ease"
                                }}
                            >
                                {cargando ? "Calculando..." : "Actualizar"}
                            </button>
                        </div>
                    </div>

                    {/* Nota técnica de metodología contable */}
                    <div
                        style={{
                            marginTop: "12px",
                            paddingTop: "10px",
                            borderTop: "1px dashed var(--border, #DDE3E0)",
                            fontSize: "12px",
                            color: "#55655D",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap"
                        }}
                    >
                        <span style={{ fontWeight: 700, color: "var(--accent, #1B4332)" }}>
                            ℹ Metodología Contable:
                        </span>
                        <span>
                            <strong>Ratios de flujo:</strong> suman movimientos del período [{desde} al {hasta}].
                        </span>
                        <span>•</span>
                        <span>
                            <strong>Ratios de saldo:</strong> acumulan histórico a la fecha de corte [{hasta}].
                        </span>
                    </div>
                </div>

                {/* Pestañas de Navegación por Sub-Secciones */}
                <div style={{ display: "flex", gap: "8px", marginTop: "18px", borderBottom: "1px solid var(--border, #DDE3E0)", paddingBottom: "2px", overflowX: "auto" }}>
                    {[
                        { id: "todas", label: "Todas las secciones" },
                        { id: "liquidez", label: "1. Liquidez" },
                        { id: "rentabilidad", label: "2. Rentabilidad" },
                        { id: "solvencia", label: "3. Solvencia" },
                        { id: "eficiencia", label: "4. Eficiencia" }
                    ].map((tab) => {
                        const activo = seccionActiva === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setSeccionActiva(tab.id)}
                                style={{
                                    fontSize: "13.5px",
                                    fontWeight: activo ? 800 : 500,
                                    padding: "9px 16px",
                                    border: "none",
                                    borderBottom: activo ? "3px solid var(--accent, #1B4332)" : "3px solid transparent",
                                    background: "transparent",
                                    color: activo ? "var(--accent, #1B4332)" : "#55655D",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                    whiteSpace: "nowrap"
                                }}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </header>

            {/* Estado de Carga y Errores */}
            {cargando && (
                <div style={{ padding: "40px 20px", textAlign: "center", background: "var(--panel, #FFFFFF)", borderRadius: "10px", border: "1px solid var(--border, #DDE3E0)" }}>
                    <p style={{ margin: 0, fontSize: "15px", color: "var(--accent, #1B4332)", fontWeight: 700 }}>
                        Calculando ratios financieros con datos contables reales...
                    </p>
                </div>
            )}

            {error && (
                <div style={{ padding: "16px 20px", background: "#FDF2F2", border: "1px solid #FECACA", borderRadius: "10px", color: "#991B1B", marginBottom: "20px" }}>
                    <strong>Error al procesar ratios:</strong> {error}
                </div>
            )}

            {/* Contenido Principal de Ratios */}
            {!cargando && !error && datosRatios && (
                <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

                    {/* Resumen de Promedios Ponderados Usados */}
                    {promedios.cuentasCobrar && (
                        <div
                            style={{
                                background: "var(--accent-soft, #E3EFE7)",
                                border: "1px solid var(--accent-border, #DDE3E0)",
                                borderRadius: "10px",
                                padding: "14px 18px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: "12px"
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "16px" }}>📊</span>
                                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--accent, #1B4332)" }}>
                                    Base de Promedios Contables:
                                </span>
                            </div>
                            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", fontSize: "12.5px", color: "#1C2321" }}>
                                <span>
                                    <strong>Inventario Prom.:</strong> (${Number(promedios.inventario?.inicial || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} + ${Number(promedios.inventario?.final || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}) / 2 = <strong>${Number(promedios.inventario?.promedio || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong>
                                </span>
                                <span>•</span>
                                <span>
                                    <strong>CxC Promedio:</strong> (${Number(promedios.cuentasCobrar?.inicial || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} + ${Number(promedios.cuentasCobrar?.final || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}) / 2 = <strong>${Number(promedios.cuentasCobrar?.promedio || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong>
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* 1. SECCIÓN DE LIQUIDEZ                                    */}
                    {/* ========================================================= */}
                    {(seccionActiva === "todas" || seccionActiva === "liquidez") && secciones.liquidez && (
                        <div style={{ background: "var(--panel, #FFFFFF)", borderRadius: "10px", border: "1px solid var(--border, #DDE3E0)", padding: "22px", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
                            <div style={{ marginBottom: "16px", borderBottom: "1px solid #EEF2F0", paddingBottom: "10px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ background: "var(--accent-soft, #E3EFE7)", color: "var(--accent, #1B4332)", fontWeight: 800, fontSize: "13px", padding: "3px 8px", borderRadius: "5px" }}>
                                        01
                                    </span>
                                    <h2 style={{ fontSize: "19px", fontWeight: 800, margin: 0, color: "var(--text-h, #1C2321)" }}>
                                        {secciones.liquidez.titulo}
                                    </h2>
                                    <span style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                                        (Fuente: Balance General acumulado al {hasta})
                                    </span>
                                </div>
                                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#55655D" }}>
                                    {secciones.liquidez.descripcion}
                                </p>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
                                {secciones.liquidez.ratios.map((ratio) => {
                                    const badge = getEstadoBadge(ratio.estado);
                                    return (
                                        <div
                                            key={ratio.id}
                                            style={{
                                                padding: "18px",
                                                borderRadius: "8px",
                                                border: "1px solid var(--border, #DDE3E0)",
                                                background: "var(--panel, #FFFFFF)",
                                                display: "flex",
                                                flexDirection: "column",
                                                justifyContent: "space-between",
                                                gap: "12px",
                                                boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
                                            }}
                                        >
                                            <div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                                                    <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "var(--text-h, #1C2321)" }}>
                                                        {ratio.nombre}
                                                    </h3>
                                                    <span
                                                        style={{
                                                            fontSize: "11px",
                                                            fontWeight: 700,
                                                            padding: "3px 8px",
                                                            borderRadius: "20px",
                                                            background: badge.bg,
                                                            border: `1px solid ${badge.border}`,
                                                            color: badge.color,
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: "4px",
                                                            whiteSpace: "nowrap"
                                                        }}
                                                    >
                                                        <span>{badge.icon}</span>
                                                        {badge.label}
                                                    </span>
                                                </div>

                                                <div style={{ margin: "12px 0 6px 0" }}>
                                                    <span style={{ fontSize: "27px", fontWeight: 800, color: "var(--text-h, #1C2321)", fontFamily: "ui-monospace, monospace" }}>
                                                        {ratio.formato}
                                                    </span>
                                                    <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
                                                        (Saludable: {ratio.rangoSaludable})
                                                    </span>
                                                </div>

                                                <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#334155", lineHeight: 1.5 }}>
                                                    {ratio.interpretacion}
                                                </p>

                                                {mostrarFormulas && (
                                                    <div style={{ background: "var(--bg, #F6F7F8)", padding: "9px 12px", borderRadius: "6px", border: "1px solid var(--border, #DDE3E0)", fontSize: "11.5px", color: "#475569", marginBottom: "10px" }}>
                                                        <div style={{ fontWeight: 600, color: "var(--accent, #1B4332)" }}>Fórmula: {ratio.formula}</div>
                                                        <div style={{ color: "#64748b", marginTop: "2px" }}>Sustitución: {ratio.valoresCalculo}</div>
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ borderTop: "1px solid #EEF2F0", paddingTop: "10px" }}>
                                                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent, #1B4332)", textTransform: "uppercase", marginBottom: "4px" }}>
                                                    Evolución Mensual:
                                                </div>
                                                <MiniGraficoTendencia datos={ratio.tendencia} color={badge.chartColor} unidad={ratio.tipo === "moneda" ? "$" : "x"} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* 2. SECCIÓN DE RENTABILIDAD                                */}
                    {/* ========================================================= */}
                    {(seccionActiva === "todas" || seccionActiva === "rentabilidad") && secciones.rentabilidad && (
                        <div style={{ background: "var(--panel, #FFFFFF)", borderRadius: "10px", border: "1px solid var(--border, #DDE3E0)", padding: "22px", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
                            <div style={{ marginBottom: "16px", borderBottom: "1px solid #EEF2F0", paddingBottom: "10px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ background: "var(--accent-soft, #E3EFE7)", color: "var(--accent, #1B4332)", fontWeight: 800, fontSize: "13px", padding: "3px 8px", borderRadius: "5px" }}>
                                        02
                                    </span>
                                    <h2 style={{ fontSize: "19px", fontWeight: 800, margin: 0, color: "var(--text-h, #1C2321)" }}>
                                        {secciones.rentabilidad.titulo}
                                    </h2>
                                    <span style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                                        (Fuente: Estado de Resultados en rango + Balance)
                                    </span>
                                </div>
                                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#55655D" }}>
                                    {secciones.rentabilidad.descripcion}
                                </p>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
                                {secciones.rentabilidad.ratios.map((ratio) => {
                                    const badge = getEstadoBadge(ratio.estado);
                                    return (
                                        <div
                                            key={ratio.id}
                                            style={{
                                                padding: "18px",
                                                borderRadius: "8px",
                                                border: "1px solid var(--border, #DDE3E0)",
                                                background: "var(--panel, #FFFFFF)",
                                                display: "flex",
                                                flexDirection: "column",
                                                justifyContent: "space-between",
                                                gap: "12px",
                                                boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
                                            }}
                                        >
                                            <div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                                                    <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "var(--text-h, #1C2321)" }}>
                                                        {ratio.nombre}
                                                    </h3>
                                                    <span
                                                        style={{
                                                            fontSize: "11px",
                                                            fontWeight: 700,
                                                            padding: "3px 8px",
                                                            borderRadius: "20px",
                                                            background: badge.bg,
                                                            border: `1px solid ${badge.border}`,
                                                            color: badge.color,
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: "4px",
                                                            whiteSpace: "nowrap"
                                                        }}
                                                    >
                                                        <span>{badge.icon}</span>
                                                        {badge.label}
                                                    </span>
                                                </div>

                                                <div style={{ margin: "12px 0 6px 0" }}>
                                                    <span style={{ fontSize: "27px", fontWeight: 800, color: "var(--text-h, #1C2321)", fontFamily: "ui-monospace, monospace" }}>
                                                        {ratio.formato}
                                                    </span>
                                                    <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
                                                        (Saludable: {ratio.rangoSaludable})
                                                    </span>
                                                </div>

                                                <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#334155", lineHeight: 1.5 }}>
                                                    {ratio.interpretacion}
                                                </p>

                                                {mostrarFormulas && (
                                                    <div style={{ background: "var(--bg, #F6F7F8)", padding: "9px 12px", borderRadius: "6px", border: "1px solid var(--border, #DDE3E0)", fontSize: "11.5px", color: "#475569", marginBottom: "10px" }}>
                                                        <div style={{ fontWeight: 600, color: "var(--accent, #1B4332)" }}>Fórmula: {ratio.formula}</div>
                                                        <div style={{ color: "#64748b", marginTop: "2px" }}>Sustitución: {ratio.valoresCalculo}</div>
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ borderTop: "1px solid #EEF2F0", paddingTop: "10px" }}>
                                                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent, #1B4332)", textTransform: "uppercase", marginBottom: "4px" }}>
                                                    Evolución Mensual:
                                                </div>
                                                <MiniGraficoTendencia datos={ratio.tendencia} color={badge.chartColor} unidad="%" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Panel Especial de Desglose DuPont */}
                            {secciones.rentabilidad.dupont && (
                                <div
                                    style={{
                                        marginTop: "22px",
                                        padding: "18px 20px",
                                        borderRadius: "8px",
                                        background: "var(--accent-soft, #E3EFE7)",
                                        border: "1px solid var(--accent-border, #DDE3E0)"
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "var(--accent, #1B4332)" }}>
                                                Análisis DuPont (Desglose del ROE)
                                            </h4>
                                            <p style={{ margin: "2px 0 0 0", fontSize: "12.5px", color: "#55655D" }}>
                                                {secciones.rentabilidad.dupont.explicacion}
                                            </p>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <span style={{ fontSize: "12px", color: "#55655D" }}>ROE DuPont Calculado:</span>
                                            <strong style={{ display: "block", fontSize: "20px", color: "var(--accent, #1B4332)" }}>
                                                {Number(secciones.rentabilidad.dupont.roe || 0).toFixed(2)}%
                                            </strong>
                                        </div>
                                    </div>

                                    {Array.isArray(secciones.rentabilidad.dupont.componentes) && secciones.rentabilidad.dupont.componentes.length > 0 && (
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                                            {secciones.rentabilidad.dupont.componentes.map((comp, idx) => (
                                                <div key={idx} style={{ background: "var(--panel, #FFFFFF)", padding: "12px 14px", borderRadius: "6px", border: "1px solid var(--border, #DDE3E0)" }}>
                                                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                                                        {comp.nombre}
                                                    </span>
                                                    <div style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-h, #1C2321)", margin: "4px 0" }}>
                                                        {comp.formato}
                                                    </div>
                                                    <span style={{ fontSize: "11.5px", color: "#55655D" }}>
                                                        {comp.detalle}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* 3. SECCIÓN DE SOLVENCIA                                   */}
                    {/* ========================================================= */}
                    {(seccionActiva === "todas" || seccionActiva === "solvencia") && secciones.solvencia && (
                        <div style={{ background: "var(--panel, #FFFFFF)", borderRadius: "10px", border: "1px solid var(--border, #DDE3E0)", padding: "22px", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
                            <div style={{ marginBottom: "16px", borderBottom: "1px solid #EEF2F0", paddingBottom: "10px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ background: "var(--accent-soft, #E3EFE7)", color: "var(--accent, #1B4332)", fontWeight: 800, fontSize: "13px", padding: "3px 8px", borderRadius: "5px" }}>
                                        03
                                    </span>
                                    <h2 style={{ fontSize: "19px", fontWeight: 800, margin: 0, color: "var(--text-h, #1C2321)" }}>
                                        {secciones.solvencia.titulo}
                                    </h2>
                                    <span style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                                        (Fuente: Balance General + Gastos Financieros)
                                    </span>
                                </div>
                                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#55655D" }}>
                                    {secciones.solvencia.descripcion}
                                </p>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
                                {secciones.solvencia.ratios.map((ratio) => {
                                    const badge = getEstadoBadge(ratio.estado);
                                    return (
                                        <div
                                            key={ratio.id}
                                            style={{
                                                padding: "18px",
                                                borderRadius: "8px",
                                                border: "1px solid var(--border, #DDE3E0)",
                                                background: "var(--panel, #FFFFFF)",
                                                display: "flex",
                                                flexDirection: "column",
                                                justifyContent: "space-between",
                                                gap: "12px",
                                                boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
                                            }}
                                        >
                                            <div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                                                    <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "var(--text-h, #1C2321)" }}>
                                                        {ratio.nombre}
                                                    </h3>
                                                    <span
                                                        style={{
                                                            fontSize: "11px",
                                                            fontWeight: 700,
                                                            padding: "3px 8px",
                                                            borderRadius: "20px",
                                                            background: badge.bg,
                                                            border: `1px solid ${badge.border}`,
                                                            color: badge.color,
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: "4px",
                                                            whiteSpace: "nowrap"
                                                        }}
                                                    >
                                                        <span>{badge.icon}</span>
                                                        {badge.label}
                                                    </span>
                                                </div>

                                                <div style={{ margin: "12px 0 6px 0" }}>
                                                    <span style={{ fontSize: "27px", fontWeight: 800, color: "var(--text-h, #1C2321)", fontFamily: "ui-monospace, monospace" }}>
                                                        {ratio.formato}
                                                    </span>
                                                    <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
                                                        (Saludable: {ratio.rangoSaludable})
                                                    </span>
                                                </div>

                                                <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#334155", lineHeight: 1.5 }}>
                                                    {ratio.interpretacion}
                                                </p>

                                                {ratio.mensajeNoDisponible && (
                                                    <div style={{ background: "#FFF9E6", padding: "8px 12px", borderRadius: "6px", border: "1px solid #FED7AA", color: "#9A3412", fontSize: "12px", marginBottom: "10px" }}>
                                                        {ratio.mensajeNoDisponible}
                                                    </div>
                                                )}

                                                {mostrarFormulas && (
                                                    <div style={{ background: "var(--bg, #F6F7F8)", padding: "9px 12px", borderRadius: "6px", border: "1px solid var(--border, #DDE3E0)", fontSize: "11.5px", color: "#475569", marginBottom: "10px" }}>
                                                        <div style={{ fontWeight: 600, color: "var(--accent, #1B4332)" }}>Fórmula: {ratio.formula}</div>
                                                        <div style={{ color: "#64748b", marginTop: "2px" }}>Sustitución: {ratio.valoresCalculo}</div>
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ borderTop: "1px solid #EEF2F0", paddingTop: "10px" }}>
                                                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent, #1B4332)", textTransform: "uppercase", marginBottom: "4px" }}>
                                                    Evolución Mensual:
                                                </div>
                                                <MiniGraficoTendencia datos={ratio.tendencia} color={badge.chartColor} unidad={ratio.tipo === "porcentaje" ? "%" : "x"} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* 4. SECCIÓN DE EFICIENCIA OPERATIVA                        */}
                    {/* ========================================================= */}
                    {(seccionActiva === "todas" || seccionActiva === "eficiencia") && secciones.eficiencia && (
                        <div style={{ background: "var(--panel, #FFFFFF)", borderRadius: "10px", border: "1px solid var(--border, #DDE3E0)", padding: "22px", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
                            <div style={{ marginBottom: "16px", borderBottom: "1px solid #EEF2F0", paddingBottom: "10px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ background: "var(--accent-soft, #E3EFE7)", color: "var(--accent, #1B4332)", fontWeight: 800, fontSize: "13px", padding: "3px 8px", borderRadius: "5px" }}>
                                        04
                                    </span>
                                    <h2 style={{ fontSize: "19px", fontWeight: 800, margin: 0, color: "var(--text-h, #1C2321)" }}>
                                        {secciones.eficiencia.titulo}
                                    </h2>
                                    <span style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                                        (Fuente: Kardex + Balance General + Estado de Resultados)
                                    </span>
                                </div>
                                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#55655D" }}>
                                    {secciones.eficiencia.descripcion}
                                </p>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
                                {secciones.eficiencia.ratios.map((ratio) => {
                                    const badge = getEstadoBadge(ratio.estado);
                                    return (
                                        <div
                                            key={ratio.id}
                                            style={{
                                                padding: "18px",
                                                borderRadius: "8px",
                                                border: "1px solid var(--border, #DDE3E0)",
                                                background: "var(--panel, #FFFFFF)",
                                                display: "flex",
                                                flexDirection: "column",
                                                justifyContent: "space-between",
                                                gap: "12px",
                                                boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
                                            }}
                                        >
                                            <div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                                                    <div>
                                                        <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "var(--text-h, #1C2321)" }}>
                                                            {ratio.nombre}
                                                        </h3>
                                                        {ratio.notaPromedio && (
                                                            <span style={{ display: "inline-block", fontSize: "11px", color: "var(--accent, #1B4332)", fontWeight: 600, marginTop: "2px" }}>
                                                                * {ratio.notaPromedio}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span
                                                        style={{
                                                            fontSize: "11px",
                                                            fontWeight: 700,
                                                            padding: "3px 8px",
                                                            borderRadius: "20px",
                                                            background: badge.bg,
                                                            border: `1px solid ${badge.border}`,
                                                            color: badge.color,
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: "4px",
                                                            whiteSpace: "nowrap"
                                                        }}
                                                    >
                                                        <span>{badge.icon}</span>
                                                        {badge.label}
                                                    </span>
                                                </div>

                                                <div style={{ margin: "12px 0 6px 0" }}>
                                                    <span style={{ fontSize: "27px", fontWeight: 800, color: "var(--text-h, #1C2321)", fontFamily: "ui-monospace, monospace" }}>
                                                        {ratio.formato}
                                                    </span>
                                                    <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
                                                        (Saludable: {ratio.rangoSaludable})
                                                    </span>
                                                </div>

                                                <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#334155", lineHeight: 1.5 }}>
                                                    {ratio.interpretacion}
                                                </p>

                                                {mostrarFormulas && (
                                                    <div style={{ background: "var(--bg, #F6F7F8)", padding: "9px 12px", borderRadius: "6px", border: "1px solid var(--border, #DDE3E0)", fontSize: "11.5px", color: "#475569", marginBottom: "10px" }}>
                                                        <div style={{ fontWeight: 600, color: "var(--accent, #1B4332)" }}>Fórmula: {ratio.formula}</div>
                                                        <div style={{ color: "#64748b", marginTop: "2px" }}>Sustitución: {ratio.valoresCalculo}</div>
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ borderTop: "1px solid #EEF2F0", paddingTop: "10px" }}>
                                                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent, #1B4332)", textTransform: "uppercase", marginBottom: "4px" }}>
                                                    Evolución Mensual:
                                                </div>
                                                <MiniGraficoTendencia datos={ratio.tendencia} color={badge.chartColor} unidad={ratio.tipo === "dias" ? "días" : "veces"} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Resumen del Ciclo de Conversión de Efectivo (Flujo Temporal) */}
                            {(() => {
                                const cce = datosRatios.secciones?.eficiencia?.ratios?.find(r => r.id === "cicloConversionEfectivo");
                                const d = cce?.detallesCiclo;
                                if (!cce || !d) return null;

                                return (
                                    <div style={{ marginTop: "22px", padding: "18px 20px", borderRadius: "8px", background: "var(--accent-soft, #E3EFE7)", border: "1px solid var(--accent-border, #DDE3E0)" }}>
                                        <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", fontWeight: 800, color: "var(--accent, #1B4332)" }}>
                                            Desglose del Ciclo de Conversión de Efectivo (CCE)
                                        </h4>
                                        <p style={{ margin: "0 0 14px 0", fontSize: "12.5px", color: "#55655D" }}>
                                            Mide el tiempo neto que los recursos monetarios de la empresa quedan inmovilizados en el ciclo productivo y comercial:
                                        </p>

                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                                            <div style={{ flex: 1, minWidth: "130px", background: "var(--panel, #FFFFFF)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border, #DDE3E0)", textAlign: "center" }}>
                                                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>+ DÍAS INVENTARIO</span>
                                                <strong style={{ display: "block", fontSize: "18px", color: "var(--text-h, #1C2321)", marginTop: "2px" }}>{Number(d.diasInventario || 0).toFixed(0)} días</strong>
                                            </div>

                                            <span style={{ fontSize: "16px", fontWeight: 800, color: "var(--accent, #1B4332)" }}>+</span>

                                            <div style={{ flex: 1, minWidth: "130px", background: "var(--panel, #FFFFFF)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border, #DDE3E0)", textAlign: "center" }}>
                                                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>+ PERÍODO COBRO</span>
                                                <strong style={{ display: "block", fontSize: "18px", color: "var(--text-h, #1C2321)", marginTop: "2px" }}>{Number(d.periodoCobro || 0).toFixed(0)} días</strong>
                                            </div>

                                            <span style={{ fontSize: "16px", fontWeight: 800, color: "var(--accent, #1B4332)" }}>−</span>

                                            <div style={{ flex: 1, minWidth: "130px", background: "var(--panel, #FFFFFF)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border, #DDE3E0)", textAlign: "center" }}>
                                                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>− DÍAS PAGO (CXP)</span>
                                                <strong style={{ display: "block", fontSize: "18px", color: "var(--text-h, #1C2321)", marginTop: "2px" }}>{Number(d.diasPago || 0).toFixed(0)} días</strong>
                                            </div>

                                            <span style={{ fontSize: "16px", fontWeight: 800, color: "var(--accent, #1B4332)" }}>=</span>

                                            <div style={{ flex: 1, minWidth: "130px", background: "#EAF5EE", padding: "12px", borderRadius: "6px", border: "1px solid #B7E4C7", textAlign: "center" }}>
                                                <span style={{ fontSize: "11px", fontWeight: 800, color: "#1B4332" }}>= CICLO NETO</span>
                                                <strong style={{ display: "block", fontSize: "20px", color: "#1B4332", marginTop: "2px" }}>{Number(cce.valor || 0).toFixed(0)} días</strong>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

class ErrorBoundaryRatios extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Error en módulo Ratios Financieros:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <section className="bg-section" style={{ maxWidth: "1280px", margin: "0 auto", padding: "30px 20px" }}>
                    <div style={{ background: "#FFFFFF", padding: "32px", borderRadius: "10px", border: "1px solid #FECACA", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", textAlign: "center" }}>
                        <span style={{ fontSize: "36px" }}>⚠️</span>
                        <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#991B1B", margin: "12px 0 8px" }}>
                            Inconveniente al procesar los ratios financieros
                        </h2>
                        <p style={{ color: "#475569", fontSize: "14px", maxWidth: "600px", margin: "0 auto 18px" }}>
                            {this.state.error?.message || "Detalle no disponible"}
                        </p>
                        <button
                            type="button"
                            onClick={() => this.setState({ hasError: false, error: null })}
                            style={{
                                background: "#1B4332",
                                color: "#FFFFFF",
                                padding: "8px 20px",
                                borderRadius: "6px",
                                border: "none",
                                fontWeight: 700,
                                cursor: "pointer"
                            }}
                        >
                            Reintentar carga
                        </button>
                    </div>
                </section>
            );
        }
        return this.props.children;
    }
}

export default function RatiosFinancierosConError(props) {
    return (
        <ErrorBoundaryRatios>
            <RatiosFinancieros {...props} />
        </ErrorBoundaryRatios>
    );
}

