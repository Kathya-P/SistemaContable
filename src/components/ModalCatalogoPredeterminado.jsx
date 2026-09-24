import { useState } from "react";
import { CATALOGO_PREDETERMINADO, cargarCatalogoPredeterminado } from "../services/cuentasService";

const SANGRIA_POR_NIVEL = { GRUPO: 0, SUBGRUPO: 16, CUENTA: 32, SUBCUENTA: 48 };

function ModalCatalogoPredeterminado({ abierto, usuario, alCerrar, alCargarExitoso }) {
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState("");
    const [necesitaForzar, setNecesitaForzar] = useState(false);

    if (!abierto) return null;

    async function manejarCargar() {
        setCargando(true);
        setError("");
        try {
            const resultado = await cargarCatalogoPredeterminado(necesitaForzar, usuario?.empresa_id);
            alCargarExitoso(resultado);
            alCerrar();
        } catch (err) {
            if (err.statusCode === 409 || err.message?.includes("ya tiene cuentas")) {
                setNecesitaForzar(true);
            } else {
                setError(err.message || "No se pudo cargar el catálogo predeterminado.");
            }
        } finally {
            setCargando(false);
        }
    }

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-predeterminado-titulo">
            <div
                className="modal-contenido modal-catalogo"
                style={{
                    maxWidth: "620px", width: "95%", maxHeight: "85vh",
                    display: "flex", flexDirection: "column",
                    background: "#FFFFFF", color: "#1C2321",
                    borderRadius: "12px", border: "1px solid #DDE3E0",
                    boxShadow: "0 20px 45px rgba(0,0,0,0.28)", padding: "24px"
                }}
            >
                <div className="modal-header" style={{ borderBottom: "1px solid #DDE3E0", paddingBottom: "12px" }}>
                    <div>
                        <p className="eyebrow" style={{ margin: 0, color: "#1B4332" }}>Catálogo estándar</p>
                        <h3 id="modal-predeterminado-titulo" style={{ margin: "4px 0 0", fontSize: "20px", color: "#173B35" }}>
                            Vista previa del catálogo predeterminado
                        </h3>
                    </div>
                    <button type="button" className="btn-cerrar" onClick={alCerrar}>×</button>
                </div>

                <p style={{ fontSize: "12.5px", color: "#5F6B67", margin: "12px 0" }}>
                    Son {CATALOGO_PREDETERMINADO.length} cuentas base (grupos, subgrupos, cuentas y subcuentas) listas para usar.
                </p>

                <div style={{ overflowY: "auto", flex: 1, border: "1px solid #DDE3E0", borderRadius: "8px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                        <thead>
                            <tr style={{ background: "#EAF5EE", textAlign: "left" }}>
                                <th style={{ padding: "6px 10px" }}>Código</th>
                                <th style={{ padding: "6px 10px" }}>Nombre</th>
                                <th style={{ padding: "6px 10px" }}>Nivel</th>
                            </tr>
                        </thead>
                        <tbody>
                            {CATALOGO_PREDETERMINADO.map((cuenta, indice) => (
                                <tr key={indice} style={{ borderTop: "1px solid #EEE" }}>
                                    <td style={{ padding: "5px 10px", fontFamily: "var(--mono)", color: "#1B4332", fontWeight: 600 }}>
                                        {cuenta.codigo}
                                    </td>
                                    <td style={{ padding: "5px 10px", paddingLeft: `${10 + (SANGRIA_POR_NIVEL[cuenta.nivel] || 0)}px` }}>
                                        {cuenta.nombre}
                                    </td>
                                    <td style={{ padding: "5px 10px", color: "#5F6B67" }}>{cuenta.nivel}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {error && <div className="message-error" style={{ margin: "10px 0" }}>{error}</div>}

                {necesitaForzar && (
                    <div style={{ margin: "10px 0", padding: "10px 12px", background: "#FFF3D6", border: "1px solid #F0D68A", borderRadius: "6px", fontSize: "12.5px", color: "#8A5300" }}>
                        Tu empresa ya tiene cuentas registradas. Si continúas, el catálogo estándar se agrega junto a las que ya tienes (no se borra nada).
                    </div>
                )}

                <div className="modal-footer" style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #DDE3E0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button type="button" className="button-secondary" onClick={alCerrar} disabled={cargando}>
                        Cancelar
                    </button>
                    <button type="button" className="button-primary" onClick={manejarCargar} disabled={cargando}>
                        {cargando ? "Cargando..." : necesitaForzar ? "Cargar de todas formas" : "Cargar este catálogo"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ModalCatalogoPredeterminado;