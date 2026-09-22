import { useMemo, useState } from "react";
import { formatearMoneda } from "../utils/kardexCalculos";

function coincideCuenta(fila, filtro) {
    if (!filtro || filtro === "TODAS") return true;

    const cta = (fila.cuenta || "").toLowerCase().trim();
    const tipo = (fila.tipo || "").toUpperCase();

    if (filtro === "VENTAS") {
        return cta === "ventas" || tipo === "VENTA" || (cta.includes("venta") && !cta.includes("devoluci"));
    }
    if (filtro === "COMPRAS") {
        return cta === "compras" || tipo === "COMPRA" || (cta.includes("compra") && !cta.includes("devoluci"));
    }
    if (filtro === "TODAS_VENTAS") {
        return cta.includes("venta") || tipo.includes("VENTA");
    }
    if (filtro === "TODAS_COMPRAS") {
        return cta.includes("compra") || tipo.includes("COMPRA");
    }
    if (filtro === "INVENTARIO") {
        return cta.includes("inventario") || tipo.includes("INVENTARIO");
    }

    return cta === filtro.toLowerCase().trim();
}

function getFiltroLabel(filtro) {
    switch (filtro) {
        case "VENTAS": return "Solo Ventas";
        case "COMPRAS": return "Solo Compras";
        case "TODAS_VENTAS": return "Ventas y Devoluciones";
        case "TODAS_COMPRAS": return "Compras y Devoluciones";
        case "INVENTARIO": return "Inventario";
        default: return filtro;
    }
}

export function TablaKardex({
    filas = [],
    totales = {},
    filtroCuentaProp,
    onCambiarFiltroCuenta
}) {
    const [filtroCuentaLocal, setFiltroCuentaLocal] = useState("TODAS");
    const filtroCuenta = filtroCuentaProp !== undefined ? filtroCuentaProp : filtroCuentaLocal;
    const setFiltroCuenta = onCambiarFiltroCuenta || setFiltroCuentaLocal;

    // Obtener cuentas adicionales únicas que no sean ventas o compras estándar
    const cuentasExtra = useMemo(() => {
        const cuentas = new Set();
        filas.forEach(f => {
            if (f.cuenta) {
                const ctaLower = f.cuenta.toLowerCase().trim();
                if (ctaLower !== "ventas" && ctaLower !== "compras") {
                    cuentas.add(f.cuenta.trim());
                }
            }
        });
        return Array.from(cuentas);
    }, [filas]);

    // Filtrar filas según la cuenta seleccionada
    const filasFiltradas = useMemo(() => {
        if (filtroCuenta === "TODAS") return filas;
        return filas.filter(f => coincideCuenta(f, filtroCuenta));
    }, [filas, filtroCuenta]);

    // Totales calculados en función del filtro
    const totalesMostrados = useMemo(() => {
        if (filtroCuenta === "TODAS") return totales;

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
    }, [filtroCuenta, filasFiltradas, totales]);

    return (
        <div>
            {/* Barra superior de filtro rápido por Cuenta */}
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
                            className={`kardex-filter-pill ${filtroCuenta === "TODAS" ? "is-active" : ""}`}
                            onClick={() => setFiltroCuenta("TODAS")}
                        >
                            Todas ({filas.length})
                        </button>
                        <button
                            type="button"
                            id="btn-filtro-cuenta-ventas"
                            className={`kardex-filter-pill ${filtroCuenta === "VENTAS" ? "is-active" : ""}`}
                            onClick={() => setFiltroCuenta("VENTAS")}
                        >
                            Solo Ventas
                        </button>
                        <button
                            type="button"
                            id="btn-filtro-cuenta-compras"
                            className={`kardex-filter-pill ${filtroCuenta === "COMPRAS" ? "is-active" : ""}`}
                            onClick={() => setFiltroCuenta("COMPRAS")}
                        >
                            Solo Compras
                        </button>
                        <button
                            type="button"
                            id="btn-filtro-cuenta-todas-ventas"
                            className={`kardex-filter-pill ${filtroCuenta === "TODAS_VENTAS" ? "is-active" : ""}`}
                            onClick={() => setFiltroCuenta("TODAS_VENTAS")}
                        >
                            Ventas + Devoluciones
                        </button>
                        <button
                            type="button"
                            id="btn-filtro-cuenta-todas-compras"
                            className={`kardex-filter-pill ${filtroCuenta === "TODAS_COMPRAS" ? "is-active" : ""}`}
                            onClick={() => setFiltroCuenta("TODAS_COMPRAS")}
                        >
                            Compras + Devoluciones
                        </button>
                    </div>
                </div>

                {filtroCuenta !== "TODAS" && (
                    <div className="kardex-cuenta-filter-active">
                        <span>Filtro activo: <strong>{getFiltroLabel(filtroCuenta)}</strong> ({filasFiltradas.length} movs.)</span>
                        <button
                            type="button"
                            id="btn-limpiar-filtro-cuenta"
                            className="btn-limpiar-filtro-cuenta"
                            onClick={() => setFiltroCuenta("TODAS")}
                            title="Quitar filtro de cuenta"
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
                            <th rowSpan={2} className="col-cuenta col-cuenta-filtro">
                                <div className="cuenta-header-cell">
                                    <span className="cuenta-header-title">CUENTA</span>
                                    <select
                                        id="filtro-cuenta-columna"
                                        value={filtroCuenta}
                                        onChange={(e) => setFiltroCuenta(e.target.value)}
                                        className="select-filtro-cuenta"
                                        title="Filtrar movimientos por cuenta"
                                    >
                                        <option value="TODAS">Todas</option>
                                        <option value="VENTAS">Solo Ventas</option>
                                        <option value="COMPRAS">Solo Compras</option>
                                        <option value="TODAS_VENTAS">Ventas y Dev.</option>
                                        <option value="TODAS_COMPRAS">Compras y Dev.</option>
                                        {cuentasExtra.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            </th>
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
                                        No se encontraron movimientos registrados para el filtro de cuenta (<strong>{getFiltroLabel(filtroCuenta)}</strong>).
                                    </p>
                                    <button
                                        type="button"
                                        className="kardex-filter-pill is-active"
                                        onClick={() => setFiltroCuenta("TODAS")}
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
