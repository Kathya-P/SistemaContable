import { registrarAccionAuditoria } from "../services/auditoriaService";

export default function ExportarPdfButton({ className = "button-secondary", onExport, onExportExcel, disabled = false, reporte = "reporte" }) {
    const exportar = () => {
        if (onExport) {
            onExport();
        } else {
            window.print();
        }

        registrarAccionAuditoria({
            tipo_accion: "descargar",
            entidad_afectada: "Reporte",
            descripcion: `Descargó reporte de ${reporte} en PDF`
        });
    };

    const exportarExcel = () => {
        onExportExcel?.();
        registrarAccionAuditoria({
            tipo_accion: "descargar",
            entidad_afectada: "Reporte",
            descripcion: `Descargó reporte de ${reporte} en Excel`
        });
    };

    return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
                type="button"
                className={`${className} exportar-pdf-button`}
                onClick={exportar}
                disabled={disabled}
                title="Exportar la vista actual en PDF"
            >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9V3h12v6" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect width="12" height="8" x="6" y="14" rx="1" />
            </svg>
                Exportar en PDF
            </button>
            <button
                type="button"
                className={`${className} exportar-excel-button`}
                onClick={exportarExcel}
                disabled={disabled || !onExportExcel}
                title="Exportar la vista actual en Excel"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
                </svg>
                Exportar en Excel
            </button>
        </div>
    );
}
