import { solicitarApi } from "./api";

// Obtener movimientos del libro diario

export async function obtenerLibroDiario(){
    return solicitarApi("/libro-diario", { cache: "no-store" });

}