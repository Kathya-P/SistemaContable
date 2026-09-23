import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COLOR_PRIMARIO = [27, 67, 50];
const COLOR_ENCABEZADO = [226, 239, 231];

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

function crearDocumento(titulo, subtitulo) {
    const documento = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    documento.setProperties({ title: titulo, subject: subtitulo, creator: "ContaCabal" });
    documento.setFont("helvetica", "bold");
    documento.setFontSize(16);
    documento.setTextColor(...COLOR_PRIMARIO);
    documento.text(titulo, 14, 15);
    documento.setFont("helvetica", "normal");
    documento.setFontSize(9);
    documento.setTextColor(90, 90, 90);
    documento.text(subtitulo, 14, 22);
    documento.text(`Generado: ${new Date().toLocaleString("es-SV")}`, 283, 15, { align: "right" });
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

export function exportarLibroDiarioPDF({ asientos = [], desde, hasta } = {}) {
    const documento = crearDocumento(
        "Libro Diario",
        `Registro cronologico | Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`
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

export function exportarLibroMayorPDF({ filas = [], totalesComprobacion = {}, movimientosPorCuenta, desde, hasta } = {}) {
    const documento = crearDocumento(
        "Libro Mayor",
        `Balance de comprobacion y detalle por cuenta | Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`
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

export function exportarBalanceGeneralPDF({ balance, desde, hasta } = {}) {
    const documento = crearDocumento(
        "Balance General",
        `Activos frente a Pasivos y Capital | Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`
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

export function exportarEstadoResultadosPDF({ filas = [], empresa, desde, hasta } = {}) {
    const documento = crearDocumento("Estado de Resultados", `${empresa || "Empresa"} | Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`);
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

export function exportarCatalogoCuentasPDF({ cuentas = [] } = {}) {
    const documento = crearDocumento("Catalogo de Cuentas", `${cuentas.length} cuentas registradas`);
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

export function exportarKardexPDF({ filas = [], totales = {}, desde, hasta } = {}) {
    const documento = crearDocumento("Kardex de Inventario", `Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`);
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

export function exportarUsuariosPDF({ usuarios = [] } = {}) {
    const documento = crearDocumento("Usuarios de la Empresa", "Listado de usuarios y estado");
    agregarTabla(documento, {
        startY: 28,
        head: [["Nombre", "Correo", "Rol", "Estado"]],
        body: usuarios.map(usuario => [usuario.nombre || "", usuario.correo || "", usuario.rol || "", usuario.estado ? "Activo" : "Inactivo"])
    });
    agregarPieDePagina(documento);
    documento.save("Usuarios_de_la_Empresa.pdf");
}

export function exportarAuditoriaPDF({ logs = [] } = {}) {
    const documento = crearDocumento("Auditoria del Sistema", "Registro de operaciones y accesos");
    agregarTabla(documento, {
        startY: 28,
        head: [["Fecha / Hora", "Usuario", "Accion", "Entidad", "ID", "Descripcion", "Resultado"]],
        body: logs.map(log => [
            log.fecha_hora ? new Date(log.fecha_hora).toLocaleString("es-ES") : "-",
            log.usuario_nombre || "",
            log.tipo_accion || "",
            log.entidad_afectada || "",
            log.entidad_id || "",
            log.descripcion || "",
            log.resultado || ""
        ]),
        styles: { fontSize: 7 }
    });
    agregarPieDePagina(documento);
    documento.save("Auditoria_del_Sistema.pdf");
}

export function exportarNuevoAsientoPDF({ detalles = [], cuentasPorId, fecha, concepto } = {}) {
    const documento = crearDocumento("Asiento Contable", `Fecha: ${formatearFecha(fecha)} | ${concepto || "Sin concepto"}`);
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

export function exportarTablaComparativaPDF({ vistaIzquierda, vistaDerecha, rangoIzquierda, rangoDerecha, usuario } = {}) {
    const documento = crearDocumento("Tabla Comparativa", "Comparacion de reportes contables");
    agregarTabla(documento, {
        startY: 28,
        head: [["Elemento", "Columna izquierda", "Columna derecha"]],
        body: [
            ["Vista", vistaIzquierda || "No seleccionada", vistaDerecha || "No seleccionada"],
            ["Periodo", rangoIzquierda || "", rangoDerecha || ""],
            ["Usuario", usuario || "Sistema", usuario || "Sistema"]
        ],
        columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 105 }, 2: { cellWidth: 105 } }
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

export function exportarDashboardPDF({ activos = 0, pasivos = 0, ingresos = 0, costos = 0, movimientos = [], periodo } = {}) {
    const documento = crearDocumento("Dashboard Ejecutivo", `Resumen contable | ${periodo || "Periodo actual"}`);
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

export function exportarRatiosPDF({ secciones = {}, desde, hasta, opcionRapida } = {}) {
    const documento = crearDocumento("Ratios Financieros", `${obtenerNombrePeriodo(opcionRapida)} | ${formatearFecha(desde)} al ${formatearFecha(hasta)}`);
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
