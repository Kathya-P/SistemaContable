import { solicitarApi } from "./api";

export async function obtenerCuentas(){
    return solicitarApi("/cuentas");
}