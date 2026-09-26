import { Fragment, useEffect, useMemo, useState } from "react";
import { obtenerLibroDiario } from "../services/libroDiarioService";
import { rectificarAsiento } from "../services/asientosService";
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
// Modal de Rectificación del Asiento Más Reciente
// ==========================================================
function ModalRectificarAsiento({ asiento, cuentas, onCerrar, onGuardado }) {
    const [concepto, setConcepto] = useState(() => {
        // Remover notas previas si existían
        return String(asiento.concepto || "").replace(/\s*\[Rectificado[^\]]*\]/gi, "").trim();
    });
    const [motivo, setMotivo] = useState("");
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

    // Cuentas que permiten movimientos para el selector
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
            // Si pone valor en Debe, limpiar Haber y viceversa
            if (campo === "debe" && valor) nueva.haber = "";
            if (campo === "haber" && valor) nueva.debe = "";
            return nueva;
        }));
    };

    const manejarGuardar = async (e) => {
        e.preventDefault();
        setError("");

        if (!concepto.trim()) {
            setError("El concepto del asiento no puede quedar vacío.");
            return;
        }
        if (!motivo.trim()) {
            setError("Debe especificar el motivo de la rectificación para cumplir con la auditoría del Código de Comercio.");
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
                detalles: lineas.map(l => ({
                    cuenta_id: l.cuenta_id,
                    descripcion: l.descripcion,
                    debe: parseFloat(l.debe) || 0,
                    haber: parseFloat(l.haber) || 0
                }))
            });

            onGuardado(respuesta.asiento || {
                ...asiento,
                concepto: `${concepto.trim()} [Rectificado el ${new Date().toLocaleDateString("es-SV")}: ${motivo.trim()}]`,
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
        <div className="modal-overlay" style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center",
            justifyContent: "center", zIndex: 10000, padding: "16px"
        }}>
            <div className="modal-content" style={{
                background: "#ffffff", borderRadius: "14px", maxWidth: "850px", width: "100%",
                maxHeight: "92vh", overflowY: "auto", padding: "26px",
                boxShadow: "0 25px 35px -5px rgba(0,0,0,0.3)", border: "1.5px solid #a7f3d0"
            }}>
                {/* Cabecera del Modal */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <span style={{
                                background: "#ecfdf5", border: "1.5px solid #a7f3d0", color: "#065f46",
                                padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: "700"
                            }}>
                                Partida #{asiento.numero_partida} · Asiento Más Reciente
                            </span>
                            <span style={{ fontSize: "12px", color: "#6b7280" }}>
                                Fecha original: {fechaCorta(asiento.fecha)}
                            </span>
                        </div>
                        <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#065f46", margin: "4px 0" }}>
                            Rectificar Asiento #{asiento.numero_partida}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onCerrar}
                        style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}
                    >
                        ✕
                    </button>
                </div>

                {/* Banner de Fundamento Legal */}
                <div style={{
                    background: "#f0fdf4", border: "1px solid #6ee7b7", borderRadius: "8px",
                    padding: "10px 14px", marginBottom: "18px", fontSize: "12px", color: "#047857", lineHeight: "1.5"
                }}>
                    <strong>⚖️ Código de Comercio de El Salvador:</strong> Solo se permite rectificar el asiento más reciente para no dejar espacios en la correlatividad ni alterar los saldos acumulados de períodos anteriores. Se registrarán los valores antes y después en la auditoría.
                </div>

                {error && (
                    <div style={{
                        background: "#fef2f2", border: "1px solid #f87171", color: "#b91c1c",
                        padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px"
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={manejarGuardar}>
                    {/* Concepto y Motivo */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "5px" }}>
                                Concepto del Asiento <span style={{ color: "#dc2626" }}>*</span>
                            </label>
                            <input
                                type="text"
                                value={concepto}
                                onChange={e => setConcepto(e.target.value)}
                                placeholder="Ej. Corrección venta anterior..."
                                style={{
                                    width: "100%", padding: "8px 12px", fontSize: "13px",
                                    border: "1.5px solid #d1d5db", borderRadius: "6px", outline: "none"
                                }}
                                required
                            />
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "5px" }}>
                                Motivo de la Rectificación <span style={{ color: "#dc2626" }}>*</span>
                            </label>
                            <input
                                type="text"
                                value={motivo}
                                onChange={e => setMotivo(e.target.value)}
                                placeholder="Ej. Corrección de monto en ventas y bancos"
                                style={{
                                    width: "100%", padding: "8px 12px", fontSize: "13px",
                                    border: "1.5px solid #a7f3d0", borderRadius: "6px", outline: "none", background: "#f0fdf4"
                                }}
                                required
                            />
                        </div>
                    </div>

                    {/* Tabla de Líneas del Asiento */}
                    <div style={{ marginBottom: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#1f2937" }}>
                                Líneas del Asiento (Partida Doble)
                            </span>
                            <button
                                type="button"
                                onClick={agregarLinea}
                                style={{
                                    background: "#f0fdf4", border: "1.5px solid #10b981", color: "#065f46",
                                    fontWeight: "600", fontSize: "12px", padding: "4px 10px", borderRadius: "6px", cursor: "pointer"
                                }}
                            >
                                + Agregar Línea
                            </button>
                        </div>

                        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                <thead>
                                    <tr style={{ background: "#065f46", color: "#ffffff", textAlign: "left" }}>
                                        <th style={{ padding: "8px 10px", width: "45%" }}>Subcuenta Contable</th>
                                        <th style={{ padding: "8px 10px", width: "25%" }}>Descripción (Opcional)</th>
                                        <th style={{ padding: "8px 10px", width: "14%", textAlign: "right" }}>Débito ($)</th>
                                        <th style={{ padding: "8px 10px", width: "14%", textAlign: "right" }}>Crédito ($)</th>
                                        <th style={{ padding: "8px 6px", width: "2%", textAlign: "center" }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineas.map((linea, index) => (
                                        <tr key={linea.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
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
                                                    placeholder="Detalle de línea..."
                                                    style={{ width: "100%", padding: "6px 8px", fontSize: "12px", border: "1px solid #d1d5db", borderRadius: "4px" }}
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
                                                    style={{ width: "100%", padding: "6px 8px", fontSize: "12px", textAlign: "right", border: "1px solid #d1d5db", borderRadius: "4px", fontWeight: "600" }}
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
                                                    style={{ width: "100%", padding: "6px 8px", fontSize: "12px", textAlign: "right", border: "1px solid #d1d5db", borderRadius: "4px", fontWeight: "600" }}
                                                />
                                            </td>
                                            <td style={{ padding: "6px 4px", textAlign: "center" }}>
                                                <button
                                                    type="button"
                                                    onClick={() => quitarLinea(linea.id)}
                                                    style={{ background: "none", border: "none", color: "#ef4444", fontSize: "16px", cursor: "pointer", fontWeight: "700" }}
                                                    title="Quitar línea"
                                                >
                                                    ×
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: "#f9fafb", fontWeight: "700", borderTop: "2px solid #e5e7eb" }}>
                                        <td colSpan="2" style={{ padding: "8px 10px", textAlign: "right" }}>Totales:</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", color: estaCuadrado ? "#047857" : "#b91c1c" }}>
                                            $ {moneda(totalDebe)}
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", color: estaCuadrado ? "#047857" : "#b91c1c" }}>
                                            $ {moneda(totalHaber)}
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Estado del balance */}
                    <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 14px", borderRadius: "8px", marginBottom: "20px",
                        background: estaCuadrado ? "#ecfdf5" : "#fef2f2",
                        border: `1.5px solid ${estaCuadrado ? "#a7f3d0" : "#fca5a5"}`
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "16px" }}>{estaCuadrado ? "✓" : "⚠️"}</span>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: estaCuadrado ? "#065f46" : "#b91c1c" }}>
                                {estaCuadrado ? "Partida Doble Cuadrada (Debe = Haber)" : `Diferencia de cuadre: $ ${moneda(diferencia)}`}
                            </span>
                        </div>
                        <span style={{ fontSize: "12px", color: "#4b5563" }}>
                            {lineas.length} líneas registradas
                        </span>
                    </div>

                    {/* Botones de acción */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                        <button
                            type="button"
                            onClick={onCerrar}
                            disabled={guardando}
                            style={{
                                background: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151",
                                padding: "8px 18px", borderRadius: "6px", fontWeight: "600", fontSize: "13px", cursor: "pointer"
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardando || !estaCuadrado}
                            style={{
                                background: estaCuadrado ? "#059669" : "#9ca3af",
                                border: "none", color: "#ffffff", padding: "8px 22px", borderRadius: "6px",
                                fontWeight: "700", fontSize: "13px", cursor: estaCuadrado ? "pointer" : "not-allowed",
                                boxShadow: estaCuadrado ? "0 4px 6px -1px rgba(5,150,105,0.3)" : "none"
                            }}
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
        // Extraer de concepto si no hay historial en memoria
        const match = String(asiento.concepto || "").match(/\[Rectificado el ([^:]+):\s*([^\]]+)\]/i);
        return {
            fecha: match ? match[1] : new Date().toLocaleDateString("es-SV"),
            usuario: "Usuario administrador",
            motivo: match ? match[2] : "Corrección contable del asiento más reciente",
            datos_anteriores: null,
            datos_nuevos: null
        };
    }, [asiento]);

    // Mapa de cuentas por ID para resolver nombres
    const cuentasMap = useMemo(() => {
        const m = new Map();
        cuentas.forEach(c => {
            m.set(String(c.id), c);
            m.set(String(c.codigo), c);
        });
        return m;
    }, [cuentas]);

    // Obtener líneas antes y después
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

    // Identificar las cuentas específicamente modificadas para generar sus Cuentas T
    const cuentasTModificadas = useMemo(() => {
        const mapaCuentas = new Map();

        // Registrar montos antes
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

        // Registrar montos después
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

        // Si no hay datos antes registrados explícitamente, tomamos las cuentas de la partida
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
        <div className="modal-overlay" style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center",
            justifyContent: "center", zIndex: 10000, padding: "16px"
        }}>
            <div className="modal-content" style={{
                background: "#ffffff", borderRadius: "14px", maxWidth: "900px", width: "100%",
                maxHeight: "92vh", overflowY: "auto", padding: "26px",
                boxShadow: "0 25px 35px -5px rgba(0,0,0,0.3)", border: "1.5px solid #a7f3d0"
            }}>
                {/* Cabecera */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <span style={{
                                background: "#ecfdf5", border: "1.5px solid #a7f3d0", color: "#065f46",
                                padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: "700"
                            }}>
                                ✏️ Registro de Rectificación
                            </span>
                            <span style={{ fontSize: "12px", color: "#6b7280" }}>
                                Partida #{asiento.numero_partida} · {fechaCorta(asiento.fecha)}
                            </span>
                        </div>
                        <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#065f46", margin: "4px 0" }}>
                            Detalle de Rectificación y Cuentas T
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onCerrar}
                        style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}
                    >
                        ✕
                    </button>
                </div>

                {/* Tarjeta de Metadatos de la Rectificación */}
                <div style={{
                    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "12px", padding: "12px 16px", background: "#f0fdf4", border: "1.5px solid #a7f3d0",
                    borderRadius: "8px", marginBottom: "20px", fontSize: "12px"
                }}>
                    <div>
                        <span style={{ color: "#065f46", fontWeight: "600", display: "block" }}>Fecha de Modificación</span>
                        <strong style={{ color: "#1f2937" }}>
                            {historial.fecha ? new Date(historial.fecha).toLocaleString("es-ES") : "Reciente"}
                        </strong>
                    </div>
                    <div>
                        <span style={{ color: "#065f46", fontWeight: "600", display: "block" }}>Modificado por</span>
                        <strong style={{ color: "#1f2937" }}>{historial.usuario || "Usuario del sistema"}</strong>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                        <span style={{ color: "#065f46", fontWeight: "600", display: "block" }}>Motivo de la Rectificación</span>
                        <strong style={{ color: "#047857" }}>{historial.motivo || "Ajuste de partida"}</strong>
                    </div>
                </div>

                {/* Sección 1: Comparación ANTES vs DESPUÉS */}
                <div style={{ marginBottom: "24px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#1f2937", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>⚖️</span> Comparativa: Asiento Original vs Asiento Rectificado
                    </h3>

                    <div style={{ display: "grid", gridTemplateColumns: lineasAntes.length > 0 ? "1fr 1fr" : "1fr", gap: "16px" }}>
                        {/* Asiento Original (Antes) */}
                        {lineasAntes.length > 0 && (
                            <div style={{ border: "1.5px solid #e5e7eb", borderRadius: "8px", overflow: "hidden", background: "#f9fafb" }}>
                                <div style={{ background: "#6b7280", color: "#ffffff", padding: "8px 12px", fontSize: "12px", fontWeight: "700" }}>
                                    Valores Anteriores (Original)
                                </div>
                                <div style={{ padding: "8px 12px", fontSize: "12px", color: "#4b5563", borderBottom: "1px solid #e5e7eb" }}>
                                    <em>C/ {historial.datos_anteriores?.concepto || asiento.concepto}</em>
                                </div>
                                <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#4b5563" }}>
                                            <th style={{ padding: "6px 8px", textAlign: "left" }}>Cuenta</th>
                                            <th style={{ padding: "6px 8px", textAlign: "right" }}>Debe</th>
                                            <th style={{ padding: "6px 8px", textAlign: "right" }}>Haber</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lineasAntes.map((l, idx) => (
                                            <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                                <td style={{ padding: "5px 8px" }}>
                                                    <strong>{l.cuenta_codigo}</strong> - {l.cuenta_nombre}
                                                </td>
                                                <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>
                                                    {Number(l.debe) > 0 ? `$ ${moneda(l.debe)}` : ""}
                                                </td>
                                                <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>
                                                    {Number(l.haber) > 0 ? `$ ${moneda(l.haber)}` : ""}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Asiento Rectificado (Después) */}
                        <div style={{ border: "1.5px solid #a7f3d0", borderRadius: "8px", overflow: "hidden", background: "#f0fdf4" }}>
                            <div style={{ background: "#059669", color: "#ffffff", padding: "8px 12px", fontSize: "12px", fontWeight: "700" }}>
                                ✓ Valores Corregidos (Rectificado)
                            </div>
                            <div style={{ padding: "8px 12px", fontSize: "12px", color: "#065f46", borderBottom: "1px solid #a7f3d0", fontWeight: "600" }}>
                                C/ {asiento.concepto}
                            </div>
                            <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1px solid #a7f3d0", color: "#065f46" }}>
                                        <th style={{ padding: "6px 8px", textAlign: "left" }}>Cuenta</th>
                                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Debe</th>
                                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Haber</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineasDespues.map((l, idx) => {
                                        const cod = l.cuenta_codigo || cuentasMap.get(String(l.cuenta_id))?.codigo || "";
                                        const nom = l.cuenta_nombre || cuentasMap.get(String(l.cuenta_id))?.nombre || "";
                                        return (
                                            <tr key={idx} style={{ borderBottom: "1px solid #d1fae5" }}>
                                                <td style={{ padding: "5px 8px" }}>
                                                    <strong style={{ color: "#047857" }}>{cod}</strong> - {nom}
                                                </td>
                                                <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: "700", color: "#065f46" }}>
                                                    {Number(l.debe) > 0 ? `$ ${moneda(l.debe)}` : ""}
                                                </td>
                                                <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: "700", color: "#065f46" }}>
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

                {/* Sección 2: Cuentas T de las Cuentas Modificadas */}
                <div>
                    <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#1f2937", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>📊</span> Cuentas "T" de las Cuentas Modificadas en este Asiento
                    </h3>

                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: "16px"
                    }}>
                        {cuentasTModificadas.map(cuentaT => {
                            const saldo = cuentaT.debeDespues - cuentaT.haberDespues;
                            const esDeudor = saldo >= 0;

                            return (
                                <div
                                    key={cuentaT.codigo}
                                    style={{
                                        border: "1.5px solid #a7f3d0", borderRadius: "10px", overflow: "hidden",
                                        background: "#ffffff", boxShadow: "0 2px 5px rgba(0,0,0,0.05)"
                                    }}
                                >
                                    {/* Cabecera de la Cuenta T */}
                                    <div style={{
                                        background: "#065f46", color: "#ffffff", padding: "8px 12px",
                                        textAlign: "center", fontWeight: "700", fontSize: "13px"
                                    }}>
                                        {cuentaT.codigo} - {cuentaT.nombre}
                                    </div>

                                    {/* Cuerpo "T": Debe y Haber */}
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "90px" }}>
                                        {/* Lado DEBE */}
                                        <div style={{
                                            borderRight: "2px solid #065f46", padding: "8px 10px",
                                            display: "flex", flexDirection: "column", justifyContent: "space-between"
                                        }}>
                                            <div style={{ borderBottom: "1px solid #d1fae5", paddingBottom: "4px", marginBottom: "6px", fontSize: "11px", fontWeight: "700", color: "#065f46" }}>
                                                DEBE
                                            </div>
                                            <div style={{ fontSize: "13px", fontWeight: "700", color: "#047857", fontFamily: "monospace" }}>
                                                {cuentaT.debeDespues > 0 ? `$ ${moneda(cuentaT.debeDespues)}` : "—"}
                                            </div>
                                            {cuentaT.debeAntes > 0 && cuentaT.debeAntes !== cuentaT.debeDespues && (
                                                <div style={{ fontSize: "10px", color: "#6b7280", textDecoration: "line-through" }}>
                                                    Antes: ${moneda(cuentaT.debeAntes)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Lado HABER */}
                                        <div style={{
                                            padding: "8px 10px",
                                            display: "flex", flexDirection: "column", justifyContent: "space-between"
                                        }}>
                                            <div style={{ borderBottom: "1px solid #d1fae5", paddingBottom: "4px", marginBottom: "6px", fontSize: "11px", fontWeight: "700", color: "#065f46", textAlign: "right" }}>
                                                HABER
                                            </div>
                                            <div style={{ fontSize: "13px", fontWeight: "700", color: "#047857", fontFamily: "monospace", textAlign: "right" }}>
                                                {cuentaT.haberDespues > 0 ? `$ ${moneda(cuentaT.haberDespues)}` : "—"}
                                            </div>
                                            {cuentaT.haberAntes > 0 && cuentaT.haberAntes !== cuentaT.haberDespues && (
                                                <div style={{ fontSize: "10px", color: "#6b7280", textDecoration: "line-through", textAlign: "right" }}>
                                                    Antes: ${moneda(cuentaT.haberAntes)}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Pie de Saldo */}
                                    <div style={{
                                        background: "#f0fdf4", borderTop: "2px solid #065f46", padding: "6px 10px",
                                        display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px"
                                    }}>
                                        <span style={{ fontWeight: "700", color: "#065f46" }}>
                                            Saldo {esDeudor ? "Deudor" : "Acreedor"}:
                                        </span>
                                        <span style={{ fontWeight: "800", color: "#047857", fontFamily: "monospace" }}>
                                            $ {moneda(Math.abs(saldo))}
                                        </span>
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
                        style={{
                            background: "#059669", color: "#ffffff", border: "none",
                            padding: "8px 24px", borderRadius: "6px", fontWeight: "700", fontSize: "13px", cursor: "pointer"
                        }}
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
function LibroDiario({ filtroDesde, filtroHasta, empresaNombre = "Empresa" } = {}) {
    const [asientos, setAsientos] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");

    // Modales de rectificación
    const [modalRectificar, setModalRectificar] = useState(null); // Asiento a rectificar
    const [modalHistorial, setModalHistorial] = useState(null); // Asiento a consultar historial
    const [notificacion, setNotificacion] = useState("");

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
        // Ordenar por número de partida descendente para hallar el más reciente
        return [...asientos].sort((a, b) => {
            const numA = Number(a.numero_partida || a.id || 0);
            const numB = Number(b.numero_partida || b.id || 0);
            return numB - numA;
        })[0];
    }, [asientos]);

    const asientosFiltrados = useMemo(() => {
        return asientos.filter(asiento => {
            if (!asiento.fecha) return true;
            if (filtroDesde && asiento.fecha < filtroDesde) return false;
            if (filtroHasta && asiento.fecha > filtroHasta) return false;
            return true;
        });
    }, [asientos, filtroDesde, filtroHasta]);

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

    const manejarExportacionPDF = () => {
        exportarLibroDiarioPDF({
            asientos: asientosFiltrados,
            desde: filtroDesde,
            hasta: filtroHasta,
            empresa: empresaNombre
        });
    };

    const manejarExportacionExcel = () => {
        exportarLibroDiarioExcel({
            asientos: asientosFiltrados,
            desde: filtroDesde,
            hasta: filtroHasta,
            empresa: empresaNombre
        });
    };

    const manejarAsientoGuardado = (asientoActualizado) => {
        setAsientos(prev => prev.map(a => a.id === asientoActualizado.id ? asientoActualizado : a));
        setModalRectificar(null);
        setNotificacion(`Partida #${asientoActualizado.numero_partida} rectificada exitosamente sin romper la correlatividad.`);
        setTimeout(() => setNotificacion(""), 6000);

        // Abrir automáticamente el modal con la comparación y Cuentas T
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
                            <tr><td colSpan="6" className="empty-state">No hay asientos registrados en este período.</td></tr>
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
                                                            {esElMasReciente && (
                                                                <span className="badge-mas-reciente" title="Asiento más reciente (único rectificable)">
                                                                    Último
                                                                </span>
                                                            )}
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
                                                            ✏️ Rectificado
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
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <span>Total partida {asiento.numero_partida}</span>
                                                {/* EL BOTÓN DE EDITAR SOLO SE COLOCA EN EL ÚLTIMO ASIENTO */}
                                                {esElMasReciente && (
                                                    <button
                                                        type="button"
                                                        className="btn-rectificar-asiento"
                                                        onClick={() => setModalRectificar(asiento)}
                                                        title="Rectificar asiento más reciente (Código de Comercio El Salvador)"
                                                    >
                                                        ✏️ Rectificar Asiento
                                                    </button>
                                                )}
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
        </section>
    );
}

export default LibroDiario;
