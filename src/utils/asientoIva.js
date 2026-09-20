// Cálculo automático del IVA y de la línea de cuadre para un asiento.
// Todo se calcula en centavos (enteros) para que nunca haya diferencias por decimales.

export const TASA_IVA = 0.13;

// Cuentas que llevan IVA (por prefijo del código) y la cuenta de IVA donde se acumula.
// 1105 = IVA crédito fiscal (compras y gastos) | 2102 = IVA débito fiscal (ventas).
// La línea de IVA se agrega del MISMO lado que la cuenta que la origina.
export const REGLAS_IVA = [
    { prefijos: ["1104", "1201", "4101", "4102", "42"], cuentaIva: "1105" },
    { prefijos: ["5101", "5102"], cuentaIva: "2102" }
];

const aCentavos = valor => Math.round((Number(valor) || 0) * 100);

export function reglaIvaDe(cuenta) {
    if (!cuenta) return null;
    return REGLAS_IVA.find(regla => regla.prefijos.some(prefijo => cuenta.codigo.startsWith(prefijo))) || null;
}

// "incluido": el monto es el total, se separa base e IVA.
// "mas": el monto es la base, se le suma el IVA.
function separarIva(monto, modoIva) {
    if (modoIva === "incluido") {
        const base = Math.round(monto / (1 + TASA_IVA));
        return { base, iva: monto - base };
    }

    return { base: monto, iva: Math.round(monto * TASA_IVA) };
}

/*
 * detalles: las líneas tal como las escribe la persona ({ cuenta_id, debe, haber })
 * Devuelve las líneas reales del asiento (con el IVA y la línea de cuadre ya puestos):
 *   { lineas: [{ cuenta, lado, centavos, origen, indice }], errores, totalDebe, totalHaber, sinImporte }
 * origen: null = escrita por la persona | "iva" = IVA automático | "cuadre" = línea completada sola
 */
export function calcularAsiento(detalles, cuentasPorId, cuentasPorCodigo, modoIva) {
    const lineas = [];
    const errores = [];
    const vacias = [];
    const ivaAcumulado = new Map();

    const acumularIva = (codigoIva, lado, centavos) => {
        const clave = `${codigoIva}|${lado}`;
        ivaAcumulado.set(clave, (ivaAcumulado.get(clave) || 0) + centavos);
    };

    detalles.forEach((detalle, indice) => {
        const cuenta = cuentasPorId.get(String(detalle.cuenta_id));
        if (!cuenta) return;

        const debe = aCentavos(detalle.debe);
        const haber = aCentavos(detalle.haber);

        if (debe === 0 && haber === 0) {
            vacias.push({ cuenta, indice });
            return;
        }

        const lado = debe > 0 ? "debe" : "haber";
        const monto = debe > 0 ? debe : haber;
        const regla = modoIva === "sin" ? null : reglaIvaDe(cuenta);
        let base = monto;

        if (regla) {
            const separado = separarIva(monto, modoIva);
            base = separado.base;
            acumularIva(regla.cuentaIva, lado, separado.iva);
        }

        lineas.push({ cuenta, lado, centavos: base, origen: null, indice });
    });

    const sumaLado = lado =>
        lineas.filter(l => l.lado === lado).reduce((suma, l) => suma + l.centavos, 0) +
        [...ivaAcumulado]
            .filter(([clave]) => clave.endsWith(`|${lado}`))
            .reduce((suma, [, centavos]) => suma + centavos, 0);

    const diferencia = sumaLado("debe") - sumaLado("haber");
    const autocompletada = vacias.length === 1 && diferencia !== 0;

    // Si queda UNA sola línea sin importe, se completa con lo que falta para cuadrar.
    if (autocompletada) {
        const { cuenta, indice } = vacias[0];
        const lado = diferencia > 0 ? "haber" : "debe";
        const total = Math.abs(diferencia);
        const regla = modoIva === "sin" ? null : reglaIvaDe(cuenta);
        let base = total;

        if (regla) {
            const separado = separarIva(total, "incluido");
            base = separado.base;
            acumularIva(regla.cuentaIva, lado, separado.iva);
        }

        lineas.push({ cuenta, lado, centavos: base, origen: "cuadre", indice });
    }

    for (const [clave, centavos] of ivaAcumulado) {
        if (centavos <= 0) continue;

        const [codigoIva, lado] = clave.split("|");
        const cuentaIva = cuentasPorCodigo.get(codigoIva);

        if (!cuentaIva) {
            errores.push(`No encuentro la cuenta de IVA ${codigoIva} en el catálogo.`);
            continue;
        }

        lineas.push({ cuenta: cuentaIva, lado, centavos, origen: "iva", indice: null });
    }

    const total = lado => lineas.filter(l => l.lado === lado).reduce((suma, l) => suma + l.centavos, 0);

    return {
        lineas,
        errores,
        totalDebe: total("debe"),
        totalHaber: total("haber"),
        sinImporte: autocompletada ? 0 : vacias.length
    };
}