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
import { exportarCatalogoCuentasPDF } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";
import ModalCuenta from "./ModalCuenta";
import ModalImportarCatalogo from "./ModalImportarCatalogo";
import ModalCatalogoPredeterminado from "./ModalCatalogoPredeterminado";

function CatalogoCuentas({ usuario }) {
    const [cuentas, setCuentas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");
    const [mensajeExito, setMensajeExito] = useState("");

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
            return true;
        });
    }, [cuentas, busqueda, filtroTipo, filtroNivel, filtroEstado]);

    // Contadores estadísticos
    const estadisticas = useMemo(() => {
        const total = cuentas.length;
        const activas = cuentas.filter(c => c.estado).length;
        const inactivas = total - activas;
        const conMovimientos = cuentas.filter(c => c.tiene_movimientos).length;
        return { total, activas, inactivas, conMovimientos };
    }, [cuentas]);

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
                    <h1 style={{ margin: "2px 0 6px" }}>Catálogo de cuentas</h1>
                    <p style={{ fontSize: "13.5px", color: "#5F6B67", margin: 0 }}>
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
                                setMensajeExito(resultado.mensaje);
                                await recargarCuentas();
                                setTimeout(() => setMensajeExito(""), 4000);
                            }}
                        />
                    )}

                    <ExportarPdfButton
                        onExport={manejarExportacionPDF}
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
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
                margin: "18px 0"
            }}>
                <div style={{ background: "#FFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #DDE3E0" }}>
                    <span style={{ fontSize: "12px", color: "#667", textTransform: "uppercase" }}>Total cuentas</span>
                    <p style={{ margin: "2px 0 0", fontSize: "24px", fontWeight: "700", color: "#173B35" }}>{estadisticas.total}</p>
                </div>
                <div style={{ background: "#FFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #DDE3E0" }}>
                    <span style={{ fontSize: "12px", color: "#2E7D32", textTransform: "uppercase" }}>Activas</span>
                    <p style={{ margin: "2px 0 0", fontSize: "24px", fontWeight: "700", color: "#2E7D32" }}>{estadisticas.activas}</p>
                </div>
                <div style={{ background: "#FFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #DDE3E0" }}>
                    <span style={{ fontSize: "12px", color: "#8A5300", textTransform: "uppercase" }}>Inactivas</span>
                    <p style={{ margin: "2px 0 0", fontSize: "24px", fontWeight: "700", color: "#8A5300" }}>{estadisticas.inactivas}</p>
                </div>
                <div style={{ background: "#FFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #DDE3E0" }}>
                    <span style={{ fontSize: "12px", color: "#1F5F99", textTransform: "uppercase" }}>Con movimientos</span>
                    <p style={{ margin: "2px 0 0", fontSize: "24px", fontWeight: "700", color: "#1F5F99" }}>{estadisticas.conMovimientos}</p>
                </div>
            </div>

           {/* Filtros y opciones de visualización */}
<div style={{
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
                <div className="table-shell">
                    <table>
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Nombre</th>
                                <th>Tipo</th>
                                <th>Naturaleza</th>
                                <th>Nivel</th>
                                <th>Cuenta padre</th>
                                <th>Asientos</th>
                                <th>Estado</th>
                                {puedeGestionar && <th style={{ textAlign: "right" }}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {cuentasFiltradas.length === 0 ? (
                                <tr>
                                    <td colSpan={puedeGestionar ? 9 : 8} className="empty-state">
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
                                            <td className="account-code" style={{ textDecoration: esInactiva ? "line-through" : "none" }}>
                                                {cuenta.codigo}
                                            </td>
                                            <td style={{ fontWeight: cuenta.nivel === "GRUPO" ? "bold" : "normal" }}>
                                                {cuenta.nombre}
                                                {cuenta.tiene_movimientos && (
                                                    <span style={{ marginLeft: "6px", fontSize: "10px", padding: "1px 5px", background: "#E3EFE7", color: "#173D2D", borderRadius: "3px", border: "1px solid #C2CECA" }}>
                                                        Movs
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ fontSize: "11.5px", fontWeight: "600" }}>{cuenta.tipo}</span>
                                            </td>
                                            <td>
                                                <span style={{
                                                    fontSize: "11px",
                                                    fontWeight: "600",
                                                    padding: "2px 6px",
                                                    borderRadius: "4px",
                                                    background: esDeudora ? "#EAF5EE" : "#F2F6F4",
                                                    color: esDeudora ? "#1B4332" : "#2D6A4F"
                                                }}>
                                                    {esDeudora ? "Deudora" : "Acreedora"}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: "11.5px" }}>{cuenta.nivel}</span>
                                            </td>
                                            <td style={{ fontSize: "12px", color: "#555" }}>
                                                {padre ? `${padre.codigo} - ${padre.nombre}` : <span style={{ color: "#999" }}>Principal (Raíz)</span>}
                                            </td>
                                            <td>
                                                {cuenta.permite_movimientos ? (
                                                    <span style={{ fontSize: "11px", color: "#1B4332", fontWeight: "600" }}>Sí</span>
                                                ) : (
                                                    <span style={{ fontSize: "11px", color: "#888" }}>No (Agrup.)</span>
                                                )}
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
