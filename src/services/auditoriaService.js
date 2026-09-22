import { solicitarApi } from "./api";

/**
 * Servicio para consultar y registrar logs de auditoría en ContaCabal.
 */

export async function obtenerLogsAuditoria({
    desde = "",
    hasta = "",
    usuario_id = "todos",
    tipo_accion = "todos",
    entidad_afectada = "todas",
    resultado = "todos",
    buscar = "",
    incluir_mis_acciones = false,
    pagina = 1,
    limite = 50,
    orden_campo = "fecha_hora",
    orden_dir = "desc"
} = {}) {
    const params = new URLSearchParams();

    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (usuario_id && usuario_id !== "todos") params.set("usuario_id", String(usuario_id));
    if (tipo_accion && tipo_accion !== "todos") params.set("tipo_accion", tipo_accion);
    if (entidad_afectada && entidad_afectada !== "todas") params.set("entidad_afectada", entidad_afectada);
    if (resultado && resultado !== "todos") params.set("resultado", resultado);
    if (buscar && String(buscar).trim()) params.set("buscar", String(buscar).trim());
    if (incluir_mis_acciones) params.set("incluir_mis_acciones", "true");
    params.set("pagina", String(pagina));
    params.set("limite", String(limite));
    params.set("orden_campo", orden_campo);
    params.set("orden_dir", orden_dir);

    return solicitarApi(`/auditoria?${params.toString()}`);
}

/**
 * Registra una acción de auditoría desde el cliente (ej. descargas de reportes)
 */
export async function registrarAccionAuditoria({
    tipo_accion = "ver",
    entidad_afectada = "Reporte",
    entidad_id = null,
    descripcion,
    datos_anteriores = null,
    datos_nuevos = null,
    resultado = "exitoso",
    detalles_error = null
}) {
    try {
        return await solicitarApi("/auditoria", {
            method: "POST",
            body: JSON.stringify({
                tipo_accion,
                entidad_afectada,
                entidad_id,
                descripcion,
                datos_anteriores,
                datos_nuevos,
                resultado,
                detalles_error
            })
        });
    } catch (err) {
        console.warn("No se pudo registrar la acción en auditoría:", err.message);
        return null;
    }
}

/**
 * Genera y descarga un archivo CSV con codificación UTF-8 con BOM a partir de los logs
 */
export function exportarAuditoriaCSV(logs = [], nombreArchivo = "Reporte_Auditoria_ContaCabal.csv") {
    if (!logs || !logs.length) {
        alert("No hay registros de auditoría para exportar.");
        return;
    }

    const cabeceras = [
        "ID",
        "Fecha y Hora",
        "Usuario",
        "Acción",
        "Entidad Afectada",
        "ID Entidad",
        "Descripción",
        "Resultado",
        "IP",
        "Detalles de Error"
    ];

    const escaparCSV = (valor) => {
        if (valor === null || valor === undefined) return '""';
        const str = String(valor).replace(/"/g, '""');
        return `"${str}"`;
    };

    const filas = logs.map(log => [
        escaparCSV(log.id),
        escaparCSV(log.fecha_hora ? new Date(log.fecha_hora).toLocaleString("es-ES") : ""),
        escaparCSV(log.usuario_nombre),
        escaparCSV(log.tipo_accion ? log.tipo_accion.toUpperCase() : ""),
        escaparCSV(log.entidad_afectada),
        escaparCSV(log.entidad_id || ""),
        escaparCSV(log.descripcion),
        escaparCSV(log.resultado),
        escaparCSV(log.ip_usuario || ""),
        escaparCSV(log.detalles_error || "")
    ].join(","));

    // \uFEFF añade el Byte Order Mark para compatibilidad con Microsoft Excel
    const contenidoCSV = "\uFEFF" + [cabeceras.join(","), ...filas].join("\r\n");
    const blob = new Blob([contenidoCSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.setAttribute("download", nombreArchivo);
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
}
