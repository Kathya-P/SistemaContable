import { solicitarApi } from "./api";
 
// Crea la empresa (si no existe), el usuario de Authentication y la fila
// en public.usuarios. No modifica el esquema de ninguna tabla existente.
export async function registrarUsuario({ nombre, nombre_empresa, correo, password }) {
    return solicitarApi("/registro", {
        method: "POST",
        body: JSON.stringify({ nombre, nombre_empresa, correo, password })
    });
}
 