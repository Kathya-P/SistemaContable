import { registrarAccionAuditoria } from "../services/auditoriaService";

export default function ExportarExcelButton({ className = "button-secondary", onExport, disabled = false, reporte = "reporte" }) {
    const exportar = () => {
        onExport?.();
        registrarAccionAuditoria({
            tipo_accion: "descargar",
            entidad_afectada: "Reporte",
            descripcion: `Descargó reporte de ${reporte} en Excel`
        });
    };

    return (
        <button
            type="button"
            className={`${className} exportar-excel-button`}
            onClick={exportar}
            disabled={disabled}
            title="Exportar la vista actual en Excel"
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
            </svg>
            Exportar en Excel
        </button>
    );
}
