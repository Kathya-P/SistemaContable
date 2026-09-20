import { supabase } from "../lib/supabase";

// En Vercel y producción, las rutas de la API siempre van a /api en el mismo dominio.
// Supabase es la base de datos, NO el servidor de la API contable.
let apiBase = "/api";
const envApi = import.meta.env.VITE_API_URL;
if (envApi && !envApi.includes("supabase.co") && !envApi.includes("localhost")) {
    apiBase = envApi;
} else if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    apiBase = envApi || "/api";
}
const API_URL = apiBase;



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

    if(!respuesta.ok){
        throw new Error(cuerpo.error || cuerpo.details || "No se pudo completar la operación.");
    }

    return cuerpo;
}

export async function obtenerUsuarioActual(){
    return solicitarApi("/usuario-actual");
}
