// Configuración y persistencia del mapeo de cuentas de IVA por empresa

const STORAGE_PREFIX = "conta_config_iva_empresa_";

export function obtenerConfiguracionIva(empresaId) {
    if (typeof localStorage === "undefined") {
        return null;
    }
    try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${empresaId || "default"}`);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function guardarConfiguracionIva(empresaId, configuracion) {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(`${STORAGE_PREFIX}${empresaId || "default"}`, JSON.stringify(configuracion));
    } catch (e) {
        console.warn("No se pudo guardar la configuración de IVA:", e);
    }
}

/**
 * Detecta inteligentemente cuentas de IVA Crédito Fiscal y Débito Fiscal
 * entre una lista de cuentas contables.
 */
export function detectarCuentasIva(cuentas = []) {
    // Buscar Crédito Fiscal (Compras)
    // 1. Por código exacto o subcuentas 1105%
    // 2. Por texto en nombre: "crédito fiscal", "credito fiscal", "iva compras", "iva crédito"
    const posiblesCredito = cuentas.filter(c => {
        const nom = (c.nombre || "").toLowerCase();
        const cod = String(c.codigo || "");
        return (
            nom.includes("crédito fiscal") ||
            nom.includes("credito fiscal") ||
            nom.includes("iva crédito") ||
            nom.includes("iva credito") ||
            (cod.startsWith("1105") && (nom.includes("iva") || nom.includes("fiscal") || nom.includes("credito") || nom.includes("crédito")))
        );
    });

    // Preferir la que permita movimientos, o la primera hoja
    const cuentaCredito = posiblesCredito.find(c => c.permite_movimientos) || posiblesCredito[0] || null;

    // Buscar Débito Fiscal (Ventas)
    // 1. Por código exacto o subcuentas 2102%, 210701%
    // 2. Por texto en nombre: "débito fiscal", "debito fiscal", "iva ventas", "iva débito"
    const posiblesDebito = cuentas.filter(c => {
        const nom = (c.nombre || "").toLowerCase();
        const cod = String(c.codigo || "");
        return (
            nom.includes("débito fiscal") ||
            nom.includes("debito fiscal") ||
            nom.includes("iva débito") ||
            nom.includes("iva debito") ||
            nom.includes("iva debito fiscal") ||
            (cod.startsWith("2102") && (nom.includes("iva") || nom.includes("fiscal") || nom.includes("debito") || nom.includes("débito"))) ||
            (cod.startsWith("2107") && (nom.includes("iva") || nom.includes("debito") || nom.includes("débito")))
        );
    });

    const cuentaDebito = posiblesDebito.find(c => c.permite_movimientos) || posiblesDebito[0] || null;

    return {
        cuentaCredito,
        cuentaDebito
    };
}

/**
 * Determina si una cuenta lleva IVA por defecto según su tipo, código o nombre.
 */
export function inferirLlevaIvaPorDefecto(cuenta) {
    if (!cuenta) return false;
    // Cuentas agrupadoras nunca aplican IVA
    if (cuenta.permite_movimientos === false) return false;

    const cod = String(cuenta.codigo || "").trim();
    const nom = (cuenta.nombre || "").toLowerCase();
    const tipo = String(cuenta.tipo || "").toUpperCase();

    // Las cuentas de IVA no llevan IVA a sí mismas
    if (nom.includes("crédito fiscal") || nom.includes("credito fiscal") || nom.includes("débito fiscal") || nom.includes("debito fiscal")) {
        return false;
    }
    // Tampoco cuentas de efectivo, bancos, capital o préstamos
    if (cod.startsWith("1101") || cod.startsWith("3") || cod.startsWith("2103")) {
        return false;
    }

    // Compras y gastos deducibles clásicos
    if (cod.startsWith("4101") || cod.startsWith("4102") || cod.startsWith("42") || cod.startsWith("1201") || cod.startsWith("1104")) {
        return true;
    }
    // Ventas clásicas
    if (cod.startsWith("5101") || cod.startsWith("5102")) {
        return true;
    }

    // Inferencia por tipo o nombre en catálogos no estándar:
    if (tipo === "GASTO" || tipo === "COSTO") {
        if (nom.includes("compra") || nom.includes("adquisic") || nom.includes("gasto") || nom.includes("suministro") || nom.includes("honorario") || nom.includes("servicio") || nom.includes("mantenimiento")) {
            return true;
        }
    }
    if (tipo === "INGRESO") {
        if (nom.includes("venta") || nom.includes("ingreso por servicio") || nom.includes("facturad")) {
            return true;
        }
    }
    if (tipo === "ACTIVO" && (nom.includes("propiedad") || nom.includes("equipo") || nom.includes("mobiliario") || nom.includes("maquinaria") || nom.includes("vehículo") || nom.includes("vehiculo") || nom.includes("activo fijo"))) {
        return true;
    }

    return false;
}

/**
 * Inicializa o completa la configuración de IVA para una empresa asegurando
 * que tenga cuenta de crédito, débito y la lista de cuentas gravadas.
 */
export function inicializarConfiguracionIva(empresaId, cuentas = []) {
    const actual = obtenerConfiguracionIva(empresaId) || {};
    const detectadas = detectarCuentasIva(cuentas);

    let cuentaCreditoCodigo = actual.cuentaCreditoCodigo;
    if (!cuentaCreditoCodigo && detectadas.cuentaCredito) {
        cuentaCreditoCodigo = String(detectadas.cuentaCredito.codigo).trim();
    }
    if (!cuentaCreditoCodigo) {
        const fallBack = cuentas.find(c => String(c.codigo).startsWith("1105"));
        if (fallBack) cuentaCreditoCodigo = String(fallBack.codigo).trim();
    }

    let cuentaDebitoCodigo = actual.cuentaDebitoCodigo;
    if (!cuentaDebitoCodigo && detectadas.cuentaDebito) {
        cuentaDebitoCodigo = String(detectadas.cuentaDebito.codigo).trim();
    }
    if (!cuentaDebitoCodigo) {
        const fallBack = cuentas.find(c => String(c.codigo).startsWith("2102") || String(c.codigo).startsWith("2107"));
        if (fallBack) cuentaDebitoCodigo = String(fallBack.codigo).trim();
    }

    // Si aún no hay lista explícita de cuentas con IVA, pre-marcar según inferencia
    let codigosConIva = actual.codigosConIva;
    const mapaPermiteMovs = new Map(cuentas.map(c => [String(c.codigo).trim(), Boolean(c.permite_movimientos)]));

    if (!Array.isArray(codigosConIva)) {
        codigosConIva = cuentas
            .filter(c => {
                if (c.permite_movimientos === false) return false;
                const cod = String(c.codigo || "").trim();
                if (cod === cuentaCreditoCodigo || cod === cuentaDebitoCodigo) return false;
                return inferirLlevaIvaPorDefecto(c);
            })
            .map(c => String(c.codigo).trim());
    } else if (cuentas.length > 0) {
        // Limpiar de codigosConIva cualquier cuenta agrupadora que hubiera quedado guardada previamente
        codigosConIva = codigosConIva.filter(cod => {
            if (mapaPermiteMovs.has(cod)) {
                return mapaPermiteMovs.get(cod) === true;
            }
            return true;
        });
    }

    const nuevaConfig = {
        habilitado: actual.habilitado !== false,
        cuentaCreditoCodigo: cuentaCreditoCodigo || null,
        cuentaDebitoCodigo: cuentaDebitoCodigo || null,
        cuentaCreditoId: detectadas.cuentaCredito?.id || actual.cuentaCreditoId || null,
        cuentaDebitoId: detectadas.cuentaDebito?.id || actual.cuentaDebitoId || null,
        codigosConIva: Array.from(new Set(codigosConIva.map(String)))
    };

    guardarConfiguracionIva(empresaId, nuevaConfig);
    return nuevaConfig;
}

/**
 * Verifica si una cuenta contable específica tiene configurado aplicar IVA.
 */
export function cuentaAplicaIva(cuenta, configOpcional, empresaId = null) {
    if (!cuenta) return false;
    // Cuentas agrupadoras (no permiten movimientos) nunca aplican IVA
    if (cuenta.permite_movimientos === false) return false;

    const config = configOpcional || (empresaId ? obtenerConfiguracionIva(empresaId) : null);
    if (config && config.habilitado === false) return false;

    const cod = String(cuenta.codigo || "").trim();
    const nom = (cuenta.nombre || "").toLowerCase();

    // Las cuentas de destino de IVA nunca aplican IVA a sí mismas
    if (nom.includes("crédito fiscal") || nom.includes("credito fiscal") || nom.includes("débito fiscal") || nom.includes("debito fiscal")) {
        return false;
    }
    if (config?.cuentaCreditoCodigo && cod === String(config.cuentaCreditoCodigo).trim()) {
        return false;
    }
    if (config?.cuentaDebitoCodigo && cod === String(config.cuentaDebitoCodigo).trim()) {
        return false;
    }
    if (config?.cuentaCreditoId && cuenta.id && String(cuenta.id) === String(config.cuentaCreditoId)) {
        return false;
    }
    if (config?.cuentaDebitoId && cuenta.id && String(cuenta.id) === String(config.cuentaDebitoId)) {
        return false;
    }

    if (config && Array.isArray(config.codigosConIva)) {
        return config.codigosConIva.includes(cod);
    }

    return inferirLlevaIvaPorDefecto(cuenta);
}

/**
 * Agrega o quita un código de cuenta del listado de cuentas gravadas con IVA.
 */
export function alternarIvaCuenta(empresaId, codigo, nuevoValor, cuentas = []) {
    const cod = String(codigo || "").trim();
    if (!cod) return null;

    // Si la cuenta es agrupadora, no permitir asignarle IVA
    const cuentaObj = cuentas.find(c => String(c.codigo).trim() === cod);
    if (cuentaObj && cuentaObj.permite_movimientos === false) {
        return obtenerConfiguracionIva(empresaId);
    }

    let config = obtenerConfiguracionIva(empresaId);
    if (!config || !Array.isArray(config.codigosConIva)) {
        config = inicializarConfiguracionIva(empresaId, cuentas);
    }

    const setCodigos = new Set(config.codigosConIva.map(String));

    if (nuevoValor) {
        setCodigos.add(cod);
    } else {
        setCodigos.delete(cod);
    }

    const nuevaConfig = {
        ...config,
        codigosConIva: Array.from(setCodigos)
    };

    guardarConfiguracionIva(empresaId, nuevaConfig);
    return nuevaConfig;
}

/**
 * Restablece las cuentas gravadas de IVA usando la inferencia contable oficial.
 */
export function restablecerIvaSugerido(empresaId, cuentas = []) {
    let config = obtenerConfiguracionIva(empresaId) || {};
    const detectadas = detectarCuentasIva(cuentas);

    const cuentaCredito = config.cuentaCreditoCodigo || (detectadas.cuentaCredito ? String(detectadas.cuentaCredito.codigo).trim() : null);
    const cuentaDebito = config.cuentaDebitoCodigo || (detectadas.cuentaDebito ? String(detectadas.cuentaDebito.codigo).trim() : null);

    const sugeridas = cuentas
        .filter(c => {
            if (c.permite_movimientos === false) return false;
            const cod = String(c.codigo || "").trim();
            if (cod === cuentaCredito || cod === cuentaDebito) return false;
            return inferirLlevaIvaPorDefecto(c);
        })
        .map(c => String(c.codigo).trim());

    const nuevaConfig = {
        ...config,
        cuentaCreditoCodigo: cuentaCredito,
        cuentaDebitoCodigo: cuentaDebito,
        codigosConIva: Array.from(new Set(sugeridas))
    };

    guardarConfiguracionIva(empresaId, nuevaConfig);
    return nuevaConfig;
}

/**
 * Actualiza los parámetros globales de IVA (habilitación y cuentas destino).
 */
export function guardarConfiguracionGeneralIva(empresaId, { habilitado, cuentaCreditoCodigo, cuentaDebitoCodigo, cuentaCreditoId = null, cuentaDebitoId = null }) {
    const actual = obtenerConfiguracionIva(empresaId) || {};

    const nuevaConfig = {
        ...actual,
        habilitado: habilitado !== false,
        cuentaCreditoCodigo: cuentaCreditoCodigo ? String(cuentaCreditoCodigo).trim() : null,
        cuentaDebitoCodigo: cuentaDebitoCodigo ? String(cuentaDebitoCodigo).trim() : null,
        cuentaCreditoId: cuentaCreditoId || actual.cuentaCreditoId || null,
        cuentaDebitoId: cuentaDebitoId || actual.cuentaDebitoId || null,
        codigosConIva: Array.isArray(actual.codigosConIva) ? actual.codigosConIva : []
    };

    guardarConfiguracionIva(empresaId, nuevaConfig);
    return nuevaConfig;
}
