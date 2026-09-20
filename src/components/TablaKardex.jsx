import { useState } from "react";
import {
    formatearFecha,
    formatearMoneda,
    TIPOS_MOVIMIENTO
} from "../utils/kardexCalculos";

function badgeTipoMovimiento(tipo) {
    switch (tipo) {
        case TIPOS_MOVIMIENTO.INVENTARIO_INICIAL:
            return <span className="kardex-badge badge-inicial">Inventario Inicial</span>;
        case TIPOS_MOVIMIENTO.COMPRA:
            return <span className="kardex-badge badge-compra">Compra</span>;
        case TIPOS_MOVIMIENTO.VENTA:
            return <span className="kardex-badge badge-venta">Venta</span>;
        case TIPOS_MOVIMIENTO.DEVOLUCION_COMPRA:
            return <span className="kardex-badge badge-dev-compra">Dev. Compra</span>;
        case TIPOS_MOVIMIENTO.DEVOLUCION_VENTA:
            return <span className="kardex-badge badge-dev-venta">Dev. Venta</span>;
        default:
            return <span className="kardex-badge badge-otro">Movimiento</span>;
    }
}

export function TablaKardex({
    filas = [],
    totales = {},
    onActualizarCantidad
}) {
    const [editandoId, setEditandoId] = useState(null);
    const [valorTemp, setValorTemp] = useState("");

    function iniciarEdicion(fila) {
        setEditandoId(fila.id);
        const cantActual = fila.entrada > 0 ? fila.entrada : fila.salida;
        setValorTemp(String(cantActual));
    }

    function guardarEdicion(fila) {
        const nuevaCant = parseFloat(valorTemp);
        if (!isNaN(nuevaCant) && nuevaCant > 0 && onActualizarCantidad) {
            onActualizarCantidad(fila.id, nuevaCant);
        }
        setEditandoId(null);
    }

    function cancelarEdicion() {
        setEditandoId(null);
    }

    return (
        <div className="table-shell kardex-shell">
            <table className="kardex-table">
                <thead>
                    <tr>
                        <th title="Número de partida o asiento contable">Asiento</th>
                        <th>Fecha</th>
                        <th>Concepto</th>
                        <th className="num-col" title="Unidades que ingresan">Entrada</th>
                        <th className="num-col" title="Unidades que salen">Salida</th>
                        <th className="num-col" title="Unidades disponibles acumuladas">Existencias</th>
                        <th className="num-col" title="Costo unitario promedio ponderado">Costo Unitario</th>
                        <th className="num-col" title="Total en $ de la entrada">Costo Entrada</th>
                        <th className="num-col" title="Total en $ del costo de salida (Costo de venta)">Costo Salida</th>
                        <th className="num-col" title="Saldo monetario total valorizado">Saldo</th>
                        <th className="num-col" title="Precio al que se vendió cada unidad">Precio Venta</th>
                    </tr>
                </thead>
                <tbody>
                    {filas.length === 0 ? (
                        <tr>
                            <td colSpan="11" className="empty-state">
                                No hay movimientos en el período seleccionado.
                            </td>
                        </tr>
                    ) : (
                        filas.map((fila, index) => {
                            const esEntrada = fila.entrada > 0;
                            const estaEditando = editandoId === fila.id;

                            return (
                                <tr key={fila.id || index} className={`kardex-row row-${fila.tipo?.toLowerCase()}`}>
                                    <td className="partida-cell">
                                        <strong>P-{fila.asiento}</strong>
                                    </td>
                                    <td className="fecha-cell">
                                        {formatearFecha(fila.fecha)}
                                    </td>
                                    <td className="concepto-cell">
                                        <div className="concepto-wrap">
                                            {badgeTipoMovimiento(fila.tipo)}
                                            <span className="concepto-texto">{fila.concepto}</span>
                                        </div>
                                    </td>

                                    {/* Entrada */}
                                    <td className="num-col entrada-cell">
                                        {estaEditando && esEntrada ? (
                                            <div className="inline-edit">
                                                <input
                                                    type="number"
                                                    value={valorTemp}
                                                    onChange={e => setValorTemp(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") guardarEdicion(fila);
                                                        if (e.key === "Escape") cancelarEdicion();
                                                    }}
                                                    autoFocus
                                                    className="inline-input"
                                                />
                                                <button type="button" onClick={() => guardarEdicion(fila)} className="inline-save">✓</button>
                                            </div>
                                        ) : (
                                            <span
                                                onClick={() => iniciarEdicion(fila)}
                                                className={fila.entrada > 0 ? "cant-clickable positive" : "cant-zero"}
                                                title="Haz clic para ajustar unidades si fuera necesario"
                                            >
                                                {fila.entrada > 0 ? Number(fila.entrada).toLocaleString("es-SV") : "0"}
                                            </span>
                                        )}
                                    </td>

                                    {/* Salida */}
                                    <td className="num-col salida-cell">
                                        {estaEditando && !esEntrada ? (
                                            <div className="inline-edit">
                                                <input
                                                    type="number"
                                                    value={valorTemp}
                                                    onChange={e => setValorTemp(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") guardarEdicion(fila);
                                                        if (e.key === "Escape") cancelarEdicion();
                                                    }}
                                                    autoFocus
                                                    className="inline-input"
                                                />
                                                <button type="button" onClick={() => guardarEdicion(fila)} className="inline-save">✓</button>
                                            </div>
                                        ) : (
                                            <span
                                                onClick={() => iniciarEdicion(fila)}
                                                className={fila.salida > 0 ? "cant-clickable negative" : "cant-zero"}
                                                title="Haz clic para ajustar unidades si fuera necesario"
                                            >
                                                {fila.salida > 0 ? Number(fila.salida).toLocaleString("es-SV") : "0"}
                                            </span>
                                        )}
                                    </td>

                                    {/* Existencias */}
                                    <td className="num-col existencias-cell">
                                        <strong>{Number(fila.existencias).toLocaleString("es-SV")}</strong>
                                    </td>

                                    {/* Costo Unitario */}
                                    <td className="num-col costo-unitario-cell">
                                        {formatearMoneda(fila.costo_unitario)}
                                    </td>

                                    {/* Costo entrada */}
                                    <td className="num-col costo-entrada-cell">
                                        {fila.costo_entrada > 0 ? formatearMoneda(fila.costo_entrada) : "$ 0.00"}
                                    </td>

                                    {/* Costo salida */}
                                    <td className="num-col costo-salida-cell">
                                        {fila.costo_salida > 0 ? formatearMoneda(fila.costo_salida) : "$ 0.00"}
                                    </td>

                                    {/* Saldo */}
                                    <td className="num-col saldo-cell">
                                        <strong>{formatearMoneda(fila.saldo)}</strong>
                                    </td>

                                    {/* Precio de venta unitario */}
                                    <td className="num-col precio-venta-cell">
                                        {fila.precio_venta_unitario && fila.precio_venta_unitario > 0
                                            ? formatearMoneda(fila.precio_venta_unitario)
                                            : "—"}
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>

                {filas.length > 0 && (
                    <tfoot>
                        <tr className="kardex-totals-row">
                            <th colSpan="3">Totales acumulados del período</th>
                            <th className="num-col">
                                {Number(totales.total_entradas_unidades || 0).toLocaleString("es-SV")} und.
                            </th>
                            <th className="num-col">
                                {Number(totales.total_salidas_unidades || 0).toLocaleString("es-SV")} und.
                            </th>
                            <th className="num-col highlight-cell">
                                {Number(totales.existencia_final || 0).toLocaleString("es-SV")} und.
                            </th>
                            <th className="num-col highlight-cell">
                                {formatearMoneda(totales.costo_promedio_final || 0)}
                            </th>
                            <th className="num-col">
                                {formatearMoneda(totales.total_costo_entrada || 0)}
                            </th>
                            <th className="num-col">
                                {formatearMoneda(totales.total_costo_salida || 0)}
                            </th>
                            <th className="num-col highlight-cell">
                                {formatearMoneda(totales.saldo_final || 0)}
                            </th>
                            <th className="num-col">—</th>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

export default TablaKardex;
