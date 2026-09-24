import { useMemo, useState } from "react";
import LibroMayor from "./LibroMayor";
import LibroDiario from "./LibroDiario";
import KardexPage from "./KardexPage";
import Estadoresultados from "./Estadoresultados";
import BalanceGeneral from "./BalanceGeneral";
import CatalogoCuentas from "./CatalogoCuentas";
import { exportarTablaComparativaPDF, exportarTablaComparativaExcel } from "../services/exportationService";
import { registrarAccionAuditoria } from "../services/auditoriaService";
import ExportarPdfButton from "./ExportarPdfButton";

// Opciones disponibles para comparar
const OPCIONES_VISTAS = [
    { id: "mayor", nombre: "Libro Mayor", tieneFechas: true },
    { id: "diario", nombre: "Libro Diario", tieneFechas: true },
    { id: "kardex", nombre: "Kardex de Inventario", tieneFechas: true },
    { id: "balanceGeneral", nombre: "Balance General", tieneFechas: true },
    { id: "estadoResultados", nombre: "Estado de Resultados", tieneFechas: true },
    { id: "cuentas", nombre: "Catálogo de Cuentas", tieneFechas: false }
];

function hoy() {
    return new Date().toISOString().slice(0, 10);
}

function calcularRangoRapido(opcion) {
    const d = new Date();
    const hoyStr = d.toISOString().slice(0, 10);
    const anio = d.getFullYear();

    switch (opcion) {
        case "hoy":
            return { desde: hoyStr, hasta: hoyStr };

        case "semana": {
            const temp = new Date(d);
            const diaSem = temp.getDay(); // 0 es domingo
            const diff = temp.getDate() - diaSem + (diaSem === 0 ? -6 : 1);
            temp.setDate(diff);
            const lunes = temp.toISOString().slice(0, 10);
            const fin = new Date(temp);
            fin.setDate(fin.getDate() + 6);
            const domingo = fin.toISOString().slice(0, 10);
            return { desde: lunes, hasta: domingo };
        }

        case "mes": {
            const primero = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
            const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
            return { desde: primero, hasta: ultimo };
        }

        case "trimestre": {
            const mesActual = d.getMonth();
            const mesInicio = Math.floor(mesActual / 3) * 3;
            const primero = new Date(d.getFullYear(), mesInicio, 1).toISOString().slice(0, 10);
            const ultimo = new Date(d.getFullYear(), mesInicio + 3, 0).toISOString().slice(0, 10);
            return { desde: primero, hasta: ultimo };
        }

        case "anio":
            return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };

        default:
            return { desde: `${anio}-01-01`, hasta: hoyStr };
    }
}

function formatearFecha(iso) {
    if (!iso) return "";
    const partes = String(iso).slice(0, 10).split("-");
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return iso;
}

function obtenerTablasDeColumna(selector) {
    const columna = document.querySelector(selector);
    if (!columna) return [];

    return Array.from(columna.querySelectorAll("table")).map(tabla => {
        const filas = Array.from(tabla.querySelectorAll("tr")).map(fila =>
            Array.from(fila.querySelectorAll("th, td")).map(celda => celda.textContent.replace(/\s+/g, " ").trim())
        ).filter(fila => fila.length > 0);
        return filas;
    }).filter(filas => filas.length > 0);
}

export default function TablaComparativa({ usuario }) {
    const anioActual = new Date().getFullYear();

    // Selectores de vista
    const [vistaIzq, setVistaIzq] = useState("");
    const [vistaDer, setVistaDer] = useState("");

    // Filtros de fecha independientes - Izquierda
    const [filtroIzq, setFiltroIzq] = useState({
        desde: `${anioActual}-01-01`,
        hasta: hoy(),
        preset: "anio"
    });

    // Filtros de fecha independientes - Derecha
    const [filtroDer, setFiltroDer] = useState({
        desde: `${anioActual}-01-01`,
        hasta: hoy(),
        preset: "anio"
    });

    // Filtros aplicados a los componentes (al pulsar "Aplicar filtros" o "Comparar")
    const [filtrosAplicados, setFiltrosAplicados] = useState({
        izq: { desde: `${anioActual}-01-01`, hasta: hoy() },
        der: { desde: `${anioActual}-01-01`, hasta: hoy() }
    });

    // Indica si se pulsó comparar al menos una vez con ambas vistas seleccionadas
    const [haComparado, setHaComparado] = useState(false);

    // Opciones rápidas de fecha
    const presetsRapidos = [
        { id: "hoy", label: "Hoy" },
        { id: "semana", label: "Esta semana" },
        { id: "mes", label: "Este mes" },
        { id: "trimestre", label: "Este trimestre" },
        { id: "anio", label: "Este año" },
        { id: "personalizado", label: "Personalizado" }
    ];

    function handlePresetIzq(pId) {
        if (pId === "personalizado") {
            setFiltroIzq(prev => ({ ...prev, preset: "personalizado" }));
            return;
        }
        const rango = calcularRangoRapido(pId);
        setFiltroIzq({ desde: rango.desde, hasta: rango.hasta, preset: pId });
    }

    function handlePresetDer(pId) {
        if (pId === "personalizado") {
            setFiltroDer(prev => ({ ...prev, preset: "personalizado" }));
            return;
        }
        const rango = calcularRangoRapido(pId);
        setFiltroDer({ desde: rango.desde, hasta: rango.hasta, preset: pId });
    }

    // Intercambiar vistas y fechas entre izquierda y derecha
    function handleIntercambiar() {
        const vTemporal = vistaIzq;
        setVistaIzq(vistaDer);
        setVistaDer(vTemporal);

        const fTemporal = { ...filtroIzq };
        setFiltroIzq({ ...filtroDer });
        setFiltroDer(fTemporal);

        setFiltrosAplicados({
            izq: { ...filtrosAplicados.der },
            der: { ...filtrosAplicados.izq }
        });
    }

    // Aplicar filtros en ambas columnas
    function handleAplicarFiltros() {
        setFiltrosAplicados({
            izq: { desde: filtroIzq.desde, hasta: filtroIzq.hasta },
            der: { desde: filtroDer.desde, hasta: filtroDer.hasta }
        });
        if (vistaIzq && vistaDer) {
            setHaComparado(true);
        }
    }

    // Acción del botón principal "Comparar"
    function handleComparar() {
        if (!vistaIzq || !vistaDer) return;
        setFiltrosAplicados({
            izq: { desde: filtroIzq.desde, hasta: filtroIzq.hasta },
            der: { desde: filtroDer.desde, hasta: filtroDer.hasta }
        });
        setHaComparado(true);
    }

    // Exportar archivo CSV con el reporte comparativo
    function handleExportarCSV() {
        const infoIzq = OPCIONES_VISTAS.find(v => v.id === vistaIzq)?.nombre || "No seleccionada";
        const infoDer = OPCIONES_VISTAS.find(v => v.id === vistaDer)?.nombre || "No seleccionada";
        const fechaHora = new Date().toLocaleString("es-SV");

        const lineas = [
            `"REPORTE COMPARATIVO DE INFORMACIÓN CONTABLE"`,
            `"Generado: ${fechaHora}"`,
            `"Usuario: ${usuario?.email || "Sistema"}"`,
            `""`,
            `"COLUMNA IZQUIERDA","${infoIzq}"`,
            `"Rango de Fechas:","${formatearFecha(filtrosAplicados.izq.desde)} al ${formatearFecha(filtrosAplicados.izq.hasta)}"`,
            `""`,
            `"COLUMNA DERECHA","${infoDer}"`,
            `"Rango de Fechas:","${formatearFecha(filtrosAplicados.der.desde)} al ${formatearFecha(filtrosAplicados.der.hasta)}"`,
            `""`,
            `"Nota:","Consulte cada reporte en la vista del sistema para explorar los detalles fila por fila."`
        ];

        const csvContent = "\uFEFF" + lineas.join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `Comparativa_${vistaIzq || "V1"}_vs_${vistaDer || "V2"}_${hoy()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        registrarAccionAuditoria({
            tipo_accion: "descargar",
            entidad_afectada: "Reporte",
            descripcion: `Descargó reporte de Tabla Comparativa en CSV (${infoIzq} vs ${infoDer})`
        });
    }

    function handleExportarPDF() {
        exportarTablaComparativaPDF({
            vistaIzquierda: nombreVistaIzq,
            vistaDerecha: nombreVistaDer,
            rangoIzquierda: `${formatearFecha(filtrosAplicados.izq.desde)} al ${formatearFecha(filtrosAplicados.izq.hasta)}`,
            rangoDerecha: `${formatearFecha(filtrosAplicados.der.desde)} al ${formatearFecha(filtrosAplicados.der.hasta)}`,
            usuario: usuario?.email,
            tablasIzquierda: obtenerTablasDeColumna(".comparativa-columna-izq"),
            tablasDerecha: obtenerTablasDeColumna(".comparativa-columna-der")
        });
    }

    function handleExportarExcel() {
        exportarTablaComparativaExcel({
            vistaIzquierda: nombreVistaIzq,
            vistaDerecha: nombreVistaDer,
            rangoIzquierda: `${formatearFecha(filtrosAplicados.izq.desde)} al ${formatearFecha(filtrosAplicados.izq.hasta)}`,
            rangoDerecha: `${formatearFecha(filtrosAplicados.der.desde)} al ${formatearFecha(filtrosAplicados.der.hasta)}`,
            usuario: usuario?.email,
            tablasIzquierda: obtenerTablasDeColumna(".comparativa-columna-izq"),
            tablasDerecha: obtenerTablasDeColumna(".comparativa-columna-der")
        });
    }

    // Helper para renderizar la vista seleccionada dentro de cada columna
    function renderizarVista(vistaId, filtros, lado) {
        if (!vistaId) {
            return (
                <div className="comparativa-empty-panel">
                    <div className="comparativa-empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
                        </svg>
                    </div>
                    <h3>Selecciona una vista</h3>
                    <p>Elige un reporte en el selector superior de la {lado === "izq" ? "columna izquierda" : "columna derecha"} para visualizarlo aquí.</p>
                </div>
            );
        }

        switch (vistaId) {
            case "mayor":
                return (
                    <LibroMayor
                        filtroDesde={filtros.desde}
                        filtroHasta={filtros.hasta}
                        ocultarFiltros={true}
                    />
                );

            case "diario":
                return (
                    <LibroDiario
                        filtroDesde={filtros.desde}
                        filtroHasta={filtros.hasta}
                    />
                );

            case "kardex":
                return (
                    <KardexPage
                        filtroDesde={filtros.desde}
                        filtroHasta={filtros.hasta}
                        ocultarFiltros={true}
                    />
                );

            case "balanceGeneral":
                return (
                    <BalanceGeneral
                        empresa={{ id: usuario?.empresa_id }}
                        fechaDesde={filtros.desde}
                        fechaHasta={filtros.hasta}
                        fechaCorte={filtros.hasta}
                        ocultarFiltros={true}
                    />
                );

            case "estadoResultados":
                return (
                    <Estadoresultados
                        filtroDesde={filtros.desde}
                        filtroHasta={filtros.hasta}
                        ocultarFiltros={true}
                    />
                );

            case "cuentas":
                return <CatalogoCuentas />;

            default:
                return (
                    <div className="banner-error" style={{ margin: "20px" }}>
                        Esta vista aún no está disponible en la tabla comparativa.
                    </div>
                );
        }
    }

    const nombreVistaIzq = OPCIONES_VISTAS.find(v => v.id === vistaIzq)?.nombre;
    const nombreVistaDer = OPCIONES_VISTAS.find(v => v.id === vistaDer)?.nombre;
    const puedeComparar = Boolean(vistaIzq && vistaDer);

    return (
        <section className="view-section comparativa-view">
            {/* Encabezado Principal */}
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Herramientas Contables · Análisis Lado a Lado</p>
                    <h1>Tabla Comparativa</h1>
                </div>
                {/* Botón de exportación */}
                {puedeComparar && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <ExportarPdfButton onExport={handleExportarPDF} onExportExcel={handleExportarExcel} reporte="Tabla Comparativa" disabled={!puedeComparar} />
                        <button
                            type="button"
                            onClick={handleExportarCSV}
                            className="button-secondary"
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                            title="Exportar archivo CSV con los parámetros de la comparación"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                            </svg>
                            Exportar comparación
                        </button>
                    </div>
                )}
            </div>

            {/* Barra de Encabezado con Selectores */}
            <div className="comparativa-header">
                <div className="comparativa-selectores-bar">
                    {/* Selector Columna Izquierda */}
                    <div className="comparativa-dropdown-group">
                        <label htmlFor="select-col-izq">
                            <span style={{ color: "#1b4332", fontWeight: 800 }}>●</span> Columna Izquierda
                        </label>
                        <select
                            id="select-col-izq"
                            value={vistaIzq}
                            onChange={e => setVistaIzq(e.target.value)}
                        >
                            <option value="">Selecciona una vista...</option>
                            {OPCIONES_VISTAS.map(opc => (
                                <option key={opc.id} value={opc.id}>
                                    {opc.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Botón Intercambiar */}
                    <button
                        type="button"
                        onClick={handleIntercambiar}
                        className="comparativa-swap-btn"
                        title="Intercambiar vistas y fechas (↔)"
                        disabled={!vistaIzq && !vistaDer}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M7 16l-4-4 4-4M3 12h14M17 8l4 4-4 4M21 12H7" />
                        </svg>
                    </button>

                    {/* Selector Columna Derecha */}
                    <div className="comparativa-dropdown-group">
                        <label htmlFor="select-col-der">
                            <span style={{ color: "#2563eb", fontWeight: 800 }}>●</span> Columna Derecha
                        </label>
                        <select
                            id="select-col-der"
                            value={vistaDer}
                            onChange={e => setVistaDer(e.target.value)}
                        >
                            <option value="">Selecciona una vista...</option>
                            {OPCIONES_VISTAS.map(opc => (
                                <option key={opc.id} value={opc.id}>
                                    {opc.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Botón Comparar */}
                    <button
                        type="button"
                        onClick={handleComparar}
                        disabled={!puedeComparar}
                        className="button-primary"
                        style={{
                            alignSelf: "flex-end",
                            height: "40px",
                            padding: "0 22px",
                            opacity: puedeComparar ? 1 : 0.5,
                            cursor: puedeComparar ? "pointer" : "not-allowed"
                        }}
                    >
                        Comparar
                    </button>
                </div>
            </div>

            {/* Área de Filtros (Dividida en 2 secciones independientes) */}
            <div className="comparativa-filters-grid">
                {/* Sección Izquierda */}
                <div className="comparativa-filter-panel">
                    <div className="comparativa-filter-title">
                        <span style={{ color: "#1b4332", fontWeight: 800 }}>●</span> Filtros - Columna Izquierda
                    </div>

                    {/* Opciones rápidas */}
                    <div className="comparativa-quick-presets">
                        {presetsRapidos.map(p => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => handlePresetIzq(p.id)}
                                className={`comparativa-preset-btn ${filtroIzq.preset === p.id ? "active" : ""}`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Entradas de Fecha */}
                    <div className="comparativa-date-inputs">
                        <div className="comparativa-field">
                            <label>Fecha inicio:</label>
                            <input
                                type="date"
                                value={filtroIzq.desde}
                                onChange={e => setFiltroIzq(prev => ({
                                    ...prev,
                                    desde: e.target.value,
                                    preset: "personalizado"
                                }))}
                            />
                        </div>
                        <div className="comparativa-field">
                            <label>Fecha fin:</label>
                            <input
                                type="date"
                                value={filtroIzq.hasta}
                                onChange={e => setFiltroIzq(prev => ({
                                    ...prev,
                                    hasta: e.target.value,
                                    preset: "personalizado"
                                }))}
                            />
                        </div>
                    </div>
                </div>

                {/* Sección Derecha */}
                <div className="comparativa-filter-panel">
                    <div className="comparativa-filter-title">
                        <span style={{ color: "#2563eb", fontWeight: 800 }}>●</span> Filtros - Columna Derecha
                    </div>

                    {/* Opciones rápidas */}
                    <div className="comparativa-quick-presets">
                        {presetsRapidos.map(p => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => handlePresetDer(p.id)}
                                className={`comparativa-preset-btn ${filtroDer.preset === p.id ? "active" : ""}`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Entradas de Fecha */}
                    <div className="comparativa-date-inputs">
                        <div className="comparativa-field">
                            <label>Fecha inicio:</label>
                            <input
                                type="date"
                                value={filtroDer.desde}
                                onChange={e => setFiltroDer(prev => ({
                                    ...prev,
                                    desde: e.target.value,
                                    preset: "personalizado"
                                }))}
                            />
                        </div>
                        <div className="comparativa-field">
                            <label>Fecha fin:</label>
                            <input
                                type="date"
                                value={filtroDer.hasta}
                                onChange={e => setFiltroDer(prev => ({
                                    ...prev,
                                    hasta: e.target.value,
                                    preset: "personalizado"
                                }))}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Botón Aplicar Filtros Global */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                    type="button"
                    onClick={handleAplicarFiltros}
                    className="button-primary"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 18px",
                        fontSize: "13.5px"
                    }}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Aplicar filtros a ambas vistas
                </button>
            </div>

            {/* Área de Comparación (Layout responsive de dos columnas de 50%) */}
            <div className="comparativa-split-container comparativa-condensado">
                {/* Columna Izquierda */}
                <div className="comparativa-columna comparativa-columna-izq">
                    <div className="comparativa-columna-header">
                        <span>
                            {nombreVistaIzq
                                ? `${nombreVistaIzq} (${formatearFecha(filtrosAplicados.izq.desde)} - ${formatearFecha(filtrosAplicados.izq.hasta)})`
                                : "Columna Izquierda"}
                        </span>
                        {vistaIzq && (
                            <span className="comparativa-badge-izq">Izquierda</span>
                        )}
                    </div>
                    <div className="comparativa-columna-body">
                        {renderizarVista(vistaIzq, filtrosAplicados.izq, "izq")}
                    </div>
                </div>

                {/* Columna Derecha */}
                <div className="comparativa-columna comparativa-columna-der">
                    <div className="comparativa-columna-header">
                        <span>
                            {nombreVistaDer
                                ? `${nombreVistaDer} (${formatearFecha(filtrosAplicados.der.desde)} - ${formatearFecha(filtrosAplicados.der.hasta)})`
                                : "Columna Derecha"}
                        </span>
                        {vistaDer && (
                            <span className="comparativa-badge-der">Derecha</span>
                        )}
                    </div>
                    <div className="comparativa-columna-body">
                        {renderizarVista(vistaDer, filtrosAplicados.der, "der")}
                    </div>
                </div>
            </div>
        </section>
    );
}
