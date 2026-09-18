import { supabase } from "../lib/supabase";


export async function obtenerCuentas(){

    const {data,error}=await supabase
        .from("cuentas")
        .select("*")
        .order("codigo");


    if(error){
        throw error;
    }


    return data;
}