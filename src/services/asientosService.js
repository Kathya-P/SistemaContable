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

