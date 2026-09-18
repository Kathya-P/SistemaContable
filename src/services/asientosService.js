import { supabase } from "../lib/supabase";


// ==========================================
// Obtener todos los asientos con detalle
// ==========================================
export async function obtenerAsientos() {

    const { data, error } = await supabase
        .from("asientos")
        .select(`
            *,
            usuarios(
                nombre,
                correo
            ),
            detalle_asientos(
                *,
                cuentas(
                    codigo,
                    nombre
                )
            )
        `)
        .order("fecha", {
            ascending: false
        });


    if(error){
        throw error;
    }


    return data;
}



// ==========================================
// Obtener un asiento específico
// ==========================================
export async function obtenerAsientoPorId(id){


    const { data, error } = await supabase
        .from("asientos")
        .select(`
            *,
            usuarios(
                nombre,
                correo
            ),
            detalle_asientos(
                *,
                cuentas(
                    codigo,
                    nombre
                )
            )
        `)
        .eq("id", id)
        .single();



    if(error){
        throw error;
    }


    return data;

}



// ==========================================
// Crear asiento contable
// ==========================================
export async function crearAsiento(asiento, detalles){


    // Crear cabecera

    const { data: asientoCreado, error:errorAsiento } = await supabase
        .from("asientos")
        .insert([
            asiento
        ])
        .select()
        .single();



    if(errorAsiento){
        throw errorAsiento;
    }



    // Agregar el id del asiento al detalle

    const detallesConAsiento = detalles.map(detalle => ({
        ...detalle,
        asiento_id: asientoCreado.id
    }));




    const { data: detallesCreados, error:errorDetalle } = await supabase
        .from("detalle_asientos")
        .insert(detallesConAsiento)
        .select();




    if(errorDetalle){
        throw errorDetalle;
    }



    return {
        asiento: asientoCreado,
        detalle: detallesCreados
    };

}