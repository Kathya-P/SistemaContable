import { useState, useRef } from "react";
import { 
    validarArchivoCatalogo, 
    importarCatalogo, 
    descargarPlantillaCSV,
    parsearTextoPegadoWordPDF
} from "../services/cuentasService";
import {
    detectarCuentasIva,
    inferirLlevaIvaPorDefecto,
    guardarConfiguracionIva
} from "../utils/configuracionIva";

/**
 * Carga la librería SheetJS (XLSX) bajo demanda desde CDN sin requerir paquetes locales en node_modules.
 */
function cargarLibreriaXLSX() {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            return reject(new Error("Entorno no compatible"));
        }
        if (window.XLSX) {
            return resolve(window.XLSX);
        }

        const scriptId = "cdn-sheetjs-script";
        let script = document.getElementById(scriptId);
        if (script) {
            script.addEventListener("load", () => resolve(window.XLSX));
            script.addEventListener("error", () => reject(new Error("No se pudo cargar el módulo de Excel.")));
            return;
        }

        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        script.async = true;
        script.onload = () => {
            if (window.XLSX) {
                resolve(window.XLSX);
            } else {
                reject(new Error("La librería de Excel no se inicializó correctamente."));
            }
        };
        script.onerror = () => {
            reject(new Error("No se pudo descargar el lector de Excel. Comprueba tu conexión o sube un archivo CSV / copia el texto en la pestaña de texto."));
        };
        document.head.appendChild(script);
    });
}

/**
 * Carga la librería PDF.js bajo demanda desde CDN sin requerir paquetes locales en node_modules.
 */
function cargarLibreriaPDFJS() {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            return reject(new Error("Entorno no compatible"));
        }
        if (window.pdfjsLib) {
            return resolve(window.pdfjsLib);
        }

        const scriptId = "cdn-pdfjs-script";
        let script = document.getElementById(scriptId);
        if (script) {
            script.addEventListener("load", () => {
                configurarWorkerPDF();
                resolve(window.pdfjsLib);
            });
            script.addEventListener("error", () => reject(new Error("No se pudo cargar el lector de PDF.")));
            return;
        }

        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.async = true;
        script.onload = () => {
            configurarWorkerPDF();
            if (window.pdfjsLib) {
                resolve(window.pdfjsLib);
            } else {
                reject(new Error("El módulo PDF no se inicializó correctamente."));
            }
        };
        script.onerror = () => {
            reject(new Error("No se pudo descargar el lector de PDF. Comprueba tu conexión o copia y pega el texto en la pestaña manual."));
        };
        document.head.appendChild(script);
    });
}

function configurarWorkerPDF() {
    if (typeof window !== "undefined" && window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
}

/**
 * Parser nativo de CSV sin dependencias externas.
 * Soporta comillas (""), comas (,), punto y comas (;), tabulaciones (\t) y saltos de línea Windows/Unix.
 */
function parsearCSVTexto(texto) {
    if (!texto || !texto.trim()) return [];

    // Remover marca BOM si está presente
    const limpio = texto.replace(/^\uFEFF/, "");

    // Detectar si el delimitador es ';', ',' o '\t' según la primera línea
    const primeraLinea = limpio.split(/\r\n|\n|\r/)[0] || "";
    const cuentaComas = (primeraLinea.match(/,/g) || []).length;
    const cuentaPuntoComas = (primeraLinea.match(/;/g) || []).length;
    const cuentaTabs = (primeraLinea.match(/\t/g) || []).length;

    let separador = ",";
    if (cuentaPuntoComas >= cuentaComas && cuentaPuntoComas >= cuentaTabs) {
        separador = ";";
    } else if (cuentaTabs > cuentaComas && cuentaTabs > cuentaPuntoComas) {
        separador = "\t";
    }

    const filas = [];
    let filaActual = [];
    let campoActual = "";
    let dentroDeComillas = false;

    for (let i = 0; i < limpio.length; i++) {
        const char = limpio[i];
        const siguienteChar = limpio[i + 1];

        if (char === '"') {
            if (dentroDeComillas && siguienteChar === '"') {
                campoActual += '"';
                i++; // Salta la comilla escapada
            } else {
                dentroDeComillas = !dentroDeComillas;
            }
        } else if (char === separador && !dentroDeComillas) {
            filaActual.push(campoActual.trim());
            campoActual = "";
        } else if ((char === "\r" || char === "\n") && !dentroDeComillas) {
            if (char === "\r" && siguienteChar === "\n") {
                i++;
            }
            filaActual.push(campoActual.trim());
            if (filaActual.some(col => col.length > 0)) {
                filas.push(filaActual);
            }
            filaActual = [];
            campoActual = "";
        } else {
            campoActual += char;
        }
    }

    if (campoActual.length > 0 || filaActual.length > 0) {
        filaActual.push(campoActual.trim());
        if (filaActual.some(col => col.length > 0)) {
            filas.push(filaActual);
        }
    }

    if (filas.length < 2) return [];

    // Limpiar comillas exteriores de los encabezados
    const encabezados = filas[0].map(h => h.replace(/^["']|["']$/g, "").trim());
    const objetos = [];

    for (let f = 1; f < filas.length; f++) {
        const cols = filas[f];
        const obj = {};
        encabezados.forEach((enc, idx) => {
            const valor = cols[idx] !== undefined ? cols[idx].replace(/^["']|["']$/g, "").trim() : "";
            obj[enc] = valor;
        });
        objetos.push(obj);
    }

    return objetos;
}

/**
 * Parsea un libro de Excel (.xlsx, .xls) a una lista de objetos de cuentas usando XLSX dinámico.
 */
async function parsearExcel(arrayBuffer) {
    const XLSX = await cargarLibreriaXLSX();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: "array" });
    const primeraHoja = workbook.SheetNames[0];
    if (!primeraHoja) {
        throw new Error("El archivo de Excel no contiene ninguna hoja de cálculo.");
    }

    const worksheet = workbook.Sheets[primeraHoja];
    const matriz = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    if (!matriz || matriz.length === 0) {
        throw new Error("La hoja de cálculo está vacía.");
    }

    // Buscar la fila de encabezados
    let indiceHeader = -1;
    for (let i = 0; i < Math.min(matriz.length, 12); i++) {
        const fila = matriz[i];
        if (Array.isArray(fila) && fila.some(celda => {
            const s = String(celda).toLowerCase().trim();
            return s.includes("cod") || s.includes("cuenta") || s.includes("nombre") || s.includes("descripcion") || s.includes("id_cuenta") || s.includes("idcuenta");
        })) {
            indiceHeader = i;
            break;
        }
    }

    const filasBrutas = [];

    if (indiceHeader !== -1) {
        const headers = matriz[indiceHeader].map(h => String(h || "").trim());
        for (let i = indiceHeader + 1; i < matriz.length; i++) {
            const fila = matriz[i];
            if (!fila || fila.length === 0) continue;
            const item = {};
            headers.forEach((h, idx) => {
                if (h) item[h] = fila[idx] !== undefined ? String(fila[idx]).trim() : "";
            });
            if (Object.values(item).some(v => v !== "")) {
                filasBrutas.push(item);
            }
        }
    } else {
        // Sin fila de encabezados: asignación posicional (0: código, 1: nombre, 2: tipo, 3: nivel, 4: padre)
        for (let i = 0; i < matriz.length; i++) {
            const fila = matriz[i];
            if (!fila || fila.length === 0) continue;
            const col0 = fila[0] !== undefined ? String(fila[0]).trim() : "";
            const col1 = fila[1] !== undefined ? String(fila[1]).trim() : "";
            if (!col0 && !col1) continue;

            filasBrutas.push({
                codigo: col0,
                nombre: col1,
                tipo: fila[2] !== undefined ? String(fila[2]).trim() : "",
                nivel: fila[3] !== undefined ? String(fila[3]).trim() : "",
                cuenta_padre_codigo: fila[4] !== undefined ? String(fila[4]).trim() : ""
            });
        }
    }

    return filasBrutas;
}

/**
 * Extrae texto de un archivo PDF usando PDF.js dinámico conservando la estructura visual de filas y columnas.
 */
async function extraerTextoDePDF(file) {
    const pdfjsLib = await cargarLibreriaPDFJS();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        useSystemFonts: true
    });
    const pdfDoc = await loadingTask.promise;
    let textoCompleto = "";

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();

        // Agrupar items por línea vertical (coordenada Y)
        const lineasMap = new Map();
        content.items.forEach(item => {
            if (!item.str || !item.str.trim()) return;
            const y = Math.round(item.transform[5]);
            const x = Math.round(item.transform[4]);

            // Buscar si ya existe una línea con Y similar (±4px)
            let yKey = null;
            for (const key of lineasMap.keys()) {
                if (Math.abs(key - y) <= 4) {
                    yKey = key;
                    break;
                }
            }
            if (yKey === null) {
                yKey = y;
                lineasMap.set(yKey, []);
            }
            lineasMap.get(yKey).push({ x, str: item.str });
        });

        // Ordenar líneas de arriba hacia abajo (en PDF, mayor Y es más arriba)
        const lineasOrdenadas = Array.from(lineasMap.entries()).sort((a, b) => b[0] - a[0]);

        // En cada línea ordenar elementos de izquierda a derecha
        const textoPagina = lineasOrdenadas.map(([, items]) => {
            items.sort((a, b) => a.x - b.x);
            return items.map(it => it.str.trim()).filter(Boolean).join("\t");
        }).filter(Boolean).join("\n");

        if (textoPagina) {
            textoCompleto += (textoCompleto ? "\n" : "") + textoPagina;
        }
    }

    return textoCompleto;
}

function ModalImportarCatalogo({ abierto, cuentasExistentes = [], usuario, alCerrar, alImportarExitoso }) {
    const [metodoEntrada, setMetodoEntrada] = useState("archivo"); // "archivo" o "pegar"
    const [textoPegado, setTextoPegado] = useState("");
    const [archivo, setArchivo] = useState(null);
    const [modo, setModo] = useState("agregar"); // "agregar" o "reemplazar"
    const [resultadoValidacion, setResultadoValidacion] = useState(null);
    const [procesandoArchivo, setProcesandoArchivo] = useState(false);
    const [arrastrando, setArrastrando] = useState(false);
    const [importando, setImportando] = useState(false);
    const [errorGeneral, setErrorGeneral] = useState("");
    const fileInputRef = useRef(null);

    // Configuración interactiva de IVA para el catálogo importado
    const [habilitarIvaAutomatico, setHabilitarIvaAutomatico] = useState(true);
    const [cuentaCreditoSeleccionada, setCuentaCreditoSeleccionada] = useState("");
    const [cuentaDebitoSeleccionada, setCuentaDebitoSeleccionada] = useState("");
    const [cuentasConIvaMarcadas, setCuentasConIvaMarcadas] = useState(new Set());

    if (!abierto) return null;

    // Normaliza nombres de encabezados para soportar formatos oficiales del gobierno, SSF, BCR y variaciones comunes
    function normalizarClave(clave = "") {
        const c = String(clave).trim().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[\s\-_]+/g, "_");

        if (c === "id_cuenta" || c === "idcuenta" || c === "codigo" || c === "code" || c === "cod" || c === "numero" || c === "no" || c === "num_cuenta" || c === "cuenta_id" || c === "id") return "codigo";
        if (c === "nombre_cuenta" || c === "nombrecuenta" || c === "nombre" || c === "name" || c === "cuenta" || c === "descripcion" || c === "concepto" || c === "titulo") return "nombre";
        if (c === "categoria" || c === "categoria_cuenta" || c === "tipo" || c === "type" || c === "tipo_cuenta" || c === "rubro_tipo" || c === "clasificacion") return "tipo";
        if (c === "descripcion_nivel" || c === "descripcionnivel" || c === "nivel" || c === "level" || c === "grado" || c === "jerarquia") return "nivel";
        if (c === "cuenta_padre_codigo" || c === "padre_codigo" || c === "cuenta_padre" || c === "padre" || c === "parent" || c === "cuenta_superior") return "cuenta_padre_codigo";
        if (c === "permite_movimientos" || c === "permite_movimiento" || c === "movimientos" || c === "movimiento" || c === "afectable" || c === "imputable") return "permite_movimientos";
        if (c === "operacion" || c === "signo" || c === "naturaleza") return "operacion";
        if (c === "lleva_iva" || c === "aplica_iva" || c === "iva" || c === "grava_iva" || c === "con_iva") return "lleva_iva";
        return c;
    }

    function procesarDatosFilas(filasBrutas, modoSeleccionado = modo) {
        setErrorGeneral("");
        if (!filasBrutas || filasBrutas.length === 0) {
            setErrorGeneral("No se encontraron registros de cuentas en la información proporcionada.");
            setResultadoValidacion(null);
            return;
        }

        // Mapear filas con encabezados normalizados
        const filasNormalizadas = filasBrutas.map(fila => {
            const nuevaFila = {};
            Object.entries(fila).forEach(([k, v]) => {
                const claveNorm = normalizarClave(k);
                nuevaFila[claveNorm] = typeof v === "string" ? v.trim() : (v !== null && v !== undefined ? String(v).trim() : "");
            });
            return nuevaFila;
        }).filter(fila => fila.codigo || fila.nombre); // Descartar filas completamente vacías

        if (filasNormalizadas.length === 0) {
            setErrorGeneral("No se encontraron registros con código y nombre de cuenta válidos.");
            setResultadoValidacion(null);
            return;
        }

        const validacion = validarArchivoCatalogo(filasNormalizadas, cuentasExistentes, modoSeleccionado, { flexible: true });
        setResultadoValidacion(validacion);

        // Auto-detectar cuentas de IVA y marcar cuentas que llevan IVA
        if (validacion && validacion.filasValidas.length > 0) {
            const detectadas = detectarCuentasIva(validacion.filasValidas);
            setCuentaCreditoSeleccionada(detectadas.cuentaCredito ? String(detectadas.cuentaCredito.codigo) : "");
            setCuentaDebitoSeleccionada(detectadas.cuentaDebito ? String(detectadas.cuentaDebito.codigo) : "");

            // Pre-marcar cuentas que llevan IVA por defecto
            const marcadasIniciales = new Set();
            validacion.filasValidas.forEach(f => {
                // Si en el archivo venía explícitamente "lleva_iva" / "aplica_iva"
                const flagExplicito = f.lleva_iva || f.aplica_iva || f.iva;
                if (flagExplicito !== undefined && flagExplicito !== "") {
                    const s = String(flagExplicito).toLowerCase();
                    if (s === "si" || s === "true" || s === "1" || s === "s") {
                        marcadasIniciales.add(String(f.codigo));
                    }
                } else if (inferirLlevaIvaPorDefecto(f)) {
                    marcadasIniciales.add(String(f.codigo));
                }
            });
            setCuentasConIvaMarcadas(marcadasIniciales);
        }
    }

    async function procesarArchivoFisico(file) {
        if (!file) return;

        setArchivo(file);
        setProcesandoArchivo(true);
        setErrorGeneral("");
        setResultadoValidacion(null);

        const nombre = file.name || "";
        const extension = nombre.split(".").pop().toLowerCase();

        try {
            if (extension === "xlsx" || extension === "xls") {
                const arrayBuffer = await file.arrayBuffer();
                const filas = await parsearExcel(arrayBuffer);
                setProcesandoArchivo(false);
                procesarDatosFilas(filas);
            } else if (extension === "pdf") {
                const textoExtraido = await extraerTextoDePDF(file);
                if (!textoExtraido || !textoExtraido.trim()) {
                    setProcesandoArchivo(false);
                    setErrorGeneral("No se pudo extraer texto del documento PDF. Si es un PDF escaneado (imagen), por favor copia y pega el texto en la pestaña de texto manual.");
                    return;
                }
                const filas = parsearTextoPegadoWordPDF(textoExtraido);
                setProcesandoArchivo(false);
                if (filas.length === 0) {
                    setErrorGeneral("No se reconocieron cuentas contables legibles en el PDF. Verifica que el archivo contenta código y nombre de cuenta.");
                    return;
                }
                procesarDatosFilas(filas);
            } else if (extension === "csv" || extension === "txt") {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const texto = event.target?.result || "";
                        const filas = parsearCSVTexto(texto);
                        setProcesandoArchivo(false);
                        if (filas.length === 0) {
                            // Intentar parseo de texto libre
                            const filasLibres = parsearTextoPegadoWordPDF(texto);
                            if (filasLibres.length > 0) {
                                procesarDatosFilas(filasLibres);
                                return;
                            }
                            setErrorGeneral("El archivo de texto no contiene cuentas válidas.");
                            return;
                        }
                        procesarDatosFilas(filas);
                    } catch (err) {
                        setProcesandoArchivo(false);
                        setErrorGeneral(`Error al procesar archivo CSV: ${err.message}`);
                    }
                };
                reader.onerror = () => {
                    setProcesandoArchivo(false);
                    setErrorGeneral("Error al leer el archivo desde el disco.");
                };
                reader.readAsText(file, "UTF-8");
            } else {
                setProcesandoArchivo(false);
                setErrorGeneral(`El formato .${extension} no es compatible. Por favor sube un archivo Excel (.xlsx, .xls), PDF (.pdf), CSV (.csv) o TXT (.txt).`);
            }
        } catch (err) {
            setProcesandoArchivo(false);
            console.error("Error al procesar archivo:", err);
            setErrorGeneral(`Error al leer el archivo: ${err.message}`);
        }
    }

    function manejarArchivoSeleccionado(e) {
        const file = e.target.files?.[0];
        if (file) {
            procesarArchivoFisico(file);
        }
    }

    function manejarDrop(e) {
        e.preventDefault();
        setArrastrando(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) {
            procesarArchivoFisico(file);
        }
    }

    function manejarDragOver(e) {
        e.preventDefault();
        if (!arrastrando) setArrastrando(true);
    }

    function manejarDragLeave(e) {
        e.preventDefault();
        setArrastrando(false);
    }

    function procesarTextoManual() {
        if (!textoPegado || !textoPegado.trim()) {
            setErrorGeneral("Por favor escribe o pega el texto de tu catálogo antes de analizar.");
            return;
        }
        setProcesandoArchivo(true);
        setErrorGeneral("");
        try {
            const filas = parsearTextoPegadoWordPDF(textoPegado);
            setProcesandoArchivo(false);
            if (filas.length === 0) {
                setErrorGeneral("No se pudieron detectar cuentas en el texto pegado. Asegúrate de incluir el código y nombre de cada cuenta (ej: 1101 Efectivo y Equivalentes).");
                return;
            }
            procesarDatosFilas(filas);
        } catch (err) {
            setProcesandoArchivo(false);
            setErrorGeneral(`Error procesando el texto: ${err.message}`);
        }
    }

    function cambiarModo(nuevoModo) {
        setModo(nuevoModo);
        if (resultadoValidacion) {
            const filas = resultadoValidacion.filasValidas.concat(resultadoValidacion.filasInvalidas);
            const validacion = validarArchivoCatalogo(filas, cuentasExistentes, nuevoModo, { flexible: true });
            setResultadoValidacion(validacion);
        }
    }

    function alternarCuentaIva(codigo) {
        setCuentasConIvaMarcadas(prev => {
            const nuevo = new Set(prev);
            const strCod = String(codigo);
            if (nuevo.has(strCod)) {
                nuevo.delete(strCod);
            } else {
                nuevo.add(strCod);
            }
            return nuevo;
        });
    }

    async function manejarConfirmarImportacion() {
        if (!resultadoValidacion || !resultadoValidacion.esValido) return;

        try {
            setImportando(true);
            setErrorGeneral("");
            
            // Resolver empresa_id de manera segura
            let idEmpresa = usuario?.empresa_id;
            if (!idEmpresa && cuentasExistentes && cuentasExistentes.length > 0) {
                const conEmpresa = cuentasExistentes.find(c => c.empresa_id);
                if (conEmpresa) idEmpresa = conEmpresa.empresa_id;
            }

            const cuentasAImportar = resultadoValidacion.filasValidas.map(f => ({
                codigo: f.codigo,
                nombre: f.nombre,
                tipo: f.tipo,
                nivel: f.nivel,
                cuenta_padre_codigo: f.cuenta_padre_codigo,
                permite_movimientos: f.permite_movimientos,
                estado: true
            }));

            const resultado = await importarCatalogo({
                cuentas: cuentasAImportar,
                modo
            }, idEmpresa);

            // Guardar configuración de IVA para la empresa
            guardarConfiguracionIva(idEmpresa, {
                habilitado: habilitarIvaAutomatico,
                cuentaCreditoCodigo: cuentaCreditoSeleccionada || null,
                cuentaDebitoCodigo: cuentaDebitoSeleccionada || null,
                codigosConIva: Array.from(cuentasConIvaMarcadas)
            });

            alImportarExitoso(resultado);
            alCerrar();
        } catch (err) {
            setErrorGeneral(err.message || "Error al importar el catálogo.");
        } finally {
            setImportando(false);
        }
    }

    function resetearArchivo() {
        setArchivo(null);
        setResultadoValidacion(null);
        setErrorGeneral("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-importar-titulo">
            <div 
                className="modal-contenido modal-catalogo" 
                style={{ 
                    maxWidth: "780px", 
                    width: "95%", 
                    maxHeight: "90vh", 
                    display: "flex", 
                    flexDirection: "column",
                    backgroundColor: "#FFFFFF",
                    color: "#1C2321",
                    borderRadius: "12px",
                    boxShadow: "0 20px 45px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.12)",
                    border: "1px solid #DDE3E0",
                    padding: "24px",
                    position: "relative",
                    zIndex: 10000
                }}
            >
                <div className="modal-header" style={{ borderBottom: "1px solid #DDE3E0", paddingBottom: "12px" }}>
                    <div>
                        <p className="eyebrow" style={{ margin: 0, color: "#1B4332" }}>Importador masivo</p>
                        <h3 id="modal-importar-titulo" style={{ margin: "4px 0 0", fontSize: "20px", color: "#173B35" }}>
                            Importar catálogo de cuentas
                        </h3>
                    </div>
                    <button type="button" className="btn-cerrar" onClick={alCerrar} title="Cerrar modal">
                        ×
                    </button>
                </div>

                <div style={{ overflowY: "auto", paddingRight: "4px", flex: 1, marginTop: "14px" }}>
                    {/* Barra de ayuda y descarga de plantilla */}
                    <div style={{
                        background: "#F4F7F5",
                        border: "1px solid #D8E4DE",
                        borderRadius: "8px",
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "14px",
                        marginBottom: "16px"
                    }}>
                        <div>
                            <strong style={{ fontSize: "13.5px", color: "#173B35", display: "block" }}>
                                Formato admitido: Excel (.xlsx, .xls), PDF (.pdf), CSV o TXT
                            </strong>
                            <code style={{ fontSize: "12px", background: "#FFFFFF", color: "#1B4332", border: "1px solid #DDE3E0", padding: "2px 6px", borderRadius: "3px", marginTop: "4px", display: "inline-block" }}>
                                codigo, nombre, tipo, nivel, cuenta_padre_codigo, lleva_iva (opcional)
                            </code>
                            <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "#40534C" }}>
                                Puedes marcar directamente en la tabla si cada cuenta lleva IVA y qué cuenta acumula crédito o débito fiscal.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="button-secondary"
                            onClick={() => descargarPlantillaCSV(";")}
                            style={{ fontSize: "12.5px", padding: "6px 14px", whiteSpace: "nowrap" }}
                            title="Descargar archivo CSV de ejemplo con la estructura oficial"
                        >
                            Descargar plantilla
                        </button>
                    </div>
                    {/* Selector de modo */}
                    <div style={{
                        background: "#FFFFFF",
                        border: "1px solid #DDE3E0",
                        borderRadius: "8px",
                        padding: "14px 16px",
                        marginBottom: "16px"
                    }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>
                            <input
                                type="radio"
                                name="modoImportacion"
                                value="agregar"
                                checked={modo === "agregar"}
                                onChange={() => cambiarModo("agregar")}
                                style={{ accentColor: "#1B4332" }}
                            />
                            <div>
                                <strong style={{ color: "#173B35" }}>Agregar al catálogo existente</strong>
                                <span style={{ display: "block", fontSize: "11.5px", color: "#5F6B67" }}>
                                    Conserva las cuentas actuales y solo añade las cuentas nuevas del archivo.
                                </span>
                            </div>
                        </label>

                        <label style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            cursor: "pointer",
                            fontSize: "11px",
                            color: "#8A8F8C",
                            marginTop: "10px",
                            paddingTop: "10px",
                            borderTop: "1px dashed #E5E9E6"
                        }}>
                            <input
                                type="radio"
                                name="modoImportacion"
                                value="reemplazar"
                                checked={modo === "reemplazar"}
                                onChange={() => cambiarModo("reemplazar")}
                                style={{ accentColor: "#B3261E", width: "12px", height: "12px" }}
                            />
                            Reemplazar catálogo completo (avanzado — requiere que no existan asientos contables)
                        </label>
                    </div>

                    {/* Selector de método de importación */}
                    <div style={{ display: "flex", gap: "8px", marginBottom: "14px", borderBottom: "1px solid #DDE3E0", paddingBottom: "10px" }}>
                        <button
                            type="button"
                            onClick={() => { setMetodoEntrada("archivo"); setErrorGeneral(""); }}
                            style={{
                                padding: "7px 16px",
                                borderRadius: "4px",
                                border: "none",
                                background: metodoEntrada === "archivo" ? "#1B4332" : "#EAF5EE",
                                color: metodoEntrada === "archivo" ? "#FFFFFF" : "#1B4332",
                                fontWeight: "600",
                                fontSize: "13px",
                                cursor: "pointer",
                                transition: "all 150ms ease"
                            }}
                        >
                            Subir archivo (Excel, PDF, CSV)
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMetodoEntrada("pegar"); setErrorGeneral(""); }}
                            style={{
                                padding: "7px 16px",
                                borderRadius: "4px",
                                border: "none",
                                background: metodoEntrada === "pegar" ? "#1B4332" : "#EAF5EE",
                                color: metodoEntrada === "pegar" ? "#FFFFFF" : "#1B4332",
                                fontWeight: "600",
                                fontSize: "13px",
                                cursor: "pointer",
                                transition: "all 150ms ease"
                            }}
                        >
                            Pegar texto copiado
                        </button>
                    </div>

                    {/* Área de entrada de datos */}
                    {metodoEntrada === "archivo" ? (
                        <div
                            onDrop={manejarDrop}
                            onDragOver={manejarDragOver}
                            onDragLeave={manejarDragLeave}
                            style={{
                                border: arrastrando ? "2px dashed #1B4332" : "2px dashed #B8DEC3",
                                borderRadius: "8px",
                                padding: "26px 20px",
                                textAlign: "center",
                                background: arrastrando ? "#EAF5EE" : "#FAFCFB",
                                marginBottom: "16px",
                                transition: "all 150ms ease"
                            }}
                        >
                            {!archivo ? (
                                <div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        accept=".xlsx, .xls, .pdf, .csv, .txt, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, application/pdf, text/csv, text/plain"
                                        onChange={manejarArchivoSeleccionado}
                                        style={{ display: "none" }}
                                        id="input-archivo-catalogo"
                                    />
                                    <label
                                        htmlFor="input-archivo-catalogo"
                                        className="button-primary"
                                        style={{ display: "inline-block", cursor: "pointer", marginBottom: "10px", padding: "10px 18px", fontSize: "13.5px" }}
                                    >
                                        Seleccionar archivo
                                    </label>
                                    <p style={{ fontSize: "12.5px", color: "#40534C", margin: "4px 0 0", fontWeight: "500" }}>
                                        Formatos admitidos: Excel (.xlsx, .xls), Documentos PDF (.pdf), CSV o TXT
                                    </p>
                                    <p style={{ fontSize: "11.5px", color: "#5F6B67", margin: "2px 0 0" }}>
                                        También puedes arrastrar y soltar tu archivo directamente en este recuadro
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", flexWrap: "wrap", gap: "10px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "left" }}>
                                        <div style={{
                                            background: "#EAF5EE",
                                            color: "#1B4332",
                                            fontWeight: "700",
                                            fontSize: "11px",
                                            padding: "6px 10px",
                                            borderRadius: "4px",
                                            border: "1px solid #B8DEC3",
                                            textTransform: "uppercase"
                                        }}>
                                            {archivo.name.split(".").pop()}
                                        </div>
                                        <div>
                                            <strong style={{ fontSize: "13.5px", color: "#173B35", display: "block" }}>
                                                {archivo.name}
                                            </strong>
                                            <span style={{ display: "block", fontSize: "11.5px", color: "#5F6B67" }}>
                                                {(archivo.size / 1024).toFixed(1)} KB
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="button-secondary"
                                        onClick={resetearArchivo}
                                        style={{ fontSize: "12px", padding: "5px 12px" }}
                                    >
                                        Cambiar archivo
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{
                            background: "#FAFCFB",
                            border: "1px solid #DDE3E0",
                            borderRadius: "8px",
                            padding: "16px",
                            marginBottom: "16px"
                        }}>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "#173B35" }}>
                                Pega aquí la tabla o lista de cuentas copiada desde Word, PDF o Excel:
                            </label>
                            <textarea
                                value={textoPegado}
                                onChange={(e) => setTextoPegado(e.target.value)}
                                rows={7}
                                placeholder={"Ejemplo de catálogo copiado:\n1  ACTIVO\n11  ACTIVO CORRIENTE\n1101  EFECTIVO Y EQUIVALENTES\n110101  Caja General\n110102  Bancos Nacionales\n2  PASIVO\n21  PASIVO CORRIENTE"}
                                style={{
                                    width: "100%",
                                    fontFamily: "var(--mono)",
                                    fontSize: "12.5px",
                                    padding: "10px",
                                    borderRadius: "5px",
                                    border: "1px solid #C2CECA",
                                    lineHeight: "1.5",
                                    resize: "vertical",
                                    boxSizing: "border-box"
                                }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", flexWrap: "wrap", gap: "8px" }}>
                                <span style={{ fontSize: "11.5px", color: "#5F6B67" }}>
                                    Nota: El sistema detecta automáticamente columnas, códigos y dependencias de cuentas.
                                </span>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    {textoPegado && (
                                        <button
                                            type="button"
                                            className="button-secondary"
                                            onClick={() => { setTextoPegado(""); setResultadoValidacion(null); }}
                                            style={{ fontSize: "12px", padding: "6px 12px" }}
                                        >
                                            Limpiar texto
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="button-primary"
                                        onClick={procesarTextoManual}
                                        style={{ fontSize: "12.5px", padding: "6px 16px" }}
                                    >
                                        Analizar cuentas
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {procesandoArchivo && (
                        <div style={{
                            padding: "16px",
                            textAlign: "center",
                            background: "#F4F7F5",
                            borderRadius: "6px",
                            border: "1px solid #DDE3E0",
                            margin: "12px 0",
                            color: "#1B4332",
                            fontSize: "13px"
                        }}>
                            Procesando y extrayendo cuentas del archivo...
                        </div>
                    )}

                    {errorGeneral && (
                        <div className="message-error" style={{ margin: "10px 0", padding: "10px 14px", fontSize: "13px", borderRadius: "6px" }}>
                            {errorGeneral}
                        </div>
                    )}

                    {/* Resumen de validación */}
                    {resultadoValidacion && (
                        <div>
                            <div style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, 1fr)",
                                gap: "10px",
                                marginBottom: "14px"
                            }}>
                                <div style={{ background: "#F4F7F5", padding: "12px", borderRadius: "6px", textAlign: "center", border: "1px solid #DDE3E0" }}>
                                    <span style={{ fontSize: "11px", color: "#5F6B67", textTransform: "uppercase", fontWeight: "600" }}>Total filas</span>
                                    <p style={{ margin: "2px 0 0", fontSize: "22px", fontWeight: "bold", color: "#173B35" }}>{resultadoValidacion.totalFilas}</p>
                                </div>
                                <div style={{ background: "#EAF5EE", padding: "12px", borderRadius: "6px", textAlign: "center", border: "1px solid #B8DEC3", color: "#1B4332" }}>
                                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "600" }}>Cuentas válidas</span>
                                    <p style={{ margin: "2px 0 0", fontSize: "22px", fontWeight: "bold" }}>{resultadoValidacion.filasValidas.length}</p>
                                </div>
                                <div style={{ 
                                    background: resultadoValidacion.errores.length > 0 ? "#FCEAE8" : "#EAF5EE", 
                                    padding: "12px", 
                                    borderRadius: "6px", 
                                    textAlign: "center",
                                    border: resultadoValidacion.errores.length > 0 ? "1px solid #F3C4BE" : "1px solid #B8DEC3",
                                    color: resultadoValidacion.errores.length > 0 ? "#B3261E" : "#1B4332"
                                }}>
                                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "600" }}>Inconsistencias</span>
                                    <p style={{ margin: "2px 0 0", fontSize: "22px", fontWeight: "bold" }}>{resultadoValidacion.errores.length}</p>
                                </div>
                            </div>

                            {/* Mostrar errores por fila si existen */}
                            {resultadoValidacion.errores.length > 0 ? (
                                <div style={{
                                    border: "1px solid #F3C4BE",
                                    borderRadius: "6px",
                                    background: "#FFF8F7",
                                    padding: "12px",
                                    marginBottom: "14px"
                                }}>
                                    <div style={{ marginBottom: "6px" }}>
                                        <strong style={{ fontSize: "13px", color: "#B3261E" }}>
                                            No se puede importar: Se encontraron {resultadoValidacion.errores.length} inconsistencias
                                        </strong>
                                    </div>
                                    <p style={{ fontSize: "12px", color: "#5F6B67", margin: "0 0 10px" }}>
                                        Corrige estos registros en tu archivo antes de proceder con la importación:
                                    </p>

                                    <div style={{ maxHeight: "180px", overflowY: "auto", border: "1px solid #EAD1CE", borderRadius: "4px" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                            <thead>
                                                <tr style={{ background: "#FCEAE8", textAlign: "left" }}>
                                                    <th style={{ padding: "6px 8px" }}>Fila</th>
                                                    <th style={{ padding: "6px 8px" }}>Código</th>
                                                    <th style={{ padding: "6px 8px" }}>Detalle del error</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {resultadoValidacion.errores.map((err, i) => (
                                                    <tr key={i} style={{ borderTop: "1px solid #F0DCDA" }}>
                                                        <td style={{ padding: "6px 8px", fontWeight: "bold" }}>Fila {err.fila}</td>
                                                        <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{err.codigo}</td>
                                                        <td style={{ padding: "6px 8px", color: "#B3261E" }}>{err.error}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div style={{
                                    border: "1px solid #B8DEC3",
                                    borderRadius: "6px",
                                    background: "#EAF5EE",
                                    padding: "12px 14px",
                                    marginBottom: "14px",
                                    color: "#1B4332",
                                    fontSize: "13px"
                                }}>
                                    <strong style={{ display: "block" }}>Validación completada con éxito</strong>
                                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#2D6A4F" }}>
                                        Todas las {resultadoValidacion.filasValidas.length} cuentas cumplen las reglas contables, tipos válidos, niveles y jerarquías.
                                    </p>
                                </div>
                            )}

                            {/* Previsualización de cuentas válidas y configuración de IVA */}
                            {resultadoValidacion.filasValidas.length > 0 && (
                                <div>
                                    {/* Panel de Configuración de IVA para el Catálogo */}
                                    <div style={{
                                        background: "#F4FBF7",
                                        border: "1px solid #BCE3D0",
                                        borderRadius: "8px",
                                        padding: "14px",
                                        marginBottom: "16px"
                                    }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                                            <div>
                                                <strong style={{ fontSize: "14px", color: "#173B35" }}>
                                                    ⚙️ Configuración de IVA Automático (13%)
                                                </strong>
                                                <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "#3B5C50" }}>
                                                    Elige si este catálogo usa cálculo automático de IVA y confirma qué cuentas reciben el crédito y débito fiscal.
                                                </p>
                                            </div>
                                            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "600", color: "#1B4332", cursor: "pointer" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={habilitarIvaAutomatico}
                                                    onChange={e => setHabilitarIvaAutomatico(e.target.checked)}
                                                    style={{ accentColor: "#1B4332" }}
                                                />
                                                Habilitar cálculo de IVA
                                            </label>
                                        </div>

                                        {habilitarIvaAutomatico ? (
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
                                                <div>
                                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#173B35", marginBottom: "4px" }}>
                                                        Cuenta para IVA Crédito Fiscal (Compras y Gastos):
                                                    </label>
                                                    <select
                                                        value={cuentaCreditoSeleccionada}
                                                        onChange={e => setCuentaCreditoSeleccionada(e.target.value)}
                                                        style={{ width: "100%", padding: "6px 8px", borderRadius: "5px", border: "1px solid #A2CDBD", fontSize: "12px", background: "#FFF" }}
                                                    >
                                                        <option value="">-- Sin cuenta asignada --</option>
                                                        {resultadoValidacion.filasValidas.map(f => (
                                                            <option key={`cred-${f.codigo}`} value={f.codigo}>
                                                                {f.codigo} - {f.nombre}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#173B35", marginBottom: "4px" }}>
                                                        Cuenta para IVA Débito Fiscal (Ventas):
                                                    </label>
                                                    <select
                                                        value={cuentaDebitoSeleccionada}
                                                        onChange={e => setCuentaDebitoSeleccionada(e.target.value)}
                                                        style={{ width: "100%", padding: "6px 8px", borderRadius: "5px", border: "1px solid #A2CDBD", fontSize: "12px", background: "#FFF" }}
                                                    >
                                                        <option value="">-- Sin cuenta asignada --</option>
                                                        {resultadoValidacion.filasValidas.map(f => (
                                                            <option key={`deb-${f.codigo}`} value={f.codigo}>
                                                                {f.codigo} - {f.nombre}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: "12px", color: "#667", background: "#FFF", padding: "8px 12px", borderRadius: "4px", border: "1px solid #E0E5E2" }}>
                                                ℹ️ El cálculo automático de IVA estará desactivado para este catálogo. Las partidas se registrarán sin desglosar IVA automáticamente.
                                            </div>
                                        )}
                                    </div>

                                    {resultadoValidacion.avisos && resultadoValidacion.avisos.length > 0 && (
                                        <div style={{
                                            border: "1px solid #C5E0D8",
                                            borderRadius: "6px",
                                            background: "#F2FAF7",
                                            padding: "10px 14px",
                                            marginBottom: "12px",
                                            color: "#1B4332",
                                            fontSize: "12.5px"
                                        }}>
                                            <strong style={{ display: "block", marginBottom: "4px" }}>
                                                ✨ Ajustes automáticos aplicados en modo flexible ({resultadoValidacion.avisos.length}):
                                            </strong>
                                            <div style={{ maxHeight: "90px", overflowY: "auto", fontSize: "11.5px", color: "#2D6A4F" }}>
                                                {resultadoValidacion.avisos.slice(0, 10).map((aviso, idx) => (
                                                    <div key={idx} style={{ padding: "2px 0" }}>• {aviso}</div>
                                                ))}
                                                {resultadoValidacion.avisos.length > 10 && (
                                                    <div style={{ fontStyle: "italic", marginTop: "3px" }}>
                                                        ... y {resultadoValidacion.avisos.length - 10} avisos más resueltos automáticamente.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                        <span style={{ fontSize: "12.5px", fontWeight: "600", color: "#173B35" }}>
                                            Previsualización y asignación de IVA ({Math.min(resultadoValidacion.filasValidas.length, 12)} de {resultadoValidacion.filasValidas.length} cuentas):
                                        </span>
                                        {habilitarIvaAutomatico && (
                                            <span style={{ fontSize: "11.5px", color: "#2D6A4F" }}>
                                                {cuentasConIvaMarcadas.size} cuenta(s) con IVA marcado
                                            </span>
                                        )}
                                    </div>

                                    <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #DDE3E0", borderRadius: "4px" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                            <thead>
                                                <tr style={{ background: "#EAF5EE", color: "#173B35", textAlign: "left", position: "sticky", top: 0, zIndex: 1 }}>
                                                    <th style={{ padding: "6px 8px" }}>Código</th>
                                                    <th style={{ padding: "6px 8px" }}>Nombre</th>
                                                    <th style={{ padding: "6px 8px" }}>Tipo</th>
                                                    <th style={{ padding: "6px 8px" }}>Nivel</th>
                                                    <th style={{ padding: "6px 8px" }}>Padre</th>
                                                    <th style={{ padding: "6px 8px" }}>Asientos</th>
                                                    {habilitarIvaAutomatico && (
                                                        <th style={{ padding: "6px 8px", textAlign: "center", minWidth: "80px" }}>Lleva IVA</th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {resultadoValidacion.filasValidas.slice(0, 12).map((f, i) => {
                                                    const esMarcada = cuentasConIvaMarcadas.has(String(f.codigo));
                                                    return (
                                                        <tr key={i} style={{ borderTop: "1px solid #EEE", background: esMarcada ? "#F9FCFA" : "transparent" }}>
                                                            <td style={{ padding: "5px 8px", fontFamily: "var(--mono)", fontWeight: "600", color: "#1B4332" }}>{f.codigo}</td>
                                                            <td style={{ padding: "5px 8px", color: "#1C2321" }}>{f.nombre}</td>
                                                            <td style={{ padding: "5px 8px" }}>{f.tipo}</td>
                                                            <td style={{ padding: "5px 8px" }}>{f.nivel}</td>
                                                            <td style={{ padding: "5px 8px" }}>{f.cuenta_padre_codigo || "-"}</td>
                                                            <td style={{ padding: "5px 8px", color: f.permite_movimientos ? "#2E7D32" : "#667" }}>
                                                                {f.permite_movimientos ? "Sí" : "No"}
                                                            </td>
                                                            {habilitarIvaAutomatico && (
                                                                <td style={{ padding: "5px 8px", textAlign: "center" }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={esMarcada}
                                                                        onChange={() => alternarCuentaIva(f.codigo)}
                                                                        title={esMarcada ? "Esta cuenta calculará IVA en Nuevo Asiento" : "Marcar para que aplique IVA"}
                                                                        style={{ accentColor: "#1B4332", cursor: "pointer" }}
                                                                    />
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer" style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #DDE3E0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                        type="button"
                        className="button-secondary"
                        onClick={alCerrar}
                        disabled={importando}
                    >
                        Cerrar
                    </button>

                    <button
                        type="button"
                        className="button-primary"
                        onClick={manejarConfirmarImportacion}
                        disabled={!resultadoValidacion || !resultadoValidacion.esValido || importando || resultadoValidacion.filasValidas.length === 0}
                    >
                        {importando 
                            ? "Importando en bloque..." 
                            : `Confirmar e importar (${resultadoValidacion?.filasValidas.length || 0} cuentas)`}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ModalImportarCatalogo;
