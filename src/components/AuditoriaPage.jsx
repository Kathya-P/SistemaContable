import { useEffect, useState, useMemo } from "react";
import {
    obtenerLogsAuditoria,
    registrarAccionAuditoria,
    exportarAuditoriaCSV
} from "../services/auditoriaService";
import { solicitarApi } from "../services/api";
import { exportarAuditoriaPDF } from "../services/exportationService";
import { exportarAuditoriaExcel } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";

// Iconos SVG para las acciones
function IconoAccion({ tipo, size = 16 }) {
    const props = {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true
    };

    switch (tipo) {
        case "crear":
            return (
                <svg {...props}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
            );
        case "editar":
            return (
                <svg {...props}>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
            );
        case "eliminar":
            return (
                <svg {...props}>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
            );
        case "descargar":
            return (
                <svg {...props}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
            );
        case "ver":
        default:
            return (
                <svg {...props}>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            );
    }
}

// Configuración de estilos y etiquetas por tipo de acción (Gama de verdes armónicos)
const CONFIG_ACCIONES = {
    crear: {
        etiqueta: "Crear",
        claseBadge: "badge-crear",
        colorTexto: "#065f46",
        colorFondo: "#ecfdf5",
        colorBorde: "#a7f3d0"
    },
    editar: {
        etiqueta: "Editar",
        claseBadge: "badge-editar",
        colorTexto: "#047857",
        colorFondo: "#f0fdf4",
        colorBorde: "#86efac"
    },
    eliminar: {
        etiqueta: "Eliminar",
        claseBadge: "badge-eliminar",
        colorTexto: "#14532d",
        colorFondo: "#dcfce7",
        colorBorde: "#4ade80"
    },
    descargar: {
        etiqueta: "Descargar",
        claseBadge: "badge-descargar",
        colorTexto: "#166534",
        colorFondo: "#f7fee7",
        colorBorde: "#bef264"
    },
    ver: {
        etiqueta: "Ver",
        claseBadge: "badge-ver",
        colorTexto: "#065f46",
        colorFondo: "#f0fdf4",
        colorBorde: "#a7f3d0"
    }
};

const CONFIG_RESULTADOS = {
    exitoso: {
        etiqueta: "Exitoso",
        colorTexto: "#065f46",
        colorFondo: "#d1fae5"
    },
    error: {
        etiqueta: "Error",
        colorTexto: "#14532d",
        colorFondo: "#e2ece2"
    },
    "denegado por permisos": {
        etiqueta: "Denegado",
        colorTexto: "#1e3a1e",
        colorFondo: "#d9e5d9"
    }
};

export default function AuditoriaPage({ usuario }) {
    const formatearFechaIso = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    };

    const anioActual = new Date().getFullYear();

    const [fechaDesde, setFechaDesde] = useState(`${anioActual}-01-01`);
    const [fechaHasta, setFechaHasta] = useState(`${anioActual}-12-31`);
    const [rangoActivo, setRangoActivo] = useState("anio");
    const [filtroUsuario, setFiltroUsuario] = useState("todos");
    const [filtroAccion, setFiltroAccion] = useState("todos");
    const [filtroEntidad, setFiltroEntidad] = useState("todas");
    const [filtroResultado, setFiltroResultado] = useState("todos");
    const [busqueda, setBusqueda] = useState("");
    const [incluirMisAcciones, setIncluirMisAcciones] = useState(true);

    const [pagina, setPagina] = useState(1);
    const [ordenCampo, setOrdenCampo] = useState("fecha_hora");
    const [ordenDir, setOrdenDir] = useState("desc");

    const [logs, setLogs] = useState([]);
    const [totalRegistros, setTotalRegistros] = useState(0);
    const [totalPaginas, setTotalPaginas] = useState(1);
    const [resumen, setResumen] = useState(null);
    const [tablaExisteEnBD, setTablaExisteEnBD] = useState(true);

    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [usuariosLista, setUsuariosLista] = useState([]);

    // Modal de detalles
    const [logSeleccionado, setLogSeleccionado] = useState(null);
    const [tabModal, setTabModal] = useState("comparacion"); // 'comparacion', 'anteriores', 'nuevos'
    const [modalSqlAbierto, setModalSqlAbierto] = useState(false);
    const [copiadoSql, setCopiadoSql] = useState(false);

    // Cargar lista de usuarios para el selector
    useEffect(() => {
        solicitarApi("/usuarios")
            .then(data => setUsuariosLista(data || []))
            .catch(() => setUsuariosLista([]));
    }, []);

    // Cargar logs con los filtros actuales
    const cargarLogs = async () => {
        setCargando(true);
        setError(null);
        try {
            const res = await obtenerLogsAuditoria({
                desde: fechaDesde,
                hasta: fechaHasta,
                usuario_id: filtroUsuario,
                tipo_accion: filtroAccion,
                entidad_afectada: filtroEntidad,
                resultado: filtroResultado,
                buscar: busqueda,
                incluir_mis_acciones: incluirMisAcciones,
                pagina,
                limite: 50,
                orden_campo: ordenCampo,
                orden_dir: ordenDir
            });

            setLogs(res.logs || []);
            setTotalRegistros(res.total || 0);
            setTotalPaginas(res.totalPaginas || 1);
            setResumen(res.resumen || null);
            setTablaExisteEnBD(res.tablaExisteEnBD !== false);
        } catch (err) {
            console.error("Error cargando auditoría:", err);
            setError(err.message || "No se pudieron cargar los registros de auditoría.");
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargarLogs();
    }, [
        fechaDesde,
        fechaHasta,
        filtroUsuario,
        filtroAccion,
        filtroEntidad,
        filtroResultado,
        incluirMisAcciones,
        pagina,
        ordenCampo,
        ordenDir
    ]);

    // Aplicar búsqueda tras un pequeño retraso
    useEffect(() => {
        const timer = setTimeout(() => {
            setPagina(1);
            cargarLogs();
        }, 350);
        return () => clearTimeout(timer);
    }, [busqueda]);

    // Accesos rápidos de fecha
    const aplicarRangoRapido = (tipo) => {
        const ahora = new Date();
        let inicio = new Date();
        let fin = new Date();

        switch (tipo) {
            case "anio":
                inicio = new Date(ahora.getFullYear(), 0, 1);
                fin = new Date(ahora.getFullYear(), 11, 31);
                break;
            case "hoy":
                inicio = ahora;
                fin = ahora;
                break;
            case "semana": {
                const diaSem = ahora.getDay();
                const diff = ahora.getDate() - diaSem + (diaSem === 0 ? -6 : 1);
                inicio = new Date(ahora.setDate(diff));
                fin = new Date();
                break;
            }
            case "mes":
                inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
                fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);
                break;
            case "30dias":
                inicio = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
                fin = new Date();
                break;
            case "3meses":
                inicio = new Date(ahora.getTime() - 90 * 24 * 60 * 60 * 1000);
                fin = new Date();
                break;
            case "todo":
                inicio = new Date("2020-01-01");
                fin = new Date();
                break;
            default:
                break;
        }

        setRangoActivo(tipo);
        setFechaDesde(formatearFechaIso(inicio));
        setFechaHasta(formatearFechaIso(fin));
        setPagina(1);
    };

    const alternarOrden = (campo) => {
        if (ordenCampo === campo) {
            setOrdenDir(actual => (actual === "asc" ? "desc" : "asc"));
        } else {
            setOrdenCampo(campo);
            setOrdenDir("desc");
        }
        setPagina(1);
    };

    const handleExportar = () => {
        exportarAuditoriaCSV(logs);
        registrarAccionAuditoria({
            tipo_accion: "descargar",
            entidad_afectada: "Reporte",
            descripcion: `Descargó reporte de auditoría en CSV (${logs.length} registros filtrados)`
        });
    };

    const handleExportarPDF = () => {
        exportarAuditoriaPDF({ logs });
    };

    const handleExportarExcel = () => {
        exportarAuditoriaExcel({ logs });
    };

    const limpiarFiltros = () => {
        aplicarRangoRapido("anio");
        setFiltroUsuario("todos");
        setFiltroAccion("todos");
        setFiltroEntidad("todas");
        setFiltroResultado("todos");
        setBusqueda("");
        setIncluirMisAcciones(true);
        setPagina(1);
    };

    // Script SQL para copiar en Supabase
    const sqlScript = `-- Ejecuta este script en el SQL Editor de tu proyecto Supabase:
CREATE TABLE IF NOT EXISTS public.logs_auditoria (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id BIGINT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_nombre TEXT NOT NULL,
    tipo_accion TEXT NOT NULL CHECK (tipo_accion IN ('crear', 'editar', 'eliminar', 'ver', 'descargar')),
    entidad_afectada TEXT NOT NULL,
    entidad_id TEXT,
    descripcion TEXT NOT NULL,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    ip_usuario TEXT,
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resultado TEXT NOT NULL DEFAULT 'exitoso' CHECK (resultado IN ('exitoso', 'error', 'denegado por permisos')),
    detalles_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_logs_auditoria_fecha_hora ON public.logs_auditoria (fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_logs_auditoria_usuario_id ON public.logs_auditoria (usuario_id);
CREATE INDEX IF NOT EXISTS idx_logs_auditoria_empresa_id ON public.logs_auditoria (empresa_id);
CREATE INDEX IF NOT EXISTS idx_logs_auditoria_tipo_accion ON public.logs_auditoria (tipo_accion);

ALTER TABLE public.logs_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a service_role en logs_auditoria" ON public.logs_auditoria FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Lectura para autenticados en logs_auditoria" ON public.logs_auditoria FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insercion para autenticados en logs_auditoria" ON public.logs_auditoria FOR INSERT TO authenticated WITH CHECK (true);`;

    const copiarSql = () => {
        navigator.clipboard.writeText(sqlScript);
        setCopiadoSql(true);
        setTimeout(() => setCopiadoSql(false), 2500);
    };

    // Cálculo de diferencias entre datos anteriores y nuevos
    const diferencias = useMemo(() => {
        if (!logSeleccionado) return [];
        const antes = logSeleccionado.datos_anteriores || {};
        const despues = logSeleccionado.datos_nuevos || {};

        const todasClaves = Array.from(new Set([...Object.keys(antes), ...Object.keys(despues)]));
        const diffs = [];

        for (const k of todasClaves) {
            const valAntes = antes[k];
            const valDespues = despues[k];
            const strAntes = JSON.stringify(valAntes);
            const strDespues = JSON.stringify(valDespues);

            if (strAntes !== strDespues) {
                diffs.push({
                    campo: k,
                    antes: valAntes,
                    despues: valDespues,
                    modificado: valAntes !== undefined && valDespues !== undefined,
                    creado: valAntes === undefined,
                    eliminado: valDespues === undefined
                });
            }
        }
        return diffs;
    }, [logSeleccionado]);

    return (
        <section className="view-section auditoria-page">
            <style>{`
                .auditoria-page {
                    --verde-primario: #059669;
                    --verde-oscuro: #064e3b;
                    --verde-bosque: #047857;
                    --verde-suave: #ecfdf5;
                    --verde-borde: #a7f3d0;
                    --verde-fondo-card: #f0fdf4;
                }

                .auditoria-page .btn-actualizar {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background-color: #f0fdf4;
                    border: 1.5px solid #a7f3d0;
                    color: #065f46;
                    font-weight: 600;
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .auditoria-page .btn-actualizar:hover:not(:disabled) {
                    background-color: #dcfce7;
                    border-color: #34d399;
                }

                .auditoria-page .btn-exportar {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background-color: #059669;
                    border: 1.5px solid #047857;
                    color: #ffffff;
                    font-weight: 600;
                    padding: 8px 18px;
                    border-radius: 8px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 5px rgba(5, 150, 105, 0.25);
                }
                .auditoria-page .btn-exportar:hover:not(:disabled) {
                    background-color: #047857;
                    box-shadow: 0 4px 8px rgba(5, 150, 105, 0.35);
                }

                .auditoria-page .chip-rango {
                    background: #ffffff;
                    border: 1.5px solid #d1fae5;
                    color: #374151;
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .auditoria-page .chip-rango:hover {
                    background: #f0fdf4;
                    border-color: #6ee7b7;
                    color: #065f46;
                }
                .auditoria-page .chip-rango.is-active {
                    background: #059669;
                    color: #ffffff;
                    border-color: #047857;
                    font-weight: 600;
                    box-shadow: 0 2px 4px rgba(5, 150, 105, 0.25);
                }

                .auditoria-page .btn-limpiar {
                    background-color: #f0fdf4;
                    border: 1.5px solid #a7f3d0;
                    color: #065f46;
                    font-weight: 600;
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .auditoria-page .btn-limpiar:hover {
                    background-color: #dcfce7;
                    border-color: #6ee7b7;
                }

                .auditoria-page .btn-detalles {
                    background-color: #f0fdf4;
                    border: 1.5px solid #a7f3d0;
                    color: #065f46;
                    font-weight: 600;
                    padding: 5px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .auditoria-page .btn-detalles:hover {
                    background-color: #dcfce7;
                    border-color: #34d399;
                }

                .auditoria-page .btn-paginacion {
                    background-color: #f0fdf4;
                    border: 1.5px solid #a7f3d0;
                    color: #065f46;
                    font-weight: 600;
                    padding: 6px 14px;
                    border-radius: 6px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .auditoria-page .btn-paginacion:hover:not(:disabled) {
                    background-color: #dcfce7;
                    border-color: #34d399;
                }
                .auditoria-page .btn-paginacion:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                }

                .auditoria-page .input-auditoria {
                    padding: 9px 12px;
                    border: 1.5px solid #a7f3d0;
                    background-color: #ffffff;
                    border-radius: 8px;
                    font-size: 13px;
                    color: #1f2937;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    width: 100%;
                    box-sizing: border-box;
                }
                .auditoria-page .input-auditoria:focus {
                    border-color: #059669;
                    box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.18);
                }

                .auditoria-page .select-auditoria {
                    padding: 9px 34px 9px 12px;
                    border: 1.5px solid #a7f3d0;
                    background-color: #ffffff;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23059669'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 10px center;
                    background-size: 16px;
                    appearance: none;
                    border-radius: 8px;
                    font-size: 13px;
                    color: #1f2937;
                    outline: none;
                    cursor: pointer;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    width: 100%;
                    box-sizing: border-box;
                }
                .auditoria-page .select-auditoria:focus {
                    border-color: #059669;
                    box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.18);
                }

                .auditoria-page .checkbox-auditoria {
                    accent-color: #059669;
                    width: 17px;
                    height: 17px;
                    cursor: pointer;
                }
            `}</style>

            {/* Cabecera Principal */}
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Seguridad y Trazabilidad</p>
                    <h1>Auditoría del Sistema</h1>
                    <p className="section-subtitle">
                        Registro inalterable de operaciones, creaciones, ediciones y accesos de usuarios.
                    </p>
                </div>
                <div className="heading-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <button
                        className="btn-actualizar"
                        onClick={cargarLogs}
                        title="Actualizar registros"
                        disabled={cargando}
                    >
                        ↻ Actualizar
                    </button>
                    <button
                        className="btn-exportar"
                        onClick={handleExportar}
                        title="Exportar a archivo CSV para Excel"
                        disabled={!logs.length}
                    >
                        <IconoAccion tipo="descargar" size={16} />
                        Exportar CSV
                    </button>
                    <ExportarPdfButton className="btn-exportar" onExport={handleExportarPDF} onExportExcel={handleExportarExcel} reporte="Auditoría" disabled={!logs.length} />
                </div>
            </div>

            {/* Aviso si la tabla aún no se ha ejecutado en Supabase */}
            {!tablaExisteEnBD && (
                <div
                    style={{
                        padding: "12px 16px",
                        marginBottom: "16px",
                        borderRadius: "8px",
                        background: "#f0fdf4",
                        border: "1.5px solid #a7f3d0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "10px"
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "20px" }}>ℹ️</span>
                        <div>
                            <strong style={{ color: "#065f46" }}>Búfer en Memoria Activo:</strong>
                            <span style={{ marginLeft: "6px", fontSize: "14px", color: "#166534" }}>
                                La tabla <code>logs_auditoria</code> aún no existe en tu base de datos Supabase. El sistema está registrando las acciones en el búfer de alta disponibilidad en memoria.
                            </span>
                        </div>
                    </div>
                    <button
                        className="btn-actualizar"
                        style={{ fontSize: "13px", padding: "6px 12px" }}
                        onClick={() => setModalSqlAbierto(true)}
                    >
                        Ver Script SQL para Supabase
                    </button>
                </div>
            )}

            {/* Tarjetas de Métricas Rápidas (Exclusivamente tonos de verde) */}
            {resumen && resumen.totales && (
                <div
                    className="metricas-auditoria-grid"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                        gap: "12px",
                        marginBottom: "20px"
                    }}
                >
                    <div style={{ padding: "15px", borderRadius: "10px", border: "1.5px solid #a7f3d0", background: "#f0fdf4" }}>
                        <span style={{ fontSize: "13px", color: "#065f46", fontWeight: "600", display: "block", marginBottom: "4px" }}>Total Acciones (30d)</span>
                        <strong style={{ fontSize: "24px", color: "#064e3b" }}>{resumen.totales.totalAcciones || 0}</strong>
                    </div>
                    <div style={{ padding: "15px", borderRadius: "10px", border: "1.5px solid #6ee7b7", background: "#ecfdf5" }}>
                        <span style={{ fontSize: "13px", color: "#047857", fontWeight: "600", display: "block", marginBottom: "4px" }}>Creaciones</span>
                        <strong style={{ fontSize: "24px", color: "#059669" }}>{resumen.totales.crear || 0}</strong>
                    </div>
                    <div style={{ padding: "15px", borderRadius: "10px", border: "1.5px solid #86efac", background: "#f0fdf4" }}>
                        <span style={{ fontSize: "13px", color: "#15803d", fontWeight: "600", display: "block", marginBottom: "4px" }}>Ediciones</span>
                        <strong style={{ fontSize: "24px", color: "#16a34a" }}>{resumen.totales.editar || 0}</strong>
                    </div>
                    <div style={{ padding: "15px", borderRadius: "10px", border: "1.5px solid #a7f3d0", background: "#dcfce7" }}>
                        <span style={{ fontSize: "13px", color: "#14532d", fontWeight: "600", display: "block", marginBottom: "4px" }}>Eliminaciones</span>
                        <strong style={{ fontSize: "24px", color: "#15803d" }}>{resumen.totales.eliminar || 0}</strong>
                    </div>
                    <div style={{ padding: "15px", borderRadius: "10px", border: "1.5px solid #bef264", background: "#f7fee7" }}>
                        <span style={{ fontSize: "13px", color: "#3f6212", fontWeight: "600", display: "block", marginBottom: "4px" }}>Descargas</span>
                        <strong style={{ fontSize: "24px", color: "#4d7c0f" }}>{resumen.totales.descargar || 0}</strong>
                    </div>
                    <div style={{ padding: "15px", borderRadius: "10px", border: "1.5px solid #a7f3d0", background: "#eef7ee" }}>
                        <span style={{ fontSize: "13px", color: "#2d4a2d", fontWeight: "600", display: "block", marginBottom: "4px" }}>Errores / Denegados</span>
                        <strong style={{ fontSize: "24px", color: "#1e3a1e" }}>{(resumen.totales.totalErrores || 0) + (resumen.totales.totalDenegados || 0)}</strong>
                    </div>
                </div>
            )}

            {/* Mini Gráficos Resumen (Acciones por día y % por tipo en verdes) */}
            {resumen && resumen.accionesPorDia && (
                <div
                    className="graficos-auditoria-container"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                        gap: "16px",
                        marginBottom: "20px"
                    }}
                >
                    {/* Gráfico 1: Barras en verde - Acciones por día */}
                    <div
                        style={{
                            background: "#ffffff",
                            border: "1.5px solid #d1fae5",
                            borderRadius: "10px",
                            padding: "16px"
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", alignItems: "center" }}>
                            <strong style={{ fontSize: "14px", color: "#065f46" }}>Acciones por día (últimos 30 días)</strong>
                            <span style={{ fontSize: "12px", color: "#047857", fontWeight: "500" }}>
                                {resumen.totales.totalAcciones} eventos
                            </span>
                        </div>
                        <div style={{ height: "120px", display: "flex", alignItems: "flex-end", gap: "3px", paddingTop: "10px" }}>
                            {(() => {
                                const maxVal = Math.max(...resumen.accionesPorDia.map(d => d.total), 1);
                                return resumen.accionesPorDia.map((d) => {
                                    const alturaPct = Math.max(8, (d.total / maxVal) * 100);
                                    return (
                                        <div
                                            key={d.fecha}
                                            style={{
                                                flex: 1,
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                height: "100%",
                                                justifyContent: "flex-end"
                                            }}
                                            title={`${d.etiqueta} (${d.fecha}): ${d.total} acciones (${d.crear} creadas, ${d.editar} editadas, ${d.eliminar} eliminadas)`}
                                        >
                                            <div
                                                style={{
                                                    width: "100%",
                                                    height: `${alturaPct}%`,
                                                    background: d.total > 0 ? "linear-gradient(180deg, #10b981 0%, #047857 100%)" : "rgba(16, 185, 129, 0.15)",
                                                    borderRadius: "3px 3px 0 0",
                                                    transition: "height 0.3s ease"
                                                }}
                                            />
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "11px", color: "#047857" }}>
                            <span>Hace 30 días</span>
                            <span>Hoy</span>
                        </div>
                    </div>

                    {/* Gráfico 2: Distribución de acciones por tipo (Solo verdes, sin 'ver') */}
                    <div
                        style={{
                            background: "#ffffff",
                            border: "1.5px solid #d1fae5",
                            borderRadius: "10px",
                            padding: "16px"
                        }}
                    >
                        <strong style={{ fontSize: "14px", color: "#065f46", display: "block", marginBottom: "14px" }}>
                            % de acciones por tipo
                        </strong>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            {resumen.accionesPorTipo.filter(item => item.tipo !== "ver").map(item => (
                                <div key={item.tipo}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                                        <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#1f2937" }}>
                                            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: item.color }} />
                                            {item.etiqueta}
                                        </span>
                                        <strong style={{ color: "#065f46" }}>{item.cantidad} ({item.porcentaje}%)</strong>
                                    </div>
                                    <div style={{ width: "100%", height: "6px", background: "rgba(16, 185, 129, 0.12)", borderRadius: "3px", overflow: "hidden" }}>
                                        <div
                                            style={{
                                                width: `${item.porcentaje}%`,
                                                height: "100%",
                                                background: item.color,
                                                borderRadius: "3px",
                                                transition: "width 0.4s ease"
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Panel de Filtros Superior */}
            <div
                className="filtros-auditoria-panel"
                style={{
                    background: "#ffffff",
                    border: "1.5px solid #d1fae5",
                    borderRadius: "10px",
                    padding: "16px",
                    marginBottom: "20px"
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                    <strong style={{ fontSize: "14px", color: "#065f46" }}>Filtros de Búsqueda</strong>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button className={`chip-rango ${rangoActivo === "anio" ? "is-active" : ""}`} onClick={() => aplicarRangoRapido("anio")}>Año actual</button>
                        <button className={`chip-rango ${rangoActivo === "hoy" ? "is-active" : ""}`} onClick={() => aplicarRangoRapido("hoy")}>Hoy</button>
                        <button className={`chip-rango ${rangoActivo === "semana" ? "is-active" : ""}`} onClick={() => aplicarRangoRapido("semana")}>Esta semana</button>
                        <button className={`chip-rango ${rangoActivo === "mes" ? "is-active" : ""}`} onClick={() => aplicarRangoRapido("mes")}>Este mes</button>
                        <button className={`chip-rango ${rangoActivo === "30dias" ? "is-active" : ""}`} onClick={() => aplicarRangoRapido("30dias")}>Últimos 30 días</button>
                        <button className={`chip-rango ${rangoActivo === "3meses" ? "is-active" : ""}`} onClick={() => aplicarRangoRapido("3meses")}>Últimos 3 meses</button>
                        <button className={`chip-rango ${rangoActivo === "todo" ? "is-active" : ""}`} onClick={() => aplicarRangoRapido("todo")}>Todo</button>
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "12px",
                        marginBottom: "14px"
                    }}
                >
                    <label style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px", color: "#065f46", fontWeight: "600" }}>
                        Fecha Inicio
                        <input
                            type="date"
                            value={fechaDesde}
                            onChange={e => { setFechaDesde(e.target.value); setRangoActivo(""); setPagina(1); }}
                            className="input-auditoria"
                        />
                    </label>

                    <label style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px", color: "#065f46", fontWeight: "600" }}>
                        Fecha Fin
                        <input
                            type="date"
                            value={fechaHasta}
                            onChange={e => { setFechaHasta(e.target.value); setRangoActivo(""); setPagina(1); }}
                            className="input-auditoria"
                        />
                    </label>

                    <label style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px", color: "#065f46", fontWeight: "600" }}>
                        Usuario
                        <select
                            value={filtroUsuario}
                            onChange={e => { setFiltroUsuario(e.target.value); setPagina(1); }}
                            className="select-auditoria"
                        >
                            <option value="todos">Todos los usuarios</option>
                            {usuariosLista.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.nombre} ({u.rol})
                                </option>
                            ))}
                        </select>
                    </label>

                    <label style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px", color: "#065f46", fontWeight: "600" }}>
                        Tipo de Acción
                        <select
                            value={filtroAccion}
                            onChange={e => { setFiltroAccion(e.target.value); setPagina(1); }}
                            className="select-auditoria"
                        >
                            <option value="todos">Todas las acciones</option>
                            <option value="crear">Crear</option>
                            <option value="editar">Editar</option>
                            <option value="eliminar">Eliminar</option>
                            <option value="descargar">Descargar</option>
                        </select>
                    </label>

                    <label style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px", color: "#065f46", fontWeight: "600" }}>
                        Entidad Afectada
                        <select
                            value={filtroEntidad}
                            onChange={e => { setFiltroEntidad(e.target.value); setPagina(1); }}
                            className="select-auditoria"
                        >
                            <option value="todas">Todas las entidades</option>
                            <option value="Asiento">Asiento</option>
                            <option value="Usuario">Usuario</option>
                            <option value="Cuenta">Cuenta (Catálogo)</option>
                            <option value="Reporte">Reporte</option>
                            <option value="Configuracion">Configuración</option>
                        </select>
                    </label>

                    <label style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px", color: "#065f46", fontWeight: "600" }}>
                        Resultado
                        <select
                            value={filtroResultado}
                            onChange={e => { setFiltroResultado(e.target.value); setPagina(1); }}
                            className="select-auditoria"
                        >
                            <option value="todos">Todos los resultados</option>
                            <option value="exitoso">Exitoso</option>
                            <option value="error">Error</option>
                            <option value="denegado por permisos">Denegado por permisos</option>
                        </select>
                    </label>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "220px" }}>
                        <input
                            type="text"
                            placeholder="Buscar en descripción, usuario o ID..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            className="input-auditoria"
                        />
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", userSelect: "none", color: "#065f46", fontWeight: "500" }}>
                        <input
                            type="checkbox"
                            className="checkbox-auditoria"
                            checked={incluirMisAcciones}
                            onChange={e => { setIncluirMisAcciones(e.target.checked); setPagina(1); }}
                        />
                        Incluir mis acciones
                    </label>

                    <button
                        className="btn-limpiar"
                        onClick={limpiarFiltros}
                    >
                        Limpiar filtros
                    </button>
                </div>
            </div>

            {/* Mensajes de error si los hay */}
            {error && <p className="message-error" style={{ marginBottom: "16px" }}>{error}</p>}

            {/* Tabla Principal de Auditoría */}
            <div className="table-shell" style={{ overflowX: "auto", border: "1.5px solid #d1fae5", borderRadius: "10px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                        <tr style={{ background: "#f0fdf4", borderBottom: "1.5px solid #a7f3d0" }}>
                            <th
                                onClick={() => alternarOrden("fecha_hora")}
                                style={{ cursor: "pointer", padding: "11px 12px", textAlign: "left", whiteSpace: "nowrap", color: "#065f46" }}
                            >
                                Fecha / Hora {ordenCampo === "fecha_hora" && (ordenDir === "asc" ? "▲" : "▼")}
                            </th>
                            <th
                                onClick={() => alternarOrden("usuario_nombre")}
                                style={{ cursor: "pointer", padding: "11px 12px", textAlign: "left", whiteSpace: "nowrap", color: "#065f46" }}
                            >
                                Usuario {ordenCampo === "usuario_nombre" && (ordenDir === "asc" ? "▲" : "▼")}
                            </th>
                            <th
                                onClick={() => alternarOrden("tipo_accion")}
                                style={{ cursor: "pointer", padding: "11px 12px", textAlign: "center", whiteSpace: "nowrap", color: "#065f46" }}
                            >
                                Acción {ordenCampo === "tipo_accion" && (ordenDir === "asc" ? "▲" : "▼")}
                            </th>
                            <th
                                onClick={() => alternarOrden("entidad_afectada")}
                                style={{ cursor: "pointer", padding: "11px 12px", textAlign: "left", whiteSpace: "nowrap", color: "#065f46" }}
                            >
                                Entidad {ordenCampo === "entidad_afectada" && (ordenDir === "asc" ? "▲" : "▼")}
                            </th>
                            <th style={{ padding: "11px 12px", textAlign: "left", color: "#065f46" }}>ID</th>
                            <th style={{ padding: "11px 12px", textAlign: "left", color: "#065f46" }}>Descripción</th>
                            <th style={{ padding: "11px 12px", textAlign: "center", whiteSpace: "nowrap", color: "#065f46" }}>Resultado</th>
                            <th style={{ padding: "11px 12px", textAlign: "center", color: "#065f46" }}>Detalles</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr>
                                <td colSpan="8" style={{ textAlign: "center", padding: "30px", color: "#047857" }}>
                                    Cargando registros de auditoría...
                                </td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan="8" style={{ textAlign: "center", padding: "30px", color: "#065f46" }}>
                                    No se encontraron eventos de auditoría con los filtros aplicados.
                                </td>
                            </tr>
                        ) : (
                            logs.map(log => {
                                const cfgAccion = CONFIG_ACCIONES[log.tipo_accion] || CONFIG_ACCIONES.crear;
                                const cfgResultado = CONFIG_RESULTADOS[log.resultado] || CONFIG_RESULTADOS.exitoso;

                                return (
                                    <tr
                                        key={log.id}
                                        style={{ borderBottom: "1px solid #e5e7eb" }}
                                    >
                                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#374151" }}>
                                            {log.fecha_hora ? new Date(log.fecha_hora).toLocaleString("es-ES", {
                                                year: "numeric",
                                                month: "2-digit",
                                                day: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                                second: "2-digit"
                                            }) : "-"}
                                        </td>
                                        <td style={{ padding: "10px 12px", fontWeight: "600", color: "#1f2937" }}>
                                            {log.usuario_nombre}
                                        </td>
                                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                            <span
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: "5px",
                                                    padding: "3px 9px",
                                                    borderRadius: "12px",
                                                    fontSize: "12px",
                                                    fontWeight: "600",
                                                    color: cfgAccion.colorTexto,
                                                    background: cfgAccion.colorFondo,
                                                    border: `1.5px solid ${cfgAccion.colorBorde}`
                                                }}
                                            >
                                                <IconoAccion tipo={log.tipo_accion} size={14} />
                                                {cfgAccion.etiqueta}
                                            </span>
                                        </td>
                                        <td style={{ padding: "10px 12px" }}>
                                            <span
                                                style={{
                                                    padding: "3px 8px",
                                                    borderRadius: "5px",
                                                    fontSize: "11px",
                                                    fontWeight: "600",
                                                    background: "#ecfdf5",
                                                    border: "1px solid #a7f3d0",
                                                    color: "#065f46"
                                                }}
                                            >
                                                {log.entidad_afectada}
                                            </span>
                                        </td>
                                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#4b5563" }}>
                                            {log.entidad_id || "-"}
                                        </td>
                                        <td style={{ padding: "10px 12px", maxWidth: "320px", wordBreak: "break-word", color: "#1f2937" }}>
                                            {log.descripcion}
                                        </td>
                                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                            <span
                                                style={{
                                                    padding: "3px 9px",
                                                    borderRadius: "12px",
                                                    fontSize: "11px",
                                                    fontWeight: "600",
                                                    color: cfgResultado.colorTexto,
                                                    background: cfgResultado.colorFondo,
                                                    border: "1px solid #a7f3d0"
                                                }}
                                            >
                                                {cfgResultado.etiqueta}
                                            </span>
                                        </td>
                                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                            <button
                                                className="btn-detalles"
                                                onClick={() => setLogSeleccionado(log)}
                                                title="Ver detalle completo y diferencias de datos"
                                            >
                                                Ver detalles
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Paginación */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "16px",
                    flexWrap: "wrap",
                    gap: "10px"
                }}
            >
                <span style={{ fontSize: "13px", color: "#065f46", fontWeight: "500" }}>
                    Mostrando {logs.length > 0 ? (pagina - 1) * 50 + 1 : 0} - {Math.min(pagina * 50, totalRegistros)} de {totalRegistros} eventos
                </span>

                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <button
                        className="btn-paginacion"
                        disabled={pagina <= 1 || cargando}
                        onClick={() => setPagina(p => Math.max(1, p - 1))}
                    >
                        ◀ Anterior
                    </button>
                    <span style={{ fontSize: "13px", padding: "0 8px", color: "#065f46" }}>
                        Página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong>
                    </span>
                    <button
                        className="btn-paginacion"
                        disabled={pagina >= totalPaginas || cargando}
                        onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                    >
                        Siguiente ▶
                    </button>
                </div>
            </div>

            {/* Modal "Ver Detalles" del Log */}
            {logSeleccionado && (
                <div
                    className="modal-overlay"
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(0,0,0,0.55)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                        padding: "16px"
                    }}
                    onClick={() => setLogSeleccionado(null)}
                >
                    <div
                        className="modal-content"
                        style={{
                            background: "var(--card-bg, #ffffff)",
                            borderRadius: "12px",
                            maxWidth: "750px",
                            width: "100%",
                            maxHeight: "90vh",
                            overflowY: "auto",
                            padding: "24px",
                            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
                            border: "1px solid var(--border-color, #e5e7eb)"
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Cabecera del modal */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                            <div>
                                <span style={{ fontSize: "12px", color: "var(--text-muted, #6b7280)" }}>
                                    Registro de Auditoría #{logSeleccionado.id}
                                </span>
                                <h2 style={{ fontSize: "18px", margin: "4px 0" }}>
                                    {logSeleccionado.descripcion}
                                </h2>
                            </div>
                            <button
                                onClick={() => setLogSeleccionado(null)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    fontSize: "22px",
                                    cursor: "pointer",
                                    color: "var(--text-muted, #6b7280)"
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Metadatos */}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                                gap: "10px",
                                padding: "12px",
                                background: "var(--bg-secondary, #f9fafb)",
                                borderRadius: "8px",
                                marginBottom: "16px",
                                fontSize: "12px"
                            }}
                        >
                            <div>
                                <span style={{ color: "var(--text-muted, #6b7280)", display: "block" }}>Fecha y Hora</span>
                                <strong>{new Date(logSeleccionado.fecha_hora).toLocaleString("es-ES")}</strong>
                            </div>
                            <div>
                                <span style={{ color: "var(--text-muted, #6b7280)", display: "block" }}>Usuario Responsable</span>
                                <strong>{logSeleccionado.usuario_nombre} (ID: {logSeleccionado.usuario_id || "N/A"})</strong>
                            </div>
                            <div>
                                <span style={{ color: "var(--text-muted, #6b7280)", display: "block" }}>Acción / Entidad</span>
                                <strong>{logSeleccionado.tipo_accion?.toUpperCase()} en {logSeleccionado.entidad_afectada} #{logSeleccionado.entidad_id || "N/A"}</strong>
                            </div>
                            <div>
                                <span style={{ color: "var(--text-muted, #6b7280)", display: "block" }}>Dirección IP</span>
                                <strong style={{ fontFamily: "monospace" }}>{logSeleccionado.ip_usuario || "127.0.0.1"}</strong>
                            </div>
                            <div>
                                <span style={{ color: "var(--text-muted, #6b7280)", display: "block" }}>Resultado</span>
                                <strong>{logSeleccionado.resultado}</strong>
                            </div>
                        </div>

                        {/* Detalles de error si existió */}
                        {logSeleccionado.detalles_error && (
                            <div
                                style={{
                                    padding: "10px 14px",
                                    borderRadius: "6px",
                                    background: "rgba(239, 68, 68, 0.1)",
                                    border: "1px solid rgba(239, 68, 68, 0.3)",
                                    color: "#dc2626",
                                    fontSize: "13px",
                                    marginBottom: "16px"
                                }}
                            >
                                <strong>Detalle del error capturado:</strong>
                                <p style={{ margin: "4px 0 0 0", fontFamily: "monospace" }}>{logSeleccionado.detalles_error}</p>
                            </div>
                        )}

                        {/* Pestañas de Vista de Datos */}
                        <div style={{ display: "flex", gap: "8px", borderBottom: "1.5px solid #d1fae5", marginBottom: "14px", paddingBottom: "4px" }}>
                            <button
                                className={`chip-rango ${tabModal === "comparacion" ? "is-active" : ""}`}
                                onClick={() => setTabModal("comparacion")}
                            >
                                Comparación / Diferencias ({diferencias.length})
                            </button>
                            <button
                                className={`chip-rango ${tabModal === "anteriores" ? "is-active" : ""}`}
                                onClick={() => setTabModal("anteriores")}
                            >
                                Datos Anteriores
                            </button>
                            <button
                                className={`chip-rango ${tabModal === "nuevos" ? "is-active" : ""}`}
                                onClick={() => setTabModal("nuevos")}
                            >
                                Datos Nuevos
                            </button>
                        </div>

                        {/* Contenido de la pestaña */}
                        {tabModal === "comparacion" && (
                            <div>
                                {diferencias.length === 0 ? (
                                    <p style={{ color: "#065f46", fontSize: "13px", textAlign: "center", padding: "20px" }}>
                                        No se detectaron diferencias clave o es un registro de creación pura.
                                    </p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                        {diferencias.map(diff => (
                                            <div
                                                key={diff.campo}
                                                style={{
                                                    padding: "10px",
                                                    borderRadius: "8px",
                                                    background: "#f0fdf4",
                                                    border: "1.5px solid #a7f3d0",
                                                    fontSize: "12px"
                                                }}
                                            >
                                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                                    <strong style={{ color: "#065f46" }}>Campo: {diff.campo}</strong>
                                                    <span style={{ fontSize: "11px", fontWeight: "600", color: diff.modificado ? "#047857" : diff.creado ? "#059669" : "#14532d" }}>
                                                        {diff.modificado ? "Modificado" : diff.creado ? "Creado" : "Eliminado"}
                                                    </span>
                                                </div>
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                                    <div style={{ background: "rgba(20, 83, 45, 0.06)", padding: "8px", borderRadius: "6px", border: "1px solid rgba(20, 83, 45, 0.2)" }}>
                                                        <span style={{ fontSize: "11px", color: "#14532d", fontWeight: "600", display: "block", marginBottom: "3px" }}>Antes:</span>
                                                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#1f2937" }}>
                                                            {JSON.stringify(diff.antes, null, 2)}
                                                        </pre>
                                                    </div>
                                                    <div style={{ background: "rgba(16, 185, 129, 0.1)", padding: "8px", borderRadius: "6px", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                                                        <span style={{ fontSize: "11px", color: "#047857", fontWeight: "600", display: "block", marginBottom: "3px" }}>Después:</span>
                                                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#064e3b" }}>
                                                            {JSON.stringify(diff.despues, null, 2)}
                                                        </pre>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {tabModal === "anteriores" && (
                            <div style={{ background: "#f0fdf4", border: "1.5px solid #a7f3d0", padding: "12px", borderRadius: "8px" }}>
                                <pre style={{ margin: 0, fontSize: "12px", whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#1f2937" }}>
                                    {logSeleccionado.datos_anteriores
                                        ? JSON.stringify(logSeleccionado.datos_anteriores, null, 2)
                                        : "No aplican datos anteriores para esta acción."}
                                </pre>
                            </div>
                        )}

                        {tabModal === "nuevos" && (
                            <div style={{ background: "#f0fdf4", border: "1.5px solid #a7f3d0", padding: "12px", borderRadius: "8px" }}>
                                <pre style={{ margin: 0, fontSize: "12px", whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#064e3b" }}>
                                    {logSeleccionado.datos_nuevos
                                        ? JSON.stringify(logSeleccionado.datos_nuevos, null, 2)
                                        : "No aplican datos nuevos para esta acción."}
                                </pre>
                            </div>
                        )}

                        <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
                            <button className="btn-exportar" onClick={() => setLogSeleccionado(null)}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Script SQL para Supabase */}
            {modalSqlAbierto && (
                <div
                    className="modal-overlay"
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(0,0,0,0.55)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                        padding: "16px"
                    }}
                    onClick={() => setModalSqlAbierto(false)}
                >
                    <div
                        className="modal-content"
                        style={{
                            background: "var(--card-bg, #ffffff)",
                            borderRadius: "12px",
                            maxWidth: "650px",
                            width: "100%",
                            padding: "24px",
                            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
                            border: "1.5px solid #a7f3d0"
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <h2 style={{ fontSize: "18px", margin: 0, color: "#064e3b" }}>Script SQL para Crear Logs_Auditoria en Supabase</h2>
                            <button
                                onClick={() => setModalSqlAbierto(false)}
                                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#065f46" }}
                            >
                                ✕
                            </button>
                        </div>
                        <p style={{ fontSize: "13px", color: "#065f46", marginBottom: "12px" }}>
                            Copia y pega este script en el <strong>SQL Editor</strong> de tu panel de Supabase para que los registros se almacenen permanentemente en la base de datos PostgreSQL:
                        </p>
                        <div
                            style={{
                                background: "#06281e",
                                color: "#ecfdf5",
                                padding: "12px",
                                borderRadius: "8px",
                                maxHeight: "250px",
                                overflowY: "auto",
                                fontSize: "12px",
                                fontFamily: "monospace",
                                marginBottom: "16px",
                                border: "1px solid #047857"
                            }}
                        >
                            <pre style={{ margin: 0 }}>{sqlScript}</pre>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <button
                                className="btn-exportar"
                                onClick={copiarSql}
                                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                            >
                                {copiadoSql ? "✓ ¡Copiado al portapapeles!" : "📋 Copiar Código SQL"}
                            </button>
                            <button className="btn-actualizar" onClick={() => setModalSqlAbierto(false)}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
