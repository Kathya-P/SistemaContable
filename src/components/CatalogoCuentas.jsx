import { useEffect, useState } from "react";
import { obtenerCuentas } from "../services/cuentasService";
import { supabaseConfigurado } from "../lib/supabase";

function CatalogoCuentas(){
    const [cuentas, setCuentas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");
    const cuentasPorId = new Map(cuentas.map(cuenta => [String(cuenta.id), cuenta]));

    useEffect(() => {
        async function cargarCuentas(){
            if(!supabaseConfigurado){
                setError("Configura Supabase para consultar el catálogo de cuentas.");
                setCargando(false);
                return;
            }

            try{
                setCuentas(await obtenerCuentas());
            }catch(error){
                console.error("Error cargando cuentas:", error);
                setError("No se pudo cargar el catálogo de cuentas. Revisa las políticas de acceso.");
            }finally{
                setCargando(false);
            }
        }

        cargarCuentas();
    }, []);

    if(cargando){
        return <p>Cargando catálogo de cuentas...</p>;
    }

    if(error){
        return <p className="message-error">{error}</p>;
    }

    return(
        <section className="view-section">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Estructura contable</p>
                    <h1>Catálogo de cuentas</h1>
                </div>
                <span className="count-badge">{cuentas.length} cuentas</span>
            </div>

            <div className="table-shell">
                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Cuenta</th>
                            <th>Nivel</th>
                            <th>Cuenta padre</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cuentas.length === 0 ? (
                            <tr><td colSpan="4" className="empty-state">No hay cuentas registradas.</td></tr>
                        ) : cuentas.map(cuenta => (
                            <tr key={cuenta.id}>
                                <td className="account-code">{cuenta.codigo}</td>
                                <td>{cuenta.nombre}</td>
                                <td>{cuenta.nivel ?? "-"}</td>
                                <td>{cuentasPorId.get(String(cuenta.cuenta_padre_id))?.nombre || "Cuenta principal"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default CatalogoCuentas;
