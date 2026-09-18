import { useEffect, useState } from "react";
import { obtenerLibroDiario } from "../services/libroDiarioService";


function LibroDiario(){

    const [asientos, setAsientos] = useState([]);
    const [cargando, setCargando] = useState(true);


    useEffect(()=>{

        async function cargarDatos(){

            try{

                const datos = await obtenerLibroDiario();

                setAsientos(datos);

            }catch(error){

                console.error("Error cargando libro diario:", error);

            }finally{

                setCargando(false);

            }

        }


        cargarDatos();


    },[]);



    if(cargando){

        return(
            <h2>
                Cargando libro diario...
            </h2>
        )

    }




    return(

        <div style={{padding:"30px"}}>


            <h1>
                Libro Diario
            </h1>



            <table
                border="1"
                width="100%"
                cellPadding="10"
                style={{
                    borderCollapse:"collapse"
                }}
            >


                <thead>

                    <tr>

                        <th>Fecha</th>

                        <th>Partida</th>

                        <th>Código</th>

                        <th>Cuenta</th>

                        <th>Descripción</th>

                        <th>Debe</th>

                        <th>Haber</th>


                    </tr>

                </thead>



                <tbody>


                {
                    asientos.map(asiento=>(

                        asiento.detalle_asientos.map(detalle=>(


                            <tr 
                                key={`${asiento.id}-${detalle.cuenta_id}-${detalle.descripcion}`}
                            >


                                <td>
                                    {asiento.fecha}
                                </td>


                                <td>
                                    {asiento.numero_partida}
                                </td>


                                <td>
                                    {detalle.cuentas.codigo}
                                </td>


                                <td>
                                    {detalle.cuentas.nombre}
                                </td>


                                <td>
                                    {detalle.descripcion}
                                </td>


                                <td>
                                    {Number(detalle.debe).toLocaleString()}
                                </td>


                                <td>
                                    {Number(detalle.haber).toLocaleString()}
                                </td>


                            </tr>


                        ))

                    ))
                }


                </tbody>


            </table>


        </div>

    )

}


export default LibroDiario;