export function FiltersPeriodo({
    fechaInicio,
    setFechaInicio,
    fechaFin,
    setFechaFin,
    onFiltrar,
    onLimpiar,
    cargando
}) {
    function handleSubmit(e) {
        e.preventDefault();
        onFiltrar();
    }

    return (
        <form onSubmit={handleSubmit} className="report-filters kardex-filters">
            <label>
                Fecha Inicio
                <input
                    type="date"
                    value={fechaInicio}
                    onChange={e => setFechaInicio(e.target.value)}
                    disabled={cargando}
                />
            </label>

            <label>
                Fecha Fin
                <input
                    type="date"
                    value={fechaFin}
                    onChange={e => setFechaFin(e.target.value)}
                    disabled={cargando}
                />
            </label>

            <div className="filter-actions">
                <button
                    type="submit"
                    className="button-primary"
                    disabled={cargando}
                >
                    {cargando ? "Filtrando..." : "Filtrar"}
                </button>

                {(fechaInicio || fechaFin) && (
                    <button
                        type="button"
                        className="button-secondary"
                        onClick={onLimpiar}
                        disabled={cargando}
                    >
                        Limpiar filtros
                    </button>
                )}
            </div>
        </form>
    );
}

export default FiltersPeriodo;
