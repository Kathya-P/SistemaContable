import { registrarAccionAuditoria } from "../services/auditoriaService";

export default function ExportarPdfButton({ className = "button-secondary", onExport, disabled = false, reporte = "reporte" }) {
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

    return (
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
    );
}
