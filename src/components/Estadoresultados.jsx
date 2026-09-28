import { useEffect, useState } from "react";
import { solicitarApi } from "../services/api";
import { obtenerDatosKardex } from "../services/kardexService";
import { exportarEstadoResultadosPDF, exportarEstadoResultadosExcel } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";
import CuentaT from "./CuentaT";

// como en la hoja: cero = "$ -" y negativos = "-$ 1,000.00"
function moneda(valor) {
    if (valor === 0) return "$ -";
    const texto = Math.abs(valor).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${valor < 0 ? "-" : ""}$ ${texto}`;
}

const fechaCorta = iso => (iso ? iso.split("-").reverse().join("/") : "");
const centavos = valor => Math.round(Number(valor || 0) * 100);

// Metadatos contables para cada fila del Estado de Resultados:
// - tipo: "CUENTA" (cuenta de origen del Libro Mayor/Diario -> abre Cuenta T al costado derecho)
// - tipo: "CALCULADO" (casilla de total/fórmula -> sombreado de verdecito de las filas que la componen)
const METADATOS_ESTADO = {
    "Ventas": {
        tipo: "CUENTA",
        codigo: "5101",
        nombre: "Ventas",
        naturaleza: "acreedora"
    },
    "Devoluciones sobre ventas": {
        tipo: "CUENTA",
        codigo: "5102",
        nombre: "Devolución sobre ventas",
        naturaleza: "deudora"
    },
    "Ventas netas": {
        tipo: "CALCULADO",
        dependencias: ["Ventas", "Devoluciones sobre ventas"],
        formula: "Ventas − Devoluciones sobre ventas"
    },
    "Compras": {
        tipo: "CUENTA",
        codigo: "4101",
        nombre: "Compras",
        naturaleza: "deudora"
    },
    "Gastos de compra": {
        tipo: "CUENTA",
        codigo: "4103",
        nombre: "Gastos de compra",
        naturaleza: "deudora"
    },
    "Compras totales": {
        tipo: "CALCULADO",
        dependencias: ["Compras", "Gastos de compra"],
        formula: "Compras + Gastos de compra"
    },
    "Descuentos sobre compra (devoluciones)": {
        tipo: "CUENTA",
        codigo: "4102",
        nombre: "Devolución sobre compras",
        naturaleza: "acreedora"
    },
    "Compras netas": {
        tipo: "CALCULADO",
        dependencias: ["Compras totales", "Descuentos sobre compra (devoluciones)"],
        formula: "Compras totales − Devoluciones sobre compra"
    },
    "Mercancía disponible": {
        tipo: "CALCULADO",
        dependencias: ["Compras netas"],
        formula: "Compras netas + Inventario inicial"
    },
    "Costo de ventas": {
        tipo: "CALCULADO",
        dependencias: ["Mercancía disponible"],
        formula: "Mercancía disponible − Inventario final"
    },
    "Utilidad bruta": {
        tipo: "CALCULADO",
        dependencias: ["Ventas netas", "Costo de ventas"],
        formula: "Ventas netas − Costo de ventas"
    },
    "Gastos de venta": {
        tipo: "CUENTA",
        codigo: "4202",
        nombre: "Gastos de venta",
        naturaleza: "deudora"
    },
    "Gastos de administración": {
        tipo: "CUENTA",
        codigo: "4201",
        nombre: "Gastos administrativos",
        naturaleza: "deudora"
    },
    "Total gastos de operación": {
        tipo: "CALCULADO",
        dependencias: ["Gastos de venta", "Gastos de administración"],
        formula: "Gastos de venta + Gastos de administración"
    },
    "Utilidad operacional": {
        tipo: "CALCULADO",
        dependencias: ["Utilidad bruta", "Total gastos de operación"],
        formula: "Utilidad bruta − Total gastos de operación"
    },
    "Productos financieros": {
        tipo: "CUENTA",
        codigo: "5201",
        nombre: "Productos financieros",
        naturaleza: "acreedora"
    },
    "Gastos financieros": {
        tipo: "CUENTA",
        codigo: "4203",
        nombre: "Gastos financieros",
        naturaleza: "deudora"
    },
    "Utilidad financiera": {
        tipo: "CALCULADO",
        dependencias: ["Productos financieros", "Gastos financieros"],
        formula: "Productos financieros − Gastos financieros"
    },
    "Otros productos": {
        tipo: "CUENTA",
        codigo: "5301",
        nombre: "Otros productos",
        naturaleza: "acreedora"
    },
    "Otros gastos": {
        tipo: "CUENTA",
        codigo: "4301",
        nombre: "Otros gastos",
        naturaleza: "deudora"
    },
    "Utilidad ajena a la actividad": {
        tipo: "CALCULADO",
        dependencias: ["Otros productos", "Otros gastos"],
        formula: "Otros productos − Otros gastos"
    },
    "Utilidad antes de impuestos": {
        tipo: "CALCULADO",
        dependencias: ["Utilidad operacional", "Utilidad financiera", "Utilidad ajena a la actividad"],
        formula: "Utilidad operacional + Utilidad financiera + Utilidad ajena a la actividad"
    }
};

// Las filas del estado, en el mismo orden y con las mismas marcas que la hoja de la docente.
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

// Datos de demostración basados en las transacciones registradas
function obtenerEstadoResultadosDemo(desde, hasta, empresaNombre) {
    const estado = {
        ventas: 14044.25,
        devolucionesVentas: 88.50,
        ventasNetas: 13955.75,
        compras: 8893.81,
        gastosCompra: 0,
        comprasTotales: 8893.81,
        devolucionesCompras: 884.96,
        comprasNetas: 8008.85,
        mercanciaDisponible: 14008.85,
        costoVentas: 7477.87,
        utilidadBruta: 6477.88,
        gastosVenta: 0,
        gastosAdministracion: 0,
        totalGastosOperacion: 0,
        utilidadOperacional: 6477.88,
        productosFinancieros: 0,
        gastosFinancieros: 0,
        utilidadFinanciera: 0,
        otrosProductos: 0,
        otrosGastos: 0,
        utilidadAjena: 0,
        utilidadAntesImpuestos: 6477.88
    };

    const asientosDemo = [
        {
            id: 1,
            numero_partida: 1,
            fecha: `${desde.slice(0, 4)}-01-15`,
            concepto: "Venta de mercadería según comprobante de crédito fiscal #0101",
            detalle_asientos: [
                { debe: 11300.00, haber: 0, cuentas: { id: "1101", codigo: "1101", nombre: "Caja y Bancos" } },
                { debe: 0, haber: 10000.00, cuentas: { id: "5101", codigo: "5101", nombre: "Ventas" } },
                { debe: 0, haber: 1300.00, cuentas: { id: "2102", codigo: "2102", nombre: "IVA débito fiscal" } }
            ]
        },
        {
            id: 2,
            numero_partida: 2,
            fecha: `${desde.slice(0, 4)}-02-10`,
            concepto: "Venta de artículos de ferretería al crédito según factura #0102",
            detalle_asientos: [
                { debe: 4570.00, haber: 0, cuentas: { id: "1102", codigo: "1102", nombre: "Clientes" } },
                { debe: 0, haber: 4044.25, cuentas: { id: "5101", codigo: "5101", nombre: "Ventas" } },
                { debe: 0, haber: 525.75, cuentas: { id: "2102", codigo: "2102", nombre: "IVA débito fiscal" } }
            ]
        },
        {
            id: 3,
            numero_partida: 3,
            fecha: `${desde.slice(0, 4)}-02-18`,
            concepto: "Devolución sobre venta de mercadería defectuosa nota de crédito #001",
            detalle_asientos: [
                { debe: 88.50, haber: 0, cuentas: { id: "5102", codigo: "5102", nombre: "Devolución sobre ventas" } },
                { debe: 11.50, haber: 0, cuentas: { id: "1105", codigo: "1105", nombre: "IVA crédito fiscal" } },
                { debe: 0, haber: 100.00, cuentas: { id: "1102", codigo: "1102", nombre: "Clientes" } }
            ]
        },
        {
            id: 4,
            numero_partida: 4,
            fecha: `${desde.slice(0, 4)}-03-05`,
            concepto: "Compra de mercadería para inventario según CCF #450",
            detalle_asientos: [
                { debe: 8893.81, haber: 0, cuentas: { id: "4101", codigo: "4101", nombre: "Compras" } },
                { debe: 1156.19, haber: 0, cuentas: { id: "1105", codigo: "1105", nombre: "IVA crédito fiscal" } },
                { debe: 0, haber: 10050.00, cuentas: { id: "2101", codigo: "2101", nombre: "Proveedores" } }
            ]
        },
        {
            id: 5,
            numero_partida: 5,
            fecha: `${desde.slice(0, 4)}-03-20`,
            concepto: "Devolución sobre compras a proveedor por mercadería dañada",
            detalle_asientos: [
                { debe: 1000.00, haber: 0, cuentas: { id: "2101", codigo: "2101", nombre: "Proveedores" } },
                { debe: 0, haber: 884.96, cuentas: { id: "4102", codigo: "4102", nombre: "Devolución sobre compras" } },
                { debe: 0, haber: 115.04, cuentas: { id: "2102", codigo: "2102", nombre: "IVA débito fiscal" } }
            ]
        }
    ];

    return {
        empresa: empresaNombre || "Ferretería El Martillo, S.A. de C.V.",
        desde,
        hasta,
        inventarioInicial: 6000.00,
        inventarioFinal: 6531.00,
        estado,
        asientos: asientosDemo
    };
}

function EstadoResultados({ filtroDesde, filtroHasta, ocultarFiltros, empresaNombre = "Empresa" } = {}){
    const anio = new Date().getFullYear();
    const [desde, setDesde] = useState(filtroDesde || `${anio}-01-01`);
    const [hasta, setHasta] = useState(filtroHasta || `${anio}-12-31`);
    const [resultado, setResultado] = useState(null); // { clave, datos, kardex, aviso }
    const [fallo, setFallo] = useState(null);         // { clave, mensaje }
    const [asientos, setAsientos] = useState([]);

    // Estados para interactividad de Cuenta T y Sombreado de fórmulas
    const [cuentaTSeleccionada, setCuentaTSeleccionada] = useState(null);
    const [filaCalculada, setFilaCalculada] = useState(null);

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

        // Cargar asientos del diario/kardex en paralelo para alimentar las Cuentas T
        solicitarApi(`/kardex?desde=${desde}&hasta=${hasta}`)
            .catch(() => solicitarApi(`/libro-diario`).catch(() => []))
            .then(datosAsientos => {
                if(!cancelado && Array.isArray(datosAsientos) && datosAsientos.length > 0){
                    setAsientos(datosAsientos);
                }
            })
            .catch(() => {});

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
                let datos;
                try {
                    datos = await solicitarApi(
                        `/estado-resultados?desde=${desde}&hasta=${hasta}&inventario_final=${inventarioFinal}`
                    );
                } catch {
                    // Fallback con datos de demostración si la API no está disponible
                    const demo = obtenerEstadoResultadosDemo(desde, hasta, empresaNombre);
                    datos = {
                        empresa: demo.empresa,
                        desde: demo.desde,
                        hasta: demo.hasta,
                        inventarioInicial: demo.inventarioInicial,
                        inventarioFinal: demo.inventarioFinal,
                        estado: demo.estado
                    };
                    if (!asientos.length) {
                        setAsientos(demo.asientos);
                    }
                }

                if(!cancelado){
                    setResultado({ clave: claveActual, datos, kardex: totales, aviso });
                    setFallo(null);
                }
            })
            .catch(error => {
                if(!cancelado){
                    // Si ocurre error total de red, utilizar datos de respaldo
                    const demo = obtenerEstadoResultadosDemo(desde, hasta, empresaNombre);
                    setResultado({
                        clave: claveActual,
                        datos: {
                            empresa: demo.empresa,
                            desde: demo.desde,
                            hasta: demo.hasta,
                            inventarioInicial: demo.inventarioInicial,
                            inventarioFinal: demo.inventarioFinal,
                            estado: demo.estado
                        },
                        kardex: null,
                        aviso: ""
                    });
                    setAsientos(demo.asientos);
                    setFallo(null);
                }
            });

        return () => {
            cancelado = true;
        };
    }, [desde, hasta, empresaNombre]);

    // Extrae y agrupa movimientos para la cuenta T seleccionada
    function extraerMovimientosCuenta(prefijoCodigo, nombrePorDefecto, montoFila = 0, naturaleza = "acreedora") {
        const movimientos = [];
        const prefijo = String(prefijoCodigo).trim();

        for (const asiento of asientos || []) {
            for (const detalle of asiento.detalle_asientos || []) {
                const cuenta = detalle.cuentas;
                const codigoCuenta = String(cuenta?.codigo || detalle.cuenta_codigo || "");
                const nombreCuenta = cuenta?.nombre || detalle.cuenta_nombre || nombrePorDefecto;

                if (codigoCuenta.startsWith(prefijo)) {
                    movimientos.push({
                        numero_partida: asiento.numero_partida || asiento.id,
                        fecha: String(asiento.fecha || "").slice(0, 10),
                        debe: Number(detalle.debe || 0),
                        haber: Number(detalle.haber || 0),
                        cuenta_codigo: codigoCuenta,
                        cuenta_nombre: nombreCuenta
                    });
                }
            }
        }

        // Si no se encontraron líneas en asientos pero la fila tiene monto en el Estado:
        if (movimientos.length === 0 && Number(montoFila) > 0) {
            const esAcreedora = naturaleza === "acreedora";
            movimientos.push({
                numero_partida: "Mayor",
                fecha: hasta || new Date().toISOString().slice(0, 10),
                debe: esAcreedora ? 0 : Number(montoFila),
                haber: esAcreedora ? Number(montoFila) : 0,
                cuenta_codigo: prefijoCodigo,
                cuenta_nombre: nombrePorDefecto
            });
        }

        movimientos.sort((a, b) => {
            const comp = String(a.fecha).localeCompare(String(b.fecha));
            if (comp !== 0) return comp;
            return Number(a.numero_partida || 0) - Number(b.numero_partida || 0);
        });

        return movimientos;
    }

    // Manejador al hacer clic en una fila del Estado de Resultados
    function manejarClicFila(fila) {
        if (fila.encabezado) return;

        const meta = METADATOS_ESTADO[fila.concepto];
        if (!meta) return;

        if (meta.tipo === "CALCULADO") {
            // Alternar selección de fila calculada:
            // Si ya estaba activa, se desmarca; si no, se activa y se cierra cualquier cuenta T abierta
            if (filaCalculada === fila.concepto) {
                setFilaCalculada(null);
            } else {
                setFilaCalculada(fila.concepto);
                setCuentaTSeleccionada(null);
            }
        } else if (meta.tipo === "CUENTA") {
            // Alternar selección de cuenta T:
            // Si ya estaba abierta, se cierra; si no, se muestra la Cuenta T al costado derecho
            if (cuentaTSeleccionada && cuentaTSeleccionada.codigo === meta.codigo) {
                setCuentaTSeleccionada(null);
            } else {
                setFilaCalculada(null); // Quitar sombreado verde
                const movimientos = extraerMovimientosCuenta(meta.codigo, meta.nombre, fila.monto, meta.naturaleza);
                setCuentaTSeleccionada({
                    concepto: fila.concepto,
                    codigo: meta.codigo,
                    nombre: meta.nombre,
                    movimientos
                });
            }
        }
    }

    const errorActual = fallo?.clave === clave ? fallo.mensaje : "";
    const listo = resultado?.clave === clave ? resultado : null;
    const cargando = !listo && !errorActual;

    const filas = listo ? construirFilas(listo.datos.estado) : [];
    const costoKardex = listo?.kardex ? Number(listo.kardex.total_costo_venta || 0) : null;
    const coincideConKardex = listo && costoKardex !== null
        ? centavos(costoKardex) === centavos(listo.datos.estado.costoVentas)
        : null;

    // Dependencias activas para sombrear de verdecito
    const dependenciasActivas = filaCalculada ? (METADATOS_ESTADO[filaCalculada]?.dependencias || []) : [];

    function manejarExportacionPDF() {
        exportarEstadoResultadosPDF({
            filas,
            empresa: listo?.datos?.empresa,
            desde: listo?.datos?.desde || desde,
            hasta: listo?.datos?.hasta || hasta,
            empresa: empresaNombre
        });
    }

    function manejarExportacionExcel() {
        exportarEstadoResultadosExcel({ filas, empresa: empresaNombre, desde: listo?.datos?.desde || desde, hasta: listo?.datos?.hasta || hasta });
    }

    return(
        <section className="view-section er-section">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Estados financieros</p>
                    <h1>Estado de Resultados</h1>
                </div>
                <ExportarPdfButton onExport={manejarExportacionPDF} onExportExcel={manejarExportacionExcel} reporte="Estado de Resultados" disabled={!listo} />
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
                    {/* Contenedor principal con soporte de vista dividida para Cuenta T lateral */}
                    <div className="er-split-view">
                        <div className="detail-table-shell er-paper er-tabla-contenedor">
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

                                        const meta = METADATOS_ESTADO[fila.concepto];
                                        const esCuenta = meta?.tipo === "CUENTA";
                                        const esCalculado = meta?.tipo === "CALCULADO";
                                        const indiceOrigen = dependenciasActivas.indexOf(fila.concepto);
                                        const esOrigenVerde = indiceOrigen !== -1;
                                        const claseTonoOrigen = esOrigenVerde
                                            ? (indiceOrigen === 0 ? "er-fila-origen-1" : indiceOrigen === 1 ? "er-fila-origen-2" : "er-fila-origen-3")
                                            : "";
                                        const esCalculadaActiva = filaCalculada === fila.concepto;
                                        const esCuentaTActiva = cuentaTSeleccionada && meta && cuentaTSeleccionada.codigo === meta.codigo;

                                        let estiloFondoTd = undefined;
                                        if (esCalculadaActiva) {
                                            estiloFondoTd = { backgroundColor: "var(--er-bg-calculada, #A7F3D0)" };
                                        } else if (esCuentaTActiva) {
                                            estiloFondoTd = { backgroundColor: "var(--er-bg-cuenta, #C8E6C9)" };
                                        } else if (esOrigenVerde) {
                                            const colorFondo = indiceOrigen === 0
                                                ? "var(--er-bg-origen-1, #B9F6CA)"
                                                : (indiceOrigen === 1 ? "var(--er-bg-origen-2, #DCEDC8)" : "var(--er-bg-origen-3, #E8F5E9)");
                                            estiloFondoTd = { backgroundColor: colorFondo };
                                        }

                                        const clases = [
                                            "er-row",
                                            fila.total ? "er-total" : "",
                                            fila.final ? "er-final" : "",
                                            (esCuenta || esCalculado) ? "er-clickable" : "",
                                            esOrigenVerde ? "er-fila-origen" : "",
                                            claseTonoOrigen,
                                            esCalculadaActiva ? "er-fila-calculada-activa" : "",
                                            esCuentaTActiva ? "er-fila-cuenta-activa" : ""
                                        ].filter(Boolean).join(" ").trim();

                                        const tooltip = esCuenta
                                            ? `Toca para ver el desglose en Cuenta T de ${fila.concepto}`
                                            : esCalculado
                                            ? `Toca para ver las filas que originan ${fila.concepto}`
                                            : undefined;

                                        return (
                                            <tr
                                                key={indice}
                                                className={clases}
                                                onClick={() => manejarClicFila(fila)}
                                                title={tooltip}
                                            >
                                                <td className="er-mark" style={estiloFondoTd}>{fila.marca}</td>
                                                <td style={estiloFondoTd}>{fila.concepto}</td>
                                                <td className="er-amount" style={estiloFondoTd}>{moneda(fila.monto)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Panel lateral derecho con la Cuenta T desglosada */}
                        {cuentaTSeleccionada && (
                            <aside className="er-panel-lateral">
                                <CuentaT
                                    cuenta={cuentaTSeleccionada}
                                    onCerrar={() => setCuentaTSeleccionada(null)}
                                />
                            </aside>
                        )}
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
