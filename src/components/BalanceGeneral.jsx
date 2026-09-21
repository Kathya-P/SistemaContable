import { useState, useEffect } from "react";
import { obtenerBalanceGeneral } from "../services/balanceGeneralService";
import { TablaBalanceGeneral } from "./TablaBalanceGeneral";
import { ValidacionBalance } from "./ValidacionBalance";
import { LiquidacionIvaModal } from "./LiquidacionIvaModal";

export function BalanceGeneral({ empresa, fechaDesde, fechaHasta, fechaCorte }) {
    const [balance, setBalance] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [mostrarIvaModal, setMostrarIvaModal] = useState(false);

    // Si viene fechaCorte se usa como hasta; si no, fechaHasta
    const fechaFin = fechaCorte || fechaHasta || new Date().toISOString().split("T")[0];
    const fechaInicio = fechaDesde || "2026-01-01";

    const cargarDatos = async () => {
        setCargando(true);
        setError(null);
        try {
            const data = await obtenerBalanceGeneral({
                desde: fechaInicio,
                hasta: fechaFin
            });
            setBalance(data);
        } catch (err) {
            console.error("Error al cargar balance general:", err);
            setError(err.message || "Error al conectar con el servidor contable");
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargarDatos();
    }, [fechaInicio, fechaFin, empresa?.id]);

    const handleImprimir = () => {
        window.print();
    };

    const handleExportarExcel = () => {
        if (!balance) return;
        const lineas = [
            ["BALANCE GENERAL (ESTADO DE SITUACIÓN FINANCIERA)"],
            [balance.empresa || empresa?.nombre_empresa || "EMPRESA"],
            [`Período: ${fechaInicio} al ${fechaFin}`],
            [""],
            ["CÓDIGO", "CONCEPTO / CUENTA", "MONTO ($)", "NOTAS"],
            ["--- ACTIVO CORRIENTE ---", "", "", ""],
            ...(balance.activo?.corriente?.cuentas || []).map(c => [c.codigo, c.concepto, c.monto.toFixed(2), c.nota || ""]),
            ["TOTAL ACTIVO CORRIENTE", "", balance.activo?.corriente?.total.toFixed(2), ""],
            ["--- ACTIVO NO CORRIENTE ---", "", "", ""],
            ...(balance.activo?.noCorriente?.cuentas || []).map(c => [c.codigo, c.concepto, c.monto.toFixed(2), c.nota || ""]),
            ["TOTAL ACTIVO NO CORRIENTE", "", balance.activo?.noCorriente?.total.toFixed(2), ""],
            ["TOTAL ACTIVOS", "", balance.activo?.total.toFixed(2), ""],
            [""],
            ["--- PASIVO CORRIENTE ---", "", "", ""],
            ...(balance.pasivo?.corriente?.cuentas || []).map(c => [c.codigo, c.concepto, c.monto.toFixed(2), c.nota || ""]),
            ["TOTAL PASIVO CORRIENTE", "", balance.pasivo?.corriente?.total.toFixed(2), ""],
            ["--- PASIVO NO CORRIENTE ---", "", "", ""],
            ...(balance.pasivo?.noCorriente?.cuentas || []).map(c => [c.codigo, c.concepto, c.monto.toFixed(2), c.nota || ""]),
            ["TOTAL PASIVO NO CORRIENTE", "", balance.pasivo?.noCorriente?.total.toFixed(2), ""],
            ["TOTAL PASIVOS", "", balance.pasivo?.total.toFixed(2), ""],
            [""],
            ["--- PATRIMONIO NETO / CAPITAL ---", "", "", ""],
            ...(balance.capital?.cuentas || []).map(c => [c.codigo, c.concepto, c.monto.toFixed(2), c.nota || ""]),
            ["TOTAL PATRIMONIO NETO", "", balance.capital?.total.toFixed(2), ""],
            ["TOTAL PASIVO + PATRIMONIO", "", balance.totalPasivoCapital.toFixed(2), ""],
            [""],
            [`ESTADO DE CUADRE: ${balance.validacion?.cuadra ? "CUADRADO EXACTO" : "DESCUADRADO"}`, `Diferencia: $${balance.validacion?.diferencia.toFixed(2)}`]
        ];

        const csvContent = "data:text/csv;charset=utf-8," + lineas.map(e => e.map(val => `"${val}"`).join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Balance_General_${fechaFin}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="balance-general-container">
            {/* ENCABEZADO Y CONTROLES */}
            <div className="balance-header-actions no-print">
                <div className="balance-titles">
                    <h1 className="balance-title">Balance General</h1>
                    <p className="balance-subtitle">
                        Estado de Situación Financiera clasificado al {fechaFin}
                    </p>
                </div>
                <div className="balance-buttons">
                    {balance?.liquidacionIva && (
                        <button
                            type="button"
                            className="btn-accion-secundario btn-iva"
                            onClick={() => setMostrarIvaModal(true)}
                        >
                            Ver Liquidación IVA
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn-accion-secundario"
                        onClick={handleExportarExcel}
                        disabled={cargando || !balance}
                    >
                        Exportar CSV
                    </button>
                    <button
                        type="button"
                        className="btn-accion-primario"
                        onClick={handleImprimir}
                        disabled={cargando || !balance}
                    >
                        Imprimir Reporte
                    </button>
                </div>
            </div>

            {/* ESTADOS DE CARGA Y ERROR */}
            {cargando && (
                <div className="balance-cargando">
                    <div className="spinner"></div>
                    <p>Calculando saldos clasificados y liquidación tributaria...</p>
                </div>
            )}

            {error && (
                <div className="balance-error-card">
                    <h3>No se pudo generar el Balance General</h3>
                    <p>{error}</p>
                    <button onClick={cargarDatos} className="btn-reintentar">
                        Reintentar
                    </button>
                </div>
            )}

            {/* CONTENIDO PRINCIPAL */}
            {!cargando && !error && balance && (
                <>
                    {/* Tarjeta de Validación de Ecuación Contable */}
                    <ValidacionBalance
                        validacion={balance.validacion}
                        liquidacionIva={balance.liquidacionIva}
                    />

                    {/* Tabla Clasificada del Balance */}
                    <div className="balance-sheet-print-area">
                        <div className="balance-print-header">
                            <h2 className="print-company-name">
                                {balance.empresa || empresa?.nombre_empresa || "Ferretería El Martillo, S.A. de C.V."}
                            </h2>
                            <h3 className="print-report-title">BALANCE GENERAL</h3>
                            <p className="print-period-text">
                                Al {fechaFin} (Expresado en Dólares de los Estados Unidos de América - USD)
                            </p>
                        </div>

                        <TablaBalanceGeneral balance={balance} />

                        {/* Firmas de Auditoría / Aprobación */}
                        <div className="balance-firmas-grid">
                            <div className="firma-box">
                                <div className="firma-linea"></div>
                                <p className="firma-cargo">Representante Legal</p>
                                <p className="firma-nombre">{empresa?.nombre_empresa || "Administración"}</p>
                            </div>
                            <div className="firma-box">
                                <div className="firma-linea"></div>
                                <p className="firma-cargo">Contador General</p>
                                <p className="firma-nombre">Firma y Sello</p>
                            </div>
                            <div className="firma-box">
                                <div className="firma-linea"></div>
                                <p className="firma-cargo">Auditor Externo</p>
                                <p className="firma-nombre">Firma y Sello</p>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Modal de Liquidación de IVA */}
            {mostrarIvaModal && balance?.liquidacionIva && (
                <LiquidacionIvaModal
                    liquidacion={balance.liquidacionIva}
                    onClose={() => setMostrarIvaModal(false)}
                />
            )}
        </div>
    );
}
