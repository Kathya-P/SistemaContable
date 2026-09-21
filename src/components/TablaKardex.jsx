import { formatearMoneda } from "../utils/kardexCalculos";

export function TablaKardex({
    filas = [],
    totales = {}
}) {
    return (
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
                    {filas.length === 0 ? (
                        <tr>
                            <td colSpan={12} className="empty-state">
                                No hay movimientos de inventario registrados para los filtros seleccionados.
                            </td>
                        </tr>
                    ) : (
                        filas.map((fila, index) => {
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

                                    {/* CONCEPTO (COMENTARIO DEL ASIENTO) */}
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

                {filas.length > 0 && (
                    <tfoot>
                        <tr className="kardex-totals-row-excel">
                            <th colSpan={4} className="totales-label">
                                TOTALES ACUMULADOS
                            </th>
                            <th className="num-col">
                                {Number(totales.total_entradas || 0).toLocaleString("en-US")}
                            </th>
                            <th className="num-col">
                                {Number(totales.total_salidas || 0).toLocaleString("en-US")}
                            </th>
                            <th className="num-col highlight-cell">
                                {Number(totales.existencia_final || 0).toLocaleString("en-US")}
                            </th>
                            <th className="num-col highlight-cell">
                                {formatearMoneda(totales.costo_promedio_final, true)}
                            </th>
                            <th className="num-col text-muted">—</th>
                            <th className="num-col">
                                {formatearMoneda(totales.total_deudor || 0)}
                            </th>
                            <th className="num-col">
                                {formatearMoneda(totales.total_acreedor || 0)}
                            </th>
                            <th className="num-col highlight-cell">
                                {formatearMoneda(totales.saldo_final || 0)}
                            </th>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

export default TablaKardex;
