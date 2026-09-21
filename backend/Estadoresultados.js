// Estado de Resultados calculado a partir del Libro Mayor.
// Todo se trabaja en centavos enteros para que no haya errores de decimales.

const centavos = valor => Math.round(Number(valor || 0) * 100);
const dolares = valor => valor / 100;

// Suma los movimientos de las cuentas cuyo código EMPIEZA con el prefijo (así entran sus subcuentas).
// naturaleza "debe": saldo = debe - haber | naturaleza "haber": saldo = haber - debe
function saldoCuentas(filasMayor, prefijo, naturaleza) {
    let debe = 0;
    let haber = 0;

    for (const fila of filasMayor || []) {
        if (String(fila.codigo).startsWith(prefijo)) {
            debe += centavos(fila.total_debe);
            haber += centavos(fila.total_haber);
        }
    }

    return naturaleza === "debe" ? debe - haber : haber - debe;
}

// Inventario de mercadería (1103) según el Libro Mayor.
// En el método periódico esa cuenta solo se mueve por el inventario con que arranca la empresa.
export function inventarioDelMayor(filasMayor) {
    return dolares(saldoCuentas(filasMayor, "1103", "debe"));
}

export function calcularEstadoResultados(filasMayor, inventarioInicial = 0, inventarioFinal = 0) {
    const ventas = saldoCuentas(filasMayor, "5101", "haber");
    const devolucionesVentas = saldoCuentas(filasMayor, "5102", "debe");
    const ventasNetas = ventas - devolucionesVentas;

    const compras = saldoCuentas(filasMayor, "4101", "debe");
    const gastosCompra = 0; // todavía no hay cuenta para gastos de compra
    const comprasTotales = compras + gastosCompra;
    const devolucionesCompras = saldoCuentas(filasMayor, "4102", "haber");
    const comprasNetas = comprasTotales - devolucionesCompras;

    // El inventario inicial se suma a las compras netas y el final se resta:
    // el estado solo muestra el resultado (costo de ventas), porque el inventario es un activo.
    const mercanciaDisponible = comprasNetas + centavos(inventarioInicial);
    const costoVentas = mercanciaDisponible - centavos(inventarioFinal);
    const utilidadBruta = ventasNetas - costoVentas;

    const gastosVenta = saldoCuentas(filasMayor, "4202", "debe");
    const gastosAdministracion = saldoCuentas(filasMayor, "4201", "debe");
    const totalGastosOperacion = gastosVenta + gastosAdministracion;
    const utilidadOperacional = utilidadBruta - totalGastosOperacion;

    const productosFinancieros = 0; // todavía no hay cuenta
    const gastosFinancieros = saldoCuentas(filasMayor, "4203", "debe");
    const utilidadFinanciera = productosFinancieros - gastosFinancieros;

    const otrosProductos = 0; // todavía no hay cuenta
    const otrosGastos = 0; // todavía no hay cuenta
    const utilidadAjena = otrosProductos - otrosGastos;

    const utilidadAntesImpuestos = utilidadOperacional + utilidadFinanciera + utilidadAjena;

    return {
        ventas: dolares(ventas),
        devolucionesVentas: dolares(devolucionesVentas),
        ventasNetas: dolares(ventasNetas),
        compras: dolares(compras),
        gastosCompra: dolares(gastosCompra),
        comprasTotales: dolares(comprasTotales),
        devolucionesCompras: dolares(devolucionesCompras),
        comprasNetas: dolares(comprasNetas),
        mercanciaDisponible: dolares(mercanciaDisponible), // no se muestra en el estado (solo para pruebas)
        costoVentas: dolares(costoVentas),
        utilidadBruta: dolares(utilidadBruta),
        gastosVenta: dolares(gastosVenta),
        gastosAdministracion: dolares(gastosAdministracion),
        totalGastosOperacion: dolares(totalGastosOperacion),
        utilidadOperacional: dolares(utilidadOperacional),
        productosFinancieros: dolares(productosFinancieros),
        gastosFinancieros: dolares(gastosFinancieros),
        utilidadFinanciera: dolares(utilidadFinanciera),
        otrosProductos: dolares(otrosProductos),
        otrosGastos: dolares(otrosGastos),
        utilidadAjena: dolares(utilidadAjena),
        utilidadAntesImpuestos: dolares(utilidadAntesImpuestos)
    };
}