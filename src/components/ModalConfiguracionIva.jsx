import { useState, useMemo } from "react";
import { 
    obtenerConfiguracionIva, 
    guardarConfiguracionGeneralIva, 
    restablecerIvaSugerido,
    cuentaAplicaIva,
    detectarCuentasIva
} from "../utils/configuracionIva";

function ModalConfiguracionIva({ abierto, cuentas = [], usuario, alCerrar, alGuardar }) {
    const empresaId = usuario?.empresa_id;

    // Configuración actual
    const [configuracion, setConfiguracion] = useState(() => {
        const conf = obtenerConfiguracionIva(empresaId) || {};
        const detectadas = detectarCuentasIva(cuentas);

        return {
            habilitado: conf.habilitado !== false,
            cuentaCreditoCodigo: conf.cuentaCreditoCodigo || (detectadas.cuentaCredito ? String(detectadas.cuentaCredito.codigo).trim() : ""),
            cuentaDebitoCodigo: conf.cuentaDebitoCodigo || (detectadas.cuentaDebito ? String(detectadas.cuentaDebito.codigo).trim() : "")
        };
    });

    const [mensaje, setMensaje] = useState("");
    const [guardando, setGuardando] = useState(false);

    // Cuentas elegibles para asignación (preferir cuentas hoja o con permite_movimientos)
    const opcionesCuentas = useMemo(() => {
        return [...cuentas].sort((a, b) => 
            String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true })
        );
    }, [cuentas]);

    // Estadísticas actuales de IVA
    const estadisticas = useMemo(() => {
        const confActual = obtenerConfiguracionIva(empresaId);
        let conIva = 0;
        let exentas = 0;
        let agrupadora = 0;

        cuentas.forEach(c => {
            if (!c.permite_movimientos) {
                agrupadora++;
            } else if (cuentaAplicaIva(c, confActual, empresaId)) {
                conIva++;
            } else {
                exentas++;
            }
        });

        return { total: cuentas.length, conIva, exentas, agrupadora };
    }, [cuentas, empresaId, configuracion]);

    if (!abierto) return null;

    function manejarGuardar(e) {
        e.preventDefault();
        setGuardando(true);
        try {
            const nuevaConfig = guardarConfiguracionGeneralIva(empresaId, {
                habilitado: configuracion.habilitado,
                cuentaCreditoCodigo: configuracion.cuentaCreditoCodigo || null,
                cuentaDebitoCodigo: configuracion.cuentaDebitoCodigo || null
            });

            alGuardar?.(nuevaConfig);
            alCerrar();
        } catch (err) {
            console.error("Error al guardar configuración de IVA:", err);
            setMensaje("No se pudo guardar la configuración. Intenta nuevamente.");
        } finally {
            setGuardando(false);
        }
    }

    function manejarRestablecerSugerencias() {
        if (!window.confirm("¿Deseas restablecer las cuentas con IVA según las reglas contables oficiales? Se marcarán las compras, gastos deducibles, activos fijos y ventas, dejando exentas las cuentas de efectivo, bancos, préstamos y capital.")) {
            return;
        }

        try {
            const confActualizada = restablecerIvaSugerido(empresaId, cuentas);
            setConfiguracion(prev => ({
                ...prev,
                cuentaCreditoCodigo: confActualizada.cuentaCreditoCodigo || prev.cuentaCreditoCodigo,
                cuentaDebitoCodigo: confActualizada.cuentaDebitoCodigo || prev.cuentaDebitoCodigo
            }));
            setMensaje("¡Sugerencias contables de IVA aplicadas exitosamente!");
            alGuardar?.(confActualizada);
            setTimeout(() => setMensaje(""), 4000);
        } catch (err) {
            console.error("Error al restablecer sugerencias de IVA:", err);
        }
    }

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-iva-titulo">
            <div 
                className="modal-contenido modal-catalogo" 
                style={{ 
                    maxWidth: "640px", 
                    width: "95%",
                    backgroundColor: "#FFFFFF",
                    color: "#1C2321",
                    borderRadius: "12px",
                    boxShadow: "0 20px 45px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.12)",
                    border: "1px solid #DDE3E0",
                    padding: "24px",
                    position: "relative",
                    zIndex: 10000
                }}
            >
                <div className="modal-header" style={{ borderBottom: "1px solid #EAEFEA", paddingBottom: "12px" }}>
                    <div>
                        <p className="eyebrow" style={{ margin: 0, color: "#1B4332" }}>
                            Parámetros Tributarios (El Salvador)
                        </p>
                        <h3 id="modal-iva-titulo" style={{ margin: "4px 0 0", fontSize: "20px", color: "#173B35" }}>
                            Configuración de IVA (13%)
                        </h3>
                    </div>
                    <button type="button" className="btn-cerrar" onClick={alCerrar} title="Cerrar modal">
                        ×
                    </button>
                </div>

                {mensaje && (
                    <div style={{
                        background: "#EAF5EE",
                        color: "#1B4332",
                        border: "1px solid #B8DEC3",
                        padding: "10px 14px",
                        borderRadius: "6px",
                        fontSize: "13px",
                        margin: "14px 0 6px"
                    }}>
                        {mensaje}
                    </div>
                )}

                <form onSubmit={manejarGuardar} style={{ marginTop: "16px" }}>
                    {/* Habilitar / Deshabilitar IVA */}
                    <div style={{
                        background: configuracion.habilitado ? "#F2FAF5" : "#F9FAFB",
                        border: configuracion.habilitado ? "1px solid #B8DEC3" : "1px solid #DDE3E0",
                        borderRadius: "8px",
                        padding: "14px",
                        marginBottom: "16px"
                    }}>
                        <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={configuracion.habilitado}
                                onChange={e => setConfiguracion(prev => ({ ...prev, habilitado: e.target.checked }))}
                                style={{ accentColor: "#1B4332", width: "18px", height: "18px", marginTop: "2px" }}
                            />
                            <div>
                                <strong style={{ fontSize: "14px", color: "#173B35" }}>
                                    Habilitar cálculo automático de IVA (13%) en asientos contables
                                </strong>
                                <span style={{ display: "block", fontSize: "12px", color: "#5F6B67", marginTop: "2px" }}>
                                    Al crear un asiento de compras o ventas, el sistema calculará automáticamente la línea de Débito o Crédito Fiscal y ajustará la partida.
                                </span>
                            </div>
                        </label>
                    </div>

                    {/* Selector de Cuentas Receptoras de IVA */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#173B35", marginBottom: "4px" }}>
                                Cuenta IVA Crédito Fiscal (Compras/Gastos):
                            </label>
                            <select
                                value={configuracion.cuentaCreditoCodigo}
                                onChange={e => setConfiguracion(prev => ({ ...prev, cuentaCreditoCodigo: e.target.value }))}
                                disabled={!configuracion.habilitado}
                                style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: "5px",
                                    border: "1px solid #DDE3E0",
                                    fontSize: "12.5px",
                                    background: configuracion.habilitado ? "#FFF" : "#F4F5F6"
                                }}
                            >
                                <option value="">-- Sin cuenta asignada --</option>
                                {opcionesCuentas.map(c => (
                                    <option key={`cred-${c.id}`} value={c.codigo}>
                                        {c.codigo} - {c.nombre} {c.permite_movimientos ? "" : "(Agrupadora)"}
                                    </option>
                                ))}
                            </select>
                            <span style={{ fontSize: "11px", color: "#5F6B67", display: "block", marginTop: "3px" }}>
                                Generalmente: 1105 (IVA Crédito Fiscal)
                            </span>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#173B35", marginBottom: "4px" }}>
                                Cuenta IVA Débito Fiscal (Ventas/Ingresos):
                            </label>
                            <select
                                value={configuracion.cuentaDebitoCodigo}
                                onChange={e => setConfiguracion(prev => ({ ...prev, cuentaDebitoCodigo: e.target.value }))}
                                disabled={!configuracion.habilitado}
                                style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: "5px",
                                    border: "1px solid #DDE3E0",
                                    fontSize: "12.5px",
                                    background: configuracion.habilitado ? "#FFF" : "#F4F5F6"
                                }}
                            >
                                <option value="">-- Sin cuenta asignada --</option>
                                {opcionesCuentas.map(c => (
                                    <option key={`deb-${c.id}`} value={c.codigo}>
                                        {c.codigo} - {c.nombre} {c.permite_movimientos ? "" : "(Agrupadora)"}
                                    </option>
                                ))}
                            </select>
                            <span style={{ fontSize: "11px", color: "#5F6B67", display: "block", marginTop: "3px" }}>
                                Generalmente: 2102 o 2107 (IVA Débito Fiscal)
                            </span>
                        </div>
                    </div>

                    {/* Resumen de cuentas con IVA */}
                    <div style={{
                        background: "#FAFCFB",
                        border: "1px solid #DDE3E0",
                        borderRadius: "8px",
                        padding: "12px 16px",
                        marginBottom: "16px"
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <strong style={{ fontSize: "13px", color: "#173B35" }}>
                                Resumen del Catálogo y Estado de IVA:
                            </strong>
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={manejarRestablecerSugerencias}
                                style={{ fontSize: "11.5px", padding: "4px 10px" }}
                                title="Auto-detecta y marca las compras, gastos deducibles y ventas oficiales"
                            >
                                ✨ Aplicar sugerencias estándar
                            </button>
                        </div>

                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, 1fr)",
                            gap: "8px",
                            textAlign: "center",
                            fontSize: "12px"
                        }}>
                            <div style={{ background: "#EAF5EE", padding: "8px", borderRadius: "5px", border: "1px solid #B8DEC3" }}>
                                <span style={{ color: "#1B4332", fontWeight: "700", fontSize: "16px", display: "block" }}>
                                    {estadisticas.conIva}
                                </span>
                                <span style={{ color: "#2D6A4F", fontSize: "11px" }}>Aplica IVA (13%)</span>
                            </div>
                            <div style={{ background: "#F4F6F5", padding: "8px", borderRadius: "5px", border: "1px solid #DDE3E0" }}>
                                <span style={{ color: "#40534C", fontWeight: "700", fontSize: "16px", display: "block" }}>
                                    {estadisticas.exentas}
                                </span>
                                <span style={{ color: "#5F6B67", fontSize: "11px" }}>Cuentas Exentas</span>
                            </div>
                            <div style={{ background: "#F4F6F5", padding: "8px", borderRadius: "5px", border: "1px solid #DDE3E0" }}>
                                <span style={{ color: "#5F6B67", fontWeight: "700", fontSize: "16px", display: "block" }}>
                                    {estadisticas.agrupadora}
                                </span>
                                <span style={{ color: "#778", fontSize: "11px" }}>Agrupadoras (N/A)</span>
                            </div>
                        </div>

                        <p style={{ margin: "10px 0 0", fontSize: "11.5px", color: "#5F6B67" }}>
                            💡 <strong>Edición directa:</strong> También puedes cambiar si cualquier cuenta aplica IVA o está exenta directamente haciendo clic en la columna <em>"IVA (13%)"</em> de la tabla de cuentas del catálogo.
                        </p>
                    </div>

                    <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                        <button
                            type="button"
                            className="button-secondary"
                            onClick={alCerrar}
                            disabled={guardando}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="button-primary"
                            disabled={guardando}
                        >
                            {guardando ? "Guardando..." : "Guardar configuración"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default ModalConfiguracionIva;
