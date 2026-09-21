import { useState } from "react";

function IconoSvg({ nombre }){
    const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
    switch(nombre){
        case "inicio":
            return <svg {...props}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /></svg>;
        case "dashboard":
            return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.3" /><rect x="14" y="3" width="7" height="7" rx="1.3" /><rect x="3" y="14" width="7" height="7" rx="1.3" /><rect x="14" y="14" width="7" height="7" rx="1.3" /></svg>;
        case "contabilidad":
            return <svg {...props}><path d="M4 6h16M4 12h16M4 18h11" /></svg>;
        case "inventario":
            return <svg {...props}><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 9h16" /></svg>;
        case "reportes":
            return <svg {...props}><rect x="3.5" y="4" width="17" height="16" rx="1.5" /><path d="M10 4v16" /></svg>;
        case "administracion":
            return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.6M12 18.9v2.6M4.2 5.5l1.8 1.8M18 16.7l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.2 18.5l1.8-1.8M18 7.3l1.8-1.8" /></svg>;
        case "sol":
            return <svg {...props}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2 12h2.4M19.6 12H22M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7" /></svg>;
        case "luna":
            return <svg {...props}><path d="M20 14.2A8.3 8.3 0 0 1 9.8 4a8.3 8.3 0 1 0 10.2 10.2Z" /></svg>;
        case "salir":
            return <svg {...props}><path d="M15 12H4M11 8l-4 4 4 4" /><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></svg>;
        default:
            return null;
    }
}

export default function Sidebar({ vista, cambiarVista, grupos, colapsado, alternarColapso, temaOscuro, cambiarTema, usuario, cerrarSesion }){
    // arranca con abierta la sección que contiene la vista activa
    const [abiertas, setAbiertas] = useState(() => {
        const inicial = {};
        grupos.forEach(grupo => {
            if(grupo.items) inicial[grupo.id] = grupo.items.some(item => item.clave === vista);
        });
        return inicial;
    });

    function alternarSeccion(id){
        setAbiertas(previo => ({ ...previo, [id]: !previo[id] }));
    }

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <button className="brand" onClick={() => cambiarVista("inicio")}>
                    <span className="brand-mark">SC</span>
                    <span className="brand-name">ContaCabal</span>
                </button>
                <button
                    className="sidebar-toggle"
                    onClick={alternarColapso}
                    aria-label={colapsado ? "Expandir menú" : "Contraer menú"}
                    title={colapsado ? "Expandir menú" : "Contraer menú"}
                >
                    <span aria-hidden="true">{colapsado ? "›" : "‹"}</span>
                </button>
            </div>

            <div className="sidebar-content">
                <nav aria-label="Navegación principal">
                    {grupos.map(grupo => {
                        // entrada suelta (Inicio, Dashboard)
                        if(!grupo.items){
                            return (
                                <button
                                    key={grupo.id}
                                    className={vista === grupo.clave ? "sidebar-link is-active" : "sidebar-link"}
                                    onClick={() => cambiarVista(grupo.clave)}
                                    title={grupo.nombre}
                                >
                                    <span className="sidebar-icon" aria-hidden="true"><IconoSvg nombre={grupo.icono} /></span>
                                    <span className="sidebar-label">{grupo.nombre}</span>
                                </button>
                            );
                        }

                        const abierta = !!abiertas[grupo.id];
                        return (
                            <div className="sidebar-section" key={grupo.id}>
                                <button
                                    className="sidebar-section-toggle"
                                    onClick={() => alternarSeccion(grupo.id)}
                                    aria-expanded={abierta}
                                    title={grupo.nombre}
                                >
                                    <span className="sidebar-section-left">
                                        <span className="sidebar-icon" aria-hidden="true"><IconoSvg nombre={grupo.icono} /></span>
                                        <span className="sidebar-label">{grupo.nombre}</span>
                                    </span>
                                    <span className={abierta ? "sidebar-chevron is-open" : "sidebar-chevron"} aria-hidden="true">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </span>
                                </button>

                                {abierta && (
                                    <div className="sidebar-submenu">
                                        {grupo.items.map(item => (
                                            <button
                                                key={item.clave}
                                                className={vista === item.clave ? "sidebar-sublink is-active" : "sidebar-sublink"}
                                                onClick={() => cambiarVista(item.clave)}
                                            >
                                                {item.nombre}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>
            </div>

            <div className="sidebar-footer">
                <button className="sidebar-footer-button" onClick={cambiarTema} title={temaOscuro ? "Modo claro" : "Modo oscuro"}>
                    <span className="sidebar-icon" aria-hidden="true"><IconoSvg nombre={temaOscuro ? "sol" : "luna"} /></span>
                    <span className="sidebar-label">{temaOscuro ? "Claro" : "Oscuro"}</span>
                </button>

                <div className="sidebar-user">
                    <div className="sidebar-user-info">
                        <strong>{usuario?.nombre || "Usuario"}</strong>
                        <span>{usuario?.rol}</span>
                    </div>
                </div>

                <button className="sidebar-footer-button logout" onClick={cerrarSesion} title="Salir">
                    <span className="sidebar-icon" aria-hidden="true"><IconoSvg nombre="salir" /></span>
                    <span className="sidebar-label">Salir</span>
                </button>
            </div>
        </aside>
    );
}