import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
    crearAsiento,
    obtenerAsientosGuardados,
    guardarPlantillaAsiento,
    eliminarAsientoGuardado
} from "../services/asientosService";
import { obtenerCuentas } from "../services/cuentasService";
import { obtenerEmpresas } from "../services/empresasService";
import { supabaseConfigurado } from "../lib/supabase";
import { calcularAsiento } from "../utils/asientoIva";
import { exportarNuevoAsientoPDF, exportarNuevoAsientoExcel } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";

function IconoBookmark({ size = 16, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
    );
}

function IconoCarpeta({ size = 16, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    );
}

function IconoLupa({ size = 15, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    );
}

function IconoCerrar({ size = 16, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

function IconoBasura({ size = 15, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
    );
}

function IconoCargar({ size = 15, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        </svg>
    );
}

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

// Selector dinámico y autocompletable de subcuentas contables
export function SelectorSubcuenta({ value, cuentas = [], onChange }) {
    const [abierto, setAbierto] = useState(false);
    const [busqueda, setBusqueda] = useState("");
    const [indiceResaltado, setIndiceResaltado] = useState(0);
    const contenedorRef = useRef(null);
    const inputRef = useRef(null);
    const listaRef = useRef(null);

    const cuentaSeleccionada = useMemo(
        () => cuentas.find(c => String(c.id) === String(value)),
        [cuentas, value]
    );

    // Mantener sincronizado el texto cuando el menú está cerrado
    useEffect(() => {
        if (!abierto) {
            setBusqueda(cuentaSeleccionada ? `${cuentaSeleccionada.codigo} - ${cuentaSeleccionada.nombre}` : "");
        }
    }, [cuentaSeleccionada, abierto]);

    // Filtrar y ordenar cuentas dinámicamente según lo escrito (priorizando coincidencias por inicio de nombre/palabra/código)
    const cuentasFiltradas = useMemo(() => {
        const normalizar = (txt) =>
            String(txt || "")
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim();

        const termino = normalizar(busqueda);
        if (!termino) return cuentas;

        const resultados = [];

        for (const c of cuentas) {
            const cod = normalizar(c.codigo);
            const nom = normalizar(c.nombre);
            const palabras = nom.split(/[\s\-_/.,;:()]+/);

            let prioridad = -1;

            if (nom.startsWith(termino)) {
                // 1. El nombre empieza exactamente con la letra/término (ej. "a" -> "Alquileres", "i" -> "IVA crédito fiscal")
                prioridad = 1;
            } else if (palabras.some(p => p.startsWith(termino))) {
                // 2. Alguna palabra dentro del nombre empieza con el término (ej. "credito" en "IVA crédito fiscal")
                prioridad = 2;
            } else if (cod.startsWith(termino)) {
                // 3. El código contable empieza con el término (ej. "11" -> "110101")
                prioridad = 3;
            } else if (termino.length > 2 && (nom.includes(termino) || cod.includes(termino))) {
                // 4. Coincidencias intermedias solo cuando se han escrito 3 o más caracteres
                prioridad = 4;
            }

            if (prioridad !== -1) {
                resultados.push({ cuenta: c, prioridad, nom });
            }
        }

        // Si no hubo coincidencia por inicio de palabra, buscar por inclusión general
        if (resultados.length === 0) {
            for (const c of cuentas) {
                const cod = normalizar(c.codigo);
                const nom = normalizar(c.nombre);
                if (nom.includes(termino) || cod.includes(termino)) {
                    resultados.push({ cuenta: c, prioridad: 5, nom });
                }
            }
        }

        // Ordenar primero por prioridad (1 = mejor) y luego alfabéticamente
        resultados.sort((a, b) => {
            if (a.prioridad !== b.prioridad) {
                return a.prioridad - b.prioridad;
            }
            return a.nom.localeCompare(b.nom, "es");
        });

        return resultados.map(r => r.cuenta);
    }, [cuentas, busqueda]);

    // Cerrar al hacer clic fuera del componente
    useEffect(() => {
        const manejarClicFuera = (e) => {
            if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
                setAbierto(false);
                setBusqueda(cuentaSeleccionada ? `${cuentaSeleccionada.codigo} - ${cuentaSeleccionada.nombre}` : "");
            }
        };
        document.addEventListener("mousedown", manejarClicFuera);
        return () => document.removeEventListener("mousedown", manejarClicFuera);
    }, [cuentaSeleccionada]);

    // Scroll automático al item resaltado con flechas de teclado
    useEffect(() => {
        if (abierto && listaRef.current && listaRef.current.children[indiceResaltado]) {
            listaRef.current.children[indiceResaltado].scrollIntoView({ block: "nearest" });
        }
    }, [indiceResaltado, abierto]);

    const seleccionar = (cuenta) => {
        onChange(cuenta ? String(cuenta.id) : "");
        setAbierto(false);
        setBusqueda(cuenta ? `${cuenta.codigo} - ${cuenta.nombre}` : "");
    };

    const manejarKeyDown = (e) => {
        if (!abierto) {
            if (e.key === "ArrowDown" || e.key === "Enter") {
                e.preventDefault();
                setAbierto(true);
                setIndiceResaltado(0);
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndiceResaltado(prev => (prev + 1 < cuentasFiltradas.length ? prev + 1 : 0));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndiceResaltado(prev => (prev - 1 >= 0 ? prev - 1 : cuentasFiltradas.length - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (cuentasFiltradas[indiceResaltado]) {
                seleccionar(cuentasFiltradas[indiceResaltado]);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            setAbierto(false);
            setBusqueda(cuentaSeleccionada ? `${cuentaSeleccionada.codigo} - ${cuentaSeleccionada.nombre}` : "");
        }
    };

    return (
        <div ref={contenedorRef} className="selector-subcuenta-wrapper" style={{ position: "relative", width: "100%", zIndex: abierto ? 100 : "auto" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                    ref={inputRef}
                    type="text"
                    value={busqueda}
                    placeholder="Escribir código o nombre..."
                    autoComplete="off"
                    className="selector-subcuenta-input"
                    style={{
                        width: "100%",
                        padding: "7px 46px 7px 10px",
                        fontSize: "13px",
                        border: "1.5px solid",
                        borderColor: abierto ? "#059669" : "#d1d5db",
                        borderRadius: "4px",
                        background: "#ffffff",
                        color: "#1f2937",
                        outline: "none",
                        boxShadow: abierto ? "0 0 0 2px rgba(16, 185, 129, 0.2)" : "none",
                        transition: "border-color 0.15s, box-shadow 0.15s"
                    }}
                    onFocus={() => {
                        setAbierto(true);
                        setIndiceResaltado(0);
                        inputRef.current?.select();
                    }}
                    onChange={e => {
                        setBusqueda(e.target.value);
                        setAbierto(true);
                        setIndiceResaltado(0);
                        if (!e.target.value.trim() && value) {
                            onChange("");
                        }
                    }}
                    onKeyDown={manejarKeyDown}
                    aria-label="Buscar subcuenta"
                />

                <div style={{ position: "absolute", right: "6px", display: "flex", alignItems: "center", gap: "2px" }}>
                    {value && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                seleccionar(null);
                                inputRef.current?.focus();
                            }}
                            title="Limpiar subcuenta"
                            style={{
                                background: "none",
                                border: "none",
                                color: "#9ca3af",
                                cursor: "pointer",
                                padding: "2px 4px",
                                fontSize: "15px",
                                lineHeight: 1,
                                borderRadius: "3px"
                            }}
                        >
                            ×
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setAbierto(prev => !prev);
                            inputRef.current?.focus();
                        }}
                        title="Ver lista de cuentas"
                        style={{
                            background: "none",
                            border: "none",
                            color: "#059669",
                            cursor: "pointer",
                            padding: "2px 4px",
                            fontSize: "10px",
                            lineHeight: 1
                        }}
                    >
                        {abierto ? "▲" : "▼"}
                    </button>
                </div>
            </div>

            {/* Menú desplegable dinámico flotante */}
            {abierto && (
                <div
                    ref={listaRef}
                    className="selector-subcuenta-menu"
                    style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        minWidth: "290px",
                        maxHeight: "230px",
                        overflowY: "auto",
                        background: "#ffffff",
                        border: "1.5px solid #a7f3d0",
                        borderRadius: "8px",
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0,0,0,0.05)",
                        zIndex: 9999,
                        padding: "5px"
                    }}
                >
                    {cuentasFiltradas.length === 0 ? (
                        <div style={{ padding: "12px 14px", fontSize: "12px", color: "#6b7280", textAlign: "center" }}>
                            No se encontraron subcuentas con "{busqueda}"
                        </div>
                    ) : (
                        cuentasFiltradas.map((cuenta, idx) => {
                            const esSeleccionada = String(cuenta.id) === String(value);
                            const esResaltada = idx === indiceResaltado;

                            return (
                                <div
                                    key={cuenta.id}
                                    className={`selector-subcuenta-item ${esResaltada ? "is-highlighted" : ""} ${esSeleccionada ? "is-selected" : ""}`}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        seleccionar(cuenta);
                                    }}
                                    onMouseEnter={() => setIndiceResaltado(idx)}
                                    style={{
                                        padding: "7px 10px",
                                        borderRadius: "5px",
                                        cursor: "pointer",
                                        fontSize: "12px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "8px",
                                        background: esResaltada ? "#ecfdf5" : esSeleccionada ? "#f0fdf4" : "transparent",
                                        color: esResaltada || esSeleccionada ? "#065f46" : "#1f2937",
                                        fontWeight: esSeleccionada ? "600" : "normal",
                                        transition: "background-color 0.1s"
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                                        <span style={{
                                            fontFamily: "monospace",
                                            fontWeight: "700",
                                            color: "#047857",
                                            background: "rgba(16, 185, 129, 0.2)",
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            fontSize: "11px",
                                            whiteSpace: "nowrap"
                                        }}>
                                            {cuenta.codigo}
                                        </span>
                                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {cuenta.nombre}
                                        </span>
                                    </div>
                                    {esSeleccionada && (
                                        <span style={{ color: "#059669", fontWeight: "700", fontSize: "14px" }}>
                                            ✓
                                        </span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
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
    const [guardarComoPlantilla, setGuardarComoPlantilla] = useState(false);
    const [asientosGuardados, setAsientosGuardados] = useState([]);
    const [drawerGuardadosAbierto, setDrawerGuardadosAbierto] = useState(false);
    const [busquedaGuardados, setBusquedaGuardados] = useState("");

    useEffect(() => {
        async function cargarDatos(){
            if(!supabaseConfigurado){
                setError("Configura Supabase para registrar asientos.");
                setCargando(false);
                return;
            }

            try{
                const [empresasCargadas, cuentasCargadas, guardadosCargados] = await Promise.all([
                    obtenerEmpresas(),
                    obtenerCuentas(),
                    obtenerAsientosGuardados()
                ]);
                setEmpresas(empresasCargadas);
                setCuentas(cuentasCargadas);
                setAsientosGuardados(guardadosCargados || []);
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
        () => calcularAsiento(detalles, cuentasPorId, cuentasPorCodigo, modoIva, empresaId),
        [detalles, cuentasPorId, cuentasPorCodigo, modoIva, empresaId]
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
        const resultado = calcularAsiento(detallesActuales, cuentasPorId, cuentasPorCodigo, modo, empresaId);
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

// Normaliza los detalles de una plantilla / esqueleto.
// Si un esqueleto fue guardado previamente con el IVA ya desglosado en líneas separadas,
// reintegra el IVA a la cuenta operativa base (en modo "incluido") y elimina la línea redundante de IVA,
// para que al cargarlo en el formulario no se duplique el IVA ni se recalcule dos veces.
function normalizarPlantillaDetalles(plantilla, cuentasPorId) {
    if (!plantilla) return [];
    const modo = plantilla.modo_iva || "incluido";
    const detalles = Array.isArray(plantilla.detalles) ? plantilla.detalles : [];

    if (modo === "sin") {
        return detalles;
    }

    const esCuentaIva = (d) => {
        const cuenta = cuentasPorId.get(String(d.cuenta_id));
        const nom = (cuenta?.nombre || d.cuenta_nombre || "").toLowerCase();
        const cod = String(cuenta?.codigo || d.cuenta_codigo || "").trim();
        const desc = (d.descripcion || "").toLowerCase();
        return (
            desc.includes("iva") ||
            nom.includes("crédito fiscal") ||
            nom.includes("credito fiscal") ||
            nom.includes("débito fiscal") ||
            nom.includes("debito fiscal") ||
            cod === "1105" ||
            cod === "2102" ||
            cod.startsWith("1105") ||
            cod.startsWith("2102")
        );
    };

    const lineasIva = detalles.filter(esCuentaIva);
    const lineasNoIva = detalles.filter(d => !esCuentaIva(d)).map(d => ({ ...d }));

    // Si la plantilla contiene líneas de IVA separadas
    if (lineasIva.length > 0 && lineasNoIva.length >= 1) {
        if (modo === "incluido") {
            // Reintegrar el IVA a la cuenta operativa correspondiente (ej. Compras en Debe o Ventas en Haber)
            lineasIva.forEach(ivaItem => {
                const debeIva = normalizarNumero(ivaItem.debe);
                const haberIva = normalizarNumero(ivaItem.haber);
                const lado = debeIva > 0 ? "debe" : "haber";
                const montoIva = debeIva > 0 ? debeIva : haberIva;

                const destino = lineasNoIva.find(item => normalizarNumero(item[lado]) > 0);
                if (destino) {
                    const actual = normalizarNumero(destino[lado]);
                    destino[lado] = Number((actual + montoIva).toFixed(2));
                }
            });
        }
        return lineasNoIva;
    }

    return detalles;
}

    // Cargar esqueleto en el asiento (mantiene la fecha del momento y todo editable)
    function cargarEsqueleto(plantilla) {
        const modo = plantilla.modo_iva || "incluido";
        setConcepto(plantilla.concepto || "");
        setModoIva(modo);

        const detallesNormalizados = normalizarPlantillaDetalles(plantilla, cuentasPorId);

        setDetalles(detallesNormalizados.map(detalle => ({
            cuenta_id: String(detalle.cuenta_id),
            debe: detalle.debe === "0" || detalle.debe === 0 || !detalle.debe ? "" : String(detalle.debe),
            haber: detalle.haber === "0" || detalle.haber === 0 || !detalle.haber ? "" : String(detalle.haber)
        })));
        setDrawerGuardadosAbierto(false);
        setMensaje(`Esqueleto "${plantilla.concepto}" cargado. Puedes editar las cuentas y montos o registrarlo con la fecha actual.`);
        setError("");
    }

    async function manejarEliminarEsqueleto(id, conceptoItem, e) {
        e?.stopPropagation?.();
        if (!window.confirm(`¿Deseas eliminar el asiento guardado "${conceptoItem}"?`)) return;
        await eliminarAsientoGuardado(id);
        setAsientosGuardados(prev => prev.filter(item => String(item.id) !== String(id)));
    }

    const plantillasFiltradas = useMemo(() => {
        const q = busquedaGuardados.trim().toLowerCase();
        if (!q) return asientosGuardados;
        return asientosGuardados.filter(item => {
            const coincideConcepto = String(item.concepto || "").toLowerCase().includes(q);
            const coincideCuentas = (item.detalles || []).some(d => {
                const cObj = cuentasPorId.get(String(d.cuenta_id));
                return (
                    (cObj?.nombre && cObj.nombre.toLowerCase().includes(q)) ||
                    (cObj?.codigo && cObj.codigo.includes(q)) ||
                    (d.cuenta_nombre && d.cuenta_nombre.toLowerCase().includes(q)) ||
                    (d.cuenta_codigo && d.cuenta_codigo.includes(q))
                );
            });
            return coincideConcepto || coincideCuentas;
        });
    }, [asientosGuardados, busquedaGuardados, cuentasPorId]);

    async function guardarAsiento(evento){
        evento.preventDefault();
        setError("");
        setMensaje("");

        if(!empresaId || !fecha || !concepto.trim()){
            setError("Completa empresa, fecha y concepto.");
            return;
        }

        if(detalles.filter(detalle => detalle.cuenta_id).length < 2){
            setError("Debe haber al menos dos líneas válidas para registrar el asiento.");
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
            const lineasParaAsiento = calculo.lineas.map(linea => ({
                cuenta_id: linea.cuenta.id,
                descripcion: linea.origen === "iva" ? "IVA automático" : "",
                debe: linea.lado === "debe" ? linea.centavos / 100 : 0,
                haber: linea.lado === "haber" ? linea.centavos / 100 : 0
            }));

            const resultado = await crearAsiento(
                {
                    empresa_id: empresaId,
                    fecha,
                    concepto: quitarPrefijoConcepto(concepto)
                },
                // se guardan las líneas reales, con el IVA y la línea de cuadre ya calculados
                lineasParaAsiento
            );

            const numeroPartida = resultado?.numero_partida ?? resultado?.asiento?.numero_partida ?? "";

            let notaGuardado = "";
            if (guardarComoPlantilla) {
                try {
                    // Para guardar el esqueleto contable, guardamos las líneas que el usuario configuró en el formulario
                    // (con sus cuentas y montos capturados/brutos), NO las líneas con IVA desglosado.
                    // Si el usuario dejó una línea vacía para autocompletar con cuadre, guardamos el importe que calculó el cuadre.
                    const detallesParaPlantilla = detalles
                        .filter(d => Boolean(d.cuenta_id))
                        .map(d => {
                            let debe = normalizarNumero(d.debe);
                            let haber = normalizarNumero(d.haber);

                            // Si quedó vacía para autocompletar por cuadre:
                            if (debe === 0 && haber === 0) {
                                const lineaCuadre = calculo.lineas.find(
                                    l => l.origen === "cuadre" && String(l.cuenta.id) === String(d.cuenta_id)
                                );
                                if (lineaCuadre) {
                                    if (lineaCuadre.lado === "debe") debe = lineaCuadre.centavos / 100;
                                    if (lineaCuadre.lado === "haber") haber = lineaCuadre.centavos / 100;
                                }
                            }

                            const cuentaObj = cuentasPorId.get(String(d.cuenta_id));
                            return {
                                cuenta_id: String(d.cuenta_id),
                                cuenta_codigo: cuentaObj?.codigo || "",
                                cuenta_nombre: cuentaObj?.nombre || "",
                                debe: debe > 0 ? debe : 0,
                                haber: haber > 0 ? haber : 0
                            };
                        });

                    await guardarPlantillaAsiento({
                        concepto: quitarPrefijoConcepto(concepto),
                        modo_iva: modoIva,
                        detalles: detallesParaPlantilla
                    });
                    const actualizados = await obtenerAsientosGuardados();
                    setAsientosGuardados(actualizados);
                    notaGuardado = " Además, el esqueleto del asiento se guardó para futuros registros.";
                } catch (errGuardar) {
                    console.warn("No se pudo guardar la plantilla del asiento:", errGuardar);
                }
            }

            setMensaje(`${numeroPartida ? `Asiento registrado correctamente. Partida ${numeroPartida}.` : "Asiento registrado correctamente."}${notaGuardado}`);
            setDetalles([nuevaLinea(), nuevaLinea()]);
            setConcepto("");
            setGenerarConcepto(false);
            setGuardarComoPlantilla(false);
        }catch(error){
            console.error("Error registrando asiento:", error);
            setError(error.message || "No se pudo registrar el asiento.");
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
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                        type="button"
                        className="btn-ver-guardados"
                        onClick={() => setDrawerGuardadosAbierto(true)}
                        title="Ver asientos guardados y esqueletos para reutilizar"
                    >
                        <IconoCarpeta size={16} />
                        <span>Ver guardados</span>
                        {asientosGuardados.length > 0 && (
                            <span className="badge-guardados-contador">{asientosGuardados.length}</span>
                        )}
                    </button>
                    <ExportarPdfButton onExport={manejarExportacionPDF} onExportExcel={manejarExportacionExcel} reporte="Nuevo Asiento" disabled={!empresaId || !detalles.length} />
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
                    <label className="concept-option template-option">
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <IconoBookmark size={15} />
                            <span>Guardar asiento</span>
                        </span>
                        <input type="checkbox" checked={guardarComoPlantilla} onChange={evento => setGuardarComoPlantilla(evento.target.checked)} />
                        <small>Guarda la estructura (cuentas y montos) como esqueleto editable para reutilizarlo cuando quieras.</small>
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
                        {calculo.infoIva?.cuentaCredito && (
                            <span style={{ display: "block", marginTop: "3px", color: "#1B4332", fontSize: "11px" }}>
                                • Cuenta Crédito Fiscal activa: <strong>{calculo.infoIva.cuentaCredito.codigo} - {calculo.infoIva.cuentaCredito.nombre}</strong>
                                {calculo.infoIva.cuentaDebito && ` | Cuenta Débito Fiscal activa: ${calculo.infoIva.cuentaDebito.codigo} - ${calculo.infoIva.cuentaDebito.nombre}`}
                            </span>
                        )}
                    </p>

                    <div className="detail-table-shell" style={{ minHeight: "300px" }}>
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
                                        <td style={{ position: "relative", minWidth: "240px" }}>
                                            <SelectorSubcuenta
                                                value={detalle.cuenta_id}
                                                cuentas={cuentasMovibles}
                                                onChange={nuevaCuentaId => actualizarDetalle(indice, "cuenta_id", nuevaCuentaId)}
                                            />
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
                            {guardando ? "Registrando..." : "Registrar asiento"}
                        </button>
                        <button type="button" className="button-secondary" onClick={() => onCreated?.()}>
                            Ver Libro Diario
                        </button>
                    </div>
                )}
            </form>

            {/* Menú lateral derecho con Asientos Guardados (Esqueletos) */}
            {drawerGuardadosAbierto && (
                <div
                    className="drawer-overlay"
                    onClick={() => setDrawerGuardadosAbierto(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Asientos guardados"
                >
                    <aside
                        className="drawer-guardados"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Cabecera del Drawer */}
                        <div className="drawer-header">
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div className="drawer-header-icon">
                                    <IconoBookmark size={20} />
                                </div>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <h3 className="drawer-title">Asientos Guardados</h3>
                                        {asientosGuardados.length > 0 && (
                                            <span className="badge-guardados-header">{asientosGuardados.length}</span>
                                        )}
                                    </div>
                                    <p className="drawer-subtitle">
                                        Selecciona un esqueleto para cargarlo en el formulario
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="drawer-close-btn"
                                onClick={() => setDrawerGuardadosAbierto(false)}
                                title="Cerrar panel"
                                aria-label="Cerrar panel"
                            >
                                <IconoCerrar size={18} />
                            </button>
                        </div>

                        {/* Buscador de asientos guardados */}
                        <div className="drawer-search-box">
                            <span className="drawer-search-icon">
                                <IconoLupa size={15} />
                            </span>
                            <input
                                type="text"
                                className="drawer-search-input"
                                placeholder="Buscar por comentario o cuenta..."
                                value={busquedaGuardados}
                                onChange={e => setBusquedaGuardados(e.target.value)}
                                autoFocus
                            />
                            {busquedaGuardados && (
                                <button
                                    type="button"
                                    className="drawer-search-clear"
                                    onClick={() => setBusquedaGuardados("")}
                                    title="Limpiar búsqueda"
                                    aria-label="Limpiar búsqueda"
                                >
                                    <IconoCerrar size={14} />
                                </button>
                            )}
                        </div>

                        {/* Lista de plantillas guardadas */}
                        <div className="drawer-list">
                            {plantillasFiltradas.length === 0 ? (
                                <div className="drawer-empty">
                                    <div className="drawer-empty-icon">
                                        <IconoCarpeta size={42} />
                                    </div>
                                    <h3>{busquedaGuardados ? "Sin coincidencias" : "No hay asientos guardados"}</h3>
                                    <p>
                                        {busquedaGuardados
                                            ? `No se encontraron esqueletos que coincidan con "${busquedaGuardados}".`
                                            : 'Al registrar un asiento, activa la casilla "Guardar asiento" para almacenar aquí su estructura con cuentas y montos.'}
                                    </p>
                                </div>
                            ) : (
                                plantillasFiltradas.map(plantilla => {
                                    const detallesParaMostrar = normalizarPlantillaDetalles(plantilla, cuentasPorId);
                                    const totalDebePlantilla = detallesParaMostrar.reduce(
                                        (sum, d) => sum + (Number(d.debe) || 0),
                                        0
                                    );
                                    const totalHaberPlantilla = detallesParaMostrar.reduce(
                                        (sum, d) => sum + (Number(d.haber) || 0),
                                        0
                                    );
                                    const montoMaximo = Math.max(totalDebePlantilla, totalHaberPlantilla);

                                    return (
                                        <div
                                            key={plantilla.id}
                                            className="plantilla-card"
                                            onClick={() => cargarEsqueleto(plantilla)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={e => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    cargarEsqueleto(plantilla);
                                                }
                                            }}
                                        >
                                            <div className="plantilla-card-top">
                                                <h4 className="plantilla-title">{plantilla.concepto || "Sin comentario"}</h4>
                                                <button
                                                    type="button"
                                                    className="btn-eliminar-plantilla"
                                                    onClick={e => manejarEliminarEsqueleto(plantilla.id, plantilla.concepto, e)}
                                                    title="Eliminar este esqueleto"
                                                    aria-label="Eliminar esqueleto"
                                                >
                                                    <IconoBasura size={15} />
                                                </button>
                                            </div>

                                            <div className="plantilla-meta-row">
                                                <span className="plantilla-tag-iva">
                                                    {plantilla.modo_iva === "incluido"
                                                        ? "IVA Incluido"
                                                        : plantilla.modo_iva === "mas"
                                                        ? "Más IVA"
                                                        : "Sin IVA"}
                                                </span>
                                                <span className="plantilla-tag-lineas">
                                                    {detallesParaMostrar.length} cuentas
                                                </span>
                                                {montoMaximo > 0 && (
                                                    <span className="plantilla-tag-monto">
                                                        $ {montoMaximo.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Preview de cuentas y montos */}
                                            {Array.isArray(detallesParaMostrar) && detallesParaMostrar.length > 0 && (
                                                <div className="plantilla-detalles-preview">
                                                    {detallesParaMostrar.map((det, idx) => {
                                                        const cuentaObj = cuentasPorId.get(String(det.cuenta_id));
                                                        const cod = cuentaObj?.codigo || det.cuenta_codigo || "";
                                                        const nom = cuentaObj?.nombre || det.cuenta_nombre || `Cuenta #${det.cuenta_id}`;
                                                        const dMonto = Number(det.debe) || 0;
                                                        const hMonto = Number(det.haber) || 0;
                                                        const tieneMonto = dMonto > 0 || hMonto > 0;

                                                        return (
                                                            <div key={idx} className="plantilla-detalle-linea">
                                                                <span className="plantilla-linea-nombre" title={`${cod} ${nom}`}>
                                                                    <strong>{cod}</strong> {nom}
                                                                </span>
                                                                {tieneMonto && (
                                                                    <span className="plantilla-linea-monto">
                                                                        {dMonto > 0 ? `D: $${dMonto.toFixed(2)}` : `H: $${hMonto.toFixed(2)}`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            <div className="plantilla-card-footer">
                                                <button
                                                    type="button"
                                                    className="btn-usar-esqueleto"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        cargarEsqueleto(plantilla);
                                                    }}
                                                >
                                                    <IconoCargar size={14} />
                                                    <span>Usar este esqueleto</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </aside>
                </div>
            )}
        </section>
    );
}

export default NuevoAsiento;
