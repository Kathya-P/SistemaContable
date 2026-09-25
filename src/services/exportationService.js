import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

const COLOR_PRIMARIO = [27, 67, 50];
const COLOR_ENCABEZADO = [226, 239, 231];

function crearLibro(nombre, hojas) {
    const libro = XLSX.utils.book_new();
    hojas.forEach(({ nombreHoja, filas, anchos, columnasMoneda = [], merges = [] }) => {
        const filasConEmpresa = filas;
        const hoja = XLSX.utils.aoa_to_sheet(filasConEmpresa);
        const formatoMoneda = '"$"#,##0.00;[Red]-"$"#,##0.00';
        columnasMoneda.forEach(columna => {
            for (let fila = 0; fila < filasConEmpresa.length; fila += 1) {
                const referencia = XLSX.utils.encode_cell({ r: fila, c: columna });
                const celda = hoja[referencia];
                if (celda && typeof celda.v === "number") {
                    celda.t = "n";
                    celda.z = formatoMoneda;
                    celda.s = { numFmt: formatoMoneda };
                }
            }
        });
        if (anchos) hoja["!cols"] = anchos.map(ancho => ({ wch: ancho }));
        if (merges.length) hoja["!merges"] = merges.map(merge => ({
            s: { r: merge.s.r + 1, c: merge.s.c },
            e: { r: merge.e.r + 1, c: merge.e.c }
        }));
        XLSX.utils.book_append_sheet(libro, hoja, nombreHoja.slice(0, 31));
    });
    XLSX.writeFile(libro, nombre, { cellStyles: true });
}

function celdaMoneda(valor) {
    return Number(valor || 0);
}

function exportarLibroExcel(nombre, hojas, empresa = "Empresa") {
    crearLibro(`${limpiarNombreArchivo(nombre)}.xlsx`, hojas.map(hoja => ({
        ...hoja,
        filas: [[empresa], ...hoja.filas]
    })));
}

function descargarArchivoExcel(buffer, nombre) {
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
}

function crearGraficoDashboardPNG(ingresos, costos) {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 430;
    const contexto = canvas.getContext("2d");
    const maximo = Math.max(Number(ingresos) || 0, Number(costos) || 0, 1);
    const baseY = 330;
    const altoMaximo = 245;
    const barras = [
        { etiqueta: "Ingresos netos", valor: Number(ingresos) || 0, color: "#059669", x: 210 },
        { etiqueta: "Costo de ventas", valor: Number(costos) || 0, color: "#c16b6b", x: 550 }
    ];

    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.fillStyle = "#1b4332";
    contexto.font = "bold 26px Arial";
    contexto.fillText("Actividad financiera", 40, 45);
    contexto.strokeStyle = "#cde1d7";
    contexto.lineWidth = 2;
    contexto.beginPath();
    contexto.moveTo(80, baseY);
    contexto.lineTo(820, baseY);
    contexto.stroke();

    barras.forEach(barra => {
        const alto = Math.max((barra.valor / maximo) * altoMaximo, 4);
        contexto.fillStyle = barra.color;
        contexto.fillRect(barra.x, baseY - alto, 140, alto);
        contexto.fillStyle = "#1b4332";
        contexto.font = "bold 20px Arial";
        contexto.textAlign = "center";
        contexto.fillText(formatearMoneda(barra.valor), barra.x + 70, baseY - alto - 14);
        contexto.font = "18px Arial";
        contexto.fillText(barra.etiqueta, barra.x + 70, baseY + 38);
    });

    return canvas.toDataURL("image/png");
}

function formatearFecha(valor) {
    if (!valor) return "Sin fecha";
    const partes = String(valor).slice(0, 10).split("-");
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : String(valor);
}

function formatearMoneda(valor) {
    return `$ ${Number(valor || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function limpiarNombreArchivo(nombre) {
    return String(nombre).replace(/[^a-z0-9_-]/gi, "_");
}

function crearDocumento(titulo, subtitulo, empresa = "Empresa") {
    const documento = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    documento.setProperties({ title: titulo, subject: subtitulo, creator: "ContaCabal" });
    documento.setFont("helvetica", "bold");
    documento.setFontSize(16);
    documento.setTextColor(...COLOR_PRIMARIO);
    documento.text(empresa, 14, 12);
    documento.setFontSize(14);
    documento.text(titulo, 14, 19);
    documento.setFont("helvetica", "normal");
    documento.setFontSize(9);
    documento.setTextColor(90, 90, 90);
    documento.text(subtitulo, 14, 26);
    documento.text(`Generado: ${new Date().toLocaleString("es-SV")}`, 283, 12, { align: "right" });
    return documento;
}

function agregarPieDePagina(documento) {
    const paginas = documento.getNumberOfPages();
    for (let pagina = 1; pagina <= paginas; pagina += 1) {
        documento.setPage(pagina);
        documento.setFont("helvetica", "normal");
        documento.setFontSize(8);
        documento.setTextColor(110, 110, 110);
        documento.text(`Pagina ${pagina} de ${paginas}`, 283, 202, { align: "right" });
    }
}

function agregarTabla(documento, opciones) {
    autoTable(documento, {
        theme: "grid",
        styles: {
            font: "helvetica",
            fontSize: 8,
            cellPadding: 2.2,
            textColor: [35, 35, 35]
        },
        headStyles: {
            fillColor: COLOR_PRIMARIO,
            textColor: [255, 255, 255],
            fontStyle: "bold"
        },
        alternateRowStyles: { fillColor: [248, 250, 249] },
        margin: { left: 14, right: 14 },
        ...opciones
    });
}

function obtenerFilasDiario(asientos = []) {
    const filas = [];

    for (const asiento of asientos) {
        const detalles = asiento.detalle_asientos || [];
        detalles.forEach((detalle, indice) => {
            const debe = Number(detalle.debe || 0);
            const haber = Number(detalle.haber || 0);
            filas.push([
                indice === 0 ? formatearFecha(asiento.fecha) : "",
                indice === 0 ? asiento.numero_partida || "" : "",
                `${detalle.cuentas?.codigo || ""} - ${detalle.cuentas?.nombre || "Cuenta"}`,
                debe + haber ? formatearMoneda(debe + haber) : "",
                debe ? formatearMoneda(debe) : "",
                haber ? formatearMoneda(haber) : ""
            ]);
        });

        const totalDebe = detalles.reduce((total, detalle) => total + Number(detalle.debe || 0), 0);
        const totalHaber = detalles.reduce((total, detalle) => total + Number(detalle.haber || 0), 0);
        filas.push(["", "", `C/ ${asiento.concepto || "Sin concepto"}`, "", "", ""]);
        filas.push(["", "", `Total partida ${asiento.numero_partida || ""}`, "", formatearMoneda(totalDebe), formatearMoneda(totalHaber)]);
    }

    return filas;
}

export function exportarLibroDiarioPDF({ asientos = [], desde, hasta, empresa = "Empresa" } = {}) {
    const documento = crearDocumento(
        "Libro Diario",
        `Registro cronologico | Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`, empresa
    );
    const sumatoriaDebe = asientos.reduce((total, asiento) => total + (asiento.detalle_asientos || []).reduce((subtotal, detalle) => subtotal + Number(detalle.debe || 0), 0), 0);
    const sumatoriaHaber = asientos.reduce((total, asiento) => total + (asiento.detalle_asientos || []).reduce((subtotal, detalle) => subtotal + Number(detalle.haber || 0), 0), 0);

    agregarTabla(documento, {
        startY: 28,
        head: [["Fecha", "N. partida", "Cuenta", "Parcial", "Debe", "Haber"]],
        body: obtenerFilasDiario(asientos),
        foot: [["", "", "Sumatoria general", "", formatearMoneda(sumatoriaDebe), formatearMoneda(sumatoriaHaber)]],
        footStyles: { fillColor: COLOR_ENCABEZADO, textColor: COLOR_PRIMARIO, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 24 }, 3: { cellWidth: 28 }, 4: { cellWidth: 30 }, 5: { cellWidth: 30 } }
    });

    agregarPieDePagina(documento);
    documento.save(`Libro_Diario_${limpiarNombreArchivo(desde || "periodo")}.pdf`);
}

function obtenerMovimientos(movimientosPorCuenta, cuentaId) {
    if (movimientosPorCuenta instanceof Map) {
        return movimientosPorCuenta.get(String(cuentaId))?.movimientos || [];
    }
    return movimientosPorCuenta?.[String(cuentaId)]?.movimientos || [];
}

export function exportarLibroMayorPDF({ filas = [], totalesComprobacion = {}, movimientosPorCuenta, desde, hasta, empresa = "Empresa" } = {}) {
    const documento = crearDocumento(
        "Libro Mayor",
        `Balance de comprobacion y detalle por cuenta | Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`, empresa
    );

    agregarTabla(documento, {
        startY: 28,
        head: [["Codigo", "Cuenta", "Debe", "Haber", "Saldo deudor", "Saldo acreedor"]],
        body: filas.map(fila => [
            fila.codigo || "",
            fila.nombre || "Cuenta sin nombre",
            formatearMoneda(fila.total_debe),
            formatearMoneda(fila.total_haber),
            formatearMoneda(fila.saldo_deudor),
            formatearMoneda(fila.saldo_acreedor)
        ]),
        foot: [[
            "",
            "Comprobacion",
            formatearMoneda(totalesComprobacion.total_debe),
            formatearMoneda(totalesComprobacion.total_haber),
            formatearMoneda(totalesComprobacion.saldo_deudor),
            formatearMoneda(totalesComprobacion.saldo_acreedor)
        ]],
        footStyles: { fillColor: COLOR_ENCABEZADO, textColor: COLOR_PRIMARIO, fontStyle: "bold" }
    });

    for (const fila of filas) {
        const movimientos = obtenerMovimientos(movimientosPorCuenta, fila.cuenta_id);
        let inicio = documento.lastAutoTable.finalY + 9;
        if (inicio > 185) {
            documento.addPage();
            inicio = 20;
        }
        documento.setFont("helvetica", "bold");
        documento.setFontSize(10);
        documento.setTextColor(...COLOR_PRIMARIO);
        documento.text(`${fila.codigo || ""} - ${fila.nombre || "Cuenta"}`, 14, inicio);

        agregarTabla(documento, {
            startY: inicio + 3,
            head: [["Partida", "Fecha", "Cuenta detalle", "Debe", "Haber"]],
            body: movimientos.length
                ? movimientos.map(movimiento => [
                    movimiento.numero_partida || "",
                    formatearFecha(movimiento.fecha),
                    movimiento.cuenta_codigo
                        ? `${movimiento.cuenta_codigo} - ${movimiento.cuenta_nombre}`
                        : `${fila.codigo || ""} - ${fila.nombre || "Cuenta"}`,
                    formatearMoneda(movimiento.debe),
                    formatearMoneda(movimiento.haber)
                ])
                : [["", "", "Sin movimientos registrados", "", ""]],
            columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 25 }, 3: { cellWidth: 35 }, 4: { cellWidth: 35 } }
        });
    }

    agregarPieDePagina(documento);
    documento.save(`Libro_Mayor_${limpiarNombreArchivo(desde || "periodo")}.pdf`);
}

function filasBalance(seccion, grupo, nivel = 0) {
    if (!grupo) return [];
    const filas = [];
    const cuentas = grupo.cuentas || [];
    if (seccion) {
        filas.push({ nombre: seccion, monto: "", nivel: nivel - 1, tipo: "seccion" });
    }
    cuentas.forEach(cuenta => {
        filas.push({
            nombre: `${"  ".repeat(Math.max(0, nivel))}${cuenta.codigo || ""} - ${cuenta.concepto || cuenta.nombre || "Cuenta"}`,
            monto: formatearMoneda(cuenta.monto),
            nivel,
            tipo: "cuenta"
        });
        if (cuenta.subcuentas?.length) {
            cuenta.subcuentas.forEach(sub => filas.push({
                nombre: `${"  ".repeat(nivel + 1)}${sub.codigo || ""} - ${sub.concepto || sub.nombre || "Subcuenta"}`,
                monto: formatearMoneda(sub.monto),
                nivel: nivel + 1,
                tipo: "subcuenta"
            }));
        }
    });
    return filas;
}

function filasBalanceColumna(grupos) {
    return grupos.flatMap(({ titulo, grupo }) => filasBalance(titulo, grupo));
}

function filasBalanceExcel(seccion, grupo, nivel = 0) {
    if (!grupo) return [];
    const filas = [];
    if (seccion) filas.push({ nombre: seccion, monto: "", tipo: "seccion" });
    (grupo.cuentas || []).forEach(cuenta => {
        filas.push({
            nombre: `${"  ".repeat(Math.max(0, nivel))}${cuenta.codigo || ""} - ${cuenta.concepto || cuenta.nombre || "Cuenta"}`,
            monto: Number(cuenta.monto || 0),
            tipo: "cuenta"
        });
        (cuenta.subcuentas || []).forEach(sub => filas.push({
            nombre: `${"  ".repeat(nivel + 1)}${sub.codigo || ""} - ${sub.concepto || sub.nombre || "Subcuenta"}`,
            monto: Number(sub.monto || 0),
            tipo: "subcuenta"
        }));
    });
    return filas;
}

export function exportarBalanceGeneralPDF({ balance, desde, hasta, empresa = "Empresa" } = {}) {
    const documento = crearDocumento(
        "Balance General",
        `Activos frente a Pasivos y Capital | Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`, empresa
    );
    const activo = balance?.activo || {};
    const pasivo = balance?.pasivo || {};
    const capital = balance?.capital || {};
    const izquierda = [
        ...filasBalanceColumna([
            { titulo: "ACTIVO CORRIENTE", grupo: activo.corriente },
            { titulo: "ACTIVO NO CORRIENTE", grupo: activo.noCorriente }
        ]),
        { nombre: "TOTAL DEL ACTIVO", monto: formatearMoneda(activo.total), tipo: "total" }
    ];
    const derecha = [
        ...filasBalanceColumna([
            { titulo: "PASIVO CORRIENTE", grupo: pasivo.corriente },
            { titulo: "PASIVO NO CORRIENTE", grupo: pasivo.noCorriente }
        ]),
        { nombre: "TOTAL PASIVOS", monto: formatearMoneda(pasivo.total), tipo: "total" },
        ...filasBalance("PATRIMONIO NETO", capital),
        { nombre: "TOTAL PASIVO Y PATRIMONIO", monto: formatearMoneda(balance?.totalPasivoCapital ?? Number(pasivo.total || 0) + Number(capital.total || 0)), tipo: "total" }
    ];
    const cantidadFilas = Math.max(izquierda.length, derecha.length);
    const cuerpo = Array.from({ length: cantidadFilas }, (_, indice) => {
        const izquierdaFila = izquierda[indice] || {};
        const derechaFila = derecha[indice] || {};
        return [izquierdaFila.nombre || "", izquierdaFila.monto || "", derechaFila.nombre || "", derechaFila.monto || ""];
    });

    agregarTabla(documento, {
        startY: 28,
        head: [["ACTIVOS", "Monto", "PASIVOS Y CAPITAL", "Monto"]],
        body: cuerpo,
        didParseCell: datos => {
            if (datos.section === "body" && (izquierda[datos.row.index]?.tipo === "seccion" || derecha[datos.row.index]?.tipo === "seccion")) {
                datos.cell.styles.fontStyle = "bold";
                datos.cell.styles.textColor = COLOR_PRIMARIO;
                datos.cell.styles.fillColor = COLOR_ENCABEZADO;
            }
            if (datos.section === "body" && (izquierda[datos.row.index]?.tipo === "total" || derecha[datos.row.index]?.tipo === "total")) {
                datos.cell.styles.fontStyle = "bold";
            }
        },
        columnStyles: { 0: { cellWidth: 105 }, 1: { cellWidth: 35, halign: "right" }, 2: { cellWidth: 105 }, 3: { cellWidth: 35, halign: "right" } }
    });

    const liquidacionIva = balance?.liquidacionIva;
    let siguienteY = (documento.lastAutoTable?.finalY || 28) + 12;
    if (liquidacionIva) {
        if (siguienteY > 165) {
            documento.addPage();
            siguienteY = 20;
        }

        documento.setFont("helvetica", "bold");
        documento.setFontSize(11);
        documento.setTextColor(...COLOR_PRIMARIO);
        documento.text("LIQUIDACION DE IVA", 14, siguienteY);

        const resultadoIva = Number(liquidacionIva.impuestoAPagar || 0) > 0
            ? "Impuesto a pagar"
            : "Remanente a favor";
        agregarTabla(documento, {
            startY: siguienteY + 4,
            head: [["Concepto", "Monto"]],
            body: [
                ["IVA credito fiscal (compras)", formatearMoneda(liquidacionIva.ivaCreditoFiscal)],
                ["IVA debito fiscal (ventas)", formatearMoneda(liquidacionIva.ivaDebitoFiscal)],
                [resultadoIva, formatearMoneda(Number(liquidacionIva.impuestoAPagar || 0) > 0 ? liquidacionIva.impuestoAPagar : liquidacionIva.remanenteAFavor)]
            ],
            columnStyles: { 0: { cellWidth: 180 }, 1: { cellWidth: 50, halign: "right" } }
        });
        siguienteY = documento.lastAutoTable.finalY + 18;
    }

    if (siguienteY > 175) {
        documento.addPage();
        siguienteY = 25;
    }

    documento.setFont("helvetica", "bold");
    documento.setFontSize(11);
    documento.setTextColor(...COLOR_PRIMARIO);
    documento.text("FIRMAS", 14, siguienteY);

    const firmas = [
        ["Representante Legal", "Gerencia General"],
        ["Contador General", "Reg. Profesional N° 45892"],
        ["Auditor Externo", "Dictamen e Informe Fiscal"]
    ];
    firmas.forEach(([nombre, cargo], indice) => {
        const x = 55 + indice * 90;
        documento.setDrawColor(148, 163, 184);
        documento.line(x - 30, siguienteY + 22, x + 30, siguienteY + 22);
        documento.setFont("helvetica", "bold");
        documento.setFontSize(9);
        documento.setTextColor(25, 25, 25);
        documento.text(nombre, x, siguienteY + 29, { align: "center" });
        documento.setFont("helvetica", "normal");
        documento.setFontSize(8);
        documento.setTextColor(100, 116, 139);
        documento.text(cargo, x, siguienteY + 36, { align: "center" });
    });

    agregarPieDePagina(documento);
    documento.save(`Balance_General_${limpiarNombreArchivo(hasta || "periodo")}.pdf`);
}

export function exportarEstadoResultadosPDF({ filas = [], empresa = "Empresa", desde, hasta } = {}) {
    const documento = crearDocumento("Estado de Resultados", `Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`, empresa);
    agregarTabla(documento, {
        startY: 28,
        head: [["", "Concepto", "Monto"]],
        body: filas.map(fila => fila.encabezado
            ? [{ content: fila.encabezado, colSpan: 3, styles: { fontStyle: "bold", fillColor: COLOR_ENCABEZADO, textColor: COLOR_PRIMARIO } }]
            : [fila.marca || "", fila.concepto || "", formatearMoneda(fila.monto)]),
        columnStyles: { 0: { cellWidth: 20 }, 2: { cellWidth: 45, halign: "right" } }
    });
    agregarPieDePagina(documento);
    documento.save(`Estado_Resultados_${limpiarNombreArchivo(hasta || "periodo")}.pdf`);
}

export function exportarCatalogoCuentasPDF({ cuentas = [], empresa = "Empresa" } = {}) {
    const documento = crearDocumento("Catalogo de Cuentas", `${cuentas.length} cuentas registradas`, empresa);
    const cuentasPorId = new Map(cuentas.map(cuenta => [String(cuenta.id), cuenta]));
    agregarTabla(documento, {
        startY: 28,
        head: [["Codigo", "Cuenta", "Nivel", "Cuenta padre"]],
        body: cuentas.map(cuenta => [
            cuenta.codigo || "",
            cuenta.nombre || "",
            cuenta.nivel ?? "-",
            cuentasPorId.get(String(cuenta.cuenta_padre_id))?.nombre || "Cuenta principal"
        ])
    });
    agregarPieDePagina(documento);
    documento.save("Catalogo_de_Cuentas.pdf");
}

export function exportarKardexPDF({ filas = [], totales = {}, desde, hasta, empresa = "Empresa" } = {}) {
    const documento = crearDocumento("Kardex de Inventario", `Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`, empresa);
    agregarTabla(documento, {
        startY: 28,
        head: [
            [
                { content: "Asiento", rowSpan: 2 },
                { content: "Fecha", rowSpan: 2 },
                { content: "Tipo de movimiento", rowSpan: 2 },
                { content: "Cuenta", rowSpan: 2 },
                { content: "Concepto", rowSpan: 2 },
                { content: "UNIDADES", colSpan: 3 },
                { content: "COSTO", colSpan: 2 },
                { content: "SALDOS", colSpan: 3 }
            ],
            ["Entrada", "Salida", "Existencias", "Costo unitario", "PEPS", "Deudor", "Acreedor", "Saldo"]
        ],
        body: filas.map(fila => [
            fila.asiento || "", fila.fechaTexto || formatearFecha(fila.fecha), obtenerEtiquetaMovimiento(fila.tipo), fila.cuenta || "", fila.concepto || "",
            fila.entrada ?? "", fila.salida ?? "", fila.existencias ?? "", formatearMoneda(fila.costo_unitario), formatearMoneda(fila.peps),
            formatearMoneda(fila.deudor), formatearMoneda(fila.acreedor), formatearMoneda(fila.saldo)
        ]),
        foot: [["", "", "", "", "Totales", totales.total_entradas ?? "", totales.total_salidas ?? "", totales.existencia_final ?? "", "", "", formatearMoneda(totales.total_deudor), formatearMoneda(totales.total_acreedor), formatearMoneda(totales.saldo_final)]],
        footStyles: { fillColor: COLOR_ENCABEZADO, textColor: COLOR_PRIMARIO, fontStyle: "bold" },
        styles: { fontSize: 6.5 },
        columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 21 }, 2: { cellWidth: 29 }, 5: { cellWidth: 16 }, 6: { cellWidth: 16 }, 7: { cellWidth: 20 }, 8: { cellWidth: 23 }, 9: { cellWidth: 23 }, 10: { cellWidth: 22 }, 11: { cellWidth: 22 }, 12: { cellWidth: 23 } }
    });
    agregarPieDePagina(documento);
    documento.save(`Kardex_${limpiarNombreArchivo(desde || "periodo")}.pdf`);
}

function obtenerEtiquetaMovimiento(tipo) {
    const etiquetas = {
        INVENTARIO_INICIAL: "Inventario inicial",
        COMPRA: "Compra / entrada",
        VENTA: "Venta / salida",
        DEVOLUCION_COMPRA: "Devolucion de compra",
        DEVOLUCION_VENTA: "Devolucion de venta"
    };
    return etiquetas[tipo] || tipo || "Movimiento";
}

export function exportarUsuariosPDF({ usuarios = [], empresa = "Empresa" } = {}) {
    const documento = crearDocumento("Usuarios de la Empresa", "Listado de usuarios y estado", empresa);
    agregarTabla(documento, {
        startY: 28,
        head: [["Nombre", "Correo", "Rol", "Estado"]],
        body: usuarios.map(usuario => [usuario.nombre || "", usuario.correo || "", usuario.rol || "", usuario.estado ? "Activo" : "Inactivo"])
    });
    agregarPieDePagina(documento);
    documento.save("Usuarios_de_la_Empresa.pdf");
}

export function exportarAuditoriaPDF({ logs = [], empresa = "Empresa" } = {}) {
    const documento = crearDocumento("Auditoria del Sistema", "Registro de operaciones y accesos", empresa);
    agregarTabla(documento, {
        startY: 28,
        head: [["Fecha / Hora", "Usuario", "Acción", "Entidad", "Descripción", "Resultado"]],
        body: logs.map(log => [
            log.fecha_hora ? new Date(log.fecha_hora).toLocaleString("es-ES") : "-",
            log.usuario_nombre || "",
            log.tipo_accion || "",
            log.entidad_afectada || "",
            log.descripcion || "",
            log.resultado || ""
        ]),
        styles: { fontSize: 7 }
    });
    agregarPieDePagina(documento);
    documento.save("Auditoria_del_Sistema.pdf");
}

export function exportarNuevoAsientoPDF({ detalles = [], cuentasPorId, fecha, concepto, empresa = "Empresa" } = {}) {
    const documento = crearDocumento("Asiento Contable", `Fecha: ${formatearFecha(fecha)} | ${concepto || "Sin concepto"}`, empresa);
    const mapa = cuentasPorId instanceof Map ? cuentasPorId : new Map();
    agregarTabla(documento, {
        startY: 28,
        head: [["Cuenta", "Subcuenta", "Parcial", "Debe", "Haber"]],
        body: detalles.map(detalle => {
            const cuenta = mapa.get(String(detalle.cuenta_id));
            return [cuenta?.nombre || "Cuenta principal", cuenta ? `${cuenta.codigo} - ${cuenta.nombre}` : "", "", formatearMoneda(detalle.debe), formatearMoneda(detalle.haber)];
        })
    });
    agregarPieDePagina(documento);
    documento.save(`Asiento_${limpiarNombreArchivo(fecha || "nuevo")}.pdf`);
}

export function exportarTablaComparativaPDF({ vistaIzquierda, vistaDerecha, rangoIzquierda, rangoDerecha, usuario, tablasIzquierda = [], tablasDerecha = [], empresa = "Empresa" } = {}) {
    const documento = crearDocumento("Tabla Comparativa", "Comparacion de reportes contables", empresa);
    let siguienteY = 30;
    [[vistaIzquierda, rangoIzquierda, tablasIzquierda], [vistaDerecha, rangoDerecha, tablasDerecha]].forEach(([vista, rango, tablas], indice) => {
        if (indice > 0) {
            documento.addPage();
            siguienteY = 20;
        }
        documento.setFont("helvetica", "bold");
        documento.setFontSize(12);
        documento.setTextColor(...COLOR_PRIMARIO);
        documento.text(`${indice === 0 ? "COLUMNA IZQUIERDA" : "COLUMNA DERECHA"}: ${vista || "No seleccionada"}`, 14, siguienteY);
        documento.setFont("helvetica", "normal");
        documento.setFontSize(8);
        documento.setTextColor(90, 90, 90);
        documento.text(`Periodo: ${rango || ""} | Usuario: ${usuario || "Sistema"}`, 14, siguienteY + 6);
        siguienteY += 12;

        if (!tablas.length) {
            agregarTabla(documento, { startY: siguienteY, head: [["Información"]], body: [["No hay una tabla cargada para exportar."]] });
            return;
        }
        tablas.forEach(tabla => {
            agregarTabla(documento, {
                startY: siguienteY,
                head: [tabla[0] || ["Información"]],
                body: tabla.slice(1),
                styles: { fontSize: 6.5 },
                margin: { left: 14, right: 14 }
            });
            siguienteY = documento.lastAutoTable.finalY + 8;
            if (siguienteY > 185) {
                documento.addPage();
                siguienteY = 20;
            }
        });
    });
    agregarPieDePagina(documento);
    documento.save("Tabla_Comparativa.pdf");
}

function dibujarTarjeta(documento, x, y, ancho, titulo, valor) {
    documento.setDrawColor(205, 225, 215);
    documento.setFillColor(248, 252, 249);
    documento.roundedRect(x, y, ancho, 22, 2, 2, "FD");
    documento.setFont("helvetica", "normal");
    documento.setFontSize(9);
    documento.setTextColor(70, 90, 80);
    documento.text(titulo, x + 5, y + 8);
    documento.setFont("helvetica", "bold");
    documento.setFontSize(13);
    documento.setTextColor(...COLOR_PRIMARIO);
    documento.text(formatearMoneda(valor), x + 5, y + 17);
}

export function exportarDashboardPDF({ activos = 0, pasivos = 0, ingresos = 0, costos = 0, movimientos = [], periodo, empresa = "Empresa" } = {}) {
    const documento = crearDocumento("Dashboard Ejecutivo", `Resumen contable | ${periodo || "Periodo actual"}`, empresa);
    const tarjetas = [
        ["Activos", activos],
        ["Pasivos", pasivos],
        ["Ingresos netos", ingresos],
        ["Costo de ventas", costos]
    ];
    tarjetas.forEach(([titulo, valor], indice) => dibujarTarjeta(documento, 14 + indice * 67, 30, 61, titulo, valor));

    const maximo = Math.max(Number(ingresos) || 0, Number(costos) || 0, 1);
    const baseX = 28;
    const baseY = 127;
    const altura = 42;
    const anchoBarra = 30;
    documento.setFont("helvetica", "bold");
    documento.setFontSize(11);
    documento.setTextColor(...COLOR_PRIMARIO);
    documento.text("Actividad financiera", 14, 68);
    documento.setDrawColor(205, 225, 215);
    documento.line(14, baseY, 145, baseY);
    [["Ingresos netos", ingresos, [5, 150, 105]], ["Costo de ventas", costos, [190, 105, 105]]].forEach(([etiqueta, valor, color], indice) => {
        const alto = Math.max((Number(valor) / maximo) * altura, 2);
        const x = baseX + indice * 70;
        documento.setFillColor(...color);
        documento.rect(x, baseY - alto, anchoBarra, alto, "F");
        documento.setFont("helvetica", "bold");
        documento.setFontSize(8);
        documento.setTextColor(50, 50, 50);
        documento.text(formatearMoneda(valor), x + anchoBarra / 2, baseY - alto - 3, { align: "center" });
        documento.setFont("helvetica", "normal");
        documento.text(etiqueta, x + anchoBarra / 2, baseY + 9, { align: "center" });
    });

    agregarTabla(documento, {
        startY: 145,
        head: [["Fecha", "Comentario", "N. partida"]],
        body: movimientos.map(asiento => [formatearFecha(asiento.fecha), `C/ ${asiento.concepto || "Sin concepto"}`, asiento.numero_partida || ""]),
        columnStyles: { 0: { cellWidth: 35 }, 2: { cellWidth: 35 } }
    });
    agregarPieDePagina(documento);
    documento.save("Dashboard_Ejecutivo.pdf");
}

function obtenerNombrePeriodo(opcion) {
    const nombres = { hoy: "Día", mes: "Mes", trimestre: "Trimestre", anio: "Año", personalizado: "Personalizado" };
    return nombres[opcion] || "Periodo seleccionado";
}

export function exportarRatiosPDF({ secciones = {}, desde, hasta, opcionRapida, empresa = "Empresa" } = {}) {
    const documento = crearDocumento("Ratios Financieros", `${obtenerNombrePeriodo(opcionRapida)} | ${formatearFecha(desde)} al ${formatearFecha(hasta)}`, empresa);
    const filas = [];
    const seccionLiquidez = secciones.liquidez;
    if (seccionLiquidez?.ratios?.length) {
        filas.push([{ content: seccionLiquidez.titulo || "Liquidez", colSpan: 5, styles: { fontStyle: "bold", fillColor: COLOR_ENCABEZADO, textColor: COLOR_PRIMARIO } }]);
        seccionLiquidez.ratios.forEach(ratio => {
            filas.push([
                ratio.nombre || "",
                ratio.formato || "",
                ratio.estado || "",
                ratio.rangoSaludable || "",
                ratio.interpretacion || ""
            ]);
        });
    }
    agregarTabla(documento, {
        startY: 28,
        head: [["Ratio de liquidez", "Valor", "Estado", "Rango saludable", "Interpretacion"]],
        body: filas,
        styles: { fontSize: 7 },
        columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 25 }, 2: { cellWidth: 25 }, 3: { cellWidth: 35 }, 4: { cellWidth: 130 } }
    });
    agregarPieDePagina(documento);
    documento.save(`Ratios_Financieros_${limpiarNombreArchivo(hasta || "periodo")}.pdf`);
}

function filasDiarioExcel(asientos = []) {
    const filas = [["Fecha", "Código", "N. partida", "Cuenta", "Parcial", "Debe", "Haber"]];
    asientos.forEach(asiento => {
        const detalles = asiento.detalle_asientos || [];
        const cuentasIncluidas = new Map(detalles.map(detalle => [String(detalle.cuenta_id), detalle.cuentas]));
        const grupos = new Map();

        detalles.forEach(detalle => {
            const cuenta = detalle.cuentas || {};
            const padre = cuenta.cuenta_padre || cuentasIncluidas.get(String(cuenta.cuenta_padre_id)) || cuenta;
            const clavePadre = String(padre.id || padre.codigo || cuenta.id || cuenta.codigo || "sin-cuenta");
            const grupo = grupos.get(clavePadre) || { padre, detalles: [], debe: 0, haber: 0 };
            grupo.detalles.push(detalle);
            grupo.debe += Number(detalle.debe || 0);
            grupo.haber += Number(detalle.haber || 0);
            grupos.set(clavePadre, grupo);
        });

        [...grupos.values()].forEach((grupo, grupoIndice) => {
            filas.push([
                grupoIndice === 0 ? formatearFecha(asiento.fecha) : "",
                grupo.padre.codigo || "",
                grupoIndice === 0 ? asiento.numero_partida || "" : "",
                grupo.padre.nombre || "Cuenta",
                grupo.debe + grupo.haber || 0,
                grupo.debe,
                grupo.haber
            ]);

            grupo.detalles.forEach(detalle => {
                const debe = Number(detalle.debe || 0);
                const haber = Number(detalle.haber || 0);
                const cuenta = detalle.cuentas || {};
                const esCuentaPadre = String(cuenta.id || cuenta.codigo || "") === String(grupo.padre.id || grupo.padre.codigo || "");
                if (esCuentaPadre) return;
                filas.push([
                    "",
                    cuenta.codigo || "",
                    "",
                    cuenta.nombre || "Cuenta",
                    debe + haber || 0,
                    debe,
                    haber
                ]);
            });
        });
        filas.push(["", "", "", `C/ ${asiento.concepto || "Sin concepto"}`, "", "", ""]);
        filas.push(["", "", "", `Total partida ${asiento.numero_partida || ""}`, "", detalles.reduce((s, d) => s + Number(d.debe || 0), 0), detalles.reduce((s, d) => s + Number(d.haber || 0), 0)]);
    });
    return filas;
}

export function exportarLibroDiarioExcel({ asientos = [], desde, hasta, empresa = "Empresa" } = {}) {
    exportarLibroExcel(`Libro_Diario_${desde || "periodo"}`, [{ nombreHoja: "Libro Diario", filas: [["LIBRO DIARIO"], [`Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`], [], ...filasDiarioExcel(asientos)], anchos: [16, 14, 14, 42, 15, 15, 15], columnasMoneda: [4, 5, 6] }], empresa);
}

export function exportarLibroMayorExcel({ filas = [], totalesComprobacion = {}, movimientosPorCuenta, desde, hasta, empresa = "Empresa" } = {}) {
    const balance = [["LIBRO MAYOR"], [`Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`], [], ["Código", "Cuenta", "Debe", "Haber", "Saldo deudor", "Saldo acreedor"], ...filas.map(fila => [fila.codigo, fila.nombre, celdaMoneda(fila.total_debe), celdaMoneda(fila.total_haber), celdaMoneda(fila.saldo_deudor), celdaMoneda(fila.saldo_acreedor)]), ["", "Comprobación", celdaMoneda(totalesComprobacion.total_debe), celdaMoneda(totalesComprobacion.total_haber), celdaMoneda(totalesComprobacion.saldo_deudor), celdaMoneda(totalesComprobacion.saldo_acreedor)]];
    const detalle = [["Código", "Cuenta", "Partida", "Fecha", "Cuenta detalle", "Debe", "Haber"]];
    filas.forEach(fila => obtenerMovimientos(movimientosPorCuenta, fila.cuenta_id).forEach(movimiento => detalle.push([fila.codigo, fila.nombre, movimiento.numero_partida, formatearFecha(movimiento.fecha), `${movimiento.cuenta_codigo || fila.codigo} - ${movimiento.cuenta_nombre || fila.nombre}`, celdaMoneda(movimiento.debe), celdaMoneda(movimiento.haber)])));
    exportarLibroExcel(`Libro_Mayor_${desde || "periodo"}`, [
        { nombreHoja: "Balance comprobación", filas: balance, anchos: [14, 34, 16, 16, 18, 18], columnasMoneda: [2, 3, 4, 5] },
        { nombreHoja: "Detalle por cuenta", filas: detalle, anchos: [14, 30, 14, 16, 40, 16, 16], columnasMoneda: [5, 6] }
    ], empresa);
}

export function exportarBalanceGeneralExcel({ balance, desde, hasta, empresa = "Empresa" } = {}) {
    const activo = balance?.activo || {};
    const pasivo = balance?.pasivo || {};
    const capital = balance?.capital || {};
    const izquierda = [...filasBalanceExcel("ACTIVO CORRIENTE", activo.corriente), ...filasBalanceExcel("ACTIVO NO CORRIENTE", activo.noCorriente)];
    izquierda.push({ nombre: "TOTAL DEL ACTIVO", monto: Number(activo.total || 0), tipo: "total" });
    const derecha = [...filasBalanceExcel("PASIVO CORRIENTE", pasivo.corriente), ...filasBalanceExcel("PASIVO NO CORRIENTE", pasivo.noCorriente)];
    derecha.push({ nombre: "TOTAL PASIVOS", monto: Number(pasivo.total || 0), tipo: "total" }, ...filasBalanceExcel("PATRIMONIO NETO", capital), { nombre: "TOTAL PASIVO Y PATRIMONIO", monto: Number(balance?.totalPasivoCapital ?? Number(pasivo.total || 0) + Number(capital.total || 0)), tipo: "total" });
    const filas = [["BALANCE GENERAL"], [`Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`], [], ["ACTIVOS", "Monto", "PASIVOS Y CAPITAL", "Monto"]];
    for (let i = 0; i < Math.max(izquierda.length, derecha.length); i += 1) filas.push([izquierda[i]?.nombre || "", izquierda[i]?.monto ?? "", derecha[i]?.nombre || "", derecha[i]?.monto ?? ""]);
    const iva = balance?.liquidacionIva;
    if (iva) filas.push([], ["LIQUIDACIÓN DE IVA"], ["Concepto", "Monto"], ["IVA crédito fiscal", celdaMoneda(iva.ivaCreditoFiscal)], ["IVA débito fiscal", celdaMoneda(iva.ivaDebitoFiscal)], [Number(iva.impuestoAPagar || 0) > 0 ? "Impuesto a pagar" : "Remanente a favor", celdaMoneda(Number(iva.impuestoAPagar || 0) > 0 ? iva.impuestoAPagar : iva.remanenteAFavor)]);
    filas.push([], ["FIRMAS"], ["Representante Legal", "Gerencia General", "Contador General", "Reg. Profesional N° 45892", "Auditor Externo", "Dictamen e Informe Fiscal"]);
    exportarLibroExcel(`Balance_General_${hasta || "periodo"}`, [{ nombreHoja: "Balance General", filas, anchos: [34, 18, 36, 18, 25, 28], columnasMoneda: [1, 3] }], empresa);
}

export function exportarEstadoResultadosExcel({ filas = [], empresa = "Empresa", desde, hasta } = {}) {
    exportarLibroExcel(`Estado_Resultados_${hasta || "periodo"}`, [{ nombreHoja: "Estado Resultados", filas: [["ESTADO DE RESULTADOS"], [`Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`], [], ["Marca", "Concepto", "Monto"], ...filas.map(fila => fila.encabezado ? [fila.encabezado, "", ""] : [fila.marca || "", fila.concepto || "", celdaMoneda(fila.monto)])], anchos: [12, 55, 18], columnasMoneda: [2] }], empresa);
}

export function exportarCatalogoCuentasExcel({ cuentas = [], empresa = "Empresa" } = {}) {
    const cuentasPorId = new Map(cuentas.map(cuenta => [String(cuenta.id), cuenta]));
    exportarLibroExcel("Catalogo_de_Cuentas", [{ nombreHoja: "Catálogo", filas: [["Código", "Cuenta", "Nivel", "Cuenta padre"], ...cuentas.map(cuenta => [cuenta.codigo, cuenta.nombre, cuenta.nivel ?? "-", cuentasPorId.get(String(cuenta.cuenta_padre_id))?.nombre || "Cuenta principal"])], anchos: [15, 42, 12, 35] }], empresa);
}

export function exportarKardexExcel({ filas = [], totales = {}, desde, hasta, empresa = "Empresa" } = {}) {
    const datos = [
        ["KARDEX DE INVENTARIO"],
        [`Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`],
        [],
        ["Asiento", "Fecha", "Tipo de movimiento", "Cuenta", "Concepto", "UNIDADES", "", "", "COSTO", "", "SALDOS", "", ""],
        ["", "", "", "", "", "Entrada", "Salida", "Existencias", "Costo unitario", "PEPS", "Deudor", "Acreedor", "Saldo"],
        ...filas.map(fila => [fila.asiento, fila.fechaTexto || formatearFecha(fila.fecha), obtenerEtiquetaMovimiento(fila.tipo), fila.cuenta, fila.concepto, fila.entrada ?? "", fila.salida ?? "", fila.existencias ?? "", celdaMoneda(fila.costo_unitario), celdaMoneda(fila.peps), celdaMoneda(fila.deudor), celdaMoneda(fila.acreedor), celdaMoneda(fila.saldo)]),
        [],
        ["", "", "", "", "Totales", totales.total_entradas ?? "", totales.total_salidas ?? "", totales.existencia_final ?? "", celdaMoneda(totales.costo_promedio_final), "", celdaMoneda(totales.total_deudor), celdaMoneda(totales.total_acreedor), celdaMoneda(totales.saldo_final)]
    ];
    exportarLibroExcel(`Kardex_${desde || "periodo"}`, [{ nombreHoja: "Kardex", filas: datos, anchos: [12, 14, 25, 28, 42, 13, 13, 14, 17, 15, 15, 15, 15], columnasMoneda: [8, 9, 10, 11, 12], merges: [
        { s: { r: 3, c: 5 }, e: { r: 3, c: 7 } },
        { s: { r: 3, c: 8 }, e: { r: 3, c: 9 } },
        { s: { r: 3, c: 10 }, e: { r: 3, c: 12 } }
    ] }], empresa);
}

export function exportarUsuariosExcel({ usuarios = [], empresa = "Empresa" } = {}) {
    exportarLibroExcel("Usuarios_de_la_Empresa", [{ nombreHoja: "Usuarios", filas: [["Nombre", "Correo", "Rol", "Estado"], ...usuarios.map(usuario => [usuario.nombre, usuario.correo, usuario.rol, usuario.estado ? "Activo" : "Inactivo"])], anchos: [30, 38, 16, 16] }], empresa);
}

export function exportarAuditoriaExcel({ logs = [], empresa = "Empresa" } = {}) {
    exportarLibroExcel("Auditoria_del_Sistema", [{ nombreHoja: "Auditoría", filas: [["Fecha / Hora", "Usuario", "Acción", "Entidad", "Descripción", "Resultado"], ...logs.map(log => [log.fecha_hora ? new Date(log.fecha_hora).toLocaleString("es-ES") : "-", log.usuario_nombre, log.tipo_accion, log.entidad_afectada, log.descripcion, log.resultado])], anchos: [22, 28, 18, 18, 65, 18] }], empresa);
}

export function exportarNuevoAsientoExcel({ detalles = [], cuentasPorId, fecha, concepto, empresa = "Empresa" } = {}) {
    const mapa = cuentasPorId instanceof Map ? cuentasPorId : new Map();
    exportarLibroExcel(`Asiento_${fecha || "nuevo"}`, [{ nombreHoja: "Asiento", filas: [["ASIENTO CONTABLE"], [`Fecha: ${formatearFecha(fecha)}`, `Concepto: ${concepto || "Sin concepto"}`], [], ["Cuenta", "Subcuenta", "Debe", "Haber"], ...detalles.map(detalle => { const cuenta = mapa.get(String(detalle.cuenta_id)); return [cuenta?.nombre || "Cuenta principal", cuenta ? `${cuenta.codigo} - ${cuenta.nombre}` : "", celdaMoneda(detalle.debe), celdaMoneda(detalle.haber)]; })], anchos: [30, 42, 16, 16], columnasMoneda: [2, 3] }], empresa);
}

export async function exportarTablaComparativaExcel({ vistaIzquierda, vistaDerecha, rangoIzquierda, rangoDerecha, usuario, tablasIzquierda = [], tablasDerecha = [], empresa = "Empresa" } = {}) {
    const libro = new ExcelJS.Workbook();
    libro.creator = "ContaCabal";

    const crearHoja = (nombre, vista, rango, tablas) => {
        const hoja = libro.addWorksheet(nombre);
        hoja.getCell("A1").value = empresa;
        hoja.getCell("A1").font = { bold: true, size: 15, color: { argb: "FF1B4332" } };
        hoja.getCell("A2").value = vista || "No seleccionada";
        hoja.getCell("A3").value = `Periodo: ${rango || ""}`;
        hoja.getCell("A4").value = `Usuario: ${usuario || "Sistema"}`;
        let filaActual = 6;

        if (!tablas.length) {
            hoja.getCell(`A${filaActual}`).value = "No hay datos cargados para este reporte.";
        }

        tablas.forEach((tabla, indiceTabla) => {
            hoja.getCell(`A${filaActual}`).value = `Tabla ${indiceTabla + 1}`;
            hoja.getCell(`A${filaActual}`).font = { bold: true, color: { argb: "FF1B4332" } };
            filaActual += 1;

            tabla.forEach((fila, indiceFila) => {
                const filaExcel = hoja.getRow(filaActual);
                filaExcel.values = fila.map(valor => valor ?? "");
                if (indiceFila === 0) {
                    filaExcel.font = { bold: true, color: { argb: "FFFFFFFF" } };
                    filaExcel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4332" } };
                }
                filaActual += 1;
            });
            filaActual += 1;
        });

        hoja.columns = Array.from({ length: 12 }, (_, indice) => ({
            width: indice === 0 ? 24 : 22
        }));
    };

    crearHoja("Columna izquierda", vistaIzquierda, rangoIzquierda, tablasIzquierda);
    crearHoja("Columna derecha", vistaDerecha, rangoDerecha, tablasDerecha);
    const buffer = await libro.xlsx.writeBuffer();
    descargarArchivoExcel(buffer, "Tabla_Comparativa.xlsx");
}

export async function exportarDashboardExcel({ activos = 0, pasivos = 0, ingresos = 0, costos = 0, movimientos = [], periodo, empresa = "Empresa" } = {}) {
    const libro = new ExcelJS.Workbook();
    libro.creator = "ContaCabal";
    libro.created = new Date();
    const hoja = libro.addWorksheet("Dashboard");
    const formatoMonedaExcel = '"$"#,##0.00;[Red]-"$"#,##0.00';

    hoja.getCell("A1").value = empresa;
    hoja.getCell("A1").font = { bold: true, size: 15, color: { argb: "FF1B4332" } };
    hoja.getCell("A2").value = "DASHBOARD EJECUTIVO";
    hoja.getCell("A2").font = { bold: true, size: 16, color: { argb: "FF1B4332" } };
    hoja.getCell("A3").value = `Resumen contable | ${periodo || "Periodo actual"}`;
    hoja.getCell("A5").value = "Tarjetas de resumen";
    hoja.getCell("A5").font = { bold: true, color: { argb: "FF1B4332" } };
    hoja.addRow(["Tarjeta", "Valor"]);
    hoja.getRow(6).font = { bold: true, color: { argb: "FFFFFFFF" } };
    hoja.getRow(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4332" } };
    [["Activos", activos], ["Pasivos", pasivos], ["Ingresos netos", ingresos], ["Costo de ventas", costos]].forEach(([nombre, valor]) => {
        const fila = hoja.addRow([nombre, Number(valor || 0)]);
        fila.getCell(2).numFmt = formatoMonedaExcel;
    });

    hoja.getCell("A12").value = "Gráfico de actividad financiera";
    hoja.getCell("A12").font = { bold: true, color: { argb: "FF1B4332" } };
    const imagenId = libro.addImage({ base64: crearGraficoDashboardPNG(ingresos, costos), extension: "png" });
    hoja.addImage(imagenId, "A13:H30");

    const filaMovimientos = 33;
    hoja.getCell(`A${filaMovimientos}`).value = "Últimos movimientos";
    hoja.getCell(`A${filaMovimientos}`).font = { bold: true, color: { argb: "FF1B4332" } };
    hoja.getRow(filaMovimientos + 1).values = ["Fecha", "Comentario", "N. partida"];
    hoja.getRow(filaMovimientos + 1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    hoja.getRow(filaMovimientos + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4332" } };
    movimientos.forEach(asiento => hoja.addRow([formatearFecha(asiento.fecha), `C/ ${asiento.concepto || "Sin concepto"}`, asiento.numero_partida || ""]));
    hoja.columns = [{ width: 24 }, { width: 64 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];

    const buffer = await libro.xlsx.writeBuffer();
    descargarArchivoExcel(buffer, "Dashboard_Ejecutivo.xlsx");
}

export function exportarRatiosExcel({ secciones = {}, desde, hasta, opcionRapida, empresa = "Empresa" } = {}) {
    const seccion = secciones.liquidez;
    const filas = [["RATIOS FINANCIEROS - LIQUIDEZ"], [`Filtro: ${obtenerNombrePeriodo(opcionRapida)} | ${formatearFecha(desde)} al ${formatearFecha(hasta)}`], [], ["Ratio financiero", "Valor", "Estado", "Rango saludable", "Interpretación"], ...(seccion?.ratios || []).map(ratio => [ratio.nombre, ratio.formato, ratio.estado, ratio.rangoSaludable, ratio.interpretacion])];
    exportarLibroExcel(`Ratios_Financieros_${hasta || "periodo"}`, [{ nombreHoja: "Liquidez", filas, anchos: [34, 18, 18, 24, 65] }], empresa);
}
