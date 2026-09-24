import { Fragment, useEffect, useMemo, useState } from "react";
import { crearAsiento } from "../services/asientosService";
import { obtenerCuentas } from "../services/cuentasService";
import { obtenerEmpresas } from "../services/empresasService";
import { supabaseConfigurado } from "../lib/supabase";
import { calcularAsiento } from "../utils/asientoIva";
import { exportarNuevoAsientoPDF, exportarNuevoAsientoExcel } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";

const nuevaLinea = () => ({
    cuenta_id: "",
    debe: "",
    haber: ""
});

function normalizarNumero(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

const dinero = n => `$ ${n.toFixed(2)}`;
const dineroC = centavos => dinero(centavos / 100);

// El Libro Diario ya antepone "C/", así que el concepto se guarda sin ese prefijo.
function quitarPrefijoConcepto(texto) {
    return String(texto || "").trim().replace(/^C\/\s*/i, "");
}

// La "cuenta mayor" de una subcuenta es su padre; las cuentas sin hijas son ellas mismas.
function cuentaMayor(cuenta, cuentasPorId) {
    if (cuenta?.nivel === "SUBCUENTA" && cuenta.cuenta_padre_id) {
        return cuentasPorId.get(String(cuenta.cuenta_padre_id)) || cuenta;
    }
    return cuenta;
}

function etiquetaOrigen(origen) {
    if (origen === "iva") return " · IVA automático";
    if (origen === "cuadre") return " · se completa sola";
    return "";
}

// Arma los bloques como en la guía: primero lo del Debe, luego lo del Haber.
// Recibe las líneas ya calculadas (con el IVA y la línea de cuadre puestos).
function armarVistaPrevia(lineas, cuentasPorId) {
    const bloques = { debe: new Map(), haber: new Map() };

    for (const linea of lineas) {
        const mayor = cuentaMayor(linea.cuenta, cuentasPorId);
        const grupo = bloques[linea.lado].get(mayor.id) || { mayor, total: 0, hijas: [], origen: null };

        grupo.total += linea.centavos;

        if (mayor.id !== linea.cuenta.id) {
            grupo.hijas.push({ cuenta: linea.cuenta, centavos: linea.centavos, origen: linea.origen });
        } else {
            grupo.origen = linea.origen;
        }

        bloques[linea.lado].set(mayor.id, grupo);
    }

    return [
        ...[...bloques.debe.values()].map(g => ({ ...g, lado: "debe" })),
        ...[...bloques.haber.values()].map(g => ({ ...g, lado: "haber" }))
    ];
}

function construirConceptoAutomatico(lineas, modoIva) {
    if (!lineas.length) return "";

    // ¿hay movimiento en una cuenta (por prefijo de código) y por qué lado?
    const hay = (prefijo, lado) => lineas.some(l =>
        l.cuenta.codigo.startsWith(prefijo) && (!lado || l.lado === lado));

    const efectivoDebe = hay("1101", "debe");
    const efectivoHaber = hay("1101", "haber");
    const aCredito = hay("2101", "haber");
    const conIva = (hay("1105") || hay("2102")) && !hay("2103");
    let iva = "";
    if (conIva && modoIva === "incluido") iva = " (precio incluye IVA)";
    if (conIva && modoIva === "mas") iva = " (más IVA)";
    let texto;

    if (hay("3101", "haber")) texto = "Aporte de los socios para el inicio de operaciones";
    else if (hay("4102", "haber")) texto = "Devolución sobre compra";
    else if (hay("5102", "debe")) texto = "Devolución sobre venta";
    else if (hay("2103", "haber")) texto = "Préstamo bancario recibido";
    else if (hay("4101", "debe")) texto = aCredito ? "Compra de mercadería al crédito" : "Compra de mercadería al contado";
    else if (hay("5101", "haber")) texto = hay("1102", "debe") ? "Venta de mercadería al crédito" : "Venta de mercadería al contado";
    else if (hay("1201", "debe")) texto = aCredito && efectivoHaber
        ? "Compra de activo fijo, parte al contado y parte a crédito"
        : aCredito ? "Compra de activo fijo a crédito" : "Compra de activo fijo al contado";
    else if (hay("1104", "debe")) texto = "Pago anticipado";
    else if (hay("42", "debe")) texto = "Pago de gastos";
    else if (hay("2101", "debe") && efectivoHaber) texto = "Pago a proveedores";
    else if (hay("1102", "haber") && efectivoDebe) texto = "Cobro a clientes";
    else if (efectivoDebe && efectivoHaber) texto = "Traslado entre Caja y Bancos";
    else texto = `Registro de ${[...new Set(lineas.map(l => l.cuenta.nombre))].slice(0, 3).join(", ")}`;

    return `${texto}${iva}.`;
}

function NuevoAsiento({ usuario, empresaNombre = "Empresa", onCreated }){
    const [empresas, setEmpresas] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const empresaId = usuario?.empresa_id ? String(usuario.empresa_id) : "";
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [concepto, setConcepto] = useState("");
    const [generarConcepto, setGenerarConcepto] = useState(false);
    const [modoIva, setModoIva] = useState("incluido"); // "incluido" | "mas" | "sin"
    const [detalles, setDetalles] = useState([nuevaLinea(), nuevaLinea()]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [mensaje, setMensaje] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        async function cargarDatos(){
            if(!supabaseConfigurado){
                setError("Configura Supabase para registrar asientos.");
                setCargando(false);
                return;
            }

            try{
                const [empresasCargadas, cuentasCargadas] = await Promise.all([obtenerEmpresas(), obtenerCuentas()]);
                setEmpresas(empresasCargadas);
                setCuentas(cuentasCargadas);
            }catch(error){
                console.error("Error cargando datos del asiento:", error);
                setError("No se pudieron cargar empresas y cuentas para el asiento.");
            }finally{
                setCargando(false);
            }
        }

        cargarDatos();
    }, []);

    const cuentasPorId = useMemo(() => new Map(cuentas.map(cuenta => [String(cuenta.id), cuenta])), [cuentas]);
    const cuentasPorCodigo = useMemo(() => new Map(cuentas.map(cuenta => [cuenta.codigo, cuenta])), [cuentas]);
    const empresa = empresas.find(e => String(e.id) === empresaId);
    const cuentasMovibles = useMemo(
        () => cuentas.filter(c => c.permite_movimientos === true && c.estado !== false),
        [cuentas]
    );

    // el asiento real: lo que escribes + el IVA automático + la línea que se completa sola
    const calculo = useMemo(
        () => calcularAsiento(detalles, cuentasPorId, cuentasPorCodigo, modoIva),
        [detalles, cuentasPorId, cuentasPorCodigo, modoIva]
    );
    const vistaPrevia = useMemo(() => armarVistaPrevia(calculo.lineas, cuentasPorId), [calculo, cuentasPorId]);

    const totalDebe = calculo.totalDebe / 100;
    const totalHaber = calculo.totalHaber / 100;
    const diferencia = Math.abs(calculo.totalDebe - calculo.totalHaber) / 100;
    const estaBalanceado = calculo.totalDebe === calculo.totalHaber && calculo.totalDebe > 0;
    const capturadoDebe = detalles.reduce((sum, item) => sum + normalizarNumero(item.debe), 0);
    const capturadoHaber = detalles.reduce((sum, item) => sum + normalizarNumero(item.haber), 0);
    const idsUsados = detalles.filter(detalle => detalle.cuenta_id).map(detalle => String(detalle.cuenta_id));
    const tieneCuentasRepetidas = new Set(idsUsados).size !== idsUsados.length;
    const puedeGuardar = Boolean(empresaId)
        && Boolean(fecha)
        && Boolean(concepto.trim())
        && calculo.lineas.length >= 2
        && calculo.sinImporte === 0
        && calculo.errores.length === 0
        && !tieneCuentasRepetidas
        && estaBalanceado;

    function conceptoAutomatico(detallesActuales, modo){
        const resultado = calcularAsiento(detallesActuales, cuentasPorId, cuentasPorCodigo, modo);
        return construirConceptoAutomatico(resultado.lineas, modo);
    }

    function alternarConceptoAutomatico(valor){
        setGenerarConcepto(valor);
        if(valor){
            setConcepto(conceptoAutomatico(detalles, modoIva));
        }
    }

    function cambiarModoIva(nuevoModo){
        setModoIva(nuevoModo);
        if(generarConcepto){
            setConcepto(conceptoAutomatico(detalles, nuevoModo));
        }
    }

    function actualizarDetalle(indice, campo, valor){
        const nuevasLineas = detalles.map((linea, lineaIndice) => {
            if(lineaIndice !== indice){
                return linea;
            }

            const lineaActualizada = { ...linea, [campo]: valor };

            if(campo === "debe" && valor !== "") {
                lineaActualizada.haber = "";
            }

            if(campo === "haber" && valor !== "") {
                lineaActualizada.debe = "";
            }

            return lineaActualizada;
        });

        setDetalles(nuevasLineas);

        if(generarConcepto){
            setConcepto(conceptoAutomatico(nuevasLineas, modoIva));
        }
    }

    function agregarLinea(){
        setDetalles(lineas => [...lineas, nuevaLinea()]);
    }

    function quitarLinea(indice){
        setDetalles(lineas => lineas.length > 2 ? lineas.filter((_, lineaIndice) => lineaIndice !== indice) : lineas);
    }

    async function guardarAsiento(evento){
        evento.preventDefault();
        setError("");
        setMensaje("");

        if(!empresaId || !fecha || !concepto.trim()){
            setError("Completa empresa, fecha y concepto.");
            return;
        }

        if(detalles.filter(detalle => detalle.cuenta_id).length < 2){
            setError("Debe haber al menos dos líneas válidas para guardar el asiento.");
            return;
        }

        if(detalles.some(detalle => !detalle.cuenta_id)){
            setError("Cada línea debe tener una cuenta contable.");
            return;
        }

        if(tieneCuentasRepetidas){
            setError("No puedes repetir la misma cuenta dentro de la misma partida.");
            return;
        }

        if(detalles.some(detalle => {
            const debe = normalizarNumero(detalle.debe);
            const haber = normalizarNumero(detalle.haber);
            return debe < 0 || haber < 0 || (debe > 0 && haber > 0);
        })){
            setError("Cada línea debe tener un importe positivo en Debe o en Haber, pero no en ambas columnas.");
            return;
        }

        if(calculo.sinImporte > 0){
            setError("Hay líneas sin importe. Solo puedes dejar una sin importe, y esa se completa sola con lo que falta para cuadrar.");
            return;
        }

        if(calculo.errores.length){
            setError(calculo.errores[0]);
            return;
        }

        if(!estaBalanceado){
            setError("El asiento debe estar balanceado: Debe y Haber deben coincidir en centavos.");
            return;
        }

        try{
            setGuardando(true);
            const resultado = await crearAsiento(
                {
                    empresa_id: empresaId,
                    fecha,
                    concepto: quitarPrefijoConcepto(concepto)
                },
                // se guardan las líneas reales, con el IVA y la línea de cuadre ya calculados
                calculo.lineas.map(linea => ({
                    cuenta_id: linea.cuenta.id,
                    descripcion: linea.origen === "iva" ? "IVA automático" : "",
                    debe: linea.lado === "debe" ? linea.centavos / 100 : 0,
                    haber: linea.lado === "haber" ? linea.centavos / 100 : 0
                }))
            );

            const numeroPartida = resultado?.numero_partida ?? resultado?.asiento?.numero_partida ?? "";
            setMensaje(numeroPartida ? `Asiento guardado correctamente. Partida ${numeroPartida}.` : "Asiento guardado correctamente.");
            setDetalles([nuevaLinea(), nuevaLinea()]);
            setConcepto("");
            setGenerarConcepto(false);
        }catch(error){
            console.error("Error guardando asiento:", error);
            setError(error.message || "No se pudo guardar el asiento.");
        }finally{
            setGuardando(false);
        }
    }

    if(cargando){
        return <p>Cargando datos para el asiento...</p>;
    }

    if(error && !cuentas.length){
        return <p className="message-error">{error}</p>;
    }

    function manejarExportacionPDF() {
        exportarNuevoAsientoPDF({ detalles, cuentasPorId, fecha, concepto, empresa: empresaNombre });
    }

    function manejarExportacionExcel() {
        exportarNuevoAsientoExcel({ detalles, cuentasPorId, fecha, concepto, empresa: empresaNombre });
    }

    return(
        <section className="view-section">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Registro contable</p>
                    <h1>Nuevo asiento</h1>
                </div>
                <ExportarPdfButton onExport={manejarExportacionPDF} onExportExcel={manejarExportacionExcel} reporte="Nuevo Asiento" disabled={!empresaId || !detalles.length} />
                <div className={estaBalanceado ? "balance-status is-balanced" : "balance-status"}>
                    Debe {totalDebe.toLocaleString()} / Haber {totalHaber.toLocaleString()} · {estaBalanceado ? "Cuadra" : `No cuadra (${diferencia.toFixed(2)})`}
                </div>
            </div>

            <form onSubmit={guardarAsiento} className="entry-form">
                <div className="company-step is-complete">
                    <div className="company-step-heading">
                        <div>
                            <span className="step-kicker">Paso 1</span>
                            <h2>Empresa</h2>
                            <p>Se aplicarán los asientos únicamente a:</p>
                        </div>
                        <span className="company-step-status">Empresa del usuario</span>
                    </div>
                    <label>Empresa
                        <input value={empresa?.nombre_empresa || empresa?.nombre || `Empresa ${empresaId || "no asignada"}`} readOnly />
                    </label>
                </div>

                {empresaId ? <div className="form-grid">
                    <label>Fecha
                        <input type="date" value={fecha} onChange={evento => setFecha(evento.target.value)} />
                    </label>
                    <label>IVA (13%)
                        <select value={modoIva} onChange={evento => cambiarModoIva(evento.target.value)}>
                            <option value="incluido">IVA incluido en el monto</option>
                            <option value="mas">Más IVA (el monto no lo incluye)</option>
                            <option value="sin">Sin IVA</option>
                        </select>
                    </label>
                    <label className="form-wide">Concepto
                        <input value={concepto} onChange={evento => setConcepto(evento.target.value)} placeholder="Ej. Aporte inicial de capital" />
                    </label>
                    <label className="concept-option">
                        <span>Concepto automático</span>
                        <span className="concept-controls">
                            <input type="checkbox" checked={generarConcepto} onChange={evento => alternarConceptoAutomatico(evento.target.checked)} />
                            <button type="button" className="button-secondary" onClick={() => setConcepto(conceptoAutomatico(detalles, modoIva))}>Generar concepto</button>
                        </span>
                    </label>
                </div> : null}

                {!empresaId && <p className="company-required-message">Tu usuario no tiene una empresa asignada. Un administrador debe completar `usuarios.empresa_id`.</p>}

                {empresaId && <>
                    <div className="detail-header">
                        <h2>Detalle del asiento</h2>
                        <button type="button" className="button-secondary" onClick={agregarLinea}>Agregar línea</button>
                    </div>

                    <p className="form-help">La cuenta seleccionada es la subcuenta. El sistema muestra su cuenta principal y calcula el parcial automáticamente.</p>
                    <p className="form-help">
                        {modoIva === "incluido" && "IVA incluido: escribe el total y el sistema separa la base y el IVA en las cuentas que lo llevan. "}
                        {modoIva === "mas" && "Más IVA: escribe el monto sin IVA y el sistema le suma el 13% en las cuentas que lo llevan. "}
                        {modoIva === "sin" && "Sin IVA: no se agrega ninguna línea de IVA. "}
                        Puedes dejar sin importe una sola línea (por ejemplo Proveedores o Caja) y se completa sola con lo que falta para cuadrar.
                    </p>

                    <div className="detail-table-shell">
                        <table className="entry-detail-table">
                        <thead>
                            <tr>
                                <th>Cuenta</th>
                                <th>Subcuenta</th>
                                <th>Parcial</th>
                                <th>Debe</th>
                                <th>Haber</th>
                                <th aria-label="Acciones"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {detalles.map((detalle, indice) => {
                                const cuenta = cuentasPorId.get(String(detalle.cuenta_id));
                                const padre = cuenta ? cuentaMayor(cuenta, cuentasPorId) : null;
                                // la línea real de esta fila: la base sin IVA o el importe que se completó sola
                                const lineaReal = calculo.lineas.find(l => l.indice === indice);
                                const parcial = lineaReal ? lineaReal.centavos / 100 : 0;
                                const sugerido = lineaReal?.origen === "cuadre" ? parcial.toFixed(2) : "0.00";

                                return (
                                    <tr key={indice}>
                                        <td className="entry-account-cell">{padre ? `${padre.codigo} - ${padre.nombre}` : "Cuenta principal"}</td>
                                        <td>
                                            <select value={detalle.cuenta_id} onChange={evento => actualizarDetalle(indice, "cuenta_id", evento.target.value)} aria-label="Subcuenta contable">
                                                <option value="">Seleccionar subcuenta</option>
                                                {cuentasMovibles.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.codigo} - {opcion.nombre}</option>)}
                                            </select>
                                        </td>
                                        <td className="entry-partial-cell">{parcial > 0 ? parcial.toFixed(2) : ""}</td>
                                        <td><input type="number" min="0" step="0.01" value={detalle.debe} onChange={evento => actualizarDetalle(indice, "debe", evento.target.value)} placeholder={lineaReal?.lado === "debe" ? sugerido : "0.00"} aria-label="Debe" /></td>
                                        <td><input type="number" min="0" step="0.01" value={detalle.haber} onChange={evento => actualizarDetalle(indice, "haber", evento.target.value)} placeholder={lineaReal?.lado === "haber" ? sugerido : "0.00"} aria-label="Haber" /></td>
                                        <td><button type="button" className="icon-button" onClick={() => quitarLinea(indice)} aria-label="Quitar línea">×</button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th colSpan="3">Total capturado</th>
                                <th>{capturadoDebe.toFixed(2)}</th>
                                <th>{capturadoHaber.toFixed(2)}</th>
                                <th></th>
                            </tr>
                        </tfoot>
                        </table>
                    </div>

                    {vistaPrevia.length > 0 && (
                        <>
                            <h2>Vista del asiento</h2>
                            <div className="detail-table-shell">
                                <table className="entry-detail-table entry-preview">
                                    <thead>
                                        <tr>
                                            <th>Cuenta</th>
                                            <th>Parcial</th>
                                            <th>Debe</th>
                                            <th>Haber</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vistaPrevia.map(({ mayor, lado, total, hijas, origen }) => (
                                            <Fragment key={`${lado}-${mayor.id}`}>
                                                <tr className="parent-row">
                                                    <td>{mayor.codigo} - {mayor.nombre}{etiquetaOrigen(origen)}</td>
                                                    <td></td>
                                                    <td>{lado === "debe" ? dineroC(total) : ""}</td>
                                                    <td>{lado === "haber" ? dineroC(total) : ""}</td>
                                                </tr>
                                                {hijas.map(h => (
                                                    <tr key={`${lado}-${h.cuenta.id}`} className="child-row">
                                                        <td>{h.cuenta.codigo} - {h.cuenta.nombre}{etiquetaOrigen(h.origen)}</td>
                                                        <td>{dineroC(h.centavos)}</td>
                                                        <td></td>
                                                        <td></td>
                                                    </tr>
                                                ))}
                                            </Fragment>
                                        ))}
                                        {quitarPrefijoConcepto(concepto) && (
                                            <tr className="concept-row">
                                                <td colSpan="4">C/ {quitarPrefijoConcepto(concepto)}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <th>Total del asiento</th>
                                            <th></th>
                                            <th>{dineroC(calculo.totalDebe)}</th>
                                            <th>{dineroC(calculo.totalHaber)}</th>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </>
                    )}
                </>}

                {calculo.errores.map(texto => <p key={texto} className="message-error">{texto}</p>)}
                {error && <p className="message-error">{error}</p>}
                {mensaje && <p className="message-success">{mensaje}</p>}
                {empresaId && (
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                        <button
                            type="submit"
                            className="button-primary"
                            disabled={!puedeGuardar || guardando}
                        >
                            {guardando ? "Guardando..." : "Guardar asiento"}
                        </button>
                        <button type="button" className="button-secondary" onClick={() => onCreated?.()}>
                            Ver Libro Diario
                        </button>
                    </div>
                )}
            </form>
        </section>
    );
}

export default NuevoAsiento;