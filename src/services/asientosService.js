import { solicitarApi } from "./api";


// ==========================================
// Obtener todos los asientos con detalle
// ==========================================
export async function obtenerAsientos() {
    return solicitarApi("/libro-diario");
}



// ==========================================
// Obtener un asiento específico
// ==========================================
export async function obtenerAsientoPorId(id){
    const asientos = await solicitarApi("/libro-diario");
    return asientos.find(asiento => String(asiento.id) === String(id));

}



// ==========================================
// Crear asiento contable
// ==========================================
export async function crearAsiento(asiento, detalles){
    return solicitarApi("/asientos", {
        method: "POST",
        body: JSON.stringify({ asiento, detalles })
    });
}

// ==========================================
// Rectificar o modificar asiento contable
// ==========================================
export async function rectificarAsiento(id, { concepto, motivo, detalles, fecha }){
    return solicitarApi(`/asientos/${id}/rectificar`, {
        method: "PUT",
        body: JSON.stringify({ concepto, motivo, detalles, fecha })
    });
}

// ==========================================
// Eliminar asiento contable del período
// ==========================================
export async function eliminarAsiento(id, motivo = "Eliminación de asiento contable"){
    return solicitarApi(`/asientos/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ motivo })
    });
}

export async function obtenerAsientosRecurrentesPendientes(fecha) {
    const query = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
    return solicitarApi(`/asientos-recurrentes/pendientes${query}`);
}

export async function crearAsientoRecurrente(recurrente) {
    return solicitarApi("/asientos-recurrentes", {
        method: "POST",
        body: JSON.stringify({ recurrente })
    });
}

export async function procesarAsientoRecurrente(ocurrenciaId, asientoId) {
    return solicitarApi(`/asientos-recurrentes/ocurrencias/${ocurrenciaId}/procesar`, {
        method: "POST",
        body: JSON.stringify({ asiento_id: asientoId })
    });
}

export async function omitirAsientoRecurrente(ocurrenciaId) {
    return solicitarApi(`/asientos-recurrentes/ocurrencias/${ocurrenciaId}/omitir`, {
        method: "POST"
    });
}

export async function desactivarAsientoRecurrente(ocurrenciaId) {
    return solicitarApi(`/asientos-recurrentes/ocurrencias/${ocurrenciaId}/desactivar`, {
        method: "PATCH"
    });
}

