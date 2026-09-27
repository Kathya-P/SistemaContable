import { supabase } from "../lib/supabase";

// En Vercel y producción, la API siempre está en /api en el mismo dominio
const API_URL = "/api";

export async function solicitarApi(ruta, opciones = {}) {
    let token = null;
    if (supabase && supabase.auth) {
        try {
            const { data } = await supabase.auth.getSession();
            token = data?.session?.access_token;
        } catch {
            // Ignorar error al obtener sesión
        }
    }
    const rolGuardado = localStorage.getItem("conta_user_rol");
    const idGuardado = localStorage.getItem("conta_user_id");

    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(rolGuardado ? { "x-usuario-rol": rolGuardado } : {}),
        ...(idGuardado ? { "x-usuario-id": idGuardado } : {}),
        ...(opciones.headers || {})
    };
    const respuesta = await fetch(`${API_URL}${ruta}`, { ...opciones, headers });
    const cuerpo = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(cuerpo.error || cuerpo.details || "No se pudo completar la operación.");
    }

    return cuerpo;
}

export async function obtenerUsuarioActual() {
    return solicitarApi("/usuario-actual");
}
