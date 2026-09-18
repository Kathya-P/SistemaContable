import { supabase } from "../lib/supabase";


// Obtener movimientos del libro diario

export async function obtenerLibroDiario(){

    const { data, error } = await supabase
        .from("asientos")
        .select(`
            id,
            fecha,
            numero_partida,
            concepto,
            detalle_asientos(
                descripcion,
                debe,
                haber,
                cuentas(
                    codigo,
                    nombre
                )
            )
        `)
        .order("fecha", {
            ascending:true
        });



    if(error){
        throw error;
    }


    return data;

}