import { Fragment, useEffect, useMemo, useState } from "react";
import { crearAsiento } from "../services/asientosService";
import { obtenerCuentas } from "../services/cuentasService";
import { obtenerEmpresas } from "../services/empresasService";
import { supabaseConfigurado } from "../lib/supabase";

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

// Arma los bloques como en la guía: primero lo del Debe, luego lo del Haber.
function armarVistaPrevia(detalles, cuentasPorId) {
    const bloques = { debe: new Map(), haber: new Map() };

    for (const d of detalles) {
        const cuenta = cuentasPorId.get(String(d.cuenta_id));
        const debe = normalizarNumero(d.debe);
        const haber = normalizarNumero(d.haber);
        if (!cuenta || (debe === 0 && haber === 0)) continue;

        const lado = debe > 0 ? "debe" : "haber";
        const monto = debe > 0 ? debe : haber;
        const mayor = cuentaMayor(cuenta, cuentasPorId);
        const grupo = bloques[lado].get(mayor.id) || { mayor, total: 0, hijas: [] };

        grupo.total += monto;
        if (mayor.id !== cuenta.id) grupo.hijas.push({ cuenta, monto });
        bloques[lado].set(mayor.id, grupo);
    }

    return [
        ...[...bloques.debe.values()].map(g => ({ ...g, lado: "debe" })),
        ...[...bloques.haber.values()].map(g => ({ ...g, lado: "haber" }))
    ];
}

function construirConceptoAutomatico(lineas, cuentasPorId) {
    const movimientos = lineas
        .map(detalle => ({
            cuenta: cuentasPorId.get(String(detalle.cuenta_id)),
            debe: normalizarNumero(detalle.debe),
            haber: normalizarNumero(detalle.haber)
        }))
        .filter(m => m.cuenta && (m.debe > 0 || m.haber > 0));

    if (!movimientos.length) return "";

    // ¿hay movimiento en una cuenta (por prefijo de código) y por qué lado?
    const hay = (prefijo, lado) => movimientos.some(m =>
        m.cuenta.codigo.startsWith(prefijo) && (!lado || m[lado] > 0));

    const efectivoDebe = hay("1101", "debe");
    const efectivoHaber = hay("1101", "haber");
    const aCredito = hay("2101", "haber");
    const iva = (hay("1105") || hay("2102")) && !hay("2103") ? " (precio incluye IVA)" : "";
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
    else texto = `Registro de ${[...new Set(movimientos.map(m => m.cuenta.nombre))].slice(0, 3).join(", ")}`;

    return `${texto}${iva}.`;
}

function NuevoAsiento({ usuario, onCreated }){
    const [empresas, setEmpresas] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const empresaId = usuario?.empresa_id ? String(usuario.empresa_id) : "";
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [concepto, setConcepto] = useState("");
    const [generarConcepto, setGenerarConcepto] = useState(false);
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
    const empresa = empresas.find(e => String(e.id) === empresaId);
    const cuentasMovibles = useMemo(
        () => cuentas.filter(c => c.permite_movimientos === true && c.estado !== false),
        [cuentas]
    );
    const vistaPrevia = useMemo(() => armarVistaPrevia(detalles, cuentasPorId), [detalles, cuentasPorId]);

    const totalDebe = useMemo(() => detalles.reduce((sum, item) => sum + normalizarNumero(item.debe), 0), [detalles]);
    const totalHaber = useMemo(() => detalles.reduce((sum, item) => sum + normalizarNumero(item.haber), 0), [detalles]);
    const diferencia = Math.abs(totalDebe - totalHaber);
    const estaBalanceado = Math.round(totalDebe * 100) === Math.round(totalHaber * 100) && totalDebe > 0;
    const hayLineasValidas = detalles.filter(detalle => detalle.cuenta_id && (normalizarNumero(detalle.debe) > 0 || normalizarNumero(detalle.haber) > 0)).length >= 2;
    const idsUsados = detalles.filter(detalle => detalle.cuenta_id).map(detalle => String(detalle.cuenta_id));
    const tieneCuentasRepetidas = new Set(idsUsados).size !== idsUsados.length;
    const puedeGuardar = Boolean(empresaId) && Boolean(fecha) && Boolean(concepto.trim()) && hayLineasValidas && !tieneCuentasRepetidas && estaBalanceado;

    function alternarConceptoAutomatico(valor){
        setGenerarConcepto(valor);
        if(valor){
            setConcepto(construirConceptoAutomatico(detalles, cuentasPorId));
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
            setConcepto(construirConceptoAutomatico(nuevasLineas, cuentasPorId));
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
            return debe < 0 || haber < 0 || (debe === 0 && haber === 0) || (debe > 0 && haber > 0);
        })){
            setError("Cada línea debe tener un importe positivo en Debe o en Haber, pero no en ambas columnas.");
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
                detalles.map(detalle => ({
                    cuenta_id: detalle.cuenta_id,
                    descripcion: "",
                    debe: Number(detalle.debe || 0),
                    haber: Number(detalle.haber || 0)
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

    return(
        <section className="view-section">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Registro contable</p>
                    <h1>Nuevo asiento</h1>
                </div>
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
                    <label className="form-wide">Concepto
                        <input value={concepto} onChange={evento => setConcepto(evento.target.value)} placeholder="Ej. Aporte inicial de capital" />
                    </label>
                    <label className="concept-option">
                        <span>Concepto automático</span>
                        <span className="concept-controls">
                            <input type="checkbox" checked={generarConcepto} onChange={evento => alternarConceptoAutomatico(evento.target.checked)} />
                            <button type="button" className="button-secondary" onClick={() => setConcepto(construirConceptoAutomatico(detalles, cuentasPorId))}>Generar concepto</button>
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
                                const parcial = normalizarNumero(detalle.debe) + normalizarNumero(detalle.haber);

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
                                        <td><input type="number" min="0" step="0.01" value={detalle.debe} onChange={evento => actualizarDetalle(indice, "debe", evento.target.value)} placeholder="0.00" aria-label="Debe" /></td>
                                        <td><input type="number" min="0" step="0.01" value={detalle.haber} onChange={evento => actualizarDetalle(indice, "haber", evento.target.value)} placeholder="0.00" aria-label="Haber" /></td>
                                        <td><button type="button" className="icon-button" onClick={() => quitarLinea(indice)} aria-label="Quitar línea">×</button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th colSpan="3">Total del asiento</th>
                                <th>{totalDebe.toFixed(2)}</th>
                                <th>{totalHaber.toFixed(2)}</th>
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
                                        {vistaPrevia.map(({ mayor, lado, total, hijas }) => (
                                            <Fragment key={`${lado}-${mayor.id}`}>
                                                <tr className="parent-row">
                                                    <td>{mayor.codigo} - {mayor.nombre}</td>
                                                    <td></td>
                                                    <td>{lado === "debe" ? dinero(total) : ""}</td>
                                                    <td>{lado === "haber" ? dinero(total) : ""}</td>
                                                </tr>
                                                {hijas.map(h => (
                                                    <tr key={`${lado}-${h.cuenta.id}`} className="child-row">
                                                        <td>{h.cuenta.codigo} - {h.cuenta.nombre}</td>
                                                        <td>{dinero(h.monto)}</td>
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
                                            <th>{dinero(totalDebe)}</th>
                                            <th>{dinero(totalHaber)}</th>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </>
                    )}
                </>}

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