import { useState } from "react";
import { 
    crearCuenta, 
    actualizarCuenta, 
    obtenerNaturaleza, 
    TIPOS_VALIDOS, 
    NIVELES_VALIDOS 
} from "../services/cuentasService";
import { 
    obtenerConfiguracionIva, 
    cuentaAplicaIva, 
    alternarIvaCuenta, 
    inferirLlevaIvaPorDefecto 
} from "../utils/configuracionIva";

function ModalCuenta({ abierto, cuenta, cuentaPadreInicial, cuentas = [], usuario, alCerrar, alGuardar }) {
    const esEdicion = Boolean(cuenta?.id);
    const tieneMovimientos = Boolean(cuenta?.tiene_movimientos);

    const [formulario, setFormulario] = useState(() => {
        const configIva = obtenerConfiguracionIva(usuario?.empresa_id);

        if (cuenta) {
            return {
                codigo: cuenta.codigo || "",
                nombre: cuenta.nombre || "",
                tipo: cuenta.tipo || "ACTIVO",
                nivel: cuenta.nivel || "CUENTA",
                cuenta_padre_id: cuenta.cuenta_padre_id ? String(cuenta.cuenta_padre_id) : "",
                permite_movimientos: Boolean(cuenta.permite_movimientos),
                lleva_iva: cuentaAplicaIva(cuenta, configIva, usuario?.empresa_id),
                estado: cuenta.estado !== false
            };
        }
        if (cuentaPadreInicial) {
            const cod = `${cuentaPadreInicial.codigo}`;
            const tipoPadre = cuentaPadreInicial.tipo || "ACTIVO";
            return {
                codigo: cod,
                nombre: "",
                tipo: tipoPadre,
                nivel: cuentaPadreInicial.nivel === "GRUPO" ? "SUBGRUPO" : (cuentaPadreInicial.nivel === "SUBGRUPO" ? "CUENTA" : "SUBCUENTA"),
                cuenta_padre_id: String(cuentaPadreInicial.id),
                permite_movimientos: cuentaPadreInicial.nivel !== "GRUPO",
                lleva_iva: inferirLlevaIvaPorDefecto({ codigo: cod, tipo: tipoPadre }),
                estado: true
            };
        }
        return {
            codigo: "",
            nombre: "",
            tipo: "ACTIVO",
            nivel: "CUENTA",
            cuenta_padre_id: "",
            permite_movimientos: true,
            lleva_iva: false,
            estado: true
        };
    });

    const [errores, setErrores] = useState([]);
    const [guardando, setGuardando] = useState(false);

    if (!abierto) return null;

    const naturalezaActual = obtenerNaturaleza(formulario.tipo);
    const esAgrupadora = formulario.nivel === "GRUPO" || formulario.nivel === "SUBGRUPO";

    // Posibles padres: no pueden ser la cuenta misma y deben ser de nivel superior o igual
    const posiblesPadres = cuentas.filter(c => {
        if (esEdicion && String(c.id) === String(cuenta.id)) return false;
        // La cuenta padre debe ser del mismo tipo
        return String(c.tipo).toUpperCase() === String(formulario.tipo).toUpperCase();
    });

    function manejarCambioCampo(campo, valor) {
        setFormulario(prev => {
            const actual = { ...prev, [campo]: valor };

            // Si cambia el nivel a GRUPO o SUBGRUPO, forzar permite_movimientos y lleva_iva a false
            if (campo === "nivel" && (valor === "GRUPO" || valor === "SUBGRUPO")) {
                actual.permite_movimientos = false;
                actual.lleva_iva = false;
            }

            // Si selecciona un padre, sincronizar tipo si difiere
            if (campo === "cuenta_padre_id" && valor) {
                const padre = cuentas.find(c => String(c.id) === String(valor));
                if (padre) {
                    actual.tipo = padre.tipo;
                }
            }

            // Si cambia el tipo, resetear padre si no coincide
            if (campo === "tipo") {
                if (actual.cuenta_padre_id) {
                    const padre = cuentas.find(c => String(c.id) === String(actual.cuenta_padre_id));
                    if (padre && padre.tipo !== valor) {
                        actual.cuenta_padre_id = "";
                    }
                }
            }

            if (!esEdicion && (campo === "tipo" || campo === "codigo")) {
                if (actual.nivel !== "GRUPO" && actual.nivel !== "SUBGRUPO") {
                    actual.lleva_iva = inferirLlevaIvaPorDefecto({ codigo: actual.codigo, tipo: actual.tipo });
                }
            }

            return actual;
        });
    }

    async function manejarSubmit(e) {
        e.preventDefault();
        setErrores([]);

        const codigoTrim = formulario.codigo.trim();
        const nombreTrim = formulario.nombre.trim();

        // Validaciones locales
        const errs = [];
        if (!codigoTrim) errs.push("El código de la cuenta es obligatorio.");
        if (!nombreTrim) errs.push("El nombre de la cuenta es obligatorio.");
        if (formulario.nivel === "SUBCUENTA" && !formulario.cuenta_padre_id) {
            errs.push("Una subcuenta debe tener obligatoriamente una cuenta padre.");
        }
        if (esAgrupadora && formulario.permite_movimientos) {
            errs.push("Las cuentas de nivel GRUPO y SUBGRUPO son agrupadoras y no pueden permitir movimientos.");
        }

        // Unicidad de código en el catálogo
        const codigoExistente = cuentas.some(c => 
            (!esEdicion || String(c.id) !== String(cuenta.id)) &&
            String(c.codigo).trim().toLowerCase() === codigoTrim.toLowerCase()
        );
        if (codigoExistente) {
            errs.push(`El código "${codigoTrim}" ya está registrado en el catálogo.`);
        }

        if (errs.length > 0) {
            setErrores(errs);
            return;
        }

        try {
            setGuardando(true);
            let resultado;
            if (esEdicion) {
                resultado = await actualizarCuenta(cuenta.id, formulario, cuentas, tieneMovimientos);
            } else {
                resultado = await crearCuenta(formulario, cuentas, usuario?.empresa_id);
            }

            // Sincronizar estado de IVA para este código de cuenta
            const codigoFinal = String(resultado?.codigo || formulario.codigo).trim();
            if (codigoFinal) {
                alternarIvaCuenta(usuario?.empresa_id, codigoFinal, Boolean(formulario.lleva_iva), cuentas);
            }

            alGuardar(resultado);
            alCerrar();
        } catch (error) {
            setErrores([error.message || "Ocurrió un error al guardar la cuenta."]);
        } finally {
            setGuardando(false);
        }
    }

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-cuenta-titulo">
            <div
                className="modal-contenido modal-catalogo"
                style={{
                    maxWidth: "580px",
                    width: "95%",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    backgroundColor: "#FFFFFF",
                    color: "#1C2321",
                    borderRadius: "12px",
                    boxShadow: "0 20px 45px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.12)",
                    border: "1px solid #DDE3E0",
                    padding: "18px 20px",
                    position: "relative",
                    zIndex: 10000
                }}
            >
                <div className="modal-header">
                    <div>
                        <p className="eyebrow" style={{ margin: 0 }}>
                            {esEdicion ? "Modificación de cuenta" : "Nueva cuenta contable"}
                        </p>
                        <h3 id="modal-cuenta-titulo" style={{ margin: "4px 0 0", fontSize: "20px" }}>
                            {esEdicion ? `Editar cuenta: ${cuenta.codigo}` : "Registrar en catálogo"}
                        </h3>
                    </div>
                    <button type="button" className="btn-cerrar" onClick={alCerrar} title="Cerrar modal">
                        ×
                    </button>
                </div>

                {tieneMovimientos && (
                    <div className="message-warning" style={{
                        fontSize: "13px",
                        margin: "16px 0 8px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px"
                    }}>
                        <div>
                            <strong>Cuenta con movimientos contables registrados:</strong>
                            <p style={{ margin: "2px 0 0", fontSize: "12px" }}>
                                Por integridad del libro diario y mayor, no se permite cambiar su tipo, código ni nivel, ni eliminarla. Puedes modificar su nombre o inactivarla.
                            </p>
                        </div>
                    </div>
                )}

                {errores.length > 0 && (
                    <div className="message-error" style={{ margin: "14px 0 8px", padding: "10px 14px" }}>
                        <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px" }}>
                            {errores.map((err, i) => (
                                <li key={i}>{err}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <form onSubmit={manejarSubmit} style={{ marginTop: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                                Código contable *
                            </label>
                            <input
                                type="text"
                                value={formulario.codigo}
                                onChange={e => manejarCambioCampo("codigo", e.target.value)}
                                placeholder="Ej: 110101"
                                disabled={tieneMovimientos}
                                required
                                style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: "5px",
                                    border: "1px solid #DDE3E0",
                                    fontFamily: "var(--mono)",
                                    fontSize: "14px",
                                    background: tieneMovimientos ? "#F4F5F6" : "#FFF"
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                                Nivel de la cuenta *
                            </label>
                            <select
                                value={formulario.nivel}
                                onChange={e => manejarCambioCampo("nivel", e.target.value)}
                                disabled={tieneMovimientos}
                                style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: "5px",
                                    border: "1px solid #DDE3E0",
                                    fontSize: "14px",
                                    background: tieneMovimientos ? "#F4F5F6" : "#FFF"
                                }}
                            >
                                {NIVELES_VALIDOS.map(niv => (
                                    <option key={niv} value={niv}>{niv}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ marginTop: "12px" }}>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                            Nombre de la cuenta *
                        </label>
                        <input
                            type="text"
                            value={formulario.nombre}
                            onChange={e => manejarCambioCampo("nombre", e.target.value)}
                            placeholder="Ej: Caja General o Bancos Nacionales"
                            required
                            style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: "5px",
                                border: "1px solid #DDE3E0",
                                fontSize: "14px"
                            }}
                        />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "12px", marginTop: "12px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                                Tipo contable *
                            </label>
                            <select
                                value={formulario.tipo}
                                onChange={e => manejarCambioCampo("tipo", e.target.value)}
                                disabled={tieneMovimientos}
                                style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: "5px",
                                    border: "1px solid #DDE3E0",
                                    fontSize: "14px",
                                    background: tieneMovimientos ? "#F4F5F6" : "#FFF"
                                }}
                            >
                                {TIPOS_VALIDOS.map(tip => (
                                    <option key={tip} value={tip}>{tip}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                                Naturaleza (derivada)
                            </label>
                            <div style={{
                                padding: "7px 10px",
                                borderRadius: "5px",
                                border: "1px solid #DDE3E0",
                                background: naturalezaActual === "DEUDORA" ? "#EAF5EE" : "#F2F6F4",
                                color: naturalezaActual === "DEUDORA" ? "#1B4332" : "#2D6A4F",
                                fontWeight: "600",
                                fontSize: "13px",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}>
                                <span>{naturalezaActual === "DEUDORA" ? "Deudora" : "Acreedora"}</span>
                                <span style={{ fontSize: "11px", fontWeight: "normal", color: "#667" }}>
                                    (por tipo {formulario.tipo})
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: "12px" }}>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                            Cuenta padre {formulario.nivel === "SUBCUENTA" && <span style={{ color: "#B3261E" }}>* (requerida para subcuenta)</span>}
                        </label>
                        <select
                            value={formulario.cuenta_padre_id}
                            onChange={e => manejarCambioCampo("cuenta_padre_id", e.target.value)}
                            disabled={tieneMovimientos}
                            style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: "5px",
                                border: "1px solid #DDE3E0",
                                fontSize: "14px",
                                background: tieneMovimientos ? "#F4F5F6" : "#FFF"
                            }}
                        >
                            <option value="">-- Sin cuenta padre (Cuenta principal/Grupo raíz) --</option>
                            {posiblesPadres.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.codigo} - {p.nombre} ({p.nivel})
                                </option>
                            ))}
                        </select>
                        <span style={{ fontSize: "11.5px", color: "#667", display: "block", marginTop: "3px" }}>
                            Solo se muestran cuentas del mismo tipo ({formulario.tipo}).
                        </span>
                    </div>

                    <div style={{ 
                        marginTop: "16px", 
                        padding: "12px", 
                        background: "#F8F9FA", 
                        borderRadius: "6px", 
                        display: "flex", 
                        flexDirection: "column", 
                        gap: "10px" 
                    }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: esAgrupadora ? "not-allowed" : "pointer" }}>
                            <input
                                type="checkbox"
                                checked={formulario.permite_movimientos}
                                onChange={e => manejarCambioCampo("permite_movimientos", e.target.checked)}
                                disabled={esAgrupadora}
                                style={{ width: "16px", height: "16px" }}
                            />
                            <div>
                                <span style={{ fontWeight: "600", fontSize: "13px" }}>
                                    Permite registrar asientos contables (movimientos directos)
                                </span>
                                {esAgrupadora && (
                                    <span style={{ display: "block", fontSize: "11px", color: "#8A5300" }}>
                                        * Deshabilitado: Las cuentas de nivel {formulario.nivel} son agrupadoras y no admiten asientos directos.
                                    </span>
                                )}
                            </div>
                        </label>

                        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: esAgrupadora ? "not-allowed" : "pointer" }}>
                            <input
                                type="checkbox"
                                name="lleva_iva"
                                checked={Boolean(formulario.lleva_iva)}
                                onChange={e => manejarCambioCampo("lleva_iva", e.target.checked)}
                                disabled={esAgrupadora}
                                style={{ accentColor: "#1B4332", width: "16px", height: "16px" }}
                            />
                            <div>
                                <span style={{ fontWeight: "600", fontSize: "13px", color: "#173B35" }}>
                                    Aplica / Genera IVA (13% Débito o Crédito Fiscal)
                                </span>
                                <span style={{ display: "block", fontSize: "11px", color: "#5F6B67" }}>
                                    {formulario.lleva_iva 
                                        ? "Calcula IVA automáticamente al registrar transacciones en Nuevo Asiento." 
                                        : "Cuenta exenta: no genera cálculo automático de IVA."}
                                </span>
                            </div>
                        </label>

                        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={formulario.estado}
                                onChange={e => manejarCambioCampo("estado", e.target.checked)}
                                style={{ width: "16px", height: "16px" }}
                            />
                            <div>
                                <span style={{ fontWeight: "600", fontSize: "13px" }}>
                                    Cuenta contable activa ({formulario.estado ? "Habilitada" : "Inactiva"})
                                </span>
                                <span style={{ display: "block", fontSize: "11px", color: "#667" }}>
                                    {formulario.estado 
                                        ? "Disponible para consultas y registros en el sistema." 
                                        : "Inactiva: no aparecerá disponible para nuevos asientos contables."}
                                </span>
                            </div>
                        </label>
                    </div>

                    <div className="modal-footer" style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
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
                            {guardando ? "Guardando..." : (esEdicion ? "Guardar cambios" : "Crear cuenta")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default ModalCuenta;