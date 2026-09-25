import { useEffect, useState, useMemo } from "react";
import { 
    obtenerCuentas, 
    inactivarCuenta, 
    activarCuenta, 
    eliminarCuenta,
    descargarPlantillaCSV,
    cargarCatalogoPredeterminado,
    TIPOS_VALIDOS, 
    NIVELES_VALIDOS 
} from "../services/cuentasService";
import { exportarCatalogoCuentasPDF, exportarCatalogoCuentasExcel } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";
import ExportarExcelButton from "./ExportarExcelButton";
import ModalCuenta from "./ModalCuenta";
import ModalImportarCatalogo from "./ModalImportarCatalogo";
import ModalCatalogoPredeterminado from "./ModalCatalogoPredeterminado";
import ModalConfiguracionIva from "./ModalConfiguracionIva";
import { 
    inicializarConfiguracionIva, 
    cuentaAplicaIva, 
    alternarIvaCuenta,
    restablecerIvaSugerido 
} from "../utils/configuracionIva";

function CatalogoCuentas({ usuario }) {
    const [cuentas, setCuentas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");
    const [mensajeExito, setMensajeExito] = useState("");

    // Configuración y gestión de IVA
    const [configIva, setConfigIva] = useState(null);
    const [modalConfigIvaAbierto, setModalConfigIvaAbierto] = useState(false);
    const [filtroIva, setFiltroIva] = useState("TODOS"); // "TODOS", "CON_IVA", "SIN_IVA", "DESTINO_IVA"

    // Filtros y vista
    const [busqueda, setBusqueda] = useState("");
    const [filtroTipo, setFiltroTipo] = useState("TODOS");
    const [filtroNivel, setFiltroNivel] = useState("TODOS");
    const [filtroEstado, setFiltroEstado] = useState("TODOS"); // "TODOS", "ACTIVAS", "INACTIVAS"
    const [modoVista, setModoVista] = useState("arbol"); // "arbol" o "tabla"
    const [nodosExpandidos, setNodosExpandidos] = useState(new Set());

    // Modales
    const [modalCuentaAbierto, setModalCuentaAbierto] = useState(false);
    const [cuentaAEditar, setCuentaAEditar] = useState(null);
    const [cuentaPadreParaSubcuenta, setCuentaPadreParaSubcuenta] = useState(null);
    const [modalImportarAbierto, setModalImportarAbierto] = useState(false);
    const [modalPredeterminadoAbierto, setModalPredeterminadoAbierto] = useState(false);
    const [eliminandoId, setEliminandoId] = useState(null);

    // Permisos del usuario actual (ADMIN y CONTADOR pueden crear/editar/importar)
    const puedeGestionar = usuario?.rol === "ADMIN" || usuario?.rol === "CONTADOR" || !usuario;

    async function recargarCuentas() {
        try {
            setCargando(true);
            setError("");
            const data = await obtenerCuentas(usuario?.empresa_id);
            setCuentas(data || []);
            const conf = inicializarConfiguracionIva(usuario?.empresa_id, data || []);
            setConfigIva(conf);

            // Inicializar nodos expandidos con cuentas de nivel GRUPO y SUBGRUPO
            const inicialesExpandidos = new Set();
            (data || []).forEach(c => {
                if (c.nivel === "GRUPO" || c.nivel === "SUBGRUPO") {
                    inicialesExpandidos.add(String(c.id));
                }
            });
            setNodosExpandidos(inicialesExpandidos);
        } catch (err) {
            console.error("Error cargando cuentas:", err);
            setError(err.message || "No se pudo cargar el catálogo de cuentas.");
        } finally {
            setCargando(false);
        }
    }

    useEffect(() => {
        let cancelado = false;
        async function cargar() {
            try {
                setCargando(true);
                setError("");
                const data = await obtenerCuentas(usuario?.empresa_id);
                if (!cancelado) {
                    setCuentas(data || []);
                    const conf = inicializarConfiguracionIva(usuario?.empresa_id, data || []);
                    setConfigIva(conf);

                    const inicialesExpandidos = new Set();
                    (data || []).forEach(c => {
                        if (c.nivel === "GRUPO" || c.nivel === "SUBGRUPO") {
                            inicialesExpandidos.add(String(c.id));
                        }
                    });
                    setNodosExpandidos(inicialesExpandidos);
                }
            } catch (err) {
                if (!cancelado) {
                    setError(err.message || "No se pudo cargar el catálogo de cuentas.");
                }
            } finally {
                if (!cancelado) {
                    setCargando(false);
                }
            }
        }
        cargar();
        return () => { cancelado = true; };
    }, []);

    function manejarAlternarIva(cuenta, e) {
        if (e) e.stopPropagation();
        if (!puedeGestionar) return;

        const codigo = String(cuenta.codigo || "").trim();
        const tieneIva = cuentaAplicaIva(cuenta, configIva, usuario?.empresa_id);
        const nuevoValor = !tieneIva;

        const nuevaConf = alternarIvaCuenta(usuario?.empresa_id, codigo, nuevoValor, cuentas);
        setConfigIva(nuevaConf);

        setMensajeExito(`Cuenta ${codigo} (${cuenta.nombre}): IVA (13%) ${nuevoValor ? "activado" : "desactivado (exenta)"}.`);
        setTimeout(() => setMensajeExito(""), 3500);
    }

    // Mapa de cuentas por ID para consultas rápidas
    const cuentasPorId = useMemo(() => {
        return new Map(cuentas.map(c => [String(c.id), c]));
    }, [cuentas]);

    // Mapa de hijos por cuenta_padre_id
    const hijosPorPadreId = useMemo(() => {
        const mapa = new Map();
        cuentas.forEach(c => {
            const padreId = c.cuenta_padre_id ? String(c.cuenta_padre_id) : "RAIZ";
            if (!mapa.has(padreId)) {
                mapa.set(padreId, []);
            }
            mapa.get(padreId).push(c);
        });

        // Ordenar hijos por código
        mapa.forEach(lista => {
            lista.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true }));
        });

        return mapa;
    }, [cuentas]);

    // Filtrado de cuentas
    const cuentasFiltradas = useMemo(() => {
        const busq = busqueda.trim().toLowerCase();
        return cuentas.filter(c => {
            if (busq) {
                const coincideCodigo = String(c.codigo).toLowerCase().includes(busq);
                const coincideNombre = String(c.nombre).toLowerCase().includes(busq);
                if (!coincideCodigo && !coincideNombre) return false;
            }
            if (filtroTipo !== "TODOS" && String(c.tipo).toUpperCase() !== filtroTipo) {
                return false;
            }
            if (filtroNivel !== "TODOS" && String(c.nivel).toUpperCase() !== filtroNivel) {
                return false;
            }
            if (filtroEstado === "ACTIVAS" && !c.estado) {
                return false;
            }
            if (filtroEstado === "INACTIVAS" && c.estado) {
                return false;
            }
            if (filtroIva !== "TODOS") {
                const tieneIva = cuentaAplicaIva(c, configIva, usuario?.empresa_id);
                const esDestino = (configIva?.cuentaCreditoCodigo && String(c.codigo).trim() === String(configIva.cuentaCreditoCodigo).trim()) ||
                                  (configIva?.cuentaDebitoCodigo && String(c.codigo).trim() === String(configIva.cuentaDebitoCodigo).trim());
                if (filtroIva === "CON_IVA" && !tieneIva) return false;
                if (filtroIva === "SIN_IVA" && (tieneIva || esDestino)) return false;
                if (filtroIva === "DESTINO_IVA" && !esDestino) return false;
            }
            return true;
        });
    }, [cuentas, busqueda, filtroTipo, filtroNivel, filtroEstado, filtroIva, configIva, usuario?.empresa_id]);

    // Contadores estadísticos
    const estadisticas = useMemo(() => {
        const total = cuentas.length;
        const activas = cuentas.filter(c => c.estado).length;
        const inactivas = total - activas;
        const conMovimientos = cuentas.filter(c => c.tiene_movimientos).length;
        const conIva = cuentas.filter(c => c.permite_movimientos && cuentaAplicaIva(c, configIva, usuario?.empresa_id)).length;
        return { total, activas, inactivas, conMovimientos, conIva };
    }, [cuentas, configIva, usuario?.empresa_id]);

    function alternarNodo(id) {
        setNodosExpandidos(prev => {
            const nuevo = new Set(prev);
            const strId = String(id);
            if (nuevo.has(strId)) {
                nuevo.delete(strId);
            } else {
                nuevo.add(strId);
            }
            return nuevo;
        });
    }

    function expandirTodo() {
        const todos = new Set(cuentas.map(c => String(c.id)));
        setNodosExpandidos(todos);
    }

    function colapsarTodo() {
        setNodosExpandidos(new Set());
    }

    function abrirCrearCuenta(padre = null) {
        setCuentaAEditar(null);
        setCuentaPadreParaSubcuenta(padre);
        setModalCuentaAbierto(true);
    }

    function abrirEditarCuenta(cuenta) {
        setCuentaPadreParaSubcuenta(null);
        setCuentaAEditar(cuenta);
        setModalCuentaAbierto(true);
    }

    async function manejarAlternarEstado(cuenta) {
        try {
            setError("");
            setMensajeExito("");
            if (cuenta.estado) {
                await inactivarCuenta(cuenta.id);
                setMensajeExito(`Cuenta ${cuenta.codigo} inactivada correctamente.`);
            } else {
                await activarCuenta(cuenta.id);
                setMensajeExito(`Cuenta ${cuenta.codigo} activada correctamente.`);
            }
            await recargarCuentas();
            setTimeout(() => setMensajeExito(""), 4000);
        } catch (err) {
            setError(err.message || "No se pudo cambiar el estado de la cuenta.");
        }
    }

    async function manejarEliminar(cuenta) {
        const subcuentasCount = hijosPorPadreId.get(String(cuenta.id))?.length || 0;

        if (cuenta.tiene_movimientos) {
            setError(`No se puede eliminar la cuenta ${cuenta.codigo} porque ya tiene movimientos en asientos contables. Solo puedes inactivarla.`);
            return;
        }

        if (subcuentasCount > 0) {
            setError(`No se puede eliminar la cuenta ${cuenta.codigo} porque tiene ${subcuentasCount} subcuenta(s) dependiente(s).`);
            return;
        }

        if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente la cuenta "${cuenta.codigo} - ${cuenta.nombre}"?`)) {
            return;
        }

        try {
            setEliminandoId(cuenta.id);
            setError("");
            await eliminarCuenta(cuenta.id, cuenta.tiene_movimientos, subcuentasCount);
            setMensajeExito(`Cuenta ${cuenta.codigo} eliminada con éxito.`);
            await recargarCuentas();
            setTimeout(() => setMensajeExito(""), 4000);
        } catch (err) {
            setError(err.message || "Error al eliminar la cuenta.");
        } finally {
            setEliminandoId(null);
        }
    }

function manejarExportacionPDF() {
    exportarCatalogoCuentasPDF({ cuentas: cuentasFiltradas });
}

function manejarExportacionExcel() {
    exportarCatalogoCuentasExcel({ cuentas });
}

    // Render recursivo de nodo en el árbol
    function renderNodoArbol(cuenta, nivelProfundidad = 0) {
        const idStr = String(cuenta.id);
        const hijos = hijosPorPadreId.get(idStr) || [];
        const tieneHijos = hijos.length > 0;
        const expandido = nodosExpandidos.has(idStr);

        // Si hay filtros aplicados, verificar si este nodo o algún descendiente coincide
        const coincideDirecto = cuentasFiltradas.some(c => String(c.id) === idStr);
        const hayFiltroActivo = busqueda || filtroTipo !== "TODOS" || filtroNivel !== "TODOS" || filtroEstado !== "TODOS";

        if (hayFiltroActivo && !coincideDirecto) {
            // Verificar si algún descendiente coincide
            const algunHijoCoincide = tieneHijos && hijos.some(h => cuentasFiltradas.some(cf => String(cf.id) === String(h.id)));
            if (!algunHijoCoincide) return null;
        }

        const esInactiva = !cuenta.estado;
        const esDeudora = cuenta.naturaleza === "DEUDORA";

        return (
            <div key={cuenta.id} className="nodo-arbol-contenedor" style={{ width: "100%" }}>
                <div 
                    className={`fila-cuenta ${esInactiva ? "cuenta-inactiva" : ""}`}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        paddingLeft: `${14 + nivelProfundidad * 24}px`,
                        borderBottom: "1px solid #EAEFEA",
                        background: esInactiva ? "#F9FAFB" : (nivelProfundidad === 0 ? "#FCFDFC" : "#FFFFFF"),
                        opacity: esInactiva ? 0.75 : 1,
                        transition: "background 150ms ease"
                    }}
                >
                    {/* Código, icono colapso, nombre y badges informativos */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0, paddingRight: "10px" }}>
                        {tieneHijos ? (
                            <button
                                type="button"
                                onClick={() => alternarNodo(cuenta.id)}
                                style={{
                                    border: "none",
                                    background: "#E8EFEA",
                                    color: "#1B4332",
                                    width: "22px",
                                    height: "22px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "11px",
                                    fontWeight: "bold",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0
                                }}
                                title={expandido ? "Colapsar subcuentas" : "Expandir subcuentas"}
                            >
                                {expandido ? "▼" : "▶"}
                            </button>
                        ) : (
                            <span style={{ width: "22px", display: "inline-block", textAlign: "center", color: "#C5D0C9", fontSize: "14px", flexShrink: 0 }}>
                                •
                            </span>
                        )}

                        <span 
                            style={{ 
                                fontFamily: "var(--mono)", 
                                fontWeight: "bold", 
                                fontSize: "13.5px", 
                                color: esInactiva ? "#8A9490" : "#1B4332",
                                minWidth: "80px",
                                flexShrink: 0
                            }}
                        >
                            {cuenta.codigo}
                        </span>

                        <span 
                            style={{ 
                                fontWeight: cuenta.nivel === "GRUPO" ? "700" : (cuenta.nivel === "SUBGRUPO" ? "600" : "500"),
                                fontSize: cuenta.nivel === "GRUPO" ? "14.5px" : "13.5px",
                                color: esInactiva ? "#7A827F" : "#1C2321",
                                textDecoration: esInactiva ? "line-through" : "none",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                            }}
                            title={cuenta.nombre}
                        >
                            {cuenta.nombre}
                        </span>

                        {/* Badges de soporte */}
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0, marginLeft: "6px" }}>
                            {/* Nivel */}
                            <span style={{
                                fontSize: "10.5px",
                                fontWeight: "600",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background: cuenta.nivel === "GRUPO" ? "#E3EFE7" : (cuenta.nivel === "SUBGRUPO" ? "#EAF5EE" : (cuenta.nivel === "CUENTA" ? "#F0F7F3" : "#F4F6F5")),
                                color: cuenta.nivel === "GRUPO" ? "#173D2D" : (cuenta.nivel === "SUBGRUPO" ? "#1B4332" : (cuenta.nivel === "CUENTA" ? "#2D6A4F" : "#40534C"))
                            }}>
                                {cuenta.nivel}
                            </span>

                            {/* Naturaleza */}
                            <span style={{
                                fontSize: "10.5px",
                                fontWeight: "600",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background: esDeudora ? "#EAF5EE" : "#F2F6F4",
                                color: esDeudora ? "#1B4332" : "#2D6A4F"
                            }} title={`Naturaleza ${cuenta.naturaleza} (derivada de ${cuenta.tipo})`}>
                                {esDeudora ? "Deudora" : "Acreedora"}
                            </span>

                            {/* Permite movimientos / Agrupadora */}
                            {cuenta.permite_movimientos ? (
                                <span style={{
                                    fontSize: "10px",
                                    fontWeight: "600",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    background: "#EAF5EE",
                                    color: "#1B4332"
                                }} title="Permite registrar asientos contables directamente en esta cuenta">
                                    Asientos directos
                                </span>
                            ) : (
                                <span style={{
                                    fontSize: "10px",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    background: "#F4F7F5",
                                    color: "#5F6B67"
                                }} title="Cuenta agrupadora: no admite asientos directos">
                                    Agrupadora
                                </span>
                            )}

                            {/* Tiene movimientos asociados en detalle_asientos */}
                            {cuenta.tiene_movimientos && (
                                <span style={{
                                    fontSize: "10px",
                                    fontWeight: "600",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    background: "#E3EFE7",
                                    color: "#173D2D",
                                    border: "1px solid #C2CECA"
                                }} title="Esta cuenta registra movimientos contables en el Libro Diario">
                                    Con movimientos
                                </span>
                            )}

                            {/* Badge de IVA */}
                            {(() => {
                                const codigo = String(cuenta.codigo || "").trim();
                                const esDestinoCredito = configIva?.cuentaCreditoCodigo && codigo === String(configIva.cuentaCreditoCodigo).trim();
                                const esDestinoDebito = configIva?.cuentaDebitoCodigo && codigo === String(configIva.cuentaDebitoCodigo).trim();

                                if (esDestinoCredito) {
                                    return (
                                        <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px", background: "#E8F0FE", color: "#1967D2", border: "1px solid #C2D7FA" }} title="Cuenta receptora de IVA Crédito Fiscal (Compras)">
                                            IVA Crédito
                                        </span>
                                    );
                                }
                                if (esDestinoDebito) {
                                    return (
                                        <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px", background: "#FEF3D6", color: "#B06000", border: "1px solid #FCD888" }} title="Cuenta receptora de IVA Débito Fiscal (Ventas)">
                                            IVA Débito
                                        </span>
                                    );
                                }
                                if (cuenta.permite_movimientos) {
                                    const tieneIva = cuentaAplicaIva(cuenta, configIva, usuario?.empresa_id);
                                    if (tieneIva) {
                                        return (
                                            <span 
                                                onClick={puedeGestionar ? (e) => manejarAlternarIva(cuenta, e) : undefined}
                                                style={{ 
                                                    fontSize: "10px", 
                                                    fontWeight: "600", 
                                                    padding: "2px 6px", 
                                                    borderRadius: "4px", 
                                                    background: "#EAF5EE", 
                                                    color: "#1B4332", 
                                                    border: "1px solid #B8DEC3",
                                                    cursor: puedeGestionar ? "pointer" : "default"
                                                }}
                                                title={puedeGestionar ? "Aplica IVA (13%). Clic para cambiar a exenta." : "Aplica IVA (13%)"}
                                            >
                                                + IVA 13%
                                            </span>
                                        );
                                    }
                                }
                                return null;
                            })()}

                            {/* Inactiva visual */}
                            {esInactiva && (
                                <span style={{
                                    fontSize: "10.5px",
                                    fontWeight: "bold",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    background: "#FCEAE8",
                                    color: "#B3261E"
                                }}>
                                    Inactiva
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Acciones por fila */}
                    {puedeGestionar && (
                        <div style={{ display: "flex", gap: "4px", alignItems: "center", flexShrink: 0 }}>
                            {/* Botón para crear subcuenta si no es SUBCUENTA */}
                            {cuenta.nivel !== "SUBCUENTA" && (
                                <button
                                    type="button"
                                    onClick={() => abrirCrearCuenta(cuenta)}
                                    className="button-secondary"
                                    style={{ fontSize: "11.5px", padding: "3px 8px", height: "28px" }}
                                    title={`Crear subcuenta hija de ${cuenta.codigo}`}
                                >
                                    + Subcuenta
                                </button>
                            )}

                            {/* Botón Editar */}
                            <button
                                type="button"
                                onClick={() => abrirEditarCuenta(cuenta)}
                                className="button-secondary"
                                style={{ fontSize: "11.5px", padding: "3px 8px", height: "28px" }}
                                title="Editar cuenta"
                            >
                                Editar
                            </button>

                            {/* Botón Inactivar / Activar */}
                            <button
                                type="button"
                                onClick={() => manejarAlternarEstado(cuenta)}
                                className="button-secondary"
                                style={{
                                    fontSize: "11.5px",
                                    padding: "3px 8px",
                                    height: "28px",
                                    color: esInactiva ? "#1B4332" : "#8A5300"
                                }}
                                title={esInactiva ? "Habilitar cuenta nuevamente" : "Inactivar cuenta para nuevos registros"}
                            >
                                {esInactiva ? "Activar" : "Inactivar"}
                            </button>

                            {/* Botón Eliminar */}
                            <button
                                type="button"
                                onClick={() => manejarEliminar(cuenta)}
                                disabled={cuenta.tiene_movimientos || hijos.length > 0 || eliminandoId === cuenta.id}
                                className="button-secondary"
                                style={{
                                    fontSize: "11.5px",
                                    padding: "3px 8px",
                                    height: "28px",
                                    color: "#B3261E",
                                    cursor: (cuenta.tiene_movimientos || hijos.length > 0) ? "not-allowed" : "pointer",
                                    opacity: (cuenta.tiene_movimientos || hijos.length > 0) ? 0.35 : 1
                                }}
                                title={
                                    cuenta.tiene_movimientos 
                                        ? "No se puede eliminar: tiene movimientos contables registrados" 
                                        : (hijos.length > 0 ? "No se puede eliminar: tiene subcuentas asociadas" : "Eliminar cuenta permanentemente")
                                }
                            >
                                {eliminandoId === cuenta.id ? "..." : "Eliminar"}
                            </button>
                        </div>
                    )}
                </div>

                {/* Subárbol de hijos */}
                {tieneHijos && (expandido || hayFiltroActivo) && (
                    <div className="subarbol-hijos">
                        {hijos.map(hijo => renderNodoArbol(hijo, nivelProfundidad + 1))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <section className="view-section catalogo-cuentas-section">
            {/* Encabezado */}
            <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
                <div>
                    <p className="eyebrow">Estructura contable</p>
                    <h1 style={{ margin: "2px 0 6px" }}>Catálogo de cuentas</h1><br></br>
                    <p></p><p style={{ fontSize: "13.5px", color: "#5F6B67", margin: 0 }}>
                        Administración del plan de cuentas contable, jerarquías y políticas de movimiento.
                    </p>
                </div>

                {/* Botones de acción principales */}
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    {puedeGestionar && (
                        <>
                            <button
                                type="button"
                                className="button-primary"
                                onClick={() => abrirCrearCuenta(null)}
                                style={{ display: "flex", alignItems: "center", gap: "6px" }}
                            >
                                <span>+</span> Nueva cuenta
                            </button>

                            <button
                                type="button"
                                className="button-secondary"
                                onClick={() => setModalImportarAbierto(true)}
                                style={{ display: "flex", alignItems: "center", gap: "6px" }}
                                title="Importar catálogo desde archivo Excel, PDF, CSV o texto"
                            >
                                Importar catálogo
                            </button>

                            <button type="button" className="button-secondary" onClick={() => setModalPredeterminadoAbierto(true)}>
                                Cargar catálogo predeterminado
                            </button>

                            <button
                                type="button"
                                className="button-secondary"
                                onClick={() => setModalConfigIvaAbierto(true)}
                                style={{ display: "flex", alignItems: "center", gap: "6px", color: "#1B4332", borderColor: "#B8DEC3" }}
                                title="Configurar cuentas de IVA Crédito y Débito Fiscal, o activar/desactivar IVA"
                            >
                                <span></span> Configurar IVA (13%)
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        className="button-secondary"
                        onClick={descargarPlantillaCSV}
                        title="Descargar plantilla excel oficial para importación"
                    >
                        Plantilla Excel
                    </button>
                    {modalPredeterminadoAbierto && (
                        <ModalCatalogoPredeterminado
                            abierto={modalPredeterminadoAbierto}
                            usuario={usuario}
                            alCerrar={() => setModalPredeterminadoAbierto(false)}
                            alCargarExitoso={async (resultado) => {
                                await recargarCuentas();
                                // Forzar reinicialización del IVA para que las cuentas
                                // del catálogo predeterminado ya vengan con su IVA asignado
                                const datosActualizados = await obtenerCuentas(usuario?.empresa_id);
                                const nuevaConfIva = restablecerIvaSugerido(usuario?.empresa_id, datosActualizados || []);
                                setConfigIva(nuevaConfIva);
                                const cuentasConIvaCount = (nuevaConfIva?.codigosConIva || []).length;
                                setMensajeExito(
                                    `${resultado.mensaje} Se configuró IVA (13%) automáticamente en ${cuentasConIvaCount} cuenta(s).`
                                );
                                setTimeout(() => setMensajeExito(""), 5000);
                            }}
                        />
                    )}

                    <ExportarPdfButton
                        onExport={manejarExportacionPDF}
                        onExportExcel={manejarExportacionExcel}
                        reporte="Catálogo de Cuentas"
                        disabled={!cuentasFiltradas.length}
                    />
                </div>
            </div>

            {/* Mensajes de notificación */}
            {mensajeExito && (
                <div style={{
                    background: "#EAF5EE",
                    color: "#1B4332",
                    border: "1px solid #B8DEC3",
                    padding: "10px 14px",
                    borderRadius: "6px",
                    fontSize: "13.5px",
                    margin: "14px 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                }}>
                    <span>{mensajeExito}</span>
                    <button type="button" onClick={() => setMensajeExito("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#1B4332", fontSize: "16px" }}>×</button>
                </div>
            )}

            {error && (
                <div className="message-error" style={{ margin: "14px 0", padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                    <span>{error}</span>
                    <button type="button" onClick={() => setError("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#B3261E", fontSize: "16px" }}>×</button>
                </div>
            )}

            {/* Barra de métricas rápidas */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: "12px",
                    margin: "18px 0"
                }}
                className="catalogo-metrics-grid"
            >
                <div className="catalogo-metric-card" style={{ background: "#FFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #DDE3E0" }}>
                    <span style={{ fontSize: "12px", color: "#667", textTransform: "uppercase" }}>Total cuentas</span>
                    <p style={{ margin: "2px 0 0", fontSize: "24px", fontWeight: "700", color: "#173B35" }}>{estadisticas.total}</p>
                </div>
                <div className="catalogo-metric-card catalogo-metric-card--success" style={{ background: "#FFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #DDE3E0" }}>
                    <span style={{ fontSize: "12px", color: "#2E7D32", textTransform: "uppercase" }}>Activas</span>
                    <p style={{ margin: "2px 0 0", fontSize: "24px", fontWeight: "700", color: "#2E7D32" }}>{estadisticas.activas}</p>
                </div>
                <div className="catalogo-metric-card" style={{ background: "#FFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #DDE3E0" }}>
                    <span style={{ fontSize: "12px", color: "#1B4332", textTransform: "uppercase", fontWeight: "600" }}>Aplica IVA (13%)</span>
                    <p style={{ margin: "2px 0 0", fontSize: "24px", fontWeight: "700", color: "#1B4332" }}>{estadisticas.conIva}</p>
                </div>
                <div className="catalogo-metric-card catalogo-metric-card--warning" style={{ background: "#FFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #DDE3E0" }}>
                    <span style={{ fontSize: "12px", color: "#8A5300", textTransform: "uppercase" }}>Inactivas</span>
                    <p style={{ margin: "2px 0 0", fontSize: "24px", fontWeight: "700", color: "#8A5300" }}>{estadisticas.inactivas}</p>
                </div>
                <div className="catalogo-metric-card catalogo-metric-card--info" style={{ background: "#FFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #DDE3E0" }}>
                    <span style={{ fontSize: "12px", color: "#1F5F99", textTransform: "uppercase" }}>Con movimientos</span>
                    <p style={{ margin: "2px 0 0", fontSize: "24px", fontWeight: "700", color: "#1F5F99" }}>{estadisticas.conMovimientos}</p>
                </div>
            </div>

           {/* Filtros y opciones de visualización */}
<div className="catalogo-filters-bar" style={{
    background: "#FFF",
    border: "1px solid #DDE3E0",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "16px"
}}>
    {/* Fila de filtros */}
    <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap"
    }}>

        {/* Búsqueda */}
        <div style={{
            flex: "1 1 280px",
            minWidth: "220px"
        }}>
            <input
                type="text"
                placeholder="Buscar por código o nombre..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "7px 10px",
                    borderRadius: "5px",
                    border: "1px solid #DDE3E0",
                    fontSize: "13px",
                    height: "36px"
                }}
            />
        </div>

        {/* Tipo */}
        <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            style={{
                width: "150px",
                padding: "7px 10px",
                borderRadius: "5px",
                border: "1px solid #DDE3E0",
                fontSize: "13px",
                height: "36px",
                background: "#FFF"
            }}
        >
            <option value="TODOS">Todos los tipos</option>
            {TIPOS_VALIDOS.map(t => (
                <option key={t} value={t}>{t}</option>
            ))}
        </select>

        {/* Nivel */}
        <select
            value={filtroNivel}
            onChange={e => setFiltroNivel(e.target.value)}
            style={{
                width: "150px",
                padding: "7px 10px",
                borderRadius: "5px",
                border: "1px solid #DDE3E0",
                fontSize: "13px",
                height: "36px",
                background: "#FFF"
            }}
        >
            <option value="TODOS">Todos los niveles</option>
            {NIVELES_VALIDOS.map(n => (
                <option key={n} value={n}>{n}</option>
            ))}
        </select>

        {/* Estado */}
        <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            style={{
                width: "150px",
                padding: "7px 10px",
                borderRadius: "5px",
                border: "1px solid #DDE3E0",
                fontSize: "13px",
                height: "36px",
                background: "#FFF"
            }}
        >
            <option value="TODOS">Todos los estados</option>
            <option value="ACTIVAS">Solo activas</option>
            <option value="INACTIVAS">Solo inactivas</option>
        </select>



        {/* Separador */}
        <div style={{
            width: "1px",
            height: "24px",
            background: "#DDE3E0",
            margin: "0 2px"
        }} />

        {/* Expandir / Colapsar */}
        {modoVista === "arbol" && (
            <>
                <button
                    type="button"
                    className="button-secondary"
                    onClick={expandirTodo}
                    style={{
                        fontSize: "12px",
                        padding: "6px 10px",
                        height: "36px",
                        whiteSpace: "nowrap"
                    }}
                    title="Expandir todos los grupos y subcuentas"
                >
                    + Expandir
                </button>

                <button
                    type="button"
                    className="button-secondary"
                    onClick={colapsarTodo}
                    style={{
                        fontSize: "12px",
                        padding: "6px 10px",
                        height: "36px",
                        whiteSpace: "nowrap"
                    }}
                    title="Colapsar todos los grupos"
                >
                    − Colapsar
                </button>
            </>
        )}

        {/* Vista */}
        <div style={{
            display: "inline-flex",
            borderRadius: "5px",
            border: "1px solid #DDE3E0",
            overflow: "hidden",
            height: "36px",
            marginLeft: "auto"
        }}>
            <button
                type="button"
                onClick={() => setModoVista("arbol")}
                style={{
                    padding: "6px 11px",
                    border: "none",
                    background: modoVista === "arbol" ? "#1B4332" : "#FFF",
                    color: modoVista === "arbol" ? "#FFF" : "#1C2321",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: modoVista === "arbol" ? "600" : "normal",
                    whiteSpace: "nowrap"
                }}
            >
                Jerárquica
            </button>

            <button
                type="button"
                onClick={() => setModoVista("tabla")}
                style={{
                    padding: "6px 11px",
                    border: "none",
                    background: modoVista === "tabla" ? "#1B4332" : "#FFF",
                    color: modoVista === "tabla" ? "#FFF" : "#1C2321",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: modoVista === "tabla" ? "600" : "normal",
                    whiteSpace: "nowrap"
                }}
            >
                Tabla
            </button>
        </div>
    </div>
</div>

            {/* Contenedor principal de visualización */}
                {cargando ? (
                    <div style={{ padding: "40px", textAlign: "center", color: "#667" }}>
                        <p>Cargando catálogo contable...</p>
                    </div>
                ) : cuentas.length === 0 ? (
                    
                    <div className="table-shell" style={{ padding: "40px", textAlign: "center" }}>
                        <p style={{ fontSize: "16px", color: "#5F6B67", marginBottom: "14px" }}>
                            Aún no hay cuentas registradas en el catálogo.
                        </p>
                        {puedeGestionar && (
                            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                                <button type="button" className="button-primary" onClick={() => abrirCrearCuenta(null)}>
                                    + Crear primera cuenta
                                </button>
                                <button type="button" className="button-secondary" onClick={() => setModalImportarAbierto(true)}>
                                    Importar catálogo inicial
                                </button>
                            </div>
                        )}
                    </div>
                ) : modoVista === "arbol" ? (
                /* VISTA JERÁRQUICA (ÁRBOL) */
                <div className="table-shell" style={{ overflow: "hidden" }}>
                    <div style={{
                        background: "#F4F7F5",
                        borderBottom: "1px solid #DDE3E0",
                        padding: "10px 16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                    }}>
                        <span style={{ fontSize: "12.5px", fontWeight: "700", color: "#173B35", textTransform: "uppercase" }}>
                            Estructura de Árbol Jerárquico ({cuentasFiltradas.length} cuentas visibles)
                        </span>
                        <span style={{ fontSize: "11.5px", color: "#667" }}>
                            Deudora: ACTIVO, GASTO | Acreedora: PASIVO, PATRIMONIO, INGRESO
                        </span>
                    </div>

                    <div style={{ minHeight: "200px" }}>
                        {/* Cuentas raíz (sin cuenta padre o cuyo padre no está en el catálogo) */}
                        {(() => {
                            const raices = cuentas.filter(c => !c.cuenta_padre_id || !cuentasPorId.has(String(c.cuenta_padre_id)));
                            raices.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true }));

                            if (raices.length === 0) {
                                return <p style={{ padding: "24px", textAlign: "center", color: "#667" }}>No se encontraron cuentas con los filtros seleccionados.</p>;
                            }

                            return raices.map(raiz => renderNodoArbol(raiz, 0));
                        })()}
                    </div>
                </div>
            ) : (
                /* VISTA DE TABLA PLANA */
                <div className="table-shell" style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", fontSize: "12px" }}>
                        <colgroup>
                            <col style={{ width: "80px" }} />   {/* Código */}
                            <col style={{ minWidth: "160px", maxWidth: "220px" }} /> {/* Nombre */}
                            <col style={{ width: "70px" }} />   {/* Tipo */}
                            <col style={{ width: "80px" }} />   {/* Naturaleza */}
                            <col style={{ width: "72px" }} />   {/* Nivel */}
                            <col style={{ width: "150px" }} />  {/* Cuenta padre */}
                            <col style={{ width: "70px" }} />   {/* Asientos */}
                            <col style={{ width: "80px" }} />   {/* IVA */}
                            <col style={{ width: "65px" }} />   {/* Estado */}
                            {puedeGestionar && <col style={{ width: "200px" }} />} {/* Acciones */}
                        </colgroup>
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Nombre</th>
                                <th>Tipo</th>
                                <th>Naturaleza</th>
                                <th>Nivel</th>
                                <th>Cuenta padre</th>
                                <th>Asientos</th>
                                <th style={{ textAlign: "center" }}>IVA (13%)</th>
                                <th>Estado</th>
                                {puedeGestionar && <th style={{ textAlign: "right" }}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {cuentasFiltradas.length === 0 ? (
                                <tr>
                                    <td colSpan={puedeGestionar ? 10 : 9} className="empty-state">
                                        No se encontraron cuentas con los filtros indicados.
                                    </td>
                                </tr>
                            ) : (
                                cuentasFiltradas.map(cuenta => {
                                    const padre = cuentasPorId.get(String(cuenta.cuenta_padre_id));
                                    const esInactiva = !cuenta.estado;
                                    const esDeudora = cuenta.naturaleza === "DEUDORA";

                                    return (
                                        <tr key={cuenta.id} style={{ opacity: esInactiva ? 0.7 : 1, background: esInactiva ? "#F9FAFB" : "transparent" }}>
                                            <td className="account-code" style={{ textDecoration: esInactiva ? "line-through" : "none", whiteSpace: "nowrap" }}>
                                                {cuenta.codigo}
                                            </td>
                                            <td style={{ fontWeight: cuenta.nivel === "GRUPO" ? "600" : "normal" }} title={cuenta.nombre}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                                    <span style={{
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                        maxWidth: "180px",
                                                        display: "block"
                                                    }}>
                                                        {cuenta.nombre}
                                                    </span>
                                                    {cuenta.tiene_movimientos && (
                                                        <span style={{ flexShrink: 0, fontSize: "9.5px", padding: "1px 4px", background: "#E3EFE7", color: "#173D2D", borderRadius: "3px", border: "1px solid #C2CECA" }}>
                                                            Movs
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ whiteSpace: "nowrap" }}>
                                                <span style={{ fontWeight: "600" }}>{cuenta.tipo}</span>
                                            </td>
                                            <td style={{ whiteSpace: "nowrap" }}>
                                                <span style={{
                                                    fontWeight: "600",
                                                    padding: "2px 5px",
                                                    borderRadius: "4px",
                                                    background: esDeudora ? "#EAF5EE" : "#F2F6F4",
                                                    color: esDeudora ? "#1B4332" : "#2D6A4F"
                                                }}>
                                                    {esDeudora ? "Deudora" : "Acreedora"}
                                                </span>
                                            </td>
                                            <td style={{ whiteSpace: "nowrap" }}>
                                                {cuenta.nivel}
                                            </td>
                                            <td title={padre ? `${padre.codigo} - ${padre.nombre}` : "Principal (Raíz)"}>
                                                <span style={{
                                                    display: "block",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    maxWidth: "140px",
                                                    color: padre ? "#555" : "#999"
                                                }}>
                                                    {padre ? `${padre.codigo} - ${padre.nombre}` : "Raíz"}
                                                </span>
                                            </td>
                                            <td style={{ whiteSpace: "nowrap" }}>
                                                {cuenta.permite_movimientos ? (
                                                    <span style={{ color: "#1B4332", fontWeight: "600" }}>Sí</span>
                                                ) : (
                                                    <span style={{ color: "#888" }}>No</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                                                {(() => {
                                                    const codigo = String(cuenta.codigo || "").trim();
                                                    const esDestinoCredito = configIva?.cuentaCreditoCodigo && codigo === String(configIva.cuentaCreditoCodigo).trim();
                                                    const esDestinoDebito = configIva?.cuentaDebitoCodigo && codigo === String(configIva.cuentaDebitoCodigo).trim();

                                                    if (esDestinoCredito) {
                                                        return (
                                                            <span
                                                                style={{ fontSize: "10.5px", fontWeight: "700", padding: "3px 8px", borderRadius: "20px", background: "#E8F0FE", color: "#1967D2", border: "1px solid #C2D7FA", whiteSpace: "nowrap" }}
                                                                title="Cuenta receptora de IVA Crédito Fiscal (Compras y Gastos)"
                                                            >
                                                                ● IVA Crédito
                                                            </span>
                                                        );
                                                    }
                                                    if (esDestinoDebito) {
                                                        return (
                                                            <span
                                                                style={{ fontSize: "10.5px", fontWeight: "700", padding: "3px 8px", borderRadius: "20px", background: "#FEF3D6", color: "#B06000", border: "1px solid #FCD888", whiteSpace: "nowrap" }}
                                                                title="Cuenta receptora de IVA Débito Fiscal (Ventas e Ingresos)"
                                                            >
                                                                ● IVA Débito
                                                            </span>
                                                        );
                                                    }
                                                    if (!cuenta.permite_movimientos) {
                                                        return <span style={{ color: "#CCC", fontSize: "12px" }}>—</span>;
                                                    }

                                                    const tieneIva = cuentaAplicaIva(cuenta, configIva, usuario?.empresa_id);

                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={puedeGestionar ? (e) => manejarAlternarIva(cuenta, e) : undefined}
                                                            disabled={!puedeGestionar}
                                                            title={puedeGestionar
                                                                ? (tieneIva ? "Clic para marcar como exenta" : "Clic para aplicar IVA 13%")
                                                                : (tieneIva ? "Aplica IVA (13%)" : "Exenta de IVA")
                                                            }
                                                            style={{
                                                                display: "inline-flex",
                                                                alignItems: "center",
                                                                gap: "5px",
                                                                padding: "3px 10px",
                                                                borderRadius: "20px",
                                                                border: tieneIva ? "1px solid #B8DEC3" : "1px solid #DDE3E0",
                                                                background: tieneIva ? "#EAF5EE" : "#F5F5F5",
                                                                color: tieneIva ? "#1B4332" : "#888",
                                                                fontSize: "11.5px",
                                                                fontWeight: tieneIva ? "600" : "400",
                                                                cursor: puedeGestionar ? "pointer" : "default",
                                                                transition: "all 150ms ease",
                                                                whiteSpace: "nowrap",
                                                                outline: "none"
                                                            }}
                                                        >
                                                            <span style={{
                                                                width: "8px",
                                                                height: "8px",
                                                                borderRadius: "50%",
                                                                background: tieneIva ? "#1B4332" : "#CCC",
                                                                flexShrink: 0
                                                            }} />
                                                            {tieneIva ? "13%" : "Exenta"}
                                                        </button>
                                                    );
                                                })()}
                                            </td>
                                            <td>
                                                <span style={{
                                                    fontSize: "11px",
                                                    fontWeight: "600",
                                                    padding: "2px 6px",
                                                    borderRadius: "4px",
                                                    background: cuenta.estado ? "#EAF5EE" : "#FCEAE8",
                                                    color: cuenta.estado ? "#1B4332" : "#B3261E"
                                                }}>
                                                    {cuenta.estado ? "Activa" : "Inactiva"}
                                                </span>
                                            </td>
                                            {puedeGestionar && (
                                                <td style={{ textAlign: "right" }}>
                                                    <div style={{ display: "inline-flex", gap: "4px" }}>
                                                        {cuenta.nivel !== "SUBCUENTA" && (
                                                             <button
                                                                type="button"
                                                                onClick={() => abrirCrearCuenta(cuenta)}
                                                                className="button-secondary"
                                                                style={{ fontSize: "11px", padding: "2px 6px" }}
                                                                title="Agregar subcuenta"
                                                            >
                                                                +
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => abrirEditarCuenta(cuenta)}
                                                            className="button-secondary"
                                                            style={{ fontSize: "11px", padding: "2px 6px" }}
                                                            title="Editar cuenta"
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => manejarAlternarEstado(cuenta)}
                                                            className="button-secondary"
                                                            style={{ fontSize: "11px", padding: "2px 6px" }}
                                                            title={cuenta.estado ? "Inactivar" : "Activar"}
                                                        >
                                                            {cuenta.estado ? "Inactivar" : "Activar"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => manejarEliminar(cuenta)}
                                                            disabled={cuenta.tiene_movimientos || (hijosPorPadreId.get(String(cuenta.id))?.length || 0) > 0}
                                                            className="button-secondary"
                                                            style={{
                                                                fontSize: "11px",
                                                                padding: "2px 6px",
                                                                color: "#B3261E",
                                                                opacity: (cuenta.tiene_movimientos || (hijosPorPadreId.get(String(cuenta.id))?.length || 0) > 0) ? 0.35 : 1
                                                            }}
                                                            title="Eliminar cuenta"
                                                        >
                                                            Eliminar
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modales */}
            {modalCuentaAbierto && (
                <ModalCuenta
                    key={`${cuentaAEditar?.id || "nueva"}-${cuentaPadreParaSubcuenta?.id || "sin-padre"}`}
                    abierto={modalCuentaAbierto}
                    cuenta={cuentaAEditar}
                    cuentaPadreInicial={cuentaPadreParaSubcuenta}
                    cuentas={cuentas}
                    usuario={usuario}
                    alCerrar={() => {
                        setModalCuentaAbierto(false);
                        setCuentaAEditar(null);
                        setCuentaPadreParaSubcuenta(null);
                    }}
                    alGuardar={async (cuentaGuardada) => {
                        setMensajeExito(`Cuenta ${cuentaGuardada.codigo} guardada con éxito.`);
                        await recargarCuentas();
                        setTimeout(() => setMensajeExito(""), 4000);
                    }}
                />
            )}

            {modalConfigIvaAbierto && (
                <ModalConfiguracionIva
                    abierto={modalConfigIvaAbierto}
                    cuentas={cuentas}
                    usuario={usuario}
                    alCerrar={() => setModalConfigIvaAbierto(false)}
                    alGuardar={(nuevaConf) => {
                        setConfigIva(nuevaConf);
                        setMensajeExito("Configuración de IVA actualizada exitosamente.");
                        setTimeout(() => setMensajeExito(""), 4000);
                    }}
                />
            )}

            <ModalImportarCatalogo
                abierto={modalImportarAbierto}
                cuentasExistentes={cuentas}
                usuario={usuario}
                alCerrar={() => setModalImportarAbierto(false)}
                alImportarExitoso={async (res) => {
                    setMensajeExito(res?.mensaje || "Catálogo de cuentas importado exitosamente.");
                    await recargarCuentas();
                    setTimeout(() => setMensajeExito(""), 5000);
                }}
            />
        </section>
    );
}

export default CatalogoCuentas;
