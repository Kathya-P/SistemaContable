import { Fragment, useEffect, useMemo, useState } from "react";
import { obtenerLibroDiario } from "../services/libroDiarioService";
import { supabaseConfigurado } from "../lib/supabase";


function moneda(valor){
    return Number(valor || 0).toLocaleString("es-SV", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function fechaCorta(valor){
    if(!valor){
        return "";
    }

    const [anio, mes, dia] = valor.split("-");
    return `${dia}/${mes}/${anio}`;
}

function gruposDeAsiento(asiento){
    const grupos = new Map();
    const detalles = asiento.detalle_asientos || [];
    const cuentas = new Map(detalles.map(detalle => [String(detalle.cuenta_id), detalle.cuentas]));

    detalles.forEach(detalle => {
        const cuenta = detalle.cuentas || {};
        const padre = cuenta.cuenta_padre || cuentas.get(String(cuenta.cuenta_padre_id)) || cuenta;
        const grupo = grupos.get(String(padre.id)) || {
            padre,
            detalles: [],
            debe: 0,
            haber: 0
        };

        grupo.detalles.push(detalle);
        grupo.debe += Number(detalle.debe || 0);
        grupo.haber += Number(detalle.haber || 0);
        grupos.set(String(padre.id), grupo);
    });

    return [...grupos.values()];
}

function LibroDiario({ filtroDesde, filtroHasta } = {}){
    const [asientos, setAsientos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function cargarDatos(){
            if(!supabaseConfigurado){
                setError("Falta configurar la conexión con Supabase.");
                setCargando(false);
                return;
            }

            try{
                setAsientos(await obtenerLibroDiario());
            }catch(error){
                console.error("Error cargando libro diario:", error);
                setError(error.message || "No se pudo cargar el Libro Diario. Verificá que la API Node esté ejecutándose.");
            }finally{
                setCargando(false);
            }
        }

        cargarDatos();
    }, []);

    const asientosFiltrados = useMemo(() => {
        return asientos.filter(asiento => {
            if (!asiento.fecha) return true;
            if (filtroDesde && asiento.fecha < filtroDesde) return false;
            if (filtroHasta && asiento.fecha > filtroHasta) return false;
            return true;
        });
    }, [asientos, filtroDesde, filtroHasta]);

    const sumatorias = useMemo(() => {
        return asientosFiltrados.reduce((totales, asiento) => {
            (asiento.detalle_asientos || []).forEach(detalle => {
                totales.debe += Number(detalle.debe || 0);
                totales.haber += Number(detalle.haber || 0);
            });
            return totales;
        }, { debe: 0, haber: 0 });
    }, [asientosFiltrados]);
    const diarioCuadrado = Math.abs(sumatorias.debe - sumatorias.haber) < 0.005;

    if(cargando){
        return <h2>Cargando libro diario...</h2>;
    }

    if(error){
        return <main className="message-error"><h1>Libro Diario</h1><p>{error}</p></main>;
    }

    return(
        <section className="view-section">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Registro cronológico</p>
                    <h1>Libro Diario</h1>
                </div>
                <div className={diarioCuadrado ? "balance-status is-balanced" : "balance-status is-unbalanced"}>
                    {diarioCuadrado ? "Partida doble cuadrada" : "Revisar diferencias"}
                </div>
            </div>

            <div className="table-shell diario-shell">
                <table className="diario-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>N.° partida</th>
                            <th>Cuenta</th>
                            <th>Parcial</th>
                            <th>Debe</th>
                            <th>Haber</th>
                        </tr>
                    </thead>
                    <tbody>
                        {asientosFiltrados.length === 0 && <tr><td colSpan="6" className="empty-state">No hay asientos registrados en este período.</td></tr>}
                        {asientosFiltrados.map(asiento => {
                            const grupos = gruposDeAsiento(asiento);
                            const totalDebe = (asiento.detalle_asientos || []).reduce((total, detalle) => total + Number(detalle.debe || 0), 0);
                            const totalHaber = (asiento.detalle_asientos || []).reduce((total, detalle) => total + Number(detalle.haber || 0), 0);

                            return(
                                <Fragment key={asiento.id}>
                                    {grupos.map((grupo, grupoIndice) => (
                                        <Fragment key={`${asiento.id}-${grupo.padre.id}`}>
                                            <tr className="diario-parent-row">
                                                <td>{grupoIndice === 0 ? fechaCorta(asiento.fecha) : ""}</td>
                                                <td>{grupoIndice === 0 ? asiento.numero_partida : ""}</td>
                                                <td><strong>{grupo.padre.codigo} - {grupo.padre.nombre}</strong></td>
                                                <td></td>
                                                <td>{grupo.debe > 0 ? `$ ${moneda(grupo.debe)}` : ""}</td>
                                                <td>{grupo.haber > 0 ? `$ ${moneda(grupo.haber)}` : ""}</td>
                                            </tr>
                                            {grupo.detalles.map((detalle, detalleIndice) => (
                                                <tr className="diario-child-row" key={`${asiento.id}-${detalle.cuenta_id}-${detalleIndice}`}>
                                                    <td></td>
                                                    <td></td>
                                                    <td className="child-account">{detalle.cuentas?.codigo} - {detalle.cuentas?.nombre}</td>
                                                    <td>{Number(detalle.debe || 0) + Number(detalle.haber || 0) > 0 ? `$ ${moneda(Number(detalle.debe || 0) + Number(detalle.haber || 0))}` : ""}</td>
                                                    <td>{Number(detalle.debe || 0) > 0 ? `$ ${moneda(detalle.debe)}` : ""}</td>
                                                    <td>{Number(detalle.haber || 0) > 0 ? `$ ${moneda(detalle.haber)}` : ""}</td>
                                                </tr>
                                            ))}
                                        </Fragment>
                                    ))}
                                    <tr className="diario-concept-row">
                                        <td></td><td></td><td colSpan="4">C/ {asiento.concepto || "Sin concepto"}</td>
                                    </tr>
                                    <tr className="diario-total-row">
                                        <td colSpan="4">Total partida {asiento.numero_partida}</td>
                                        <td>$ {moneda(totalDebe)}</td>
                                        <td>$ {moneda(totalHaber)}</td>
                                    </tr>
                                </Fragment>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="diario-grand-total-row">
                            <th colSpan="4">Sumatoria general</th>
                            <th>$ {moneda(sumatorias.debe)}</th>
                            <th>$ {moneda(sumatorias.haber)}</th>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </section>
    );
}


export default LibroDiario;
