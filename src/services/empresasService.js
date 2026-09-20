import { supabase } from "../lib/supabase";
import { solicitarApi } from "./api";

// Obtener todas las empresas
export async function obtenerEmpresas() {
    return solicitarApi("/empresas");
}


// Obtener empresa por ID
export async function obtenerEmpresaPorId(id) {

    const { data, error } = await supabase
        .from("empresas")
        .select("*")
        .eq("id", id)
        .single();


    if (error) {
        throw error;
    }


    return data;
}


// Crear empresa
export async function crearEmpresa(empresa) {
    return solicitarApi("/empresas", {
        method: "POST",
        body: JSON.stringify(empresa)
    });
}