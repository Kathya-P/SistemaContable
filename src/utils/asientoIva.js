// Cálculo automático del IVA y de la línea de cuadre para un asiento.
// Todo se calcula en centavos (enteros) para que nunca haya diferencias por decimales.

import { obtenerConfiguracionIva, detectarCuentasIva, inferirLlevaIvaPorDefecto } from "./configuracionIva";

export const TASA_IVA = 0.13;

// Cuentas de respaldo predeterminadas si no hay configuración específica
export const REGLAS_IVA_DEFECTO = [
    { prefijos: ["1104", "1201", "4101", "4102", "42"], tipoIva: "credito", cuentaIvaFallback: "1105" },
    { prefijos: ["5101", "5102"], tipoIva: "debito", cuentaIvaFallback: "2102" }
];

export const REGLAS_IVA = [
    { prefijos: ["1104", "1201", "4101", "4102", "42"], cuentaIva: "1105" },
    { prefijos: ["5101", "5102"], cuentaIva: "2102" }
];

const aCentavos = valor => Math.round((Number(valor) || 0) * 100);

/**
 * Resuelve la cuenta de IVA de destino (Crédito Fiscal para compras/gastos o Débito Fiscal para ventas).
 */
export function resolverCuentasIvaEmpresa(cuentasPorId, cuentasPorCodigo, empresaId) {
    const config = obtenerConfiguracionIva(empresaId);
    let cuentaCredito = null;
    let cuentaDebito = null;

    if (config) {
        if (config.habilitado === false) {
            return { habilitado: false, cuentaCredito: null, cuentaDebito: null, cuentasMarcadas: new Set() };
        }
        if (config.cuentaCreditoId) {
            cuentaCredito = cuentasPorId.get(String(config.cuentaCreditoId)) || null;
        }
        if (config.cuentaDebitoId) {
            cuentaDebito = cuentasPorId.get(String(config.cuentaDebitoId)) || null;
        }
        if (config.cuentaCreditoCodigo && !cuentaCredito) {
            cuentaCredito = cuentasPorCodigo.get(String(config.cuentaCreditoCodigo)) || null;
        }
        if (config.cuentaDebitoCodigo && !cuentaDebito) {
            cuentaDebito = cuentasPorCodigo.get(String(config.cuentaDebitoCodigo)) || null;
        }
    }

    // Si aún no se encuentran por configuración, auto-detectar entre las cuentas actuales
    if (!cuentaCredito || !cuentaDebito) {
        const listaCuentas = Array.from(cuentasPorId.values());
        const detectadas = detectarCuentasIva(listaCuentas);

        if (!cuentaCredito) cuentaCredito = detectadas.cuentaCredito || cuentasPorCodigo.get("1105") || null;
        if (!cuentaDebito) cuentaDebito = detectadas.cuentaDebito || cuentasPorCodigo.get("2102") || null;
    }

    const cuentasMarcadas = new Set(
        config?.codigosConIva ? config.codigosConIva.map(String) : []
    );

    return {
        habilitado: config?.habilitado !== false,
        cuentaCredito,
        cuentaDebito,
        cuentasMarcadas,
        tieneConfiguracionExplicita: Boolean(config?.codigosConIva)
    };
}

/**
 * Determina si una cuenta lleva IVA y hacia cuál cuenta de IVA se acumula (crédito o débito).
 */
export function reglaIvaDe(cuenta, infoIvaEmpresa) {
    if (!cuenta) return null;

    // Si la empresa desactivó el IVA explícitamente para este catálogo
    if (infoIvaEmpresa && infoIvaEmpresa.habilitado === false) {
        return null;
    }

    const codigo = String(cuenta.codigo || "").trim();
    const nombre = (cuenta.nombre || "").toLowerCase();
    const tipo = String(cuenta.tipo || "").toUpperCase();

    // No auto-calcular IVA sobre las mismas cuentas de IVA ni sobre las cuentas destino configuradas
    if (nombre.includes("crédito fiscal") || nombre.includes("credito fiscal") || nombre.includes("débito fiscal") || nombre.includes("debito fiscal")) {
        return null;
    }
    if (infoIvaEmpresa?.cuentaCredito?.codigo && codigo === String(infoIvaEmpresa.cuentaCredito.codigo).trim()) {
        return null;
    }
    if (infoIvaEmpresa?.cuentaDebito?.codigo && codigo === String(infoIvaEmpresa.cuentaDebito.codigo).trim()) {
        return null;
    }

    // 1. Verificación por configuración explícita guardada del catálogo (si el usuario la marcó en el importador)
    const aplicaIva = infoIvaEmpresa?.tieneConfiguracionExplicita
        ? infoIvaEmpresa.cuentasMarcadas.has(codigo)
        : (REGLAS_IVA_DEFECTO.some(r => r.prefijos.some(p => codigo.startsWith(p))) || inferirLlevaIvaPorDefecto(cuenta));

    if (!aplicaIva) {
        return null;
    }

    // Determinar si es crédito fiscal (compras/gastos/activos) o débito fiscal (ventas/ingresos)
    const esVenta = (
        codigo.startsWith("5") ||
        tipo === "INGRESO" ||
        nombre.includes("venta") ||
        nombre.includes("ingreso")
    );

    const cuentaIvaDestino = esVenta
        ? infoIvaEmpresa?.cuentaDebito
        : infoIvaEmpresa?.cuentaCredito;

    return {
        tipoIva: esVenta ? "debito" : "credito",
        cuentaIva: cuentaIvaDestino,
        codigoFallback: esVenta ? "2102" : "1105"
    };
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
export function calcularAsiento(detalles, cuentasPorId, cuentasPorCodigo, modoIva, empresaId = null) {
    const lineas = [];
    const errores = [];
    const vacias = [];
    const ivaAcumulado = new Map(); // clave: `cuentaId_o_codigo|lado` => { cuenta, lado, centavos }

    const infoIva = resolverCuentasIvaEmpresa(cuentasPorId, cuentasPorCodigo, empresaId);

    const acumularIva = (regla, lado, centavos) => {
        const cuentaIva = regla.cuentaIva || (regla.tipoIva === "debito" ? infoIva.cuentaDebito : infoIva.cuentaCredito);
        const clave = cuentaIva ? `id_${cuentaIva.id}|${lado}` : `cod_${regla.codigoFallback}|${lado}`;

        if (!ivaAcumulado.has(clave)) {
            ivaAcumulado.set(clave, {
                cuenta: cuentaIva,
                codigoFallback: regla.codigoFallback,
                tipoIva: regla.tipoIva,
                lado,
                centavos: 0
            });
        }
        ivaAcumulado.get(clave).centavos += centavos;
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
        const regla = (modoIva === "sin" || !infoIva.habilitado) ? null : reglaIvaDe(cuenta, infoIva);
        let base = monto;

        if (regla) {
            const separado = separarIva(monto, modoIva);
            base = separado.base;
            acumularIva(regla, lado, separado.iva);
        }

        lineas.push({ cuenta, lado, centavos: base, origen: null, indice });
    });

    const sumaLado = lado =>
        lineas.filter(l => l.lado === lado).reduce((suma, l) => suma + l.centavos, 0) +
        [...ivaAcumulado.values()]
            .filter(item => item.lado === lado)
            .reduce((suma, item) => suma + item.centavos, 0);

    const diferencia = sumaLado("debe") - sumaLado("haber");
    const autocompletada = vacias.length === 1 && diferencia !== 0;

    // Si queda UNA sola línea sin importe, se completa con lo que falta para cuadrar.
    if (autocompletada) {
        const { cuenta, indice } = vacias[0];
        const lado = diferencia > 0 ? "haber" : "debe";
        const total = Math.abs(diferencia);
        const regla = (modoIva === "sin" || !infoIva.habilitado) ? null : reglaIvaDe(cuenta, infoIva);
        let base = total;

        if (regla) {
            const separado = separarIva(total, "incluido");
            base = separado.base;
            acumularIva(regla, lado, separado.iva);
        }

        lineas.push({ cuenta, lado, centavos: base, origen: "cuadre", indice });
    }

    for (const item of ivaAcumulado.values()) {
        if (item.centavos <= 0) continue;

        let cuentaFinal = item.cuenta;
        if (!cuentaFinal && item.codigoFallback) {
            cuentaFinal = cuentasPorCodigo.get(item.codigoFallback);
        }

        if (!cuentaFinal) {
            const nombreTipo = item.tipoIva === "debito" ? "IVA Débito Fiscal" : "IVA Crédito Fiscal";
            errores.push(`No se encontró la cuenta contable para ${nombreTipo}. Configúrala en la importación del catálogo o crea una cuenta con código ${item.codigoFallback}.`);
            continue;
        }

        lineas.push({
            cuenta: cuentaFinal,
            lado: item.lado,
            centavos: item.centavos,
            origen: "iva",
            indice: null
        });
    }

    const total = lado => lineas.filter(l => l.lado === lado).reduce((suma, l) => suma + l.centavos, 0);

    return {
        lineas,
        errores,
        totalDebe: total("debe"),
        totalHaber: total("haber"),
        sinImporte: autocompletada ? 0 : vacias.length,
        infoIva
    };
}
