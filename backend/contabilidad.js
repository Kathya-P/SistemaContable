const CENTAVOS = 100;

function normalizarMonto(valor, nombreCampo) {
  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero < 0) {
    throw new Error(`${nombreCampo} debe ser un número mayor o igual a cero.`);
  }

  return Math.round(numero * CENTAVOS) / CENTAVOS;
}

export function validarPartidaDoble(detalles, cuentas) {
  if (!Array.isArray(detalles) || detalles.length < 2) {
    throw new Error("El asiento debe tener al menos dos líneas.");
  }

  const cuentasPorId = new Map(cuentas.map(cuenta => [String(cuenta.id), cuenta]));
  let totalDebe = 0;
  let totalHaber = 0;

  const detallesValidados = detalles.map((detalle, indice) => {
    const cuenta = cuentasPorId.get(String(detalle.cuenta_id));
    if (!cuenta) {
      throw new Error(`La cuenta de la línea ${indice + 1} no existe.`);
    }
    if (cuenta.permite_movimientos === false) {
      throw new Error(`La cuenta ${cuenta.codigo} - ${cuenta.nombre} no permite movimientos.`);
    }

    const debe = normalizarMonto(detalle.debe || 0, `Debe de la línea ${indice + 1}`);
    const haber = normalizarMonto(detalle.haber || 0, `Haber de la línea ${indice + 1}`);

    if ((debe > 0 && haber > 0) || (debe === 0 && haber === 0)) {
      throw new Error(`La línea ${indice + 1} debe tener Debe o Haber, nunca ambos.`);
    }

    totalDebe += debe;
    totalHaber += haber;

    return {
      cuenta_id: detalle.cuenta_id,
      descripcion: String(detalle.descripcion || "").trim(),
      debe,
      haber
    };
  });

  if (totalDebe <= 0 || totalHaber <= 0) {
    throw new Error("Debe y Haber deben ser mayores a cero.");
  }

  if (Math.round(totalDebe * CENTAVOS) !== Math.round(totalHaber * CENTAVOS)) {
    throw new Error(`Partida descuadrada. Debe: ${(totalDebe).toFixed(2)} | Haber: ${(totalHaber).toFixed(2)}`);
  }

  return {
    detalles: detallesValidados,
    totalDebe,
    totalHaber,
    balanceado: true
  };
}

export function validarCabecera(asiento) {
    if (!asiento || !asiento.empresa_id || !asiento.fecha || !asiento.numero_partida || !String(asiento.concepto || "").trim()) {
        throw new Error("La cabecera requiere empresa, fecha, número de partida y concepto.");
    }

    return {
        empresa_id: asiento.empresa_id,
        fecha: asiento.fecha,
        numero_partida: Number(asiento.numero_partida),
        concepto: String(asiento.concepto).trim(),
        usuario_id: Number(process.env.USUARIO_ID || 1)
    };
}
