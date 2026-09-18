import { supabase } from "../lib/supabase";


// Obtener todas las empresas
export async function obtenerEmpresas() {

    const { data, error } = await supabase
        .from("empresas")
        .select("*")
        .order("nombre_empresa");


    if (error) {
        throw error;
    }


    return data;
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

    const { data, error } = await supabase
        .from("empresas")
        .insert([
            empresa
        ])
        .select()
        .single();


    if (error) {
        throw error;
    }


    return data;
}