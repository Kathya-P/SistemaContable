import { Fragment, useEffect, useMemo, useState } from "react";
import { obtenerLibroDiario } from "../services/libroDiarioService";
import { rectificarAsiento, eliminarAsiento } from "../services/asientosService";
import { obtenerCuentas } from "../services/cuentasService";
import { exportarLibroDiarioPDF, exportarLibroDiarioExcel } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";
import { SelectorSubcuenta } from "./NuevoAsiento";

function moneda(valor) {
    return Number(valor || 0).toLocaleString("es-SV", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function fechaCorta(valor) {
    if (!valor) return "";
    const [anio, mes, dia] = valor.split("-");
    return `${dia}/${mes}/${anio}`;
}

function IconoLapiz({ size = 14, className = "" }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
    );
}

function IconoBasura({ size = 14, className = "" }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
    );
}

function IconoRayo({ size = 14 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
    );
}

function IconoLupa({ size = 15 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    );
}

function IconoCalendario({ size = 14 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    );
}

function gruposDeAsiento(asiento) {
    const grupos = new Map();
    const detalles = asiento.detalle_asientos || [];
    const cuentas = new Map(detalles.map(detalle => [String(detalle.cuenta_id), detalle.cuentas]));

    detalles.forEach(detalle => {
        const cuenta = detalle.cuentas || {};
        const padre = cuenta.cuenta_padre || cuentas.get(String(cuenta.cuenta_padre_id)) || cuenta;
        const grupo = grupos.get(String(padre.id)) || {
            padre,
            detalles: [],
            debe: 0,
            haber: 0
        };

        grupo.detalles.push(detalle);
        grupo.debe += Number(detalle.debe || 0);
        grupo.haber += Number(detalle.haber || 0);
        grupos.set(String(padre.id), grupo);
    });

    return [...grupos.values()];
}

// ==========================================================
// Función para Interpretar y Generar Motivo Automático
// ==========================================================
function interpretarCambiosAsiento(asientoOriginal, lineasActuales, catalogoMap) {
    const lineasOrig = asientoOriginal.detalle_asientos || [];

    // Mapear cuentas originales con importes netos
    const origMap = new Map();
    lineasOrig.forEach(d => {
        const cod = d.cuentas?.codigo || String(d.cuenta_id);
        const nom = d.cuentas?.nombre || catalogoMap.get(cod)?.nombre || catalogoMap.get(String(d.cuenta_id))?.nombre || "Cuenta";
        const debe = Number(d.debe || 0);
        const haber = Number(d.haber || 0);
        if (!origMap.has(cod)) {
            origMap.set(cod, { codigo: cod, nombre: nom, debe: 0, haber: 0 });
        }
        const item = origMap.get(cod);
        item.debe += debe;
        item.haber += haber;
    });

    // Mapear cuentas actuales con importes netos
    const actMap = new Map();
    lineasActuales.forEach(l => {
        if (!l.cuenta_id) return;
        const cuentaObj = catalogoMap.get(String(l.cuenta_id));
        const cod = cuentaObj?.codigo || String(l.cuenta_id);
        const nom = cuentaObj?.nombre || "Cuenta";
        const debe = parseFloat(l.debe) || 0;
        const haber = parseFloat(l.haber) || 0;
        if (!actMap.has(cod)) {
            actMap.set(cod, { codigo: cod, nombre: nom, debe: 0, haber: 0 });
        }
        const item = actMap.get(cod);
        item.debe += debe;
        item.haber += haber;
    });

    const cuentasMontoModificado = [];
    const cuentasNuevas = [];
    const cuentasQuitadas = [];

    // Detectar cuentas modificadas o agregadas
    for (const [cod, act] of actMap.entries()) {
        const orig = origMap.get(cod);
        if (!orig) {
            cuentasNuevas.push(act.nombre);
        } else {
            const difDebe = Math.abs(act.debe - orig.debe);
            const difHaber = Math.abs(act.haber - orig.haber);
            if (difDebe > 0.005 || difHaber > 0.005) {
                const montoAntes = orig.debe > 0 ? orig.debe : orig.haber;
                const montoDespues = act.debe > 0 ? act.debe : act.haber;
                cuentasMontoModificado.push({
                    nombre: act.nombre,
                    antes: montoAntes,
                    despues: montoDespues
                });
            }
        }
    }

    // Detectar cuentas eliminadas
    for (const [cod, orig] of origMap.entries()) {
        if (!actMap.has(cod)) {
            cuentasQuitadas.push(orig.nombre);
        }
    }

    const fragmentos = [];

    if (cuentasMontoModificado.length > 0) {
        if (cuentasMontoModificado.length === 1) {
            const m = cuentasMontoModificado[0];
            fragmentos.push(`Corrección de monto en ${m.nombre} (de $${m.antes.toFixed(2)} a $${m.despues.toFixed(2)})`);
        } else {
            const nombres = cuentasMontoModificado.map(c => c.nombre).join(" y ");
            fragmentos.push(`Ajuste de importes en ${nombres}`);
        }
    }

    if (cuentasNuevas.length > 0) {
        fragmentos.push(`Inclusión de ${cuentasNuevas.join(", ")}`);
    }

    if (cuentasQuitadas.length > 0) {
        fragmentos.push(`Exclusión de ${cuentasQuitadas.join(", ")}`);
    }

    if (fragmentos.length === 0) {
        return "Corrección de redacción de concepto y regularización de partida";
    }

    return fragmentos.join("; ");
}

// ==========================================================
// Modal de Modificación y Rectificación del Asiento Contable
// ==========================================================
function ModalRectificarAsiento({ asiento, cuentas, onCerrar, onGuardado }) {
    const [fecha, setFecha] = useState(asiento.fecha || "");
    const [concepto, setConcepto] = useState(() => {
        return String(asiento.concepto || "").replace(/\s*\[Rectificado[^\]]*\]/gi, "").trim();
    });
    const [motivo, setMotivo] = useState("");
    const [mensajeAutoMotivo, setMensajeAutoMotivo] = useState("");
    const [lineas, setLineas] = useState(() => {
        return (asiento.detalle_asientos || []).map(d => ({
            id: Math.random().toString(36).substring(2, 9),
            cuenta_id: String(d.cuenta_id || d.cuentas?.id || d.cuentas?.codigo || ""),
            descripcion: d.descripcion || "",
            debe: Number(d.debe) > 0 ? String(d.debe) : "",
            haber: Number(d.haber) > 0 ? String(d.haber) : ""
        }));
    });
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState("");

    const catalogoMap = useMemo(() => {
        const m = new Map();
        cuentas.forEach(c => {
            m.set(String(c.id), c);
            m.set(String(c.codigo), c);
        });
        return m;
    }, [cuentas]);

    const cuentasMovibles = useMemo(() => {
        return cuentas.filter(c => c.permite_movimientos !== false);
    }, [cuentas]);

    // Cuadre en tiempo real
    const totalDebe = useMemo(() => {
        return lineas.reduce((acc, l) => acc + (parseFloat(l.debe) || 0), 0);
    }, [lineas]);

    const totalHaber = useMemo(() => {
        return lineas.reduce((acc, l) => acc + (parseFloat(l.haber) || 0), 0);
    }, [lineas]);

    const diferencia = Math.abs(totalDebe - totalHaber);
    const estaCuadrado = diferencia < 0.005 && totalDebe > 0;

    const agregarLinea = () => {
        setLineas(prev => [
            ...prev,
            { id: Math.random().toString(36).substring(2, 9), cuenta_id: "", descripcion: "", debe: "", haber: "" }
        ]);
    };

    const quitarLinea = (id) => {
        if (lineas.length <= 2) {
            setError("Un asiento contable debe contener como mínimo 2 líneas.");
            return;
        }
        setError("");
        setLineas(prev => prev.filter(l => l.id !== id));
    };

    const actualizarLinea = (id, campo, valor) => {
        setError("");
        setLineas(prev => prev.map(l => {
            if (l.id !== id) return l;
            const nueva = { ...l, [campo]: valor };
            if (campo === "debe" && valor) nueva.haber = "";
            if (campo === "haber" && valor) nueva.debe = "";
            return nueva;
        }));
    };

    const manejarAutoGenerarMotivo = () => {
        const motivoGenerado = interpretarCambiosAsiento(asiento, lineas, catalogoMap);
        setMotivo(motivoGenerado);
        setMensajeAutoMotivo("✓ Motivo redactado e interpretado según los cambios");
        setTimeout(() => setMensajeAutoMotivo(""), 4000);
    };

    const manejarGuardar = async (e) => {
        e.preventDefault();
        setError("");

        if (!concepto.trim()) {
            setError("El concepto del asiento no puede quedar vacío.");
            return;
        }
        if (!motivo.trim()) {
            setError("Debe especificar el motivo del ajuste para la auditoría contable.");
            return;
        }
        if (lineas.some(l => !l.cuenta_id)) {
            setError("Todas las líneas deben tener una subcuenta asignada.");
            return;
        }
        if (!estaCuadrado) {
            setError(`La partida doble no está balanceada. Diferencia actual: $${diferencia.toFixed(2)}.`);
            return;
        }

        setGuardando(true);
        try {
            const respuesta = await rectificarAsiento(asiento.id, {
                concepto: concepto.trim(),
                motivo: motivo.trim(),
                fecha: fecha || asiento.fecha,
                detalles: lineas.map(l => ({
                    cuenta_id: l.cuenta_id,
                    descripcion: l.descripcion,
                    debe: parseFloat(l.debe) || 0,
                    haber: parseFloat(l.haber) || 0
                }))
            });

            onGuardado(respuesta.asiento || {
                ...asiento,
                fecha: fecha || asiento.fecha,
                concepto: concepto.trim(),
                rectificado: true
            });
        } catch (err) {
            console.error("Error al rectificar asiento:", err);
            setError(err.message || "No se pudo rectificar el asiento.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="modal-rect-overlay">
            <div className="modal-rect-container">
                {/* Cabecera del Modal */}
                <div className="modal-rect-header">
                    <div>
                        <div className="modal-rect-badge-row">
                            <span className="modal-rect-badge-recent">
                                Partida #{asiento.numero_partida}
                            </span>
                            <span className="modal-rect-date">
                                Fecha: {fechaCorta(fecha || asiento.fecha)}
                            </span>
                        </div>
                        <h2 className="modal-rect-title">
                            Modificar Asiento #{asiento.numero_partida}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onCerrar}
                        className="modal-rect-close-btn"
                        aria-label="Cerrar modal"
                    >
                        ✕
                    </button>
                </div>

                {/* Banner Informativo */}
                <div className="modal-rect-banner" style={{ background: "#ecfdf5", border: "1.5px solid #a7f3d0", color: "#065f46" }}>
                    <strong>Modificación en período abierto:</strong> Se puede modificar cualquier asiento del período sin afectar la continuidad del ejercicio contable. La fecha de modificación queda registrada en la auditoría.
                </div>

                {error && (
                    <div className="modal-rect-error-box">
                        {error}
                    </div>
                )}

                <form onSubmit={manejarGuardar}>
                    {/* Fecha, Concepto y Motivo */}
                    <div className="modal-rect-fields-grid" style={{ gridTemplateColumns: "190px 1.2fr 1fr", gap: "12px" }}>
                        <div>
                            <label className="modal-rect-label">
                                Fecha Contable <span style={{ color: "#ef4444" }}>*</span>
                            </label>
                            <input
                                type="date"
                                value={fecha}
                                onChange={e => setFecha(e.target.value)}
                                className="modal-rect-input"
                                required
                            />
                            <span style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px", display: "block" }}>
                                Puede ser la misma fecha
                            </span>
                        </div>

                        <div>
                            <label className="modal-rect-label">
                                Concepto del Asiento <span style={{ color: "#ef4444" }}>*</span>
                            </label>
                            <input
                                type="text"
                                value={concepto}
                                onChange={e => setConcepto(e.target.value)}
                                placeholder="Ej. Pago de luz del mes..."
                                className="modal-rect-input"
                                required
                            />
                        </div>

                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                                <label className="modal-rect-label" style={{ margin: 0 }}>
                                    Motivo del Ajuste <span style={{ color: "#ef4444" }}>*</span>
                                </label>
                            </div>
                            <input
                                type="text"
                                value={motivo}
                                onChange={e => setMotivo(e.target.value)}
                                placeholder="Ej. Ajuste de cuenta o corrección de monto..."
                                className="modal-rect-input"
                                required
                            />

                            {/* Botón para Auto-generar motivo */}
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                                <button
                                    type="button"
                                    onClick={manejarAutoGenerarMotivo}
                                    className="btn-auto-generar-motivo"
                                    title="Analiza automáticamente los cambios realizados en las líneas para redactar el motivo contable"
                                >
                                    <IconoRayo size={13} />
                                    <span>Generar motivo automáticamente</span>
                                </button>
                                {mensajeAutoMotivo && (
                                    <span style={{ fontSize: "11px", color: "#10b981", fontWeight: "600" }}>
                                        {mensajeAutoMotivo}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Líneas del Asiento */}
                    <div style={{ marginBottom: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <span className="modal-rect-subheading">
                                Líneas del Asiento (Partida Doble)
                            </span>
                            <button
                                type="button"
                                onClick={agregarLinea}
                                className="btn-agregar-linea-rect"
                            >
                                + Agregar Línea
                            </button>
                        </div>

                        <div className="modal-rect-table-shell">
                            <table className="modal-rect-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: "42%" }}>Subcuenta Contable</th>
                                        <th style={{ width: "26%" }}>Descripción (Opcional)</th>
                                        <th style={{ width: "15%", textAlign: "right" }}>Débito ($)</th>
                                        <th style={{ width: "15%", textAlign: "right" }}>Crédito ($)</th>
                                        <th style={{ width: "2%", textAlign: "center" }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineas.map(linea => (
                                        <tr key={linea.id}>
                                            <td style={{ padding: "6px 8px" }}>
                                                <SelectorSubcuenta
                                                    value={linea.cuenta_id}
                                                    cuentas={cuentasMovibles}
                                                    onChange={val => actualizarLinea(linea.id, "cuenta_id", val)}
                                                />
                                            </td>
                                            <td style={{ padding: "6px 8px" }}>
                                                <input
                                                    type="text"
                                                    value={linea.descripcion}
                                                    onChange={e => actualizarLinea(linea.id, "descripcion", e.target.value)}
                                                    placeholder="Detalle..."
                                                    className="modal-rect-input"
                                                    style={{ padding: "6px 8px", fontSize: "12px" }}
                                                />
                                            </td>
                                            <td style={{ padding: "6px 8px" }}>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={linea.debe}
                                                    onChange={e => actualizarLinea(linea.id, "debe", e.target.value)}
                                                    placeholder="0.00"
                                                    className="modal-rect-input"
                                                    style={{ padding: "6px 8px", fontSize: "12px", textAlign: "right", fontWeight: "700" }}
                                                />
                                            </td>
                                            <td style={{ padding: "6px 8px" }}>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={linea.haber}
                                                    onChange={e => actualizarLinea(linea.id, "haber", e.target.value)}
                                                    placeholder="0.00"
                                                    className="modal-rect-input"
                                                    style={{ padding: "6px 8px", fontSize: "12px", textAlign: "right", fontWeight: "700" }}
                                                />
                                            </td>
                                            <td style={{ padding: "6px 4px", textAlign: "center" }}>
                                                <button
                                                    type="button"
                                                    onClick={() => quitarLinea(linea.id)}
                                                    className="btn-quitar-linea-rect"
                                                    title="Quitar línea"
                                                >
                                                    ✕
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="modal-rect-total-row">
                                        <td colSpan="2" style={{ textAlign: "right", padding: "8px 10px" }}>Totales:</td>
                                        <td style={{ textAlign: "right", padding: "8px 10px", color: estaCuadrado ? "#10b981" : "#ef4444" }}>
                                            $ {moneda(totalDebe)}
                                        </td>
                                        <td style={{ textAlign: "right", padding: "8px 10px", color: estaCuadrado ? "#10b981" : "#ef4444" }}>
                                            $ {moneda(totalHaber)}
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Estado del balance */}
                    <div className={`modal-rect-balance ${estaCuadrado ? "is-balanced" : "is-unbalanced"}`}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>{estaCuadrado ? "✓" : "⚠️"}</span>
                            <strong>
                                {estaCuadrado ? "Partida Doble Cuadrada (Debe = Haber)" : `Diferencia de cuadre: $ ${moneda(diferencia)}`}
                            </strong>
                        </div>
                        <span style={{ fontSize: "12px", opacity: 0.85 }}>
                            {lineas.length} líneas registradas
                        </span>
                    </div>

                    {/* Botones de acción */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                        <button
                            type="button"
                            onClick={onCerrar}
                            disabled={guardando}
                            className="btn-modal-cancelar"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardando || !estaCuadrado}
                            className="btn-modal-guardar"
                        >
                            {guardando ? "Guardando rectificación..." : "✓ Guardar Rectificación"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ==========================================================
// Modal de Historial de Rectificación: ANTES vs DESPUÉS y Cuentas T
// ==========================================================
function ModalHistorialRectificacion({ asiento, cuentas = [], onCerrar }) {
    const historial = useMemo(() => {
        if (asiento.rectificacion_historial) {
            return asiento.rectificacion_historial;
        }
        const match = String(asiento.concepto || "").match(/\[Rectificado el ([^:]+):\s*([^\]]+)\]/i);
        return {
            fecha: match ? match[1] : new Date().toLocaleDateString("es-SV"),
            usuario: "Usuario del sistema",
            motivo: match ? match[2] : "Corrección contable del asiento más reciente",
            datos_anteriores: null,
            datos_nuevos: null
        };
    }, [asiento]);

    const cuentasMap = useMemo(() => {
        const m = new Map();
        cuentas.forEach(c => {
            m.set(String(c.id), c);
            m.set(String(c.codigo), c);
        });
        return m;
    }, [cuentas]);

    const lineasAntes = useMemo(() => {
        if (historial.datos_anteriores?.lineas) {
            return historial.datos_anteriores.lineas;
        }
        return [];
    }, [historial]);

    const lineasDespues = useMemo(() => {
        if (historial.datos_nuevos?.lineas) {
            return historial.datos_nuevos.lineas;
        }
        return (asiento.detalle_asientos || []).map(d => ({
            cuenta_id: d.cuenta_id,
            cuenta_codigo: d.cuentas?.codigo || "",
            cuenta_nombre: d.cuentas?.nombre || "",
            descripcion: d.descripcion,
            debe: Number(d.debe || 0),
            haber: Number(d.haber || 0)
        }));
    }, [historial, asiento]);

    const cuentasTModificadas = useMemo(() => {
        const mapaCuentas = new Map();

        lineasAntes.forEach(l => {
            const cod = l.cuenta_codigo || cuentasMap.get(String(l.cuenta_id))?.codigo || String(l.cuenta_id);
            const nom = l.cuenta_nombre || cuentasMap.get(String(l.cuenta_id))?.nombre || "Cuenta";
            if (!mapaCuentas.has(cod)) {
                mapaCuentas.set(cod, { codigo: cod, nombre: nom, debeAntes: 0, haberAntes: 0, debeDespues: 0, haberDespues: 0 });
            }
            const info = mapaCuentas.get(cod);
            info.debeAntes += Number(l.debe || 0);
            info.haberAntes += Number(l.haber || 0);
        });

        lineasDespues.forEach(l => {
            const cod = l.cuenta_codigo || cuentasMap.get(String(l.cuenta_id))?.codigo || String(l.cuenta_id);
            const nom = l.cuenta_nombre || cuentasMap.get(String(l.cuenta_id))?.nombre || "Cuenta";
            if (!mapaCuentas.has(cod)) {
                mapaCuentas.set(cod, { codigo: cod, nombre: nom, debeAntes: 0, haberAntes: 0, debeDespues: 0, haberDespues: 0 });
            }
            const info = mapaCuentas.get(cod);
            info.debeDespues += Number(l.debe || 0);
            info.haberDespues += Number(l.haber || 0);
        });

        if (mapaCuentas.size === 0) {
            lineasDespues.forEach(l => {
                const cod = l.cuenta_codigo || cuentasMap.get(String(l.cuenta_id))?.codigo || String(l.cuenta_id);
                const nom = l.cuenta_nombre || cuentasMap.get(String(l.cuenta_id))?.nombre || "Cuenta";
                mapaCuentas.set(cod, {
                    codigo: cod,
                    nombre: nom,
                    debeAntes: 0,
                    haberAntes: 0,
                    debeDespues: Number(l.debe || 0),
                    haberDespues: Number(l.haber || 0)
                });
            });
        }

        return [...mapaCuentas.values()];
    }, [lineasAntes, lineasDespues, cuentasMap]);

    return (
        <div className="modal-rect-overlay">
            <div className="modal-rect-container" style={{ maxWidth: "920px" }}>
                {/* Cabecera */}
                <div className="modal-rect-header">
                    <div>
                        <div className="modal-rect-badge-row">
                            <span className="modal-rect-badge-recent">
                                <IconoLapiz size={12} />
                                <span>Registro de Rectificación</span>
                            </span>
                            <span className="modal-rect-date">
                                Partida #{asiento.numero_partida} · {fechaCorta(asiento.fecha)}
                            </span>
                        </div>
                        <h2 className="modal-rect-title">
                            Auditoría de Rectificación y Cuentas T
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onCerrar}
                        className="modal-rect-close-btn"
                        aria-label="Cerrar modal"
                    >
                        ✕
                    </button>
                </div>

                {/* Tarjeta de Metadatos */}
                <div className="modal-rect-metadata-grid">
                    <div>
                        <span className="modal-rect-meta-title">Fecha de Rectificación</span>
                        <strong className="modal-rect-meta-val">
                            {historial.fecha ? new Date(historial.fecha).toLocaleString("es-ES") : "Reciente"}
                        </strong>
                    </div>
                    <div>
                        <span className="modal-rect-meta-title">Modificado por</span>
                        <strong className="modal-rect-meta-val">{historial.usuario || "Usuario del sistema"}</strong>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                        <span className="modal-rect-meta-title">Motivo de la Rectificación</span>
                        <strong className="modal-rect-meta-val" style={{ color: "var(--accent, #10b981)" }}>
                            {historial.motivo || "Ajuste de partida"}
                        </strong>
                    </div>
                </div>

                {/* Comparación ANTES vs DESPUÉS */}
                <div style={{ marginBottom: "24px" }}>
                    <h3 className="modal-rect-subheading" style={{ marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>⚖️</span> Comparativa: Asiento Original vs Asiento Rectificado
                    </h3>

                    <div style={{ display: "grid", gridTemplateColumns: lineasAntes.length > 0 ? "1fr 1fr" : "1fr", gap: "16px" }}>
                        {lineasAntes.length > 0 && (
                            <div className="comparativa-card-antes">
                                <div className="comparativa-card-header antes">
                                    Valores Anteriores (Original)
                                </div>
                                <div className="comparativa-card-concept">
                                    <em>C/ {historial.datos_anteriores?.concepto || asiento.concepto}</em>
                                </div>
                                <table className="comparativa-mini-table">
                                    <thead>
                                        <tr>
                                            <th>Cuenta</th>
                                            <th style={{ textAlign: "right" }}>Debe</th>
                                            <th style={{ textAlign: "right" }}>Haber</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lineasAntes.map((l, idx) => (
                                            <tr key={idx}>
                                                <td><strong>{l.cuenta_codigo}</strong> - {l.cuenta_nombre}</td>
                                                <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                                                    {Number(l.debe) > 0 ? `$ ${moneda(l.debe)}` : ""}
                                                </td>
                                                <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                                                    {Number(l.haber) > 0 ? `$ ${moneda(l.haber)}` : ""}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="comparativa-card-despues">
                            <div className="comparativa-card-header despues">
                                ✓ Valores Corregidos (Rectificado)
                            </div>
                            <div className="comparativa-card-concept">
                                <strong>C/ {asiento.concepto}</strong>
                            </div>
                            <table className="comparativa-mini-table">
                                <thead>
                                    <tr>
                                        <th>Cuenta</th>
                                        <th style={{ textAlign: "right" }}>Debe</th>
                                        <th style={{ textAlign: "right" }}>Haber</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineasDespues.map((l, idx) => {
                                        const cod = l.cuenta_codigo || cuentasMap.get(String(l.cuenta_id))?.codigo || "";
                                        const nom = l.cuenta_nombre || cuentasMap.get(String(l.cuenta_id))?.nombre || "";
                                        return (
                                            <tr key={idx}>
                                                <td><strong style={{ color: "#10b981" }}>{cod}</strong> - {nom}</td>
                                                <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "700" }}>
                                                    {Number(l.debe) > 0 ? `$ ${moneda(l.debe)}` : ""}
                                                </td>
                                                <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "700" }}>
                                                    {Number(l.haber) > 0 ? `$ ${moneda(l.haber)}` : ""}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Cuentas T de las Cuentas Modificadas */}
                <div>
                    <h3 className="modal-rect-subheading" style={{ marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>📊</span> Cuentas "T" de las Cuentas Modificadas en este Asiento
                    </h3>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                        {cuentasTModificadas.map(cuentaT => {
                            const saldo = cuentaT.debeDespues - cuentaT.haberDespues;
                            const esDeudor = saldo >= 0;

                            return (
                                <div key={cuentaT.codigo} className="cuenta-t-card">
                                    <div className="cuenta-t-header">
                                        {cuentaT.codigo} - {cuentaT.nombre}
                                    </div>

                                    <div className="cuenta-t-body">
                                        <div className="cuenta-t-col izquierda">
                                            <div className="cuenta-t-col-title">DEBE</div>
                                            <div className="cuenta-t-monto">
                                                {cuentaT.debeDespues > 0 ? `$ ${moneda(cuentaT.debeDespues)}` : "—"}
                                            </div>
                                            {cuentaT.debeAntes > 0 && cuentaT.debeAntes !== cuentaT.debeDespues && (
                                                <div className="cuenta-t-antes">
                                                    Antes: ${moneda(cuentaT.debeAntes)}
                                                </div>
                                            )}
                                        </div>

                                        <div className="cuenta-t-col derecha">
                                            <div className="cuenta-t-col-title" style={{ textAlign: "right" }}>HABER</div>
                                            <div className="cuenta-t-monto" style={{ textAlign: "right" }}>
                                                {cuentaT.haberDespues > 0 ? `$ ${moneda(cuentaT.haberDespues)}` : "—"}
                                            </div>
                                            {cuentaT.haberAntes > 0 && cuentaT.haberAntes !== cuentaT.haberDespues && (
                                                <div className="cuenta-t-antes" style={{ textAlign: "right" }}>
                                                    Antes: ${moneda(cuentaT.haberAntes)}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="cuenta-t-footer">
                                        <span>Saldo {esDeudor ? "Deudor" : "Acreedor"}:</span>
                                        <strong>$ {moneda(Math.abs(saldo))}</strong>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Botón Cerrar */}
                <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
                    <button
                        type="button"
                        onClick={onCerrar}
                        className="btn-modal-guardar"
                    >
                        Cerrar Detalle
                    </button>
                </div>
            </div>
        </div>
    );
}

// ==========================================================
// Componente Principal: Libro Diario
// ==========================================================
function LibroDiario({ filtroDesde: propDesde, filtroHasta: propHasta, empresaNombre = "Empresa" } = {}) {
    const [asientos, setAsientos] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");

    // Estados de Búsqueda y Filtros Integrados
    const [busquedaTexto, setBusquedaTexto] = useState("");
    const [fechaDesde, setFechaDesde] = useState(propDesde || "");
    const [fechaHasta, setFechaHasta] = useState(propHasta || "");

    // Modales de rectificación y eliminación
    const [modalRectificar, setModalRectificar] = useState(null);
    const [modalHistorial, setModalHistorial] = useState(null);
    const [modalEliminar, setModalEliminar] = useState(null);
    const [motivoEliminar, setMotivoEliminar] = useState("");
    const [eliminando, setEliminando] = useState(false);
    const [notificacion, setNotificacion] = useState("");

    const confirmarEliminacion = async () => {
        if (!modalEliminar) return;
        setEliminando(true);
        try {
            await eliminarAsiento(modalEliminar.id, motivoEliminar || "Eliminación de asiento contable del período");
            setAsientos(prev => prev.filter(a => String(a.id) !== String(modalEliminar.id)));
            setNotificacion(`Partida #${modalEliminar.numero_partida} eliminada exitosamente. La acción fue registrada en la auditoría.`);
            setTimeout(() => setNotificacion(""), 6000);
            setModalEliminar(null);
            setMotivoEliminar("");
        } catch (err) {
            console.error("Error al eliminar asiento:", err);
            alert(err.message || "No se pudo eliminar el asiento contable.");
        } finally {
            setEliminando(false);
        }
    };

    const cargarDatos = async () => {
        try {
            const [datosAsientos, datosCuentas] = await Promise.all([
                obtenerLibroDiario(),
                obtenerCuentas().catch(() => [])
            ]);
            setAsientos(datosAsientos || []);
            setCuentas(datosCuentas || []);
        } catch (err) {
            console.error("Error cargando libro diario:", err);
            setError(err.message || "No se pudo cargar el Libro Diario.");
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargarDatos();
    }, []);

    // Identificar el asiento más reciente de toda la empresa
    const ultimoAsiento = useMemo(() => {
        if (!asientos || asientos.length === 0) return null;
        return [...asientos].sort((a, b) => {
            const numA = Number(a.numero_partida || a.id || 0);
            const numB = Number(b.numero_partida || b.id || 0);
            return numB - numA;
        })[0];
    }, [asientos]);

    // Filtrado inteligente por número de partida, cuentas involucradas y fechas
    const asientosFiltrados = useMemo(() => {
        const termino = busquedaTexto.trim().toLowerCase();

        return asientos.filter(asiento => {
            // Filtro por fecha
            if (fechaDesde && asiento.fecha && asiento.fecha < fechaDesde) return false;
            if (fechaHasta && asiento.fecha && asiento.fecha > fechaHasta) return false;

            // Si no hay término de búsqueda, pasa
            if (!termino) return true;

            // 1. Coincidencia con número de partida (ej. "14", "#14")
            const numPartida = String(asiento.numero_partida || "");
            const numId = String(asiento.id || "");
            if (numPartida.includes(termino) || `#${numPartida}`.includes(termino) || numId === termino) {
                return true;
            }

            // 2. Coincidencia con concepto
            const concepto = String(asiento.concepto || "").toLowerCase();
            if (concepto.includes(termino)) {
                return true;
            }

            // 3. Coincidencia con nombres o códigos de cuentas involucradas en el asiento
            const detalles = asiento.detalle_asientos || [];
            const tieneCuenta = detalles.some(d => {
                const cod = String(d.cuentas?.codigo || d.cuenta_id || "").toLowerCase();
                const nom = String(d.cuentas?.nombre || "").toLowerCase();
                const desc = String(d.descripcion || "").toLowerCase();
                const padreCod = String(d.cuentas?.cuenta_padre?.codigo || "").toLowerCase();
                const padreNom = String(d.cuentas?.cuenta_padre?.nombre || "").toLowerCase();

                return cod.includes(termino) ||
                       nom.includes(termino) ||
                       desc.includes(termino) ||
                       padreCod.includes(termino) ||
                       padreNom.includes(termino);
            });

            return tieneCuenta;
        });
    }, [asientos, busquedaTexto, fechaDesde, fechaHasta]);

    const sumatorias = useMemo(() => {
        return asientosFiltrados.reduce((totales, asiento) => {
            (asiento.detalle_asientos || []).forEach(detalle => {
                totales.debe += Number(detalle.debe || 0);
                totales.haber += Number(detalle.haber || 0);
            });
            return totales;
        }, { debe: 0, haber: 0 });
    }, [asientosFiltrados]);

    const diarioCuadrado = Math.abs(sumatorias.debe - sumatorias.haber) < 0.005;
    const hayFiltrosActivos = Boolean(busquedaTexto || fechaDesde || fechaHasta);

    const limpiarFiltros = () => {
        setBusquedaTexto("");
        setFechaDesde("");
        setFechaHasta("");
    };

    const manejarExportacionPDF = () => {
        exportarLibroDiarioPDF({
            asientos: asientosFiltrados,
            desde: fechaDesde,
            hasta: fechaHasta,
            empresa: empresaNombre
        });
    };

    const manejarExportacionExcel = () => {
        exportarLibroDiarioExcel({
            asientos: asientosFiltrados,
            desde: fechaDesde,
            hasta: fechaHasta,
            empresa: empresaNombre
        });
    };

    const manejarAsientoGuardado = (asientoActualizado) => {
        setAsientos(prev => prev.map(a => String(a.id) === String(asientoActualizado.id) ? asientoActualizado : a));
        setModalRectificar(null);
        setNotificacion(`Partida #${asientoActualizado.numero_partida} modificada exitosamente. Registrado en auditoría.`);
        setTimeout(() => setNotificacion(""), 6000);
        setModalHistorial(asientoActualizado);
    };

    if (cargando) {
        return <h2>Cargando libro diario...</h2>;
    }

    if (error) {
        return <main className="message-error"><h1>Libro Diario</h1><p>{error}</p></main>;
    }

    return (
        <section className="view-section libro-diario-section">
            <style>{`
                /* =======================================
                   ESTILOS GENERALES Y MODO OSCURO
                   ======================================= */
                .btn-rectificar-asiento {
                    background: #059669;
                    color: #ffffff;
                    border: none;
                    padding: 5px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    box-shadow: 0 2px 4px rgba(5, 150, 105, 0.25);
                    transition: all 0.15s ease;
                }
                .btn-rectificar-asiento:hover {
                    background: #047857;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 6px rgba(5, 150, 105, 0.35);
                }
                .btn-eliminar-asiento {
                    background: #ffffff;
                    color: #dc2626;
                    border: 1px solid #fca5a5;
                    padding: 5px 10px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    transition: all 0.15s ease;
                }
                .btn-eliminar-asiento:hover {
                    background: #fee2e2;
                    border-color: #ef4444;
                    color: #b91c1c;
                    transform: translateY(-1px);
                }
                .badge-mas-reciente {
                    background: #ecfdf5;
                    border: 1px solid #a7f3d0;
                    color: #065f46;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 2px 6px;
                    border-radius: 10px;
                    margin-left: 6px;
                    white-space: nowrap;
                }
                .pill-rectificado {
                    background: #fef3c7;
                    border: 1px solid #fde68a;
                    color: #92400e;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 2px 8px;
                    border-radius: 10px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }
                .btn-ver-cambios-rect {
                    background: #f0fdf4;
                    border: 1px solid #a7f3d0;
                    color: #065f46;
                    font-size: 11px;
                    font-weight: 600;
                    padding: 2px 8px;
                    border-radius: 5px;
                    cursor: pointer;
                    margin-left: 8px;
                    transition: background-color 0.15s;
                }
                .btn-ver-cambios-rect:hover {
                    background: #dcfce7;
                }

                /* Barra de búsqueda y filtros */
                .diario-filtros-bar {
                    background: #ffffff;
                    border: 1.5px solid #DDE3E0;
                    border-radius: 10px;
                    padding: 12px 16px;
                    margin-bottom: 16px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    align-items: center;
                    justify-content: space-between;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                }
                .diario-busqueda-input-box {
                    position: relative;
                    flex: 1 1 300px;
                    display: flex;
                    align-items: center;
                }
                .diario-busqueda-input-box svg {
                    position: absolute;
                    left: 10px;
                    color: #9ca3af;
                }
                .diario-input-busqueda {
                    width: 100%;
                    padding: 8px 12px 8px 32px;
                    font-size: 13px;
                    border: 1.5px solid #DDE3E0;
                    border-radius: 6px;
                    background: #ffffff;
                    color: #1f2937;
                    outline: none;
                    transition: border-color 0.15s;
                }
                .diario-input-busqueda:focus {
                    border-color: #059669;
                    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
                }
                .diario-fechas-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .diario-fecha-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #4b5563;
                }
                .diario-input-fecha {
                    padding: 7px 10px;
                    font-size: 12px;
                    border: 1.5px solid #DDE3E0;
                    border-radius: 6px;
                    background: #ffffff;
                    color: #1f2937;
                    outline: none;
                }
                .diario-btn-limpiar {
                    background: #f3f4f6;
                    border: 1px solid #d1d5db;
                    color: #4b5563;
                    font-size: 12px;
                    font-weight: 600;
                    padding: 6px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .diario-btn-limpiar:hover {
                    background: #e5e7eb;
                    color: #1f2937;
                }

                /* Modales Rectificación */
                .modal-rect-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    padding: 16px;
                }
                .modal-rect-container {
                    background: #ffffff;
                    color: #1f2937;
                    border-radius: 14px;
                    max-width: 860px;
                    width: 100%;
                    max-height: 92vh;
                    overflow-y: auto;
                    padding: 24px;
                    box-shadow: 0 25px 35px -5px rgba(0,0,0,0.3);
                    border: 1.5px solid #a7f3d0;
                }
                .modal-rect-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 14px;
                }
                .modal-rect-badge-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 4px;
                }
                .modal-rect-badge-recent {
                    background: #ecfdf5;
                    border: 1.5px solid #a7f3d0;
                    color: #065f46;
                    padding: 3px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 700;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                }
                .modal-rect-date {
                    font-size: 12px;
                    color: #6b7280;
                }
                .modal-rect-title {
                    font-size: 20px;
                    font-weight: 800;
                    color: #065f46;
                    margin: 4px 0;
                }
                .modal-rect-close-btn {
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    color: #6b7280;
                    line-height: 1;
                }
                .modal-rect-banner {
                    background: #f0fdf4;
                    border: 1px solid #6ee7b7;
                    border-radius: 8px;
                    padding: 10px 14px;
                    margin-bottom: 18px;
                    font-size: 12px;
                    color: #047857;
                    line-height: 1.5;
                }
                .modal-rect-fields-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 14px;
                    margin-bottom: 16px;
                }
                .modal-rect-label {
                    display: block;
                    font-size: 13px;
                    font-weight: 600;
                    color: #374151;
                    margin-bottom: 5px;
                }
                .modal-rect-input {
                    width: 100%;
                    padding: 8px 12px;
                    font-size: 13px;
                    border: 1.5px solid #d1d5db;
                    border-radius: 6px;
                    background: #ffffff;
                    color: #1f2937;
                    outline: none;
                    transition: border-color 0.15s;
                }
                .modal-rect-input:focus {
                    border-color: #059669;
                    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
                }
                .btn-auto-generar-motivo {
                    background: #f0fdf4;
                    border: 1px solid #10b981;
                    color: #065f46;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 3px 8px;
                    border-radius: 5px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    transition: all 0.15s;
                }
                .btn-auto-generar-motivo:hover {
                    background: #d1fae5;
                    transform: translateY(-1px);
                }
                .modal-rect-subheading {
                    font-size: 13px;
                    font-weight: 700;
                    color: #1f2937;
                }
                .btn-agregar-linea-rect {
                    background: #f0fdf4;
                    border: 1.5px solid #10b981;
                    color: #065f46;
                    font-weight: 600;
                    font-size: 12px;
                    padding: 4px 10px;
                    border-radius: 6px;
                    cursor: pointer;
                }
                .modal-rect-table-shell {
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .modal-rect-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }
                .modal-rect-table th {
                    background: #065f46;
                    color: #ffffff;
                    padding: 8px 10px;
                    text-align: left;
                }
                .modal-rect-table td {
                    border-bottom: 1px solid #f3f4f6;
                }
                .modal-rect-total-row {
                    background: #f9fafb;
                    font-weight: 700;
                    border-top: 2px solid #e5e7eb;
                }
                .btn-quitar-linea-rect {
                    background: none;
                    border: none;
                    color: #ef4444;
                    font-size: 16px;
                    cursor: pointer;
                    font-weight: 700;
                }
                .modal-rect-balance {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 14px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    font-size: 13px;
                }
                .modal-rect-balance.is-balanced {
                    background: #ecfdf5;
                    border: 1.5px solid #a7f3d0;
                    color: #065f46;
                }
                .modal-rect-balance.is-unbalanced {
                    background: #fef2f2;
                    border: 1.5px solid #fca5a5;
                    color: #b91c1c;
                }
                .modal-rect-error-box {
                    background: #fef2f2;
                    border: 1px solid #f87171;
                    color: #b91c1c;
                    padding: 10px 14px;
                    border-radius: 8px;
                    margin-bottom: 16px;
                    font-size: 13px;
                }
                .btn-modal-cancelar {
                    background: #f3f4f6;
                    border: 1px solid #d1d5db;
                    color: #374151;
                    padding: 8px 18px;
                    border-radius: 6px;
                    font-weight: 600;
                    font-size: 13px;
                    cursor: pointer;
                }
                .btn-modal-guardar {
                    background: #059669;
                    border: none;
                    color: #ffffff;
                    padding: 8px 22px;
                    border-radius: 6px;
                    font-weight: 700;
                    font-size: 13px;
                    cursor: pointer;
                    box-shadow: 0 4px 6px -1px rgba(5,150,105,0.3);
                }
                .btn-modal-guardar:disabled {
                    background: #9ca3af;
                    cursor: not-allowed;
                    box-shadow: none;
                }

                /* Tarjetas Comparativa Historial */
                .modal-rect-metadata-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 12px;
                    padding: 12px 16px;
                    background: #f0fdf4;
                    border: 1.5px solid #a7f3d0;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    font-size: 12px;
                }
                .modal-rect-meta-title {
                    color: #065f46;
                    font-weight: 600;
                    display: block;
                }
                .modal-rect-meta-val {
                    color: #1f2937;
                }
                .comparativa-card-antes {
                    border: 1.5px solid #e5e7eb;
                    border-radius: 8px;
                    overflow: hidden;
                    background: #f9fafb;
                }
                .comparativa-card-despues {
                    border: 1.5px solid #a7f3d0;
                    border-radius: 8px;
                    overflow: hidden;
                    background: #f0fdf4;
                }
                .comparativa-card-header.antes {
                    background: #6b7280;
                    color: #ffffff;
                    padding: 8px 12px;
                    font-size: 12px;
                    font-weight: 700;
                }
                .comparativa-card-header.despues {
                    background: #059669;
                    color: #ffffff;
                    padding: 8px 12px;
                    font-size: 12px;
                    font-weight: 700;
                }
                .comparativa-card-concept {
                    padding: 8px 12px;
                    font-size: 12px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .comparativa-mini-table {
                    width: 100%;
                    font-size: 11px;
                    border-collapse: collapse;
                }
                .comparativa-mini-table th, .comparativa-mini-table td {
                    padding: 5px 8px;
                    border-bottom: 1px solid rgba(0,0,0,0.06);
                }

                /* Cuentas T */
                .cuenta-t-card {
                    border: 1.5px solid #a7f3d0;
                    border-radius: 10px;
                    overflow: hidden;
                    background: #ffffff;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                }
                .cuenta-t-header {
                    background: #065f46;
                    color: #ffffff;
                    padding: 8px 12px;
                    text-align: center;
                    font-weight: 700;
                    font-size: 13px;
                }
                .cuenta-t-body {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    min-height: 90px;
                }
                .cuenta-t-col {
                    padding: 8px 10px;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .cuenta-t-col.izquierda {
                    border-right: 2px solid #065f46;
                }
                .cuenta-t-col-title {
                    border-bottom: 1px solid #d1fae5;
                    padding-bottom: 4px;
                    margin-bottom: 6px;
                    font-size: 11px;
                    font-weight: 700;
                    color: #065f46;
                }
                .cuenta-t-monto {
                    font-size: 13px;
                    font-weight: 700;
                    color: #047857;
                    font-family: monospace;
                }
                .cuenta-t-antes {
                    font-size: 10px;
                    color: #6b7280;
                    text-decoration: line-through;
                }
                .cuenta-t-footer {
                    background: #f0fdf4;
                    border-top: 2px solid #065f46;
                    padding: 6px 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 11px;
                }

                /* =======================================
                   REGLAS ESPECÍFICAS PARA MODO OSCURO
                   ======================================= */
                .app-shell.tema-oscuro .diario-filtros-bar {
                    background: #1e293b;
                    border-color: #334155;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
                }
                .app-shell.tema-oscuro .diario-input-busqueda,
                .app-shell.tema-oscuro .diario-input-fecha {
                    background: #0f172a;
                    border-color: #475569;
                    color: #f8fafc;
                }
                .app-shell.tema-oscuro .diario-input-busqueda:focus,
                .app-shell.tema-oscuro .diario-input-fecha:focus {
                    border-color: #10b981;
                }
                .app-shell.tema-oscuro .diario-fecha-item {
                    color: #cbd5e1;
                }
                .app-shell.tema-oscuro .diario-btn-limpiar {
                    background: #334155;
                    border-color: #475569;
                    color: #e2e8f0;
                }
                .app-shell.tema-oscuro .diario-btn-limpiar:hover {
                    background: #475569;
                }

                /* Modal en modo oscuro */
                .app-shell.tema-oscuro .modal-rect-container {
                    background: #1e293b !important;
                    color: #f1f5f9 !important;
                    border-color: rgba(16, 185, 129, 0.4) !important;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7) !important;
                }
                .app-shell.tema-oscuro .modal-rect-title {
                    color: #34d399 !important;
                }
                .app-shell.tema-oscuro .modal-rect-badge-recent {
                    background: rgba(6, 78, 59, 0.45) !important;
                    border-color: #059669 !important;
                    color: #6ee7b7 !important;
                }
                .app-shell.tema-oscuro .modal-rect-date {
                    color: #94a3b8 !important;
                }
                .app-shell.tema-oscuro .modal-rect-banner {
                    background: rgba(6, 78, 59, 0.35) !important;
                    border-color: rgba(16, 185, 129, 0.4) !important;
                    color: #a7f3d0 !important;
                }
                .app-shell.tema-oscuro .modal-rect-label {
                    color: #e2e8f0 !important;
                }
                .app-shell.tema-oscuro .modal-rect-input {
                    background: #0f172a !important;
                    border-color: #475569 !important;
                    color: #f8fafc !important;
                }
                .app-shell.tema-oscuro .modal-rect-input:focus {
                    border-color: #10b981 !important;
                }
                .app-shell.tema-oscuro .btn-auto-generar-motivo {
                    background: rgba(16, 185, 129, 0.15) !important;
                    border-color: #059669 !important;
                    color: #6ee7b7 !important;
                }
                .app-shell.tema-oscuro .btn-auto-generar-motivo:hover {
                    background: rgba(16, 185, 129, 0.25) !important;
                }
                .app-shell.tema-oscuro .modal-rect-subheading {
                    color: #f1f5f9 !important;
                }
                .app-shell.tema-oscuro .btn-agregar-linea-rect {
                    background: rgba(16, 185, 129, 0.15) !important;
                    border-color: #059669 !important;
                    color: #6ee7b7 !important;
                }
                .app-shell.tema-oscuro .modal-rect-table-shell {
                    border-color: #334155 !important;
                }
                .app-shell.tema-oscuro .modal-rect-table th {
                    background: #064e3b !important;
                    color: #ecfdf5 !important;
                }
                .app-shell.tema-oscuro .modal-rect-table td {
                    border-color: #334155 !important;
                }
                .app-shell.tema-oscuro .modal-rect-total-row {
                    background: #0f172a !important;
                    border-color: #334155 !important;
                }
                .app-shell.tema-oscuro .modal-rect-balance.is-balanced {
                    background: rgba(6, 78, 59, 0.45) !important;
                    border-color: #059669 !important;
                    color: #6ee7b7 !important;
                }
                .app-shell.tema-oscuro .modal-rect-balance.is-unbalanced {
                    background: rgba(127, 29, 29, 0.4) !important;
                    border-color: #ef4444 !important;
                    color: #fca5a5 !important;
                }
                .app-shell.tema-oscuro .btn-modal-cancelar {
                    background: #334155 !important;
                    border-color: #475569 !important;
                    color: #e2e8f0 !important;
                }
                .app-shell.tema-oscuro .modal-rect-metadata-grid {
                    background: #0f172a !important;
                    border-color: #334155 !important;
                }
                .app-shell.tema-oscuro .modal-rect-meta-title {
                    color: #34d399 !important;
                }
                .app-shell.tema-oscuro .modal-rect-meta-val {
                    color: #f8fafc !important;
                }
                .app-shell.tema-oscuro .comparativa-card-antes {
                    background: #0f172a !important;
                    border-color: #334155 !important;
                }
                .app-shell.tema-oscuro .comparativa-card-despues {
                    background: #064e3b25 !important;
                    border-color: rgba(16, 185, 129, 0.5) !important;
                }
                .app-shell.tema-oscuro .cuenta-t-card {
                    background: #0f172a !important;
                    border-color: #059669 !important;
                }
                .app-shell.tema-oscuro .cuenta-t-header {
                    background: #064e3b !important;
                    color: #f8fafc !important;
                }
                .app-shell.tema-oscuro .cuenta-t-col.izquierda {
                    border-right-color: #059669 !important;
                }
                .app-shell.tema-oscuro .cuenta-t-col-title {
                    border-bottom-color: #334155 !important;
                    color: #34d399 !important;
                }
                .app-shell.tema-oscuro .cuenta-t-monto {
                    color: #10b981 !important;
                }
                .app-shell.tema-oscuro .cuenta-t-antes {
                    color: #94a3b8 !important;
                }
                .app-shell.tema-oscuro .cuenta-t-footer {
                    background: #022c22 !important;
                    border-top-color: #059669 !important;
                    color: #e2e8f0 !important;
                }
                /* Selector de Subcuentas en Modo Claro (garantiza fondo blanco y texto oscuro) */
                .selector-subcuenta-input {
                    background: #ffffff !important;
                    color: #1f2937 !important;
                    border: 1.5px solid #d1d5db !important;
                }
                .selector-subcuenta-input:focus {
                    border-color: #059669 !important;
                }
                .selector-subcuenta-menu {
                    background: #ffffff !important;
                    border: 1.5px solid #a7f3d0 !important;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15) !important;
                }
                .selector-subcuenta-item {
                    color: #1f2937 !important;
                }
                .selector-subcuenta-item.is-highlighted {
                    background-color: #ecfdf5 !important;
                    color: #065f46 !important;
                }
                .selector-subcuenta-item.is-selected {
                    background-color: #f0fdf4 !important;
                    color: #065f46 !important;
                }

                /* Selector de Subcuentas en Modo Oscuro */
                .app-shell.tema-oscuro .selector-subcuenta-input {
                    background: #0f172a !important;
                    border-color: #475569 !important;
                    color: #f8fafc !important;
                }
                .app-shell.tema-oscuro .selector-subcuenta-input:focus {
                    border-color: #10b981 !important;
                }
                .app-shell.tema-oscuro .selector-subcuenta-menu {
                    background: #1e293b !important;
                    border-color: #059669 !important;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6) !important;
                }
                .app-shell.tema-oscuro .selector-subcuenta-item {
                    color: #e2e8f0 !important;
                }
                .app-shell.tema-oscuro .selector-subcuenta-item.is-highlighted {
                    background-color: rgba(16, 185, 129, 0.2) !important;
                    color: #6ee7b7 !important;
                }
                .app-shell.tema-oscuro .selector-subcuenta-item.is-selected {
                    background-color: rgba(5, 150, 105, 0.25) !important;
                    color: #34d399 !important;
                }

                .app-shell.tema-oscuro .badge-mas-reciente {
                    background: rgba(6, 78, 59, 0.45);
                    border-color: #059669;
                    color: #6ee7b7;
                }
                .app-shell.tema-oscuro .btn-eliminar-asiento {
                    background: rgba(220, 38, 38, 0.15);
                    border-color: #ef4444;
                    color: #fca5a5;
                }
                .app-shell.tema-oscuro .btn-eliminar-asiento:hover {
                    background: rgba(220, 38, 38, 0.3);
                    color: #ffffff;
                }
                .app-shell.tema-oscuro .pill-rectificado {
                    background: rgba(146, 64, 14, 0.3);
                    border-color: #b45309;
                    color: #fde68a;
                }
                .app-shell.tema-oscuro .btn-ver-cambios-rect {
                    background: rgba(6, 78, 59, 0.35);
                    border-color: #059669;
                    color: #6ee7b7;
                }
                .app-shell.tema-oscuro .btn-ver-cambios-rect:hover {
                    background: rgba(6, 78, 59, 0.55);
                }
            `}</style>

            <div className="section-heading">
                <div>
                    <p className="eyebrow">Registro cronológico · Código de Comercio El Salvador</p>
                    <h1>Libro Diario</h1>
                </div>
                <ExportarPdfButton
                    onExport={manejarExportacionPDF}
                    onExportExcel={manejarExportacionExcel}
                    reporte="Libro Diario"
                    disabled={!asientosFiltrados.length}
                />
                <div className={diarioCuadrado ? "balance-status is-balanced" : "balance-status is-unbalanced"}>
                    {diarioCuadrado ? "Partida doble cuadrada" : "Revisar diferencias"}
                </div>
            </div>

            {/* Barra de Búsqueda y Filtros al Inicio del Libro Diario */}
            <div className="diario-filtros-bar">
                {/* Caja de Búsqueda por texto (Partida, Cuenta, Concepto) */}
                <div className="diario-busqueda-input-box">
                    <IconoLupa />
                    <input
                        type="text"
                        value={busquedaTexto}
                        onChange={e => setBusquedaTexto(e.target.value)}
                        placeholder="Buscar por N.° partida, nombre de cuenta o concepto (ej. 14, Bancos, Proveedores)..."
                        className="diario-input-busqueda"
                    />
                </div>

                {/* Filtros de Rango de Fecha */}
                <div className="diario-fechas-group">
                    <div className="diario-fecha-item">
                        <IconoCalendario size={13} />
                        <span>Desde:</span>
                        <input
                            type="date"
                            value={fechaDesde}
                            onChange={e => setFechaDesde(e.target.value)}
                            className="diario-input-fecha"
                        />
                    </div>

                    <div className="diario-fecha-item">
                        <span>Hasta:</span>
                        <input
                            type="date"
                            value={fechaHasta}
                            onChange={e => setFechaHasta(e.target.value)}
                            className="diario-input-fecha"
                        />
                    </div>

                    {hayFiltrosActivos && (
                        <button
                            type="button"
                            onClick={limpiarFiltros}
                            className="diario-btn-limpiar"
                            title="Restablecer todos los filtros"
                        >
                            ✕ Limpiar filtros
                        </button>
                    )}
                </div>

                {/* Indicador de resultados filtrados */}
                <div style={{ fontSize: "12px", color: "var(--muted, #6b7280)", fontWeight: "600" }}>
                    Mostrando {asientosFiltrados.length} de {asientos.length} partidas
                </div>
            </div>

            {/* Notificación toast de éxito */}
            {notificacion && (
                <div style={{
                    background: "#ecfdf5", border: "1.5px solid #10b981", color: "#065f46",
                    padding: "12px 18px", borderRadius: "8px", marginBottom: "16px",
                    fontWeight: "600", fontSize: "13px", display: "flex", alignItems: "center",
                    justifyContent: "space-between", boxShadow: "0 2px 6px rgba(5, 150, 105, 0.15)"
                }}>
                    <span>✓ {notificacion}</span>
                    <button
                        onClick={() => setNotificacion("")}
                        style={{ background: "none", border: "none", color: "#065f46", cursor: "pointer", fontSize: "16px" }}
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="table-shell diario-shell">
                <table className="diario-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>N.° partida</th>
                            <th>Cuenta</th>
                            <th>Parcial</th>
                            <th>Debe</th>
                            <th>Haber</th>
                        </tr>
                    </thead>
                    <tbody>
                        {asientosFiltrados.length === 0 && (
                            <tr>
                                <td colSpan="6" className="empty-state">
                                    {hayFiltrosActivos
                                        ? "No se encontraron asientos que coincidan con los filtros aplicados."
                                        : "No hay asientos registrados en este período."}
                                </td>
                            </tr>
                        )}
                        {asientosFiltrados.map(asiento => {
                            const grupos = gruposDeAsiento(asiento);
                            const totalDebe = (asiento.detalle_asientos || []).reduce((total, detalle) => total + Number(detalle.debe || 0), 0);
                            const totalHaber = (asiento.detalle_asientos || []).reduce((total, detalle) => total + Number(detalle.haber || 0), 0);

                            const esElMasReciente = ultimoAsiento && String(asiento.id) === String(ultimoAsiento.id);
                            const fueRectificado = Boolean(
                                asiento.rectificado ||
                                (asiento.concepto && asiento.concepto.includes("[Rectificado")) ||
                                asiento.rectificacion_historial
                            );

                            return (
                                <Fragment key={asiento.id}>
                                    {grupos.map((grupo, grupoIndice) => (
                                        <Fragment key={`${asiento.id}-${grupo.padre.id}`}>
                                            <tr className="diario-parent-row">
                                                <td>{grupoIndice === 0 ? fechaCorta(asiento.fecha) : ""}</td>
                                                <td>
                                                    {grupoIndice === 0 && (
                                                        <div style={{ display: "inline-flex", alignItems: "center" }}>
                                                            <span>{asiento.numero_partida}</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td><strong>{grupo.padre.codigo} - {grupo.padre.nombre}</strong></td>
                                                <td></td>
                                                <td>{grupo.debe > 0 ? `$ ${moneda(grupo.debe)}` : ""}</td>
                                                <td>{grupo.haber > 0 ? `$ ${moneda(grupo.haber)}` : ""}</td>
                                            </tr>
                                            {grupo.detalles.map((detalle, detalleIndice) => (
                                                <tr className="diario-child-row" key={`${asiento.id}-${detalle.cuenta_id}-${detalleIndice}`}>
                                                    <td></td>
                                                    <td></td>
                                                    <td className="child-account">{detalle.cuentas?.codigo} - {detalle.cuentas?.nombre}</td>
                                                    <td>{Number(detalle.debe || 0) + Number(detalle.haber || 0) > 0 ? `$ ${moneda(Number(detalle.debe || 0) + Number(detalle.haber || 0))}` : ""}</td>
                                                    <td>{Number(detalle.debe || 0) > 0 ? `$ ${moneda(detalle.debe)}` : ""}</td>
                                                    <td>{Number(detalle.haber || 0) > 0 ? `$ ${moneda(detalle.haber)}` : ""}</td>
                                                </tr>
                                            ))}
                                        </Fragment>
                                    ))}

                                    {/* Fila de Concepto */}
                                    <tr className="diario-concept-row">
                                        <td></td>
                                        <td></td>
                                        <td colSpan="4">
                                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                                                <span>C/ {asiento.concepto || "Sin concepto"}</span>
                                                {fueRectificado && (
                                                    <>
                                                        <span className="pill-rectificado">
                                                            <IconoLapiz size={12} />
                                                            <span>Rectificado</span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="btn-ver-cambios-rect"
                                                            onClick={() => setModalHistorial(asiento)}
                                                            title="Ver valores originales vs rectificados y Cuentas T"
                                                        >
                                                            Ver cambios y Cuentas T
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Fila de Totales de la Partida */}
                                    <tr className="diario-total-row">
                                        <td colSpan="4">
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                                                <span>Total partida {asiento.numero_partida}</span>
                                                <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                                                    <button
                                                        type="button"
                                                        className="btn-rectificar-asiento"
                                                        onClick={() => setModalRectificar(asiento)}
                                                        title="Modificar cuentas, montos o fecha de este asiento"
                                                    >
                                                        <IconoLapiz size={14} />
                                                        <span>Modificar</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-eliminar-asiento"
                                                        onClick={() => {
                                                            setModalEliminar(asiento);
                                                            setMotivoEliminar("");
                                                        }}
                                                        title="Eliminar este asiento contable"
                                                    >
                                                        <IconoBasura size={14} />
                                                        <span>Eliminar</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        <td>$ {moneda(totalDebe)}</td>
                                        <td>$ {moneda(totalHaber)}</td>
                                    </tr>
                                </Fragment>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="diario-grand-total-row">
                            <th colSpan="4">Sumatoria general</th>
                            <th>$ {moneda(sumatorias.debe)}</th>
                            <th>$ {moneda(sumatorias.haber)}</th>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Modal de Rectificación del Asiento Más Reciente */}
            {modalRectificar && (
                <ModalRectificarAsiento
                    asiento={modalRectificar}
                    cuentas={cuentas}
                    onCerrar={() => setModalRectificar(null)}
                    onGuardado={manejarAsientoGuardado}
                />
            )}

            {/* Modal de Comparación ANTES vs DESPUÉS y Cuentas T */}
            {modalHistorial && (
                <ModalHistorialRectificacion
                    asiento={modalHistorial}
                    cuentas={cuentas}
                    onCerrar={() => setModalHistorial(null)}
                />
            )}

            {/* Modal de Confirmación para Eliminar Asiento */}
            {modalEliminar && (
                <div className="modal-rect-overlay" style={{ zIndex: 10000 }}>
                    <div className="modal-rect-container" style={{ maxWidth: "480px" }}>
                        <div className="modal-rect-header">
                            <div>
                                <span style={{ fontSize: "12px", color: "#dc2626", fontWeight: "700" }}>
                                    Confirmar Eliminación
                                </span>
                                <h2 className="modal-rect-title" style={{ color: "#991b1b" }}>
                                    Eliminar Partida #{modalEliminar.numero_partida}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setModalEliminar(null)}
                                className="modal-rect-close-btn"
                                aria-label="Cerrar modal"
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ padding: "16px 0", color: "#374151", fontSize: "14px", lineHeight: "1.5" }}>
                            <p style={{ margin: "0 0 10px 0" }}>
                                ¿Está seguro de eliminar el asiento <strong>Partida #{modalEliminar.numero_partida}</strong> ({fechaCorta(modalEliminar.fecha)})?
                            </p>
                            <p style={{ margin: "0 0 14px 0", color: "#6b7280", fontSize: "13px" }}>
                                Concepto: <em>"{modalEliminar.concepto}"</em>
                            </p>
                            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 12px", borderRadius: "8px", fontSize: "12px", color: "#991b1b", marginBottom: "14px" }}>
                                Esta acción eliminará el asiento del Libro Diario y quedará registrada en el módulo de <strong>Auditoría</strong> con el respaldo de sus movimientos.
                            </div>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "6px" }}>
                                Motivo de la eliminación:
                            </label>
                            <input
                                type="text"
                                value={motivoEliminar}
                                onChange={e => setMotivoEliminar(e.target.value)}
                                placeholder="Ej. Corrección por partida duplicada o error..."
                                className="modal-rect-input"
                                style={{ width: "100%" }}
                            />
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                            <button
                                type="button"
                                onClick={() => setModalEliminar(null)}
                                style={{
                                    padding: "8px 16px",
                                    borderRadius: "6px",
                                    border: "1px solid #d1d5db",
                                    background: "#ffffff",
                                    color: "#374151",
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    cursor: "pointer"
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarEliminacion}
                                disabled={eliminando}
                                style={{
                                    padding: "8px 16px",
                                    borderRadius: "6px",
                                    border: "none",
                                    background: "#dc2626",
                                    color: "#ffffff",
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                    opacity: eliminando ? 0.7 : 1
                                }}
                            >
                                {eliminando ? "Eliminando..." : "Eliminar Asiento"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

export default LibroDiario;
