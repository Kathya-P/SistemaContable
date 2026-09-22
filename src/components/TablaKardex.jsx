import { useMemo, useState } from "react";
import { formatearMoneda } from "../utils/kardexCalculos";

function coincideCuenta(fila, filtro) {
    if (!filtro || filtro === "TODAS") return true;

    const cta = (fila.cuenta || "").toLowerCase().trim();
    const tipo = (fila.tipo || "").toUpperCase();

    switch (filtro) {
        case "INVENTARIO":
            return (
                tipo === "INVENTARIO_INICIAL" ||
                tipo === "INVENTARIO" ||
                cta.includes("inventario")
            );
        case "VENTAS":
            return (
                (tipo === "VENTA" || cta === "ventas") &&
                !cta.includes("devoluci") &&
                !tipo.includes("DEVOLUCION")
            );
        case "COMPRAS":
            return (
                (tipo === "COMPRA" || cta === "compras") &&
                !cta.includes("devoluci") &&
                !tipo.includes("DEVOLUCION")
            );
        case "DEV_COMPRA":
            return (
                tipo === "DEVOLUCION_COMPRA" ||
                (cta.includes("devoluci") && cta.includes("compra"))
            );
        case "DEV_VENTA":
            return (
                tipo === "DEVOLUCION_VENTA" ||
                (cta.includes("devoluci") && cta.includes("venta"))
            );
        default:
            return cta === filtro.toLowerCase().trim();
    }
}

function getFiltroLabel(filtro) {
    switch (filtro) {
        case "INVENTARIO": return "Inventario";
        case "VENTAS": return "Ventas";
        case "COMPRAS": return "Compras";
        case "DEV_COMPRA": return "Dev. sobre compra";
        case "DEV_VENTA": return "Dev. sobre venta";
        default: return filtro;
    }
}

const OPCIONES_FILTRO = [
    { key: "INVENTARIO", label: "Inventario", id: "btn-filtro-cuenta-inventario" },
    { key: "VENTAS", label: "Ventas", id: "btn-filtro-cuenta-ventas" },
    { key: "COMPRAS", label: "Compras", id: "btn-filtro-cuenta-compras" },
    { key: "DEV_COMPRA", label: "Dev. sobre compra", id: "btn-filtro-cuenta-dev-compra" },
    { key: "DEV_VENTA", label: "Dev. sobre venta", id: "btn-filtro-cuenta-dev-venta" }
];

export function TablaKardex({
    filas = [],
    totales = {},
    filtroCuentaProp,
    onCambiarFiltroCuenta
}) {
    const [filtrosLocales, setFiltrosLocales] = useState([]);

    // Filtros activos normalizados (soporta multi-selección)
    const filtrosActivos = useMemo(() => {
        if (filtroCuentaProp !== undefined) {
            if (Array.isArray(filtroCuentaProp)) return filtroCuentaProp.filter(f => f && f !== "TODAS");
            if (filtroCuentaProp === "TODAS" || !filtroCuentaProp) return [];
            return [filtroCuentaProp];
        }
        return filtrosLocales;
    }, [filtroCuentaProp, filtrosLocales]);

    // Alternar selección de un filtro (multi-selección y deselección con clic)
    const handleToggleFiltro = (filtroKey) => {
        const nuevos = filtrosActivos.includes(filtroKey)
            ? filtrosActivos.filter(k => k !== filtroKey)
            : [...filtrosActivos, filtroKey];

        if (onCambiarFiltroCuenta) {
            onCambiarFiltroCuenta(nuevos);
        } else {
            setFiltrosLocales(nuevos);
        }
    };

    const handleLimpiarFiltros = () => {
        if (onCambiarFiltroCuenta) {
            onCambiarFiltroCuenta([]);
        } else {
            setFiltrosLocales([]);
        }
    };

    // Filtrar filas: si no hay filtros activos se muestran todas; si hay filtros, coincide con cualquiera de los seleccionados
    const filasFiltradas = useMemo(() => {
        if (filtrosActivos.length === 0) return filas;
        return filas.filter(f => filtrosActivos.some(k => coincideCuenta(f, k)));
    }, [filas, filtrosActivos]);

    // Totales calculados en función del filtro
    const totalesMostrados = useMemo(() => {
        if (filtrosActivos.length === 0) return totales;

        const totalEntradas = filasFiltradas.reduce((acc, f) => acc + (Number(f.entrada) || 0), 0);
        const totalSalidas = filasFiltradas.reduce((acc, f) => acc + (Number(f.salida) || 0), 0);
        const totalDeudor = filasFiltradas.reduce((acc, f) => acc + (Number(f.deudor) || 0), 0);
        const totalAcreedor = filasFiltradas.reduce((acc, f) => acc + (Number(f.acreedor) || 0), 0);
        const ultimaFila = filasFiltradas[filasFiltradas.length - 1];

        return {
            ...totales,
            total_entradas: totalEntradas,
            total_salidas: totalSalidas,
            total_deudor: totalDeudor,
            total_acreedor: totalAcreedor,
            existencia_final: ultimaFila?.existencias ?? totales.existencia_final,
            costo_promedio_final: ultimaFila?.costo_unitario ?? totales.costo_promedio_final,
            saldo_final: ultimaFila?.saldo ?? totales.saldo_final
        };
    }, [filtrosActivos, filasFiltradas, totales]);

    return (
        <div>
            {/* Barra superior de filtro rápido por Cuenta con selección múltiple */}
            <div className="kardex-cuenta-filter-bar">
                <div className="kardex-cuenta-filter-left">
                    <span className="kardex-filter-label">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "5px" }}>
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                        Filtro de Cuenta:
                    </span>
                    <div className="kardex-pills-group">
                        <button
                            type="button"
                            id="btn-filtro-cuenta-todas"
                            className={`kardex-filter-pill ${filtrosActivos.length === 0 ? "is-active" : ""}`}
                            onClick={handleLimpiarFiltros}
                            title="Ver todos los movimientos"
                        >
                            Todas ({filas.length})
                        </button>
                        {OPCIONES_FILTRO.map(opc => {
                            const isActivo = filtrosActivos.includes(opc.key);
                            return (
                                <button
                                    key={opc.key}
                                    type="button"
                                    id={opc.id}
                                    className={`kardex-filter-pill ${isActivo ? "is-active" : ""}`}
                                    onClick={() => handleToggleFiltro(opc.key)}
                                    title={isActivo ? `Clic para quitar filtro de ${opc.label}` : `Clic para agregar filtro de ${opc.label}`}
                                >
                                    {opc.label}
                                    {isActivo && <span className="kardex-pill-check"> ✓</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {filtrosActivos.length > 0 && (
                    <div className="kardex-cuenta-filter-active">
                        <span>
                            Filtros activos: <strong>{filtrosActivos.map(getFiltroLabel).join(", ")}</strong> ({filasFiltradas.length} movs.)
                        </span>
                        <button
                            type="button"
                            id="btn-limpiar-filtro-cuenta"
                            className="btn-limpiar-filtro-cuenta"
                            onClick={handleLimpiarFiltros}
                            title="Quitar todos los filtros de cuenta"
                        >
                            ✕ Ver todas
                        </button>
                    </div>
                )}
            </div>

            {/* Contenedor responsivo de la tabla */}
            <div className="table-shell kardex-shell shadow-sm">
                <table className="kardex-table-excel">
                    <thead>
                        {/* Fila 1: Superencabezados */}
                        <tr className="kardex-header-super">
                            <th rowSpan={2} className="col-asiento">ASIENTO</th>
                            <th rowSpan={2} className="col-fecha">FECHA</th>
                            <th rowSpan={2} className="col-cuenta">CUENTA</th>
                            <th rowSpan={2} className="col-concepto">CONCEPTO</th>
                            <th colSpan={3} className="col-group col-unidades">UNIDADES</th>
                            <th colSpan={2} className="col-group col-costo">COSTO</th>
                            <th colSpan={3} className="col-group col-saldos">SALDOS</th>
                        </tr>
                        {/* Fila 2: Subencabezados específicos */}
                        <tr className="kardex-header-sub">
                            <th className="sub-col num-col">ENTRADA</th>
                            <th className="sub-col num-col">SALIDA</th>
                            <th className="sub-col num-col">EXISTENCIAS</th>
                            <th className="sub-col num-col">COSTO UNITARIO</th>
                            <th className="sub-col num-col">PEPS</th>
                            <th className="sub-col num-col">DEUDOR</th>
                            <th className="sub-col num-col">ACREEDOR</th>
                            <th className="sub-col num-col">SALDO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filasFiltradas.length === 0 ? (
                            <tr>
                                <td colSpan={12} className="empty-state" style={{ padding: "32px 16px", textAlign: "center" }}>
                                    <p style={{ margin: "0 0 10px 0", color: "#64748B", fontSize: "13.5px" }}>
                                        No se encontraron movimientos registrados para los filtros seleccionados (<strong>{filtrosActivos.map(getFiltroLabel).join(", ")}</strong>).
                                    </p>
                                    <button
                                        type="button"
                                        className="kardex-filter-pill is-active"
                                        onClick={handleLimpiarFiltros}
                                    >
                                        Mostrar todas las cuentas
                                    </button>
                                </td>
                            </tr>
                        ) : (
                            filasFiltradas.map((fila, index) => {
                                const config = fila.config || {};
                                return (
                                    <tr
                                        key={fila.id || index}
                                        className={`kardex-data-row ${config.borderRow ? `row-accent ${config.borderRow}` : ""}`}
                                    >
                                        {/* ASIENTO */}
                                        <td className="cell-asiento">
                                            <span className="partida-badge">#{fila.asiento}</span>
                                        </td>

                                        {/* FECHA */}
                                        <td className="cell-fecha">
                                            {fila.fechaTexto || fila.fecha}
                                        </td>

                                        {/* CUENTA CON COLOR DISTINTIVO */}
                                        <td className="cell-cuenta">
                                            <span className={`kardex-tag ${config.colorBadge || "badge-kardex-inventario"}`}>
                                                <span
                                                    className="tag-dot"
                                                    style={{ backgroundColor: config.dotColor || "#64748b" }}
                                                />
                                                {fila.cuenta}
                                            </span>
                                        </td>

                                        {/* CONCEPTO */}
                                        <td className="cell-concepto" title={fila.concepto}>
                                            <span className="concepto-texto">
                                                {fila.concepto}
                                            </span>
                                        </td>

                                        {/* UNIDADES */}
                                        <td className="num-col cell-num">
                                            {fila.entrada ? Number(fila.entrada).toLocaleString("en-US") : ""}
                                        </td>
                                        <td className="num-col cell-num">
                                            {fila.salida ? Number(fila.salida).toLocaleString("en-US") : ""}
                                        </td>
                                        <td className="num-col cell-num font-bold highlight-col">
                                            {fila.existencias !== null && fila.existencias !== undefined
                                                ? Number(fila.existencias).toLocaleString("en-US")
                                                : ""}
                                        </td>

                                        {/* COSTO */}
                                        <td className="num-col cell-money font-medium">
                                            {formatearMoneda(fila.costo_unitario, true)}
                                        </td>
                                        <td className="num-col cell-money text-muted">
                                            {formatearMoneda(fila.peps, true)}
                                        </td>

                                        {/* SALDOS */}
                                        <td className="num-col cell-money">
                                            {formatearMoneda(fila.deudor, true)}
                                        </td>
                                        <td className="num-col cell-money">
                                            {formatearMoneda(fila.acreedor, true)}
                                        </td>
                                        <td className="num-col cell-money font-bold highlight-col">
                                            {formatearMoneda(fila.saldo)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>

                    {filasFiltradas.length > 0 && (
                        <tfoot>
                            <tr className="kardex-totals-row-excel">
                                <th colSpan={4} className="totales-label">
                                    {filtroCuenta !== "TODAS"
                                        ? `TOTALES FILTRADOS (${filasFiltradas.length})`
                                        : "TOTALES ACUMULADOS"}
                                </th>
                                <th className="num-col">
                                    {Number(totalesMostrados.total_entradas || 0).toLocaleString("en-US")}
                                </th>
                                <th className="num-col">
                                    {Number(totalesMostrados.total_salidas || 0).toLocaleString("en-US")}
                                </th>
                                <th className="num-col highlight-cell">
                                    {Number(totalesMostrados.existencia_final || 0).toLocaleString("en-US")}
                                </th>
                                <th className="num-col highlight-cell">
                                    {formatearMoneda(totalesMostrados.costo_promedio_final, true)}
                                </th>
                                <th className="num-col text-muted">—</th>
                                <th className="num-col">
                                    {formatearMoneda(totalesMostrados.total_deudor || 0)}
                                </th>
                                <th className="num-col">
                                    {formatearMoneda(totalesMostrados.total_acreedor || 0)}
                                </th>
                                <th className="num-col highlight-cell">
                                    {formatearMoneda(totalesMostrados.saldo_final || 0)}
                                </th>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
}

export default TablaKardex;
