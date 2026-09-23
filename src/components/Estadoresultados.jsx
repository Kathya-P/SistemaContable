import { useEffect, useState } from "react";
import { solicitarApi } from "../services/api";
import { obtenerDatosKardex } from "../services/kardexService";
import { exportarEstadoResultadosPDF } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";

// como en la hoja: cero = "$ -" y negativos = "-$ 1,000.00"
function moneda(valor) {
    if (valor === 0) return "$ -";
    const texto = Math.abs(valor).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${valor < 0 ? "-" : ""}$ ${texto}`;
}

const fechaCorta = iso => (iso ? iso.split("-").reverse().join("/") : "");
const centavos = valor => Math.round(Number(valor || 0) * 100);

// Las filas del estado, en el mismo orden y con las mismas marcas que la hoja de la docente.
// El inventario NO aparece aquí: es un activo y va en el Balance General.
function construirFilas(e) {
    return [
        { concepto: "Ventas", monto: e.ventas },
        { marca: "(-)", concepto: "Devoluciones sobre ventas", monto: e.devolucionesVentas },
        { marca: "(=)", concepto: "Ventas netas", monto: e.ventasNetas, total: true, nota: "Ventas − Devoluciones sobre ventas" },
        { concepto: "Compras", monto: e.compras },
        { marca: "(+)", concepto: "Gastos de compra", monto: e.gastosCompra },
        { marca: "(=)", concepto: "Compras totales", monto: e.comprasTotales, total: true, nota: "Compras + Gastos de compra" },
        { marca: "(-)", concepto: "Descuentos sobre compra (devoluciones)", monto: e.devolucionesCompras },
        { marca: "(=)", concepto: "Compras netas", monto: e.comprasNetas, total: true, nota: "Compras totales − Devoluciones sobre compra" },
{ marca: "(=)", concepto: "Mercancía disponible", monto: e.mercanciaDisponible, total: true, nota: "Compras netas + Inventario inicial" },
{ marca: "(=)(-)", concepto: "Costo de ventas", monto: e.costoVentas, total: true, nota: "Mercancía disponible − Inventario final" },
        { marca: "(=)", concepto: "Utilidad bruta", monto: e.utilidadBruta, total: true, nota: "Ventas netas − Costo de ventas" },
        { encabezado: "GASTOS DE OPERACIÓN" },
        { concepto: "Gastos de venta", monto: e.gastosVenta },
        { marca: "(+)", concepto: "Gastos de administración", monto: e.gastosAdministracion },
        { marca: "(=)(-)", concepto: "Total gastos de operación", monto: e.totalGastosOperacion, total: true },
        { marca: "(=)", concepto: "Utilidad operacional", monto: e.utilidadOperacional, total: true, nota: "Utilidad bruta − Gastos de operación" },
        { concepto: "Productos financieros", monto: e.productosFinancieros },
        { marca: "(-)", concepto: "Gastos financieros", monto: e.gastosFinancieros },
        { marca: "(=)", concepto: "Utilidad financiera", monto: e.utilidadFinanciera, total: true, nota: "Productos financieros − Gastos financieros" },
        { concepto: "Otros productos", monto: e.otrosProductos },
        { marca: "(-)", concepto: "Otros gastos", monto: e.otrosGastos },
        { marca: "(=)(+)", concepto: "Utilidad ajena a la actividad", monto: e.utilidadAjena, total: true },
        {
            marca: "(=)",
            concepto: "Utilidad antes de impuestos",
            monto: e.utilidadAntesImpuestos,
            total: true,
            final: true,
            nota: "Utilidad operacional + Utilidad financiera + Utilidad ajena a la actividad"
        }
    ];
}

function EstadoResultados({ filtroDesde, filtroHasta, ocultarFiltros } = {}){
    const anio = new Date().getFullYear();
    const [desde, setDesde] = useState(filtroDesde || `${anio}-01-01`);
    const [hasta, setHasta] = useState(filtroHasta || `${anio}-12-31`);
    const [resultado, setResultado] = useState(null); // { clave, datos, kardex, aviso }
    const [fallo, setFallo] = useState(null);         // { clave, mensaje }

    useEffect(() => {
        if (filtroDesde) setDesde(filtroDesde);
        if (filtroHasta) setHasta(filtroHasta);
    }, [filtroDesde, filtroHasta]);

    const clave = `${desde}|${hasta}`;

    useEffect(() => {
        if(!desde || !hasta){
            return undefined;
        }

        let cancelado = false;
        const claveActual = `${desde}|${hasta}`;

        // 1) el kardex da el inventario final; 2) el backend arma el estado con el Libro Mayor
        Promise.resolve()
            .then(() => obtenerDatosKardex({ fechaInicio: desde, fechaFin: hasta }))
            .then(kardex => ({ totales: kardex?.totales || null, aviso: "" }))
            .catch(() => ({
                totales: null,
                aviso: "No se pudo leer el kardex: el costo de ventas se calculó con inventario final en 0."
            }))
            .then(async ({ totales, aviso }) => {
                const inventarioFinal = Number(totales?.saldo_final || 0);
                const datos = await solicitarApi(
                    `/estado-resultados?desde=${desde}&hasta=${hasta}&inventario_final=${inventarioFinal}`
                );

                if(!cancelado){
                    setResultado({ clave: claveActual, datos, kardex: totales, aviso });
                    setFallo(null);
                }
            })
            .catch(error => {
                if(!cancelado){
                    setFallo({ clave: claveActual, mensaje: error.message || "No se pudo cargar el Estado de Resultados." });
                }
            });

        return () => {
            cancelado = true;
        };
    }, [desde, hasta]);

    const errorActual = fallo?.clave === clave ? fallo.mensaje : "";
    const listo = resultado?.clave === clave ? resultado : null;
    const cargando = !listo && !errorActual;

    const filas = listo ? construirFilas(listo.datos.estado) : [];
    const costoKardex = listo?.kardex ? Number(listo.kardex.total_costo_venta || 0) : null;
    const coincideConKardex = listo && costoKardex !== null
        ? centavos(costoKardex) === centavos(listo.datos.estado.costoVentas)
        : null;

    function manejarExportacionPDF() {
        exportarEstadoResultadosPDF({
            filas,
            empresa: listo?.datos?.empresa,
            desde: listo?.datos?.desde || desde,
            hasta: listo?.datos?.hasta || hasta
        });
    }

    return(
        <section className="view-section er-section">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Estados financieros</p>
                    <h1>Estado de Resultados</h1>
                </div>
                <ExportarPdfButton onExport={manejarExportacionPDF} reporte="Estado de Resultados" disabled={!listo} />
            </div>

            {!ocultarFiltros && (
                <>
                    <div className="form-grid er-controls">
                        <label>Desde
                            <input type="date" value={desde} onChange={evento => setDesde(evento.target.value)} />
                        </label>
                        <label>Hasta
                            <input type="date" value={hasta} onChange={evento => setHasta(evento.target.value)} />
                        </label>
                    </div>
                    <br />
                </>
            )}
            {errorActual && <p className="message-error">{errorActual}</p>}
            {listo?.aviso && <p className="message-error">{listo.aviso}</p>}
            {cargando && <p>Calculando el estado de resultados...</p>}

            {listo && (
                <>
                    <div className="detail-table-shell er-paper">
                        <div className="er-heading">
                            <strong>{listo.datos.empresa}</strong>
                            <span>Estado de Resultados</span>
                            <span>Del {fechaCorta(listo.datos.desde)} al {fechaCorta(listo.datos.hasta)}</span>
                        </div>

                        <table className="entry-detail-table er-table">
                            <tbody>
                                {filas.map((fila, indice) => {
                                    if(fila.encabezado){
                                        return (
                                            <tr key={indice} className="er-group">
                                                <td></td>
                                                <td colSpan="2">{fila.encabezado}</td>
                                            </tr>
                                        );
                                    }

                                    const clases = [fila.total ? "er-total" : "", fila.final ? "er-final" : ""].join(" ").trim();

                                    return (
                                        <tr key={indice} className={clases}>
                                            <td className="er-mark">{fila.marca}</td>
                                            <td>{fila.concepto}</td>
                                            <td className="er-amount">{moneda(fila.monto)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <aside className="er-kardex-panel">
                        <strong>Datos del kardex (no forman parte del estado)</strong>
                        <p className="form-help">
                            El costo de ventas se calcula con las compras netas, el inventario inicial de{" "}
                            {moneda(listo.datos.inventarioInicial)} (Libro Mayor, cuenta 1103) y el inventario final de{" "}
                            {moneda(listo.datos.inventarioFinal)} (kardex).
                        </p>
                        {coincideConKardex === true && (
                            <p className="form-help">El costo de ventas coincide con el del kardex: {moneda(costoKardex)}.</p>
                        )}
                        {coincideConKardex === false && (
                            <p className="message-error">
                                El costo de ventas del kardex ({moneda(costoKardex)}) no coincide con el calculado
                                ({moneda(listo.datos.estado.costoVentas)}). Revisa que el período del kardex sea el mismo.
                            </p>
                        )}
                    </aside>
                </>
            )}
        </section>
    );
}

export default EstadoResultados;
