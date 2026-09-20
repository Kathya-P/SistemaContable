import { supabase } from "../lib/supabase";

// En Vercel y producción, la API siempre está en /api en el mismo dominio
const API_URL = "/api";

export async function solicitarApi(ruta, opciones = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
