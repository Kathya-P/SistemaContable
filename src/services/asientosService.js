import { solicitarApi } from "./api";


// ==========================================
// Obtener todos los asientos con detalle
// ==========================================
export async function obtenerAsientos() {
    return solicitarApi("/libro-diario");
}



// ==========================================
// Obtener un asiento específico
// ==========================================
export async function obtenerAsientoPorId(id){
    const asientos = await solicitarApi("/libro-diario");
    return asientos.find(asiento => String(asiento.id) === String(id));

}



// ==========================================
// Crear asiento contable
// ==========================================
export async function crearAsiento(asiento, detalles){
    return solicitarApi("/asientos", {
        method: "POST",
        body: JSON.stringify({ asiento, detalles })
    });
}

// ==========================================
// Rectificar o modificar asiento contable
// ==========================================
export async function rectificarAsiento(id, { concepto, motivo, detalles, fecha }){
    return solicitarApi(`/asientos/${id}/rectificar`, {
        method: "PUT",
        body: JSON.stringify({ concepto, motivo, detalles, fecha })
    });
}

// ==========================================
// Eliminar asiento contable del período
// ==========================================
export async function eliminarAsiento(id, motivo = "Eliminación de asiento contable"){
    return solicitarApi(`/asientos/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ motivo })
    });
}

// ==========================================
// Asientos Guardados (Esqueletos / Plantillas)
// ==========================================
const LOCAL_STORAGE_KEY_GUARDADOS = "contacabal_asientos_guardados";

function obtenerGuardadosLocales() {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY_GUARDADOS);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function guardarLocales(lista) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY_GUARDADOS, JSON.stringify(lista));
    } catch {
        // ignore
    }
}

export async function obtenerAsientosGuardados() {
    try {
        const delServidor = await solicitarApi("/asientos-guardados");
        if (Array.isArray(delServidor)) {
            // Guardar en cache local
            const locales = obtenerGuardadosLocales();
            // Combinar evitando duplicados por id
            const mapa = new Map();
            locales.forEach(item => mapa.set(String(item.id), item));
            delServidor.forEach(item => mapa.set(String(item.id), item));
            const combinados = Array.from(mapa.values()).sort(
                (a, b) => new Date(b.fecha_creacion || 0) - new Date(a.fecha_creacion || 0)
            );
            guardarLocales(combinados);
            return combinados;
        }
    } catch (e) {
        console.warn("No se pudieron obtener asientos guardados del servidor, usando locales:", e);
    }
    return obtenerGuardadosLocales();
}

export async function guardarPlantillaAsiento({ concepto, modo_iva, detalles }) {
    const nuevoLocal = {
        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        concepto: String(concepto || "").trim(),
        modo_iva: modo_iva || "incluido",
        detalles: Array.isArray(detalles) ? detalles : [],
        fecha_creacion: new Date().toISOString()
    };

    // Guardar inmediatamente en localStorage
    const actuales = obtenerGuardadosLocales();
    actuales.unshift(nuevoLocal);
    guardarLocales(actuales);

    try {
        const respuesta = await solicitarApi("/asientos-guardados", {
            method: "POST",
            body: JSON.stringify({ concepto, modo_iva, detalles })
        });
        if (respuesta?.asiento) {
            // Reemplazar o actualizar con el del servidor si tiene id oficial
            const actualizados = actuales.map(item =>
                item.id === nuevoLocal.id ? respuesta.asiento : item
            );
            guardarLocales(actualizados);
            return respuesta.asiento;
        }
    } catch (e) {
        console.warn("Asiento guardado en local (falló sincronización remota):", e);
    }

    return nuevoLocal;
}

export async function eliminarAsientoGuardado(id) {
    const actuales = obtenerGuardadosLocales().filter(item => String(item.id) !== String(id));
    guardarLocales(actuales);

    try {
        await solicitarApi(`/asientos-guardados/${id}`, {
            method: "DELETE"
        });
    } catch (e) {
        console.warn("Eliminado de local (error en servidor):", e);
    }
    return true;
}

