import { useEffect, useMemo, useState } from "react";
import { obtenerCuentas } from "../services/cuentasService";
import { obtenerBalanceGeneral } from "../services/balanceGeneralService";
import { obtenerLibroDiario } from "../services/libroDiarioService";
import { supabaseConfigurado } from "../lib/supabase";

function moneda(valor) {
	return Number(valor || 0).toLocaleString("es-SV", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}

function fechaCorta(valor) {
	if (!valor) return "--";

	const [anio, mes, dia] = valor.split("-");
	return `${dia}/${mes}/${anio}`;
}

function calcularResumen(asientos, cuentas) {
	const cuentasPorId = new Map(
		cuentas.map(cuenta => [String(cuenta.id), cuenta])
	);

	const resultado = {
		activos: 0,
		pasivos: 0,
		ingresos: 0,
		gastos: 0
	};

	asientos.forEach(asiento => {
		(asiento.detalle_asientos || []).forEach(detalle => {
			const cuenta =
				cuentasPorId.get(String(detalle.cuenta_id)) ||
				detalle.cuentas;

			const codigo = String(cuenta?.codigo || "").trim();

			const debe = Number(detalle.debe || 0);
			const haber = Number(detalle.haber || 0);

			if (
				!codigo ||
				!Number.isFinite(debe) ||
				!Number.isFinite(haber)
			) {
				return;
			}

			switch (codigo.charAt(0)) {
				case "1":
					// Activos: naturaleza deudora
					// Saldo = Debe - Haber
					resultado.activos += debe - haber;
					break;

				case "2":
					// Pasivos: naturaleza acreedora
					// Saldo = Haber - Debe
					resultado.pasivos += haber - debe;
					break;

				case "4":
					// Gastos: naturaleza deudora
					// Saldo = Debe - Haber
					resultado.gastos += debe - haber;
					break;

				case "5":
					// Ingresos: naturaleza acreedora
					// Saldo = Haber - Debe
					resultado.ingresos += haber - debe;
					break;

				default:
					break;
			}
		});
	});

	return resultado;
}

function Dashboard({ cambiarVista }) {
	const [asientos, setAsientos] = useState([]);
	const [cuentas, setCuentas] = useState([]);
	const [balance, setBalance] = useState(null);
	const [cargando, setCargando] = useState(true);
	const [error, setError] = useState("");
	const [avisoHerramienta, setAvisoHerramienta] = useState("");
	const anioActual = new Date().getFullYear();
	const fechaInicio = `${anioActual}-01-01`;
	const fechaFin = `${anioActual}-12-31`;

	useEffect(() => {
		async function cargarDatos() {
			if (!supabaseConfigurado) {
				setCargando(false);
				setError(
					"Configura Supabase para mostrar los movimientos contables."
				);
				return;
			}

			try {
				const [asientosCargados, cuentasCargadas, balanceCargado] =
					await Promise.all([
						obtenerLibroDiario(),
						obtenerCuentas(),
						obtenerBalanceGeneral({
							desde: fechaInicio,
							hasta: fechaFin
						})
					]);

				setAsientos(asientosCargados);
				setCuentas(cuentasCargadas);
				setBalance(balanceCargado);
			} catch (errorCarga) {
				console.error(
					"Error cargando el dashboard:",
					errorCarga
				);

				setError(
					errorCarga.message ||
						"No se pudo cargar el resumen contable."
				);
			} finally {
				setCargando(false);
			}
		}

		cargarDatos();
	}, [fechaFin, fechaInicio]);

	const resumen = useMemo(() => {
		return calcularResumen(asientos, cuentas);
	}, [asientos, cuentas]);

	const movimientos = asientos.slice(-3).reverse();

	const maxResultado = Math.max(
		resumen.ingresos,
		resumen.gastos,
		1
	);

	if (cargando) {
		return (
			<section className="dashboard-page">
				<p className="dashboard-loading">
					Cargando resumen contable...
				</p>
			</section>
		);
	}

	return (
		<section className="dashboard-page">
			<div className="dashboard-heading">
				<div>
					<p className="eyebrow">Dashboard ejecutivo</p>

					<h1>Visión general</h1>

					<p className="dashboard-subtitle">
						Un resumen claro del movimiento de tu empresa.
					</p>
				</div>

				<button
					className="button-primary dashboard-action"
					onClick={() => cambiarVista("asiento")}
				>
					+ Nuevo asiento
				</button>
			</div>

			{error && (
				<p className="dashboard-notice">
					{error}
				</p>
			)}

			<div className="dashboard-stats">
				<article className="dashboard-stat">
					<span>Activos</span>
					<strong>
						$ {moneda(balance?.activo?.total)}
					</strong>
				</article>

				<article className="dashboard-stat">
					<span>Pasivos</span>
					<strong>
						$ {moneda(balance?.pasivo?.total)}
					</strong>
				</article>

				<article className="dashboard-stat">
					<span>Ingresos</span>
					<strong>
						$ {moneda(resumen.ingresos)}
					</strong>
				</article>

				<article className="dashboard-stat">
					<span>Gastos</span>
					<strong>
						$ {moneda(resumen.gastos)}
					</strong>
				</article>
			</div>

			<div className="dashboard-grid">
				<article className="dashboard-panel dashboard-chart-panel">
					<div className="dashboard-panel-heading">
						<div>
							<span className="dashboard-kicker">
								Actividad financiera
							</span>

							<h2>Ingresos vs. gastos</h2>
						</div>

						<span className="dashboard-period">
							Acumulado
						</span>
					</div>

					<div
						className="dashboard-chart"
						aria-label="Comparación entre ingresos y gastos"
					>
						<div className="chart-scale">
							<span>
								$ {moneda(maxResultado)}
							</span>

							<span>$ 0.00</span>
						</div>

						<div className="chart-bars">
							<div className="chart-column">
								<div
									className="chart-bar chart-income"
									style={{
										height: `${Math.max(
											(resumen.ingresos /
												maxResultado) *
												100,
											3
										)}%`
									}}
								></div>

								<span>Ingresos</span>
							</div>

							<div className="chart-column">
								<div
									className="chart-bar chart-expense"
									style={{
										height: `${Math.max(
											(resumen.gastos /
												maxResultado) *
												100,
											3
										)}%`
									}}
								></div>

								<span>Gastos</span>
							</div>
						</div>
					</div>
				</article>

				<article className="dashboard-panel dashboard-tools-panel">
					<div className="dashboard-panel-heading">
						<div>
							<span className="dashboard-kicker">
								Herramientas
							</span>

							<h2>Accesos del sistema</h2>
						</div>
					</div>

					<div className="dashboard-tools">
						<button type="button" onClick={() => cambiarVista("kardex")}>
							Kardex <span>→</span>
						</button>

						<button type="button" onClick={() => cambiarVista("estadoResultados")}>
							Estado de resultados <span>→</span>
						</button>

						<button
							type="button"
							onClick={() =>
								setAvisoHerramienta(
									"Ratios financieros no está disponible todavía."
								)
							}
						>
							Ratios financieros <span>→</span>
						</button>

						<button type="button" onClick={() => cambiarVista("balanceGeneral")}>
							Balance General <span>→</span>
						</button>

						<button
							type="button"
							onClick={() =>
								setAvisoHerramienta(
									"Trazabilidad y auditoría no está disponible todavía."
								)
							}
						>
							Trazabilidad y auditoría <span>→</span>
						</button>
					</div>

					{avisoHerramienta && (
						<p className="dashboard-tool-notice">
							{avisoHerramienta}
						</p>
					)}
				</article>
			</div>

			<article className="dashboard-panel dashboard-activity-panel">
				<div className="dashboard-panel-heading">
					<div>
						<span className="dashboard-kicker">
							Actividad reciente
						</span>

						<h2>Últimos movimientos</h2>
					</div>

					<button
						className="dashboard-link"
						onClick={() => cambiarVista("diario")}
					>
						Ver todos
					</button>
				</div>

				{movimientos.length === 0 ? (
					<p className="dashboard-empty">
						Todavía no hay movimientos registrados.
					</p>
				) : (
					<div className="dashboard-activity-list">
						{movimientos.map(asiento => (
							<button
								className="dashboard-activity-row"
								key={asiento.id}
								onClick={() =>
									cambiarVista("diario")
								}
							>
								<span>
									{fechaCorta(asiento.fecha)}
								</span>

								<strong>
									C/{" "}
									{asiento.concepto ||
										"Sin concepto"}
								</strong>

								<em>
									{asiento.numero_partida ||
										"--"}
								</em>
							</button>
						))}
					</div>
				)}
			</article>
		</section>
	);
}

export default Dashboard;