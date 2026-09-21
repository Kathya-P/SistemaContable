import { useEffect, useState } from "react";
import { solicitarApi } from "../services/api";
import { obtenerDatosKardex } from "../services/kardexService";
import { obtenerBalanceGeneral } from "../services/balanceGeneralService";

// Formato de moneda: $ 1,234.56 o ($ 1,234.56) si es negativo
function moneda(valor) {
    if (valor === 0 || valor === null || valor === undefined) return "$ -";
    const num = Number(valor);
    const texto = Math.abs(num).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return num < 0 ? `($ ${texto})` : `$ ${texto}`;
}

export function BalanceGeneral({ empresa, fechaDesde, fechaHasta, fechaCorte }) {
    const [balance, setBalance] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [mostrarIvaModal, setMostrarIvaModal] = useState(false);

    // Si viene fechaCorte se usa como hasta; si no, fechaHasta o fin de año del período
    const anioActual = new Date().getFullYear();
    const fechaFin = fechaCorte || fechaHasta || `${anioActual}-12-31`;
    const fechaInicio = fechaDesde || `${anioActual}-01-01`;

    useEffect(() => {
        let cancelado = false;

        async function cargarDatos() {
            setCargando(true);
            setError(null);
            try {
                // 1. Obtener el inventario final del Kardex (saldo_final real)
                let inventarioFinalKardex = null;
                try {
                    const kardex = await obtenerDatosKardex({
                        fechaInicio,
                        fechaFin
                    });
                    const saldo = Number(kardex?.totales?.saldo_final ?? 0);
                    if (saldo > 0) {
                        inventarioFinalKardex = saldo;
                    } else {
                        // Respaldo: si por la fecha de corte no hay movimientos, consultar el saldo del Kardex del ejercicio
                        const kardexGeneral = await obtenerDatosKardex({});
                        const saldoGeneral = Number(kardexGeneral?.totales?.saldo_final ?? 0);
                        if (saldoGeneral > 0) {
                            inventarioFinalKardex = saldoGeneral;
                        }
                    }
                } catch (errKardex) {
                    console.warn("No se pudo obtener el saldo final del Kardex:", errKardex);
                }

                // 2. Cargar el Balance General pasando ese inventario final
                const data = await obtenerBalanceGeneral({
                    desde: fechaInicio,
                    hasta: fechaFin,
                    inventarioFinal: inventarioFinalKardex,
                    inventarioFinalManual: inventarioFinalKardex
                });

                if (!cancelado) {
                    setBalance(data);
                }
            } catch (err) {
                if (!cancelado) {
                    console.error("Error al cargar el Balance General:", err);
                    setError(err.message || "Error al cargar los datos.");
                }
            } finally {
                if (!cancelado) {
                    setCargando(false);
                }
            }
        }

        cargarDatos();

        return () => {
            cancelado = true;
        };
    }, [fechaInicio, fechaFin]);

    if (cargando) {
        return (
            <div className="flex items-center justify-center p-8 text-gray-500">
                <span>Cargando balance general...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">
                <p className="font-semibold">Error al cargar balance:</p>
                <p>{error}</p>
            </div>
        );
    }

    if (!balance) return null;

    const { activo, pasivo, capital, liquidacionIva, validacion } = balance;

    return (
        <div className="bg-white rounded-lg shadow-md p-6 max-w-6xl mx-auto my-6">
            {/* Encabezado */}
            <div className="text-center border-b pb-4 mb-6 relative">
                <h2 className="text-2xl font-bold text-gray-800 tracking-wide">BALANCE GENERAL</h2>
                <p className="text-gray-500 text-sm mt-1">
                    Al {fechaFin} (Expresado en Dólares de los Estados Unidos de América - USD)
                </p>

                {liquidacionIva && (
                    <button
                        onClick={() => setMostrarIvaModal(true)}
                        className="absolute right-0 top-0 text-xs bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors"
                    >
                        Ver Liquidación de IVA ({liquidacionIva.tipo === "A_PAGAR" ? "A Pagar" : "Remanente"})
                    </button>
                )}
            </div>

            {/* Modal de Liquidación de IVA */}
            {mostrarIvaModal && liquidacionIva && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800">Liquidación de IVA</h3>
                            <button
                                onClick={() => setMostrarIvaModal(false)}
                                className="text-gray-400 hover:text-gray-600 font-bold"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between py-1 border-b">
                                <span className="text-gray-600">IVA Crédito Fiscal (Compras):</span>
                                <span className="font-medium text-gray-800">{moneda(liquidacionIva.ivaCreditoFiscal)}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b">
                                <span className="text-gray-600">IVA Débito Fiscal (Ventas):</span>
                                <span className="font-medium text-gray-800">{moneda(liquidacionIva.ivaDebitoFiscal)}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b">
                                <span className="text-gray-600">Diferencia:</span>
                                <span className="font-medium text-gray-800">{moneda(liquidacionIva.diferencia)}</span>
                            </div>
                            {liquidacionIva.impuestoAPagar > 0 && (
                                <div className="flex justify-between py-1 bg-red-50 px-2 rounded font-semibold text-red-700">
                                    <span>Impuesto a Pagar (Pasivo):</span>
                                    <span>{moneda(liquidacionIva.impuestoAPagar)}</span>
                                </div>
                            )}
                            {liquidacionIva.remanenteAFavor > 0 && (
                                <div className="flex justify-between py-1 bg-green-50 px-2 rounded font-semibold text-green-700">
                                    <span>Remanente a Favor (Activo):</span>
                                    <span>{moneda(liquidacionIva.remanenteAFavor)}</span>
                                </div>
                            )}
                        </div>
                        <div className="mt-6 text-right">
                            <button
                                onClick={() => setMostrarIvaModal(false)}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Contenido en dos columnas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* COLUMNA IZQUIERDA: ACTIVOS */}
                <div>
                    <div className="border-b-2 border-emerald-600 pb-2 mb-4 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-emerald-800">ACTIVO</h3>
                        <span className="font-bold text-emerald-800">{moneda(activo?.total)}</span>
                    </div>

                    {/* Activo Corriente */}
                    <div className="mb-6">
                        <div className="flex justify-between font-semibold text-gray-700 bg-gray-50 px-2 py-1 rounded text-sm mb-2">
                            <span>ACTIVO CORRIENTE</span>
                            <span>{moneda(activo?.corriente?.total)}</span>
                        </div>
                        <div className="space-y-1.5 pl-2 text-sm">
                            {(activo?.corriente?.cuentas || []).map((cuenta) => (
                                <div key={cuenta.codigo} className="flex justify-between text-gray-600 hover:bg-gray-50 px-1 py-0.5 rounded">
                                    <span>
                                        <span className="text-xs text-gray-400 mr-2 font-mono">{cuenta.codigo}</span>
                                        {cuenta.concepto}
                                    </span>
                                    <span className="font-medium text-gray-800">{moneda(cuenta.monto)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Activo No Corriente */}
                    <div className="mb-6">
                        <div className="flex justify-between font-semibold text-gray-700 bg-gray-50 px-2 py-1 rounded text-sm mb-2">
                            <span>ACTIVO NO CORRIENTE</span>
                            <span>{moneda(activo?.noCorriente?.total)}</span>
                        </div>
                        <div className="space-y-1.5 pl-2 text-sm">
                            {(activo?.noCorriente?.cuentas || []).length === 0 ? (
                                <p className="text-xs text-gray-400 italic">Sin cuentas en este período</p>
                            ) : (
                                (activo?.noCorriente?.cuentas || []).map((cuenta) => (
                                    <div key={cuenta.codigo} className="flex justify-between text-gray-600 hover:bg-gray-50 px-1 py-0.5 rounded">
                                        <span>
                                            <span className="text-xs text-gray-400 mr-2 font-mono">{cuenta.codigo}</span>
                                            {cuenta.concepto}
                                        </span>
                                        <span className="font-medium text-gray-800">{moneda(cuenta.monto)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Total Activo */}
                    <div className="mt-8 border-t-2 border-emerald-600 pt-2 flex justify-between items-center font-bold text-emerald-900 bg-emerald-50/50 p-2 rounded">
                        <span>TOTAL DEL ACTIVO</span>
                        <span>{moneda(activo?.total)}</span>
                    </div>
                </div>

                {/* COLUMNA DERECHA: PASIVO Y PATRIMONIO */}
                <div>
                    <div className="border-b-2 border-emerald-600 pb-2 mb-4 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-emerald-800">PASIVO</h3>
                        <span className="font-bold text-emerald-800">{moneda(pasivo?.total)}</span>
                    </div>

                    {/* Pasivo Corriente */}
                    <div className="mb-6">
                        <div className="flex justify-between font-semibold text-gray-700 bg-gray-50 px-2 py-1 rounded text-sm mb-2">
                            <span>PASIVO CORRIENTE</span>
                            <span>{moneda(pasivo?.corriente?.total)}</span>
                        </div>
                        <div className="space-y-1.5 pl-2 text-sm">
                            {(pasivo?.corriente?.cuentas || []).map((cuenta) => (
                                <div key={cuenta.codigo} className="flex justify-between text-gray-600 hover:bg-gray-50 px-1 py-0.5 rounded">
                                    <span>
                                        <span className="text-xs text-gray-400 mr-2 font-mono">{cuenta.codigo}</span>
                                        {cuenta.concepto}
                                    </span>
                                    <span className="font-medium text-gray-800">{moneda(cuenta.monto)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Pasivo No Corriente */}
                    <div className="mb-6">
                        <div className="flex justify-between font-semibold text-gray-700 bg-gray-50 px-2 py-1 rounded text-sm mb-2">
                            <span>PASIVO NO CORRIENTE</span>
                            <span>{moneda(pasivo?.noCorriente?.total)}</span>
                        </div>
                        <div className="space-y-1.5 pl-2 text-sm">
                            {(pasivo?.noCorriente?.cuentas || []).length === 0 ? (
                                <p className="text-xs text-gray-400 italic">Sin deudas a largo plazo registradas</p>
                            ) : (
                                (pasivo?.noCorriente?.cuentas || []).map((cuenta) => (
                                    <div key={cuenta.codigo} className="flex justify-between text-gray-600 hover:bg-gray-50 px-1 py-0.5 rounded">
                                        <span>
                                            <span className="text-xs text-gray-400 mr-2 font-mono">{cuenta.codigo}</span>
                                            {cuenta.concepto}
                                        </span>
                                        <span className="font-medium text-gray-800">{moneda(cuenta.monto)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Patrimonio Neto */}
                    <div className="mb-6">
                        <div className="flex justify-between font-semibold text-gray-700 bg-gray-50 px-2 py-1 rounded text-sm mb-2">
                            <span>PATRIMONIO NETO</span>
                            <span>{moneda(capital?.total)}</span>
                        </div>
                        <div className="space-y-1.5 pl-2 text-sm">
                            {(capital?.cuentas || []).map((cuenta) => (
                                <div key={cuenta.codigo} className="flex justify-between text-gray-600 hover:bg-gray-50 px-1 py-0.5 rounded">
                                    <span>
                                        <span className="text-xs text-gray-400 mr-2 font-mono">{cuenta.codigo}</span>
                                        {cuenta.concepto}
                                    </span>
                                    <span className="font-medium text-gray-800">{moneda(cuenta.monto)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Total Pasivo y Patrimonio */}
                    <div className="mt-8 border-t-2 border-emerald-600 pt-2 flex justify-between items-center font-bold text-emerald-900 bg-emerald-50/50 p-2 rounded">
                        <span>TOTAL PASIVO Y PATRIMONIO</span>
                        <span>{moneda(balance?.totalPasivoCapital)}</span>
                    </div>
                </div>
            </div>

            {/* Comprobación de cuadre */}
            {validacion && (
                <div className={`mt-6 p-3 rounded text-sm text-center font-medium ${
                    validacion.cuadra ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
                }`}>
                    {validacion.cuadra ? (
                        <span>✓ Ecuación patrimonial verificada: Activo = Pasivo + Patrimonio</span>
                    ) : (
                        <span>⚠ El balance presenta una diferencia de {moneda(validacion.diferencia)}</span>
                    )}
                </div>
            )}
        </div>
    );
}

export default BalanceGeneral;
